import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  cancelBaneseBoleto,
  queryBaneseBoleto,
} from "../banese/core/adapter.ts";
import type { BaneseFinancialTermsInput } from "../banese/internal/financial-terms.ts";
import {
  assertBaneseFinancialTermsEqual,
} from "../banese/internal/financial-terms-response.ts";
import { documentForGateway } from "../gateways/checkout/utils.ts";
import type { GatewayChargeResult } from "../gateways/router.ts";
import {
  DATABASE_UUID_RE,
  deterministicReceivableRequestId,
  parseCycleContext,
  validateBaneseGatewayResult,
} from "../technical-manual-cycle-issuance/contract.ts";
import type { InternalCycleRecoveryRequest } from "./contract.ts";

type Client = SupabaseClient;
type BaneseSnapshot = Awaited<ReturnType<typeof queryBaneseBoleto>>;
const REMOTE_RECOVERY_TIMEOUT_MS = 45_000;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const requiredRecord = async (
  query: PromiseLike<{ data: unknown; error: unknown }>,
  message: string,
) => {
  const { data, error } = await query;
  if (error) throw error;
  const record = asRecord(data);
  if (!Object.keys(record).length) throw new Error(message);
  return record;
};

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

const cancellationEvidenceFingerprint = async (canceled: {
  nossoNumero: unknown;
  situationCode: unknown;
  remoteStatus: unknown;
  alreadyCanceled: boolean;
  mutationAttempted: boolean;
  raw: unknown;
}) => {
  const evidence = JSON.stringify({
    nossoNumero: digits(canceled.nossoNumero),
    situationCode: Number(canceled.situationCode),
    remoteStatus: String(canceled.remoteStatus || "").toUpperCase(),
    alreadyCanceled: canceled.alreadyCanceled === true,
    mutationAttempted: canceled.mutationAttempted === true,
    sanitizedSnapshot: canceled.raw || null,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(evidence),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const assertUnpaidReviewTitle = (
  snapshot: BaneseSnapshot,
  expectedFinancialTerms: BaneseFinancialTermsInput,
) => {
  if (
    snapshot.paid || snapshot.payments.length > 0 || snapshot.paymentsError ||
    snapshot.financialTermsError || !snapshot.financialTerms ||
    ![2, 5].includes(snapshot.situationCode) ||
    (snapshot.situationCode === 2 && snapshot.remoteStatus !== "PENDING") ||
    (snapshot.situationCode === 5 &&
      !["CANCELED", "CANCELLED"].includes(snapshot.remoteStatus))
  ) {
    console.warn("technical manual cycle review GET rejected", {
      paid: snapshot.paid,
      paymentCount: snapshot.payments.length,
      paymentsError: Boolean(snapshot.paymentsError),
      financialTermsError: Boolean(snapshot.financialTermsError),
      hasFinancialTerms: Boolean(snapshot.financialTerms),
      hasPixPayload: Boolean(snapshot.pixPayload),
      hasPixImage: Boolean(snapshot.pixEncodedImage),
      remoteStatus: snapshot.remoteStatus,
      situationCode: snapshot.situationCode,
    });
    throw new Error(
      "A consulta GET não confirmou o título Banese íntegro e não pago.",
    );
  }
  assertBaneseFinancialTermsEqual(
    expectedFinancialTerms,
    snapshot.financialTerms,
  );
  if (Boolean(snapshot.pixPayload) !== Boolean(snapshot.pixEncodedImage)) {
    throw new Error("O GET Banese retornou um par Pix parcial.");
  }
};

const assertOpenUnpaidTitle = (
  snapshot: BaneseSnapshot,
  expectedFinancialTerms: BaneseFinancialTermsInput,
) => {
  assertUnpaidReviewTitle(snapshot, expectedFinancialTerms);
  if (snapshot.situationCode !== 2 || snapshot.remoteStatus !== "PENDING") {
    throw new Error("O título Banese não está aberto para recuperar o Pix.");
  }
};

const recoveredGatewayResult = (
  snapshot: BaneseSnapshot,
  receivable: Record<string, unknown>,
  receivableId: string,
): GatewayChargeResult => {
  if (!snapshot.pixPayload || !snapshot.pixEncodedImage) {
    throw new Error("O GET Banese não retornou o par Pix completo.");
  }
  const raw = asRecord(snapshot.raw);
  return validateBaneseGatewayResult({
    providerCode: "banese_card",
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
    issuerPoloId: String(receivable.gateway_issuer_polo_id || ""),
    financialTerms: snapshot.financialTerms,
    rawPayload: {
      recoveryMode: "BANESE_REVIEW_EXACT_GET_ONLY",
      request: {
        receivableId,
        nossoNumero: snapshot.nossoNumero,
        expectedAmount: receivable.valor,
        expectedDueDate: String(receivable.data_vencimento || "").slice(0, 10),
      },
      response: raw,
      payments: snapshot.payments,
    },
  }, receivable);
};

const persistRecoveredSnapshot = async (
  admin: Client,
  expected: Record<string, unknown>,
  snapshot: BaneseSnapshot,
  receivable: Record<string, unknown>,
  receivableId: string,
) => {
  assertOpenUnpaidTitle(
    snapshot,
    receivable.gateway_financial_terms as BaneseFinancialTermsInput,
  );
  const { data: persisted, error: persistError } = await admin.rpc(
    "persist_technical_manual_cycle_banese_review_recovery_service",
    {
      ...expected,
      p_result: recoveredGatewayResult(snapshot, receivable, receivableId),
    },
  );
  if (
    persistError || persisted?.success !== true ||
    persisted?.reviewRecovered !== true || persisted?.status !== "EMITIDO"
  ) {
    throw persistError || new Error(
      "A persistência atômica do GET-only não foi confirmada.",
    );
  }
};

const recoverReviewedReceivableWithinDeadline = async (
  admin: Client,
  internal: InternalCycleRecoveryRequest,
  cycleRequestId: string,
  receivableId: string,
  signal: AbortSignal,
) => {
  const recoveryRequestId = await deterministicReceivableRequestId(
    cycleRequestId,
    receivableId,
  );
  const expected = {
    p_receivable_id: receivableId,
    p_recovery_request_id: recoveryRequestId,
    p_expected_matricula_id: internal.matriculaId,
    p_expected_cycle_number: internal.cicloNumero,
    p_expected_cycle_request_id: internal.expectedCycleRequestId,
    p_expected_item_count: internal.expectedItemCount,
  };
  const { data: claim, error: claimError } = await admin.rpc(
    "claim_technical_manual_cycle_banese_review_recovery_service",
    expected,
  );
  if (
    claimError || claim?.claimed !== true ||
    claim?.receivableId !== receivableId ||
    claim?.authorizationRequestId !== recoveryRequestId
  ) {
    throw claimError || new Error("O claim GET-only não foi confirmado.");
  }

  const receivable = await requiredRecord(
    admin.from("contas_receber").select("*").eq("id", receivableId)
      .maybeSingle(),
    "Recebível em revisão não encontrado.",
  );
  if (
    receivable.gateway_creation_token !== recoveryRequestId ||
    receivable.gateway_submission_status !== "API_REVIEW"
  ) {
    throw new Error("O recebível mudou após o claim GET-only.");
  }
  const [payer, route] = await Promise.all([
    requiredRecord(
      admin.from("parceiros").select("cpf_cnpj").eq(
        "id",
        String(receivable.cliente_id || ""),
      ).maybeSingle(),
      "Pagador da conciliação não encontrado.",
    ),
    requiredRecord(
      admin.from("payment_gateway_routes").select("credential_id")
        .eq("modalidade", "TECNICO").eq("payment_method", "BOLETO")
        .eq("environment", "production").eq("enabled", true).maybeSingle(),
      "Rota Banese da conciliação não encontrada.",
    ),
  ]);
  const credential = await requiredRecord(
    admin.from("payment_gateway_credentials").select("metadata").eq(
      "id",
      String(route.credential_id || ""),
    ).eq("provider_code", "banese_card").eq("environment", "production")
      .maybeSingle(),
    "Credencial Banese da conciliação não encontrada.",
  );
  const metadata = asRecord(credential.metadata);
  const bankIdentity = {
    convenio: receivable.gateway_boleto_convenio ||
      metadata.baneseBoletoConvenio || metadata.baneseConvenio,
    nossoNumero: receivable.gateway_boleto_nosso_numero,
    expectedAmount: receivable.valor,
    expectedDueDate: String(receivable.data_vencimento || "").slice(0, 10),
    expectedAgency: receivable.gateway_boleto_agencia || metadata.baneseAgencia,
    expectedAccount: metadata.baneseConta || metadata.baneseContaDisplay,
    expectedDocumentNumber: receivableId.slice(0, 15),
    expectedCompanyTitleId: receivableId.slice(0, 25),
    expectedPayerDocument: documentForGateway(payer.cpf_cnpj),
    expectedFinancialTerms: receivable
      .gateway_financial_terms as BaneseFinancialTermsInput,
  };
  const queryExactTitle = () =>
    queryBaneseBoleto(admin as never, "production", {
      ...bankIdentity,
      recoverPix: true,
      validateTitleIdentity: true,
      signal,
    });
  const snapshot = await queryExactTitle();
  assertUnpaidReviewTitle(snapshot, bankIdentity.expectedFinancialTerms);
  if (
    snapshot.situationCode === 2 && snapshot.pixPayload &&
    snapshot.pixEncodedImage
  ) {
    await persistRecoveredSnapshot(
      admin,
      expected,
      snapshot,
      receivable,
      receivableId,
    );
    return;
  }

  const fenced = await requiredRecord(
    admin.rpc(
      "begin_technical_manual_cycle_banese_review_cancel_service",
      expected,
    ),
    "O fence de substituição do título técnico não foi criado.",
  );
  const leaseToken = String(fenced.leaseToken || "");
  if (
    fenced.fenced !== true || fenced.receivableId !== receivableId ||
    fenced.recoveryRequestId !== recoveryRequestId ||
    fenced.authorizationRequestId !== recoveryRequestId ||
    digits(fenced.canceledNossoNumero) !== snapshot.nossoNumero ||
    !["CANCEL_ALLOWED", "CANCEL_ALLOWED_AFTER_GET"].includes(
      String(fenced.mode || ""),
    ) ||
    !DATABASE_UUID_RE.test(leaseToken)
  ) {
    throw new Error("O fence Banese não corresponde ao título consultado.");
  }

  const cancelResult = await cancelBaneseBoleto(
    admin as never,
    "production",
    {
      ...bankIdentity,
      stopWhenPixAvailable: true,
      expectedDigitableLine: receivable.gateway_boleto_linha_digitavel,
      expectedBarcode: receivable.gateway_boleto_codigo_barras,
      signal,
      onMutationStart: async () => {
        const intent = await requiredRecord(
          admin.rpc(
            "mark_technical_manual_cycle_banese_cancel_intent_service",
            { ...expected, p_lease_token: leaseToken },
          ),
          "A intenção de baixa do título técnico não foi registrada.",
        );
        if (
          intent.intent !== true || intent.receivableId !== receivableId ||
          intent.recoveryRequestId !== recoveryRequestId ||
          intent.leaseToken !== leaseToken ||
          digits(intent.canceledNossoNumero) !== snapshot.nossoNumero
        ) {
          throw new Error("A intenção de baixa divergiu do fence Banese.");
        }
      },
    },
  );

  if (cancelResult.pixAvailable) {
    const recovered = await queryExactTitle();
    await persistRecoveredSnapshot(
      admin,
      expected,
      recovered,
      receivable,
      receivableId,
    );
    return;
  }

  const prepared = await requiredRecord(
    admin.rpc(
      "prepare_technical_manual_cycle_banese_reissue_service",
      {
        ...expected,
        p_lease_token: leaseToken,
        p_confirmed_remote_status: cancelResult.remoteStatus,
        p_confirmed_situation_code: cancelResult.situationCode,
        p_confirmed_at: new Date().toISOString(),
        p_cancel_fingerprint: await cancellationEvidenceFingerprint(
          cancelResult,
        ),
        p_already_canceled: cancelResult.alreadyCanceled,
        p_mutation_attempted: cancelResult.mutationAttempted,
      },
    ),
    "A baixa confirmada não preparou a reemissão técnica.",
  );
  if (
    prepared.ready !== true || prepared.receivableId !== receivableId ||
    prepared.recoveryRequestId !== recoveryRequestId ||
    prepared.canceledNossoNumero !== snapshot.nossoNumero ||
    prepared.requiresNewNossoNumero !== true
  ) {
    throw new Error("O reset confirmado divergiu do título Banese cancelado.");
  }
};

const recoverReviewedReceivable = async (
  admin: Client,
  internal: InternalCycleRecoveryRequest,
  cycleRequestId: string,
  receivableId: string,
) => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () =>
      controller.abort(
        new Error("Tempo total da recuperação Banese excedido."),
      ),
    REMOTE_RECOVERY_TIMEOUT_MS,
  );
  try {
    await recoverReviewedReceivableWithinDeadline(
      admin,
      internal,
      cycleRequestId,
      receivableId,
      controller.signal,
    );
  } finally {
    clearTimeout(timeout);
  }
};

export const recoverReviewedCycleItems = async (
  admin: Client,
  internal: InternalCycleRecoveryRequest,
) => {
  const { data, error } = await admin.rpc(
    "obter_emissao_ciclo_financeiro_tecnico_manual_service",
    {
      p_matricula_id: internal.matriculaId,
      p_ciclo_numero: internal.cicloNumero,
    },
  );
  if (error) throw error;
  const context = parseCycleContext(data);
  if (
    context.requestId !== internal.expectedCycleRequestId ||
    context.ciclo.quantidadeItens !== internal.expectedItemCount
  ) throw new Error("O contexto GET-only divergiu do run esperado.");
  const reviewed = context.ciclo.recebiveis.filter((item) =>
    item.emissaoBanese === "REVISAO_MANUAL"
  );
  for (const item of reviewed) {
    await recoverReviewedReceivable(
      admin,
      internal,
      context.requestId,
      item.id,
    );
  }
  return reviewed.length;
};
