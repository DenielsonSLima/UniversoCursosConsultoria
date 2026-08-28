import {
  ensureBaneseBoletoFinancialTerms,
  queryBaneseBoleto,
} from "../../banese/core/adapter.ts";
import {
  normalizeBaneseFinancialTerms,
  type NormalizedBaneseFinancialTerms,
} from "../../banese/internal/financial-terms.ts";
import { assertBaneseFinancialTermsEqual } from "../../banese/internal/financial-terms-response.ts";
import {
  assertBaneseAsbaceField,
  assertBaneseBankNumbers,
  assertBaneseDueDateFactor,
} from "../../banese/internal/bank-fields.ts";
import { requireGatewayEnvironment } from "./environment.ts";
import { resolveBaneseReceivableFinancialTerms } from "./banese-financial-terms.ts";
import {
  assertBaneseReceivableTitleCompatible,
  assertBaneseReconciliationProvenance,
  assertBaneseTitleNumber,
  assertBaneseTransactionPixCompatible,
  onlyBaneseDigits,
} from "./banese-reconciliation-contract.ts";
import { loadBaneseExpectedTransactions } from "./banese-reconciliation-persistence.ts";
import {
  assertDiscountRemovalRemoteProof,
  withRepairStage,
} from "./banese-discount-removal-stages.ts";

export const BANESE_DISCOUNT_REMOVAL_PENDING =
  "BANESE_DISCOUNT_REMOVAL_PENDING:T42_REMATRICULA_NO_DISCOUNT";

type RepairContext = {
  metadata: Record<string, unknown>;
  payerDocument: string;
  canonicalFinancialTerms: NormalizedBaneseFinancialTerms;
};

type PersistInput = {
  receivable: Record<string, any>;
  environment: "production";
  nossoNumero: string;
  expectedFinancialTerms: NormalizedBaneseFinancialTerms;
  correctedFinancialTerms: NormalizedBaneseFinancialTerms;
  expectedTechnicalSnapshot: Record<string, unknown>;
  correctedTechnicalSnapshot: Record<string, unknown>;
  remoteSnapshot: Record<string, unknown>;
  actorId: string | null;
};

type RepairDependencies = {
  loadContext?: (
    admin: any,
    receivable: Record<string, any>,
  ) => Promise<RepairContext>;
  loadTransactions?: typeof loadBaneseExpectedTransactions;
  queryBoleto?: typeof queryBaneseBoleto;
  ensureFinancialTerms?: typeof ensureBaneseBoletoFinancialTerms;
  persistCorrection?: (
    admin: any,
    input: PersistInput,
  ) => Promise<Record<string, any>>;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const uuid = (value: unknown) => {
  const normalized = String(value || "").trim();
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
      .test(normalized)
    ? normalized
    : "";
};

const sameJson = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

const termsMatch = (
  expected: NormalizedBaneseFinancialTerms,
  actual: NormalizedBaneseFinancialTerms,
) => {
  try {
    assertBaneseFinancialTermsEqual(expected, actual);
    return true;
  } catch {
    return false;
  }
};

const assertOnlyDiscountRemoved = (
  expected: NormalizedBaneseFinancialTerms,
  corrected: NormalizedBaneseFinancialTerms,
) => {
  if (!expected.discount || corrected.discount !== null) {
    throw new Error(
      "Reparo Banese exige um unico desconto confirmado para remover.",
    );
  }
  if (
    expected.nominalAmount !== corrected.nominalAmount ||
    expected.dueDate !== corrected.dueDate ||
    !sameJson(expected.penalty, corrected.penalty) ||
    !sameJson(expected.interest, corrected.interest)
  ) {
    throw new Error(
      "Reparo Banese tentou alterar termos alem do desconto da rematricula.",
    );
  }
};

const loadRepairContext = async (
  admin: any,
  receivable: Record<string, any>,
): Promise<RepairContext> => {
  const clienteId = uuid(receivable.cliente_id);
  if (!clienteId) {
    throw new Error(
      "Rematricula Banese nao possui identidade academica completa.",
    );
  }

  const [credentialResult, payerResult, canonicalFinancialTerms] = await Promise
    .all([
      admin.from("payment_gateway_credentials")
        .select("metadata")
        .eq("provider_code", "banese_card")
        .eq("environment", "production")
        .maybeSingle(),
      admin.from("parceiros").select("cpf_cnpj").eq("id", clienteId)
        .maybeSingle(),
      resolveBaneseReceivableFinancialTerms(admin, receivable).then(
        normalizeBaneseFinancialTerms,
      ),
    ]);

  for (const result of [credentialResult, payerResult]) {
    if (result.error) throw result.error;
  }
  const payerDocument = onlyBaneseDigits(payerResult.data?.cpf_cnpj);
  if (![11, 14].includes(payerDocument.length)) {
    throw new Error(
      "Rematricula Banese nao possui documento canonico do pagador.",
    );
  }

  return {
    metadata: asRecord(credentialResult.data?.metadata),
    payerDocument,
    canonicalFinancialTerms,
  };
};

const persistDiscountRemoval = async (
  admin: any,
  input: PersistInput,
) => {
  const { data, error } = await admin.rpc(
    "persist_banese_discount_removal_correction",
    {
      p_receivable_id: input.receivable.id,
      p_expected_updated_at: input.receivable.updated_at,
      p_expected_financial_terms: input.expectedFinancialTerms,
      p_corrected_financial_terms: input.correctedFinancialTerms,
      p_expected_technical_snapshot: input.expectedTechnicalSnapshot,
      p_corrected_technical_snapshot: input.correctedTechnicalSnapshot,
      p_environment: input.environment,
      p_nosso_numero: input.nossoNumero,
      p_remote_snapshot: input.remoteSnapshot,
      p_actor_id: input.actorId,
    },
  );
  if (error) throw error;
  const updated = asRecord(data?.receivable);
  if (String(updated.id || "") !== String(input.receivable.id)) {
    throw new Error(
      "Persistencia auditada do reparo Banese retornou contrato invalido.",
    );
  }
  return updated;
};

const assertPersistedIdentity = (
  before: Record<string, any>,
  updated: Record<string, any>,
  correctedTerms: NormalizedBaneseFinancialTerms,
) => {
  const immutableKeys = [
    "id",
    "valor",
    "data_vencimento",
    "gateway_provider",
    "gateway_environment",
    "gateway_payment_method",
    "gateway_payment_id",
    "gateway_boleto_nosso_numero",
    "gateway_boleto_linha_digitavel",
    "gateway_boleto_codigo_barras",
    "gateway_pix_payload",
    "gateway_pix_encoded_image",
  ];
  if (immutableKeys.some((key) => updated[key] !== before[key])) {
    throw new Error(
      "Persistencia do reparo alterou a identidade imutavel do boleto Banese.",
    );
  }
  const persistedTerms = normalizeBaneseFinancialTerms(
    updated.gateway_financial_terms,
  );
  assertBaneseFinancialTermsEqual(correctedTerms, persistedTerms);
  if (
    asRecord(updated.regra_financeira_tecnica_snapshot)
        .aplicarDesconto !== false ||
    updated.gateway_last_error !== null
  ) {
    throw new Error(
      "Persistencia do reparo nao confirmou a regra sem desconto.",
    );
  }
};

export const repairMarkedBaneseReenrollmentDiscount = async (
  admin: any,
  input: {
    receivable: Record<string, any>;
    actorId?: string | null;
  },
  dependencies: RepairDependencies = {},
) => {
  const receivable = input.receivable;
  if (
    String(receivable.gateway_last_error || "") !==
      BANESE_DISCOUNT_REMOVAL_PENDING
  ) {
    throw new Error("Titulo Banese nao esta marcado para este reparo.");
  }
  if (
    String(receivable.tipo_lancamento || "").toUpperCase() !==
      "REMATRICULA" ||
    String(receivable.status || "").toUpperCase() !== "PENDENTE" ||
    receivable.gateway_provider !== "banese_card" ||
    String(receivable.gateway_payment_method || "").toUpperCase() !==
      "BOLETO" ||
    String(receivable.gateway_submission_channel || "").toUpperCase() !==
      "API" ||
    String(receivable.gateway_submission_status || "").toUpperCase() !==
      "API_REGISTERED"
  ) {
    throw new Error(
      "Marcador de reparo nao pertence a uma rematricula Banese pendente e registrada.",
    );
  }
  if (
    !uuid(receivable.id) || !uuid(receivable.cliente_id) ||
    !uuid(receivable.matricula_id) || !uuid(receivable.turma_id) ||
    !uuid(receivable.gateway_issuer_polo_id) ||
    String(receivable.gateway_status || "").trim().toUpperCase() !==
      "PENDING" ||
    Number(receivable.parcela_numero) !== 0 ||
    Math.round(Number(receivable.valor) * 100) !== 10_000 ||
    Boolean(receivable.gateway_cnab_file_id) ||
    receivable.data_pagamento != null || receivable.valor_pago != null ||
    receivable.gateway_settlement_evidence != null ||
    receivable.gateway_settlement_recorded_at != null
  ) {
    throw new Error(
      "Rematricula marcada nao possui identidade completa de titulo pendente.",
    );
  }
  const environment = requireGatewayEnvironment(
    receivable.gateway_environment,
    "reparo de rematricula Banese",
  );
  if (environment !== "production") {
    throw new Error("Reparo marcado de desconto aceita somente producao.");
  }
  if (
    !receivable.gateway_financial_terms_confirmed_at ||
    !receivable.gateway_boleto_issued_at ||
    !receivable.gateway_pix_payload ||
    !receivable.gateway_pix_encoded_image
  ) {
    throw new Error(
      "Rematricula marcada nao possui termos e Pix oficiais completos.",
    );
  }

  const nossoNumero = assertBaneseReceivableTitleCompatible(receivable);
  const expectedTerms = normalizeBaneseFinancialTerms(
    receivable.gateway_financial_terms,
  );
  const correctedTerms = normalizeBaneseFinancialTerms({
    ...expectedTerms,
    discount: null,
  });
  assertOnlyDiscountRemoved(expectedTerms, correctedTerms);

  const expectedTechnicalSnapshot = asRecord(
    receivable.regra_financeira_tecnica_snapshot,
  );
  if (
    expectedTechnicalSnapshot.tipoLancamento !== "REMATRICULA" ||
    expectedTechnicalSnapshot.aplicarDesconto !== true
  ) {
    throw new Error(
      "Snapshot tecnico nao comprova o desconto indevido da rematricula.",
    );
  }
  const correctedTechnicalSnapshot = {
    ...expectedTechnicalSnapshot,
    aplicarDesconto: false,
  };

  const context = await withRepairStage(
    "LOCAL_CONTEXT",
    () => (dependencies.loadContext ?? loadRepairContext)(admin, receivable),
  );
  if (
    context.canonicalFinancialTerms.nominalAmount !==
      correctedTerms.nominalAmount ||
    context.canonicalFinancialTerms.dueDate !== correctedTerms.dueDate ||
    context.canonicalFinancialTerms.discount !== null
  ) {
    throw new Error(
      "Regra canonica nao confirma a rematricula sem desconto.",
    );
  }
  const convenio = onlyBaneseDigits(
    receivable.gateway_boleto_convenio ||
      context.metadata.baneseBoletoConvenio || context.metadata.baneseConvenio,
  );
  const expectedAgency = onlyBaneseDigits(
    receivable.gateway_boleto_agencia || context.metadata.baneseAgencia,
  ).padStart(3, "0");
  const expectedAccount = onlyBaneseDigits(
    context.metadata.baneseConta || context.metadata.baneseContaDisplay,
  );
  if (!convenio || expectedAgency.length !== 3 || !expectedAccount) {
    throw new Error(
      "Rematricula marcada nao possui convenio, agencia e conta completos.",
    );
  }
  const bankNumbers = assertBaneseBankNumbers(
    receivable.gateway_boleto_linha_digitavel,
    receivable.gateway_boleto_codigo_barras,
  );
  assertBaneseDueDateFactor(bankNumbers.barcode, correctedTerms.dueDate);
  assertBaneseAsbaceField(bankNumbers.barcode, {
    agency: expectedAgency,
    account: expectedAccount,
    ourNumber: nossoNumero,
  });
  if (
    Number(bankNumbers.barcode.slice(9, 19)) !==
      Math.round(correctedTerms.nominalAmount * 100)
  ) {
    throw new Error(
      "Valor da rematricula diverge do codigo de barras Banese persistido.",
    );
  }
  const expectedTransactions = await withRepairStage(
    "LOCAL_TRANSACTIONS",
    () =>
      (dependencies.loadTransactions ?? loadBaneseExpectedTransactions)(
        admin,
        { receivableId: String(receivable.id), environment },
      ),
  );
  assertBaneseReconciliationProvenance(
    receivable,
    expectedTransactions,
    nossoNumero,
  );
  if (expectedTransactions.length !== 1) {
    throw new Error(
      "Rematricula Banese nao possui uma unica transacao comprovada.",
    );
  }
  const transaction = expectedTransactions[0];
  assertBaneseTransactionPixCompatible(
    expectedTransactions,
    receivable.gateway_pix_payload,
    receivable.gateway_pix_encoded_image,
  );
  if (
    String(transaction.remote_status || "").trim().toUpperCase() !==
      "PENDING" ||
    onlyBaneseDigits(transaction.bank_slip_digitable_line) !==
      bankNumbers.digitableLine ||
    onlyBaneseDigits(transaction.bank_slip_barcode) !== bankNumbers.barcode
  ) {
    throw new Error(
      "Transacao da rematricula diverge do titulo Banese marcado.",
    );
  }

  const externalReference = String(receivable.id);
  const preflight = await withRepairStage(
    "BANK_PREFLIGHT",
    () =>
      (dependencies.queryBoleto ?? queryBaneseBoleto)(admin, environment, {
        convenio,
        nossoNumero,
        validateTitleIdentity: true,
        expectedAmount: expectedTerms.nominalAmount,
        expectedDueDate: expectedTerms.dueDate,
        expectedAgency,
        expectedAccount,
        expectedDocumentNumber: externalReference.slice(0, 15),
        expectedCompanyTitleId: externalReference.slice(0, 25),
        expectedPayerDocument: context.payerDocument,
      }),
  );
  if (
    assertBaneseTitleNumber(preflight.nossoNumero) !== nossoNumero ||
    preflight.situationCode !== 2 || preflight.paid ||
    preflight.payments.length !== 0 || preflight.paymentsError ||
    preflight.financialTermsError || !preflight.financialTerms
  ) {
    throw new Error(
      "Boleto remoto nao esta pendente e integralmente confirmado para remover desconto.",
    );
  }
  const remoteStillHasDiscount = termsMatch(
    expectedTerms,
    preflight.financialTerms,
  );
  const remoteAlreadyCorrected = termsMatch(
    correctedTerms,
    preflight.financialTerms,
  );
  if (!remoteStillHasDiscount && !remoteAlreadyCorrected) {
    throw new Error(
      "Termos remotos nao correspondem ao estado anterior nem ao reparo esperado.",
    );
  }

  const ensured = remoteAlreadyCorrected
    ? { financialTerms: preflight.financialTerms, raw: preflight.raw }
    : await withRepairStage(
      "BANK_UPDATE",
      () =>
        (dependencies.ensureFinancialTerms ??
          ensureBaneseBoletoFinancialTerms)(admin, environment, {
            convenio,
            nossoNumero,
            nominalAmount: correctedTerms.nominalAmount,
            dueDate: correctedTerms.dueDate,
            financialTerms: correctedTerms,
            allowDiscountRemoval: true,
          }),
    );
  assertBaneseFinancialTermsEqual(correctedTerms, ensured.financialTerms);
  const ensuredRaw = asRecord(ensured.raw);
  assertDiscountRemovalRemoteProof({
    snapshot: ensuredRaw,
    receivable,
    nossoNumero,
    amount: correctedTerms.nominalAmount,
    dueDate: correctedTerms.dueDate,
  });
  if (
    Number(
      ensuredRaw.CodigoSituacaoBoleto ?? ensuredRaw.codigoSituacaoBoleto,
    ) !== 2
  ) {
    throw new Error(
      "Boleto Banese deixou de estar pendente durante o reparo do desconto.",
    );
  }

  const updated = await withRepairStage(
    "LOCAL_PERSISTENCE",
    () =>
      (dependencies.persistCorrection ?? persistDiscountRemoval)(admin, {
        receivable,
        environment,
        nossoNumero,
        expectedFinancialTerms: expectedTerms,
        correctedFinancialTerms: correctedTerms,
        expectedTechnicalSnapshot,
        correctedTechnicalSnapshot,
        remoteSnapshot: ensuredRaw,
        actorId: input.actorId ?? null,
      }),
  );
  assertPersistedIdentity(receivable, updated, correctedTerms);

  return {
    success: true,
    repairedDiscount: true,
    receivable: updated,
    remoteStatus: preflight.remoteStatus,
    paid: false,
    payments: 0,
    futureSyncWarning: null,
  };
};
