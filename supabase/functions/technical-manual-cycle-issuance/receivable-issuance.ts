import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { queryBaneseBoleto } from "../banese/core/adapter.ts";
import {
  claimExistingGatewayCheckout,
  gatewayAttemptIsOwned,
} from "../gateways/checkout/gateway-creation-fence.ts";
import {
  hasAmbiguousGatewaySubmission,
} from "../gateways/checkout/remote-title-guard.ts";
import { documentForGateway } from "../gateways/checkout/utils.ts";
import {
  createGatewayCharge,
  type GatewayChargeResult,
} from "../gateways/router.ts";
import {
  deterministicReceivableRequestId,
  errorMessage,
  type ManualCycleContext,
  remotePaymentMayExist,
  validateBaneseGatewayResult,
} from "./contract.ts";
import {
  hasUnsafePartialBaneseEvidence,
  type LoadedReceivable,
} from "./receivable-state.ts";
import { resolveCanonicalManualCycleBaneseTerms } from "./financial-terms.ts";
import {
  manualCycleRecoveryFailure,
  reconciliationClaimError,
  skipManualCycleFailureMutation,
} from "./recovery-policy.ts";

type Client = SupabaseClient;

export type IssuanceScope = {
  matriculaId: string;
  turmaId: string;
  alunoId: string;
  poloId: string;
  issuerPoloId: string;
  credentialId: string;
};

const PROVIDER = "banese_card" as const;
const ENVIRONMENT = "production" as const;
const PAYMENT_METHOD = "BOLETO" as const;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const loadReceivable = async (
  admin: Client,
  receivableId: string,
): Promise<LoadedReceivable> => {
  const receivableResult = await admin.from("contas_receber").select("*")
    .eq("id", receivableId).maybeSingle();
  if (receivableResult.error) throw receivableResult.error;
  if (!receivableResult.data) {
    throw new Error("Recebível do ciclo não encontrado.");
  }
  const receivable = receivableResult.data as Record<string, unknown>;
  const [payerResult, transactionResult] = await Promise.all([
    admin.from("parceiros").select(
      "id, nome, email, cpf_cnpj, telefone, endereco, numero, complemento, cep, bairro, cidade, uf, estado, status",
    ).eq("id", String(receivable.cliente_id || "")).maybeSingle(),
    admin.from("payment_gateway_transactions").select("*")
      .eq("receivable_id", receivableId).eq("provider_code", PROVIDER)
      .eq("environment", ENVIRONMENT).eq("payment_method", PAYMENT_METHOD),
  ]);
  if (payerResult.error) throw payerResult.error;
  if (transactionResult.error) throw transactionResult.error;
  if (!payerResult.data) throw new Error("Pagador do ciclo não encontrado.");
  return {
    receivable,
    payer: payerResult.data as Record<string, unknown>,
    transactions: Array.isArray(transactionResult.data)
      ? transactionResult.data as Array<Record<string, unknown>>
      : [],
  };
};

const payerForGateway = (payer: Record<string, unknown>) => ({
  id: payer.id,
  name: payer.nome,
  email: payer.email,
  cpfCnpj: documentForGateway(payer.cpf_cnpj),
  phone: payer.telefone,
  address: payer.endereco,
  number: payer.numero,
  complement: payer.complemento,
  postalCode: payer.cep,
  district: payer.bairro,
  city: payer.cidade,
  state: payer.uf ?? payer.estado,
});

const ownsAttempt = (
  receivable: Record<string, unknown>,
  attemptToken: string,
) =>
  gatewayAttemptIsOwned(receivable, attemptToken) &&
  receivable.gateway_provider === PROVIDER &&
  receivable.gateway_environment === ENVIRONMENT &&
  receivable.gateway_payment_method === PAYMENT_METHOD;

const markFailure = async (
  admin: Client,
  input: {
    receivableId: string;
    authorizationRequestId: string;
    remoteMayExist: boolean;
    error: unknown;
  },
) => {
  const failure = manualCycleRecoveryFailure(input.error);
  const { error } = await admin.rpc(
    "mark_technical_manual_cycle_banese_failure",
    {
      p_receivable_id: input.receivableId,
      p_authorization_request_id: input.authorizationRequestId,
      p_expected_creation_token: input.authorizationRequestId,
      p_remote_payment_may_exist: input.remoteMayExist,
      p_retryable_reconciliation: failure.retryable,
      p_diagnostic_code: failure.diagnosticCode,
      p_error: errorMessage(input.error),
    },
  );
  if (error) {
    console.error("manual cycle Banese failure fence could not be updated", {
      receivableId: input.receivableId,
      message: errorMessage(error),
    });
  }
};

export const requiresBaneseReconciliation = (
  receivable: Record<string, unknown>,
  attemptToken: string,
) => {
  if (!hasAmbiguousGatewaySubmission(receivable)) return false;
  if (!ownsAttempt(receivable, attemptToken)) {
    throw new Error(
      "A tentativa Banese ambígua não pertence à geração atual.",
    );
  }
  return true;
};

const claimAmbiguousReconciliation = async (input: {
  admin: Client;
  receivableId: string;
  authorizationRequestId: string;
}) => {
  const { data, error } = await input.admin.rpc(
    "claim_technical_manual_cycle_banese_reconciliation",
    {
      p_receivable_id: input.receivableId,
      p_authorization_request_id: input.authorizationRequestId,
      p_expected_creation_token: input.authorizationRequestId,
    },
  );
  if (error) throw error;
  if (data?.reviewRequired === true) {
    throw reconciliationClaimError(
      "A janela segura de conciliação Banese terminou e o item exige revisão.",
      "MAX_AGE",
    );
  }
  if (data?.claimed !== true) {
    const retryAfter = Math.max(1, Number(data?.retryAfterSeconds || 60));
    throw reconciliationClaimError(
      `A conciliação Banese respeita uma janela segura. Aguarde ${retryAfter} segundos e retome.`,
      "COOLDOWN",
    );
  }
};

const recoverAmbiguousBaneseResult = async (input: {
  admin: Client;
  loaded: LoadedReceivable;
  scope: IssuanceScope;
}): Promise<GatewayChargeResult> => {
  const receivable = input.loaded.receivable;
  const { data: credential, error: credentialError } = await input.admin
    .from("payment_gateway_credentials").select("metadata")
    .eq("id", input.scope.credentialId).eq("provider_code", PROVIDER)
    .eq("environment", ENVIRONMENT).maybeSingle();
  if (credentialError) throw credentialError;
  const metadata = asRecord(credential?.metadata);
  const receivableId = String(receivable.id || "");
  await claimAmbiguousReconciliation({
    admin: input.admin,
    receivableId,
    authorizationRequestId: String(receivable.gateway_creation_token || ""),
  });
  const snapshot = await queryBaneseBoleto(
    input.admin as unknown as Parameters<typeof queryBaneseBoleto>[0],
    ENVIRONMENT,
    {
      convenio: receivable.gateway_boleto_convenio ||
        metadata.baneseBoletoConvenio || metadata.baneseConvenio,
      nossoNumero: receivable.gateway_boleto_nosso_numero,
      recoverPix: true,
      validateTitleIdentity: true,
      expectedAmount: receivable.valor,
      expectedDueDate: String(receivable.data_vencimento || "").slice(0, 10),
      expectedAgency: receivable.gateway_boleto_agencia ||
        metadata.baneseAgencia,
      expectedAccount: metadata.baneseConta || metadata.baneseContaDisplay,
      expectedDocumentNumber: receivableId.slice(0, 15),
      expectedCompanyTitleId: receivableId.slice(0, 25),
      expectedPayerDocument: documentForGateway(input.loaded.payer.cpf_cnpj),
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (
    snapshot.paid || snapshot.payments.length > 0 || snapshot.paymentsError ||
    snapshot.financialTermsError || !snapshot.financialTerms ||
    !snapshot.pixPayload || !snapshot.pixEncodedImage ||
    snapshot.remoteStatus !== "PENDING"
  ) {
    throw new Error(
      "A consulta oficial não confirmou um BolePix aberto e completo.",
    );
  }
  const raw = asRecord(snapshot.raw);
  return {
    providerCode: PROVIDER,
    remotePaymentId: snapshot.nossoNumero,
    remotePaymentLinkId: null,
    remoteCustomerId: null,
    remoteStatus: snapshot.remoteStatus,
    invoiceUrl: null,
    bankSlipUrl: null,
    pixPayload: snapshot.pixPayload,
    pixEncodedImage: snapshot.pixEncodedImage,
    bankSlipDigitableLine: String(
      raw.NumeroLinhaDigitavel || raw.numeroLinhaDigitavel || "",
    ),
    bankSlipBarcode: String(
      raw.NumeroCodigoBarras || raw.numeroCodigoBarras || "",
    ),
    bankSlipOurNumber: snapshot.nossoNumero,
    issuerPoloId: input.scope.issuerPoloId,
    financialTerms: snapshot.financialTerms,
    rawPayload: {
      recoveryMode: "BANESE_EXACT_GET_ONLY",
      request: {
        receivableId,
        nossoNumero: snapshot.nossoNumero,
        expectedAmount: receivable.valor,
        expectedDueDate: String(receivable.data_vencimento || "").slice(0, 10),
      },
      response: raw,
      payments: snapshot.payments,
    },
  };
};

const claimOrRecover = async (input: {
  admin: Client;
  loaded: LoadedReceivable;
  authorizationRequestId: string;
  scope: IssuanceScope;
}) => {
  const current = input.loaded.receivable;
  if (hasAmbiguousGatewaySubmission(current)) {
    return { locked: current, recovering: true };
  }
  if (hasUnsafePartialBaneseEvidence(input.loaded)) {
    throw new Error(
      "O recebível possui identidade bancária parcial e exige revisão antes de nova emissão.",
    );
  }
  if (ownsAttempt(current, input.authorizationRequestId)) {
    return { locked: current, recovering: true };
  }
  const claimed = await claimExistingGatewayCheckout({
    admin: input.admin,
    receivable: current,
    providerCode: PROVIDER,
    attemptToken: input.authorizationRequestId,
    receivablePayload: {
      forma_pagamento: PAYMENT_METHOD,
      gateway_provider: PROVIDER,
      gateway_environment: ENVIRONMENT,
      gateway_payment_method: PAYMENT_METHOD,
      gateway_issuer_polo_id: input.scope.issuerPoloId,
      gateway_installments: 1,
    },
  });
  if (claimed) {
    return { locked: claimed as Record<string, unknown>, recovering: false };
  }
  const concurrent = await loadReceivable(input.admin, String(current.id));
  if (
    !hasAmbiguousGatewaySubmission(concurrent.receivable) &&
    !ownsAttempt(concurrent.receivable, input.authorizationRequestId)
  ) {
    throw new Error("Outra tentativa ainda possui o lock desta cobrança.");
  }
  return { locked: concurrent.receivable, recovering: true };
};

export const createReceivableIssuer = (input: {
  admin: Client;
  userClient: Client;
  supabaseUrl: string;
  getScope: () => IssuanceScope | null;
}) =>
async (context: ManualCycleContext, receivableId: string) => {
  const scope = input.getScope();
  if (
    !scope || !context.ciclo.recebiveis.some((row) => row.id === receivableId)
  ) {
    throw new Error("Recebível não pertence ao ciclo autorizado.");
  }
  let loaded = await loadReceivable(input.admin, receivableId);
  if (
    loaded.receivable.matricula_id !== scope.matriculaId ||
    loaded.receivable.turma_id !== scope.turmaId ||
    loaded.receivable.polo_id !== scope.poloId
  ) throw new Error("Recebível mudou de escopo durante a emissão.");

  const authorizationRequestId = await deterministicReceivableRequestId(
    context.requestId,
    receivableId,
  );
  const authorization = await input.userClient.rpc(
    "authorize_technical_manual_receivable_issuance_secure",
    {
      p_receivable_id: receivableId,
      p_request_id: authorizationRequestId,
    },
  );
  if (authorization.error || authorization.data?.authorized !== true) {
    throw authorization.error || new Error(
      "O recebível não foi autorizado para emissão Banese.",
    );
  }

  let locked: Record<string, unknown>;
  let recoveryOnly = false;
  let result: GatewayChargeResult;
  try {
    const claim = await claimOrRecover({
      admin: input.admin,
      loaded,
      authorizationRequestId,
      scope,
    });
    if (!claim.locked) return;
    loaded = await loadReceivable(input.admin, receivableId);
    locked = loaded.receivable;
    if (locked.gateway_issuer_polo_id !== scope.issuerPoloId) {
      throw new Error(
        "O emissor congelado no recebível diverge da Matriz canônica.",
      );
    }
    recoveryOnly = requiresBaneseReconciliation(
      locked,
      authorizationRequestId,
    );
    if (!recoveryOnly && hasUnsafePartialBaneseEvidence(loaded)) {
      throw Object.assign(
        new Error(
          "Há evidência bancária parcial; o item foi preservado para conciliação sem novo POST.",
        ),
        { remotePaymentCreated: true },
      );
    }
    if (recoveryOnly && loaded.transactions.length > 0) {
      throw new Error(
        "A tentativa ambígua já possui auditoria parcial e exige revisão.",
      );
    }
    if (recoveryOnly) {
      // API_AMBIGUOUS consulta somente o Nosso Número reservado. Esta rota
      // nunca chama o criador e, portanto, nunca envia um segundo POST.
      result = await recoverAmbiguousBaneseResult({
        admin: input.admin,
        loaded: { ...loaded, receivable: locked },
        scope,
      });
    } else {
      const financialTerms = await resolveCanonicalManualCycleBaneseTerms(
        input.admin,
        locked,
      );
      result = await createGatewayCharge({
        admin: input.admin,
        supabaseUrl: input.supabaseUrl,
        providerCode: PROVIDER,
        credentialId: scope.credentialId,
        environment: ENVIRONMENT,
        paymentMethod: PAYMENT_METHOD,
        receivable: locked,
        payer: payerForGateway(loaded.payer),
        amount: Number(locked.valor),
        description: String(locked.descricao || "Cobrança técnica"),
        dueDate: String(locked.data_vencimento || "").slice(0, 10),
        installments: 1,
        successUrl: null,
        failureUrl: null,
        pendingUrl: null,
        financialTerms,
        allowPendingBolePix: false,
      });
    }
  } catch (error) {
    const current = await loadReceivable(input.admin, receivableId).catch(
      () => loaded,
    );
    if (!skipManualCycleFailureMutation(error)) {
      await markFailure(input.admin, {
        receivableId,
        authorizationRequestId,
        remoteMayExist: recoveryOnly ||
          hasAmbiguousGatewaySubmission(current.receivable) ||
          hasUnsafePartialBaneseEvidence(current) ||
          remotePaymentMayExist(error),
        error,
      });
    }
    throw error;
  }

  let normalized: GatewayChargeResult;
  try {
    normalized = validateBaneseGatewayResult(result, locked);
  } catch (error) {
    await markFailure(input.admin, {
      receivableId,
      authorizationRequestId,
      remoteMayExist: true,
      error,
    });
    throw error;
  }

  try {
    const persistence = await input.admin.rpc(
      "persist_technical_manual_cycle_banese_issuance",
      {
        p_receivable_id: receivableId,
        p_authorization_request_id: authorizationRequestId,
        p_expected_creation_token: authorizationRequestId,
        p_result: normalized,
      },
    );
    if (persistence.error) throw persistence.error;
    if (
      persistence.data?.success !== true ||
      persistence.data?.status !== "EMITIDO" ||
      persistence.data?.receivableId !== receivableId
    ) {
      throw new Error(
        "A RPC canônica não confirmou o título e sua transação atômica.",
      );
    }
  } catch (error) {
    await markFailure(input.admin, {
      receivableId,
      authorizationRequestId,
      remoteMayExist: true,
      error,
    });
    throw error;
  }
};
