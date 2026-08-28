import { queryBaneseBoleto } from "../../banese/core/adapter.ts";
import {
  calculateBaneseAcceptablePaymentRange,
  normalizeBaneseFinancialTerms,
} from "../../banese/internal/financial-terms.ts";
import { assertBaneseFinancialTermsEqual } from "../../banese/internal/financial-terms-response.ts";
import type { Environment } from "./config.ts";
import { requireGatewayEnvironment } from "./environment.ts";
import {
  dependencyBillingSnapshotFrom,
  isDependencyReceivable,
} from "../../banese/internal/dependency-billing.ts";
import {
  assertBaneseReceivableTitleCompatible,
  assertBaneseReconciliationProvenance,
  assertBaneseTitleNumber,
  banesePaymentDate,
  classifyBaneseSettlementMethod,
  sumBanesePaymentValues,
} from "./banese-reconciliation-contract.ts";
import { recoverBanesePixBeforeFinancialReconciliation } from "./banese-pix-recovery.ts";
import {
  loadBaneseExpectedTransactions,
  persistBaneseReconciliationSnapshot,
} from "./banese-reconciliation-persistence.ts";
import {
  BANESE_POST_SETTLEMENT_PENDING_PREFIX,
  throwBanesePostSettlementPending,
} from "./banese-post-settlement.ts";
import { completeBanesePostSettlement } from "./banese-post-settlement-projection.ts";

export {
  baneseReceivableTitleFilter,
  baneseTransactionTitleFilter,
  classifyBaneseSettlementMethod,
  sumBanesePaymentValues,
} from "./banese-reconciliation-contract.ts";

type ReconcileBaneseDependencies = {
  queryBoleto?: typeof queryBaneseBoleto;
  persistReconciliation?: typeof persistBaneseReconciliationSnapshot;
  syncFutureInstallments?: (
    matriculaId: string,
    environment: Environment,
  ) => Promise<unknown>;
};

export const reconcileBaneseReceivable = async (
  admin: any,
  receivableIdValue: unknown,
  dependencies: ReconcileBaneseDependencies = {},
) => {
  const receivableId = String(receivableIdValue || "").trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(receivableId)
  ) {
    throw new Error("Cobranca invalida para conciliacao Banese.");
  }

  const { data: receivable, error: receivableError } = await admin
    .from("contas_receber")
    .select("*")
    .eq("id", receivableId)
    .maybeSingle();
  if (receivableError) throw receivableError;
  if (!receivable) throw new Error("Cobranca nao encontrada.");
  if (receivable.gateway_provider !== "banese_card") {
    throw new Error("A cobranca informada nao pertence ao Banese.");
  }
  if (
    String(receivable.gateway_payment_method || "").toUpperCase() !== "BOLETO"
  ) {
    throw new Error("A conciliacao Banese disponivel atende somente boletos.");
  }

  const environment: Environment = requireGatewayEnvironment(
    receivable.gateway_environment,
    "titulo Banese",
  );
  const nossoNumero = assertBaneseReceivableTitleCompatible(receivable);
  const postSettlementRetry =
    String(receivable.status || "").toUpperCase() === "PAGO" &&
    String(receivable.gateway_last_error || "").startsWith(
      BANESE_POST_SETTLEMENT_PENDING_PREFIX,
    );
  if (postSettlementRetry) {
    try {
      const completion = await completeBanesePostSettlement(admin, {
        receivable,
        environment,
        nossoNumero,
        settlementMethod: String(
          receivable.gateway_settlement_channel ||
            receivable.forma_pagamento || "BOLETO",
        ),
        syncFutureInstallments: dependencies.syncFutureInstallments,
      });
      return {
        success: true,
        receivable: completion.updated,
        remoteStatus: receivable.gateway_status,
        paid: true,
        payments: 0,
        futureSyncWarning: completion.futureSyncWarning,
      };
    } catch (error) {
      await throwBanesePostSettlementPending(admin, receivable, error);
    }
  }
  const { data: credential, error: credentialError } = await admin
    .from("payment_gateway_credentials")
    .select("metadata")
    .eq("provider_code", "banese_card")
    .eq("environment", environment)
    .maybeSingle();
  if (credentialError) throw credentialError;

  const metadata =
    credential?.metadata && typeof credential.metadata === "object"
      ? credential.metadata
      : {};
  const convenio = receivable.gateway_boleto_convenio ||
    metadata.baneseBoletoConvenio || metadata.baneseConvenio;
  if (
    !receivable.gateway_financial_terms ||
    typeof receivable.gateway_financial_terms !== "object"
  ) {
    throw new Error(
      "Titulo Banese nao possui o pedido financeiro canonico persistido antes do POST; a conciliacao automatica foi bloqueada.",
    );
  }
  const confirmedFinancialTerms = normalizeBaneseFinancialTerms(
    receivable.gateway_financial_terms,
  );
  if (
    Math.round(confirmedFinancialTerms.nominalAmount * 100) !==
      Math.round(Number(receivable.valor || 0) * 100) ||
    confirmedFinancialTerms.dueDate !==
      String(receivable.data_vencimento || "").slice(0, 10)
  ) {
    throw new Error(
      "Pedido financeiro canonico Banese diverge do valor ou vencimento do recebivel; a conciliacao automatica foi bloqueada.",
    );
  }
  const submissionChannel = String(
    receivable.gateway_submission_channel || "",
  ).trim().toUpperCase();
  const submissionStatus = String(
    receivable.gateway_submission_status || "",
  ).trim().toUpperCase();
  if (
    submissionStatus === "API_AMBIGUOUS" &&
    !["", "API"].includes(submissionChannel)
  ) {
    throw new Error(
      "Titulo Banese ambiguo possui canal de submissao inconsistente; a conciliacao automatica foi bloqueada.",
    );
  }
  let persistedPixPayload = String(
    receivable.gateway_pix_payload || "",
  ).trim();
  let persistedPixEncodedImage = String(
    receivable.gateway_pix_encoded_image || "",
  ).trim();
  if (Boolean(persistedPixPayload) !== Boolean(persistedPixEncodedImage)) {
    throw new Error(
      "Titulo Banese possui snapshot Pix incompleto; a conciliacao automatica foi bloqueada.",
    );
  }
  let expectedTransactions = await loadBaneseExpectedTransactions(admin, {
    receivableId,
    environment,
  });
  assertBaneseReconciliationProvenance(
    receivable,
    expectedTransactions,
    nossoNumero,
  );
  const { data: payer, error: payerError } = await admin
    .from("parceiros")
    .select("cpf_cnpj")
    .eq("id", receivable.cliente_id)
    .maybeSingle();
  if (payerError) throw payerError;
  const payerDocument = String(payer?.cpf_cnpj || "").replace(/\D/g, "");
  if (![11, 14].includes(payerDocument.length)) {
    throw new Error(
      "Titulo Banese nao possui CPF/CNPJ canonico do pagador para validar a consulta.",
    );
  }
  const externalReference = String(receivable.id);
  const snapshot = await (dependencies.queryBoleto ?? queryBaneseBoleto)(
    admin,
    environment,
    {
      convenio,
      nossoNumero,
      recoverPix: !persistedPixPayload,
      validateTitleIdentity: true,
      expectedAmount: confirmedFinancialTerms.nominalAmount,
      expectedDueDate: confirmedFinancialTerms.dueDate,
      expectedAgency: receivable.gateway_boleto_agencia ||
        metadata.baneseAgencia,
      expectedAccount: metadata.baneseConta || metadata.baneseContaDisplay,
      expectedDocumentNumber: externalReference.slice(0, 15),
      expectedCompanyTitleId: externalReference.slice(0, 25),
      expectedPayerDocument: payerDocument,
    },
  );
  const snapshotNossoNumero = assertBaneseTitleNumber(snapshot.nossoNumero);
  if (snapshotNossoNumero !== nossoNumero) {
    throw new Error(
      "Nosso Numero retornado pelo Banese diverge do titulo conciliado.",
    );
  }
  const pixRecovery = await recoverBanesePixBeforeFinancialReconciliation(
    admin,
    {
      receivable,
      environment,
      convenio,
      nossoNumero: snapshotNossoNumero,
      snapshot,
      persistedPixPayload,
      persistedPixEncodedImage,
    },
  );
  const recoveredBankNumbers = pixRecovery.bankNumbers;
  persistedPixPayload = pixRecovery.pixPayload;
  persistedPixEncodedImage = pixRecovery.pixEncodedImage;
  if (pixRecovery.persisted) {
    expectedTransactions = await loadBaneseExpectedTransactions(admin, {
      receivableId,
      environment,
    });
  }
  if (snapshot.financialTermsError) throw snapshot.financialTermsError;
  assertBaneseFinancialTermsEqual(
    confirmedFinancialTerms,
    snapshot.financialTerms!,
  );
  if (snapshot.paymentsError) throw snapshot.paymentsError;

  const paymentTotal = sumBanesePaymentValues(snapshot.payments);
  const paymentDates = snapshot.payments.map(banesePaymentDate).sort();
  if (
    snapshot.paid &&
    (snapshot.payments.length === 0 || paymentTotal <= 0 ||
      paymentDates.length === 0)
  ) {
    throw new Error(
      "Banese informou boleto pago sem detalhe completo do pagamento; a baixa local foi preservada para conciliacao segura.",
    );
  }
  if (snapshot.paid) {
    const paymentRange = calculateBaneseAcceptablePaymentRange(
      confirmedFinancialTerms,
      paymentDates.at(-1)!,
    );
    const paymentCents = Math.round(paymentTotal * 100);
    const minimumCents = Math.round(paymentRange.minimumAmount * 100);
    const maximumCents = Math.round(paymentRange.maximumAmount * 100);
    if (paymentCents < minimumCents || paymentCents > maximumCents) {
      throw new Error(
        "Valor pago no Banese diverge dos termos confirmados do titulo; a baixa automatica foi bloqueada para revisao.",
      );
    }
  }
  const postSettlementRequired = snapshot.paid;
  const effectiveRemoteStatus = snapshot.remoteStatus;
  const candidatePixPayload = persistedPixPayload || snapshot.pixPayload || "";
  const candidatePixEncodedImage = persistedPixEncodedImage ||
    snapshot.pixEncodedImage || "";
  const shouldConfirmApiSubmission = ["", "API"].includes(
    submissionChannel,
  ) && ["", "API_AMBIGUOUS", "API_REGISTERED"].includes(submissionStatus);
  const shouldSettle = snapshot.paid &&
    String(receivable.status || "").toUpperCase() !== "PAGO";
  const settlementMethod = classifyBaneseSettlementMethod(snapshot.payments);
  if (
    shouldSettle && settlementMethod === "PIX" &&
    isDependencyReceivable(receivable) &&
    dependencyBillingSnapshotFrom(
      receivable.regra_financeira_dependencia_snapshot,
    )
  ) {
    throw new Error(
      "Cobrança de disciplina aceita liquidação somente por boleto Banese; o retorno Pix exige revisão.",
    );
  }
  let updated = await (dependencies.persistReconciliation ??
    persistBaneseReconciliationSnapshot)(admin, {
      receivable,
      environment,
      convenio,
      nossoNumero: snapshotNossoNumero,
      remoteStatus: effectiveRemoteStatus,
      financialTerms: confirmedFinancialTerms,
      confirmApiSubmission: shouldConfirmApiSubmission,
      remotePaid: snapshot.paid,
      postSettlementRequired,
      shouldSettle,
      paymentTotal,
      paymentDate: paymentDates.at(-1) || null,
      settlementMethod,
      pixPayload: candidatePixPayload,
      pixEncodedImage: candidatePixEncodedImage,
      bankNumbers: recoveredBankNumbers,
      snapshot,
      expectedTransactions,
    });

  let futureSyncWarning: string | null = null;
  try {
    if (
      postSettlementRequired &&
      String(updated.status || "").toUpperCase() === "PAGO"
    ) {
      const completion = await completeBanesePostSettlement(admin, {
        receivable: updated,
        environment,
        nossoNumero: snapshotNossoNumero,
        settlementMethod,
        syncFutureInstallments: dependencies.syncFutureInstallments,
      });
      updated = completion.updated;
      futureSyncWarning = completion.futureSyncWarning;
    }
  } catch (error) {
    if (String(updated.status || "").toUpperCase() === "PAGO") {
      await throwBanesePostSettlementPending(admin, updated, error);
    }
    throw error;
  }

  return {
    success: true,
    receivable: updated,
    remoteStatus: effectiveRemoteStatus,
    paid: postSettlementRequired,
    payments: snapshot.payments.length,
    futureSyncWarning,
  };
};
