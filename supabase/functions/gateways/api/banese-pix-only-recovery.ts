import { queryBaneseBoleto } from "../../banese/core/adapter/boleto-query.ts";
import { normalizeBaneseFinancialTerms } from "../../banese/internal/financial-terms.ts";
import { assertBaneseFinancialTermsEqual } from "../../banese/internal/financial-terms-response.ts";
import type { Environment } from "./config.ts";
import {
  assertBaneseReceivableTitleCompatible,
  assertBaneseReconciliationProvenance,
} from "./banese-reconciliation-contract.ts";
import { recoverBanesePixBeforeFinancialReconciliation } from "./banese-pix-recovery.ts";
import { loadBaneseExpectedTransactions } from "./banese-reconciliation-persistence.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RecoveryContext = {
  receivable: Record<string, any>;
  metadata: Record<string, any>;
  payerDocument: string;
  transactions: Array<Record<string, any>>;
};

type PixOnlyRecoveryDependencies = {
  readContext?: (admin: any, receivableId: string) => Promise<RecoveryContext>;
  queryBoleto?: typeof queryBaneseBoleto;
  recoverPix?: typeof recoverBanesePixBeforeFinancialReconciliation;
  signal?: AbortSignal;
};

export const BANESE_PIX_ONLY_TIMEOUT_MS = 8_000;

const readRecoveryContext = async (
  admin: any,
  receivableId: string,
): Promise<RecoveryContext> => {
  const { data: receivable, error: receivableError } = await admin
    .from("contas_receber")
    .select("*")
    .eq("id", receivableId)
    .maybeSingle();
  if (receivableError) throw receivableError;
  if (!receivable) throw new Error("Cobranca nao encontrada.");

  const { data: credential, error: credentialError } = await admin
    .from("payment_gateway_credentials")
    .select("metadata")
    .eq("provider_code", "banese_card")
    .eq("environment", "production")
    .maybeSingle();
  if (credentialError) throw credentialError;
  const metadata = credential?.metadata &&
      typeof credential.metadata === "object" &&
      !Array.isArray(credential.metadata)
    ? credential.metadata
    : {};

  const { data: payer, error: payerError } = await admin
    .from("parceiros")
    .select("cpf_cnpj")
    .eq("id", receivable.cliente_id)
    .maybeSingle();
  if (payerError) throw payerError;
  const payerDocument = String(payer?.cpf_cnpj ?? "").replace(/\D/g, "");

  const transactions = await loadBaneseExpectedTransactions(admin, {
    receivableId,
    environment: "production",
  });
  return { receivable, metadata, payerDocument, transactions };
};

const normalizedRemoteTitleNumber = (value: unknown) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!/^\d{1,9}$/.test(digits)) {
    throw new Error("Nosso Numero retornado pelo Banese e invalido.");
  }
  return digits.padStart(9, "0");
};

/**
 * Recupera apenas o BolePix oficial. Esta operação nunca cria outro título,
 * não liquida o recebível e não executa efeitos acadêmicos.
 */
export const recoverBanesePixOnly = async (
  admin: any,
  receivableIdValue: unknown,
  dependencies: PixOnlyRecoveryDependencies = {},
) => {
  const receivableId = String(receivableIdValue ?? "").trim();
  if (!UUID_RE.test(receivableId)) {
    throw new Error("Cobranca invalida para recuperacao BolePix Banese.");
  }

  const context = await (dependencies.readContext ?? readRecoveryContext)(
    admin,
    receivableId,
  );
  const { receivable, metadata, payerDocument, transactions } = context;
  if (String(receivable.id ?? "") !== receivableId) {
    throw new Error("Recuperacao BolePix carregou cobranca divergente.");
  }
  if (
    receivable.gateway_provider !== "banese_card" ||
    String(receivable.gateway_payment_method ?? "").toUpperCase() !== "BOLETO"
  ) {
    throw new Error("Cobranca nao pertence ao boleto Banese.");
  }
  const environment = String(receivable.gateway_environment ?? "")
    .toLowerCase() as Environment;
  if (environment !== "production") {
    throw new Error("Recuperacao BolePix automatica requer producao.");
  }

  const persistedPixPayload = String(
    receivable.gateway_pix_payload ?? "",
  ).trim();
  const persistedPixImage = String(
    receivable.gateway_pix_encoded_image ?? "",
  ).trim();
  if (Boolean(persistedPixPayload) !== Boolean(persistedPixImage)) {
    throw new Error(
      "Titulo Banese possui snapshot Pix incompleto; a recuperacao automatica foi bloqueada.",
    );
  }
  if (persistedPixPayload) {
    return { receivable, queried: false, recovered: false };
  }

  if (
    !receivable.gateway_financial_terms ||
    typeof receivable.gateway_financial_terms !== "object" ||
    !receivable.gateway_financial_terms_confirmed_at
  ) {
    throw new Error(
      "Titulo Banese nao possui termos financeiros confirmados para recuperar Pix.",
    );
  }
  const financialTerms = normalizeBaneseFinancialTerms(
    receivable.gateway_financial_terms,
  );
  if (
    Math.round(financialTerms.nominalAmount * 100) !==
      Math.round(Number(receivable.valor ?? 0) * 100) ||
    financialTerms.dueDate !==
      String(receivable.data_vencimento ?? "").slice(0, 10)
  ) {
    throw new Error(
      "Pedido financeiro canonico Banese diverge do recebivel; a recuperacao Pix foi bloqueada.",
    );
  }
  if (![11, 14].includes(payerDocument.length)) {
    throw new Error(
      "Titulo Banese nao possui CPF/CNPJ canonico para validar a consulta Pix.",
    );
  }

  const nossoNumero = assertBaneseReceivableTitleCompatible(receivable);
  assertBaneseReconciliationProvenance(
    receivable,
    transactions,
    nossoNumero,
  );
  const convenio = receivable.gateway_boleto_convenio ||
    metadata.baneseBoletoConvenio || metadata.baneseConvenio;
  const signal = dependencies.signal ??
    AbortSignal.timeout(BANESE_PIX_ONLY_TIMEOUT_MS);
  const snapshot = await (dependencies.queryBoleto ?? queryBaneseBoleto)(
    admin,
    environment,
    {
      convenio,
      nossoNumero,
      recoverPix: true,
      validateTitleIdentity: true,
      expectedAmount: financialTerms.nominalAmount,
      expectedDueDate: financialTerms.dueDate,
      expectedAgency: receivable.gateway_boleto_agencia ||
        metadata.baneseAgencia,
      expectedAccount: metadata.baneseConta || metadata.baneseContaDisplay,
      expectedDocumentNumber: receivableId.slice(0, 15),
      expectedCompanyTitleId: receivableId.slice(0, 25),
      expectedPayerDocument: payerDocument,
      signal,
    },
  );
  const remoteNossoNumero = normalizedRemoteTitleNumber(snapshot.nossoNumero);
  if (remoteNossoNumero !== nossoNumero) {
    throw new Error(
      "Nosso Numero retornado pelo Banese diverge do titulo recuperado.",
    );
  }
  if (snapshot.paymentsError) throw snapshot.paymentsError;
  if (
    snapshot.situationCode !== 2 ||
    String(snapshot.remoteStatus ?? "").toUpperCase() !== "PENDING" ||
    snapshot.paid !== false ||
    !Array.isArray(snapshot.payments) ||
    snapshot.payments.length !== 0
  ) {
    throw new Error(
      "Boleto remoto nao esta pendente e sem pagamento confirmado; a recuperacao Pix foi bloqueada.",
    );
  }
  if (snapshot.financialTermsError) throw snapshot.financialTermsError;
  assertBaneseFinancialTermsEqual(
    financialTerms,
    snapshot.financialTerms!,
  );

  const recovery = await (dependencies.recoverPix ??
    recoverBanesePixBeforeFinancialReconciliation)(admin, {
      receivable,
      environment,
      convenio,
      nossoNumero: remoteNossoNumero,
      snapshot,
      persistedPixPayload: "",
      persistedPixEncodedImage: "",
      requirePayableStateCas: true,
    });
  return {
    receivable,
    queried: true,
    recovered: recovery.persisted,
  };
};
