import { queryBaneseBoleto } from "../../banese/core/adapter.ts";
import {
  calculateBaneseAcceptablePaymentRange,
  normalizeBaneseFinancialTerms,
} from "../../banese/internal/financial-terms.ts";
import { assertBaneseFinancialTermsEqual } from "../../banese/internal/financial-terms-response.ts";
import {
  activateEnrollmentAfterPayment,
  syncOnlineInscriptionPayment,
} from "../webhook/domain/ead-enrollment.ts";
import {
  applyReceivableSnapshotFields,
  applyRemoteIdentitySnapshot,
} from "../checkout/remote-title-guard.ts";
import type { Environment } from "./config.ts";
import { requireGatewayEnvironment } from "./environment.ts";
import {
  dependencyBillingSnapshotFrom,
  isDependencyReceivable,
} from "../../banese/internal/dependency-billing.ts";
import {
  assertBaneseTitleNumber,
  banesePaymentDate,
  baneseReceivableTitleFilter,
  baneseTransactionTitleFilter,
  classifyBaneseSettlementMethod,
  loadCompatibleBaneseTransactions,
  onlyBaneseDigits,
  sumBanesePaymentValues,
  validateBaneseRecoveredBankNumbers,
} from "./banese-reconciliation-contract.ts";

export {
  baneseReceivableTitleFilter,
  baneseTransactionTitleFilter,
  classifyBaneseSettlementMethod,
  sumBanesePaymentValues,
  validateBaneseRecoveredBankNumbers,
} from "./banese-reconciliation-contract.ts";
export type { BaneseSettlementMethod } from "./banese-reconciliation-contract.ts";

type ReconcileBaneseDependencies = {
  queryBoleto?: typeof queryBaneseBoleto;
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
  const nossoNumero = assertBaneseTitleNumber(
    receivable.gateway_boleto_nosso_numero ||
      receivable.gateway_payment_id,
  );
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
  const persistedPixPayload = String(
    receivable.gateway_pix_payload || "",
  ).trim();
  const persistedPixEncodedImage = String(
    receivable.gateway_pix_encoded_image || "",
  ).trim();
  if (Boolean(persistedPixPayload) !== Boolean(persistedPixEncodedImage)) {
    throw new Error(
      "Titulo Banese possui snapshot Pix incompleto; a conciliacao automatica foi bloqueada.",
    );
  }
  const snapshot = await (dependencies.queryBoleto ?? queryBaneseBoleto)(
    admin,
    environment,
    {
      convenio,
      nossoNumero,
      recoverPix: !persistedPixPayload,
    },
  );
  const snapshotNossoNumero = assertBaneseTitleNumber(snapshot.nossoNumero);
  if (snapshotNossoNumero !== nossoNumero) {
    throw new Error(
      "Nosso Numero retornado pelo Banese diverge do titulo conciliado.",
    );
  }
  assertBaneseFinancialTermsEqual(
    confirmedFinancialTerms,
    snapshot.financialTerms,
  );
  if (Boolean(snapshot.pixPayload) !== Boolean(snapshot.pixEncodedImage)) {
    throw new Error(
      "Banese retornou snapshot Pix incompleto; nenhuma alteracao foi aplicada.",
    );
  }

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
  const syncedAt = new Date().toISOString();
  const recoveredBankNumbers = validateBaneseRecoveredBankNumbers(
    snapshot.raw,
    {
      digitableLine: receivable.gateway_boleto_linha_digitavel,
      barcode: receivable.gateway_boleto_codigo_barras,
      expectedOurNumber: nossoNumero,
      pixPayload: snapshot.pixPayload,
    },
  );
  const candidatePixPayload = persistedPixPayload || snapshot.pixPayload || "";
  const candidatePixEncodedImage = persistedPixEncodedImage ||
    snapshot.pixEncodedImage || "";
  const transactionRows = await loadCompatibleBaneseTransactions(admin, {
    receivableId: receivable.id,
    environment,
    nossoNumero: snapshotNossoNumero,
    pixPayload: candidatePixPayload,
    pixEncodedImage: candidatePixEncodedImage,
  });
  const receivableUpdate: Record<string, unknown> = {
    gateway_payment_id: snapshotNossoNumero,
    gateway_status: snapshot.remoteStatus,
    gateway_financial_terms: confirmedFinancialTerms,
    gateway_financial_terms_confirmed_at:
      receivable.gateway_financial_terms_confirmed_at || syncedAt,
    gateway_synced_at: syncedAt,
    gateway_last_error: null,
    updated_at: syncedAt,
  };
  const shouldConfirmApiSubmission = ["", "API"].includes(
    submissionChannel,
  ) && ["", "API_AMBIGUOUS", "API_REGISTERED"].includes(submissionStatus);
  if (shouldConfirmApiSubmission) {
    receivableUpdate.gateway_creation_token = null;
    receivableUpdate.gateway_submission_channel = "API";
    receivableUpdate.gateway_submission_status = "API_REGISTERED";
  }
  if (!receivable.gateway_boleto_nosso_numero) {
    receivableUpdate.gateway_boleto_nosso_numero = snapshotNossoNumero;
  }
  if (
    (!receivable.gateway_boleto_linha_digitavel ||
      recoveredBankNumbers?.replacePersistedDigitableLine) &&
    recoveredBankNumbers?.hasRemoteDigitableLine
  ) {
    receivableUpdate.gateway_boleto_linha_digitavel =
      recoveredBankNumbers.digitableLine;
  }
  if (
    !receivable.gateway_boleto_codigo_barras &&
    recoveredBankNumbers?.hasRemoteBarcode
  ) {
    receivableUpdate.gateway_boleto_codigo_barras =
      recoveredBankNumbers.barcode;
  }
  if (!persistedPixPayload && snapshot.pixPayload && snapshot.pixEncodedImage) {
    receivableUpdate.gateway_pix_payload = snapshot.pixPayload;
    receivableUpdate.gateway_pix_encoded_image = snapshot.pixEncodedImage;
  }
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
  if (snapshot.paid) {
    receivableUpdate.gateway_settlement_channel = settlementMethod;
    receivableUpdate.gateway_settlement_source = "API";
    receivableUpdate.gateway_settlement_evidence = {
      classification: settlementMethod,
      paymentCount: snapshot.payments.length,
      documentedFields: ["BancoRecebedor", "DataPagamento", "ValorPago"],
    };
    receivableUpdate.gateway_settlement_recorded_at = syncedAt;
  }
  if (shouldSettle) {
    receivableUpdate.status = "PAGO";
    receivableUpdate.valor_pago = Number(paymentTotal.toFixed(2));
    receivableUpdate.data_pagamento = paymentDates.at(-1);
    receivableUpdate.forma_pagamento = settlementMethod === "PIX"
      ? "PIX"
      : "BOLETO";
    receivableUpdate.origem_pagamento = "BANESE";
  }

  let updateQuery = admin
    .from("contas_receber")
    .update(receivableUpdate)
    .eq("id", receivable.id)
    .eq("gateway_provider", "banese_card")
    .eq("gateway_environment", environment)
    .eq("gateway_payment_method", "BOLETO")
    .or(baneseReceivableTitleFilter(snapshotNossoNumero));
  if (shouldSettle) {
    updateQuery = updateQuery.in("status", [
      "PENDENTE",
      "VENCIDO",
      "AGUARDANDO_CONFIRMACAO",
    ]);
  }
  updateQuery = applyRemoteIdentitySnapshot(updateQuery, receivable);
  updateQuery = applyReceivableSnapshotFields(updateQuery, receivable, [
    "status",
    "origem_pagamento",
    "forma_pagamento",
    "valor",
    "data_vencimento",
    "gateway_status",
    "gateway_creation_token",
    "gateway_financial_terms",
    "gateway_financial_terms_confirmed_at",
    "gateway_submission_channel",
    "gateway_submission_status",
    "gateway_cnab_file_id",
    "gateway_boleto_convenio",
    "gateway_boleto_agencia",
    "gateway_boleto_linha_digitavel",
    "gateway_boleto_codigo_barras",
    "gateway_pix_payload",
    "gateway_pix_encoded_image",
    "updated_at",
  ]);
  const { data: updatedRow, error: updateError } = await updateQuery
    .select()
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updatedRow) {
    throw new Error("Cobranca mudou durante a conciliacao Banese.");
  }
  const updated = updatedRow;

  const transactionSnapshot = {
    reconciliation: snapshot.raw,
    payments: snapshot.payments,
    convenio: onlyBaneseDigits(convenio),
    nossoNumero: snapshotNossoNumero,
    financialTerms: confirmedFinancialTerms,
    settlementMethod,
    pixRecovered: Boolean(snapshot.pixPayload),
  };
  const transactionPix = updated.gateway_pix_payload &&
      updated.gateway_pix_encoded_image
    ? {
      pix_payload: updated.gateway_pix_payload,
      pix_encoded_image: updated.gateway_pix_encoded_image,
    }
    : {};
  const transactionPayload = {
    remote_status: snapshot.remoteStatus,
    last_error: null,
    synced_at: syncedAt,
    updated_at: syncedAt,
  };
  const recoveredTransactionBankNumbers = recoveredBankNumbers
    ? {
      bank_slip_digitable_line: recoveredBankNumbers.digitableLine,
      bank_slip_barcode: recoveredBankNumbers.barcode,
    }
    : {};
  if (transactionRows?.length) {
    const updates = await Promise.all(
      transactionRows.map((transaction: any) =>
        admin
          .from("payment_gateway_transactions")
          .update({
            ...transactionPayload,
            ...recoveredTransactionBankNumbers,
            ...transactionPix,
            remote_payment_id: snapshotNossoNumero,
            bank_slip_our_number: snapshotNossoNumero,
            raw_payload: {
              ...(transaction.raw_payload &&
                  typeof transaction.raw_payload === "object"
                ? transaction.raw_payload
                : {}),
              ...transactionSnapshot,
            },
          })
          .eq("id", transaction.id)
          .eq("receivable_id", receivable.id)
          .eq("provider_code", "banese_card")
          .eq("environment", environment)
          .eq("payment_method", "BOLETO")
          .or(baneseTransactionTitleFilter(snapshotNossoNumero))
          .select("id")
          .maybeSingle()
      ),
    );
    const failedUpdate = updates.find((result: any) => result.error);
    if (failedUpdate?.error) throw failedUpdate.error;
    if (updates.some((result: any) => !result.data)) {
      throw new Error(
        "Transacao mudou durante a conciliacao Banese.",
      );
    }
  } else {
    const { error: repairError } = await admin
      .from("payment_gateway_transactions")
      .insert({
        receivable_id: receivable.id,
        provider_code: "banese_card",
        environment,
        payment_method: "BOLETO",
        origin_polo_id: receivable.polo_id || null,
        issuer_polo_id: receivable.gateway_issuer_polo_id || null,
        installments: Number(receivable.gateway_installments || 1),
        remote_payment_id: snapshotNossoNumero,
        amount: Number(receivable.valor || 0),
        invoice_url: receivable.gateway_invoice_url || null,
        bank_slip_url: receivable.gateway_bank_slip_url || null,
        bank_slip_digitable_line: recoveredBankNumbers?.digitableLine ||
          updated.gateway_boleto_linha_digitavel || null,
        bank_slip_barcode: recoveredBankNumbers?.barcode ||
          updated.gateway_boleto_codigo_barras || null,
        bank_slip_our_number: snapshotNossoNumero,
        ...transactionPix,
        ...transactionPayload,
        raw_payload: transactionSnapshot,
      });
    if (repairError) throw repairError;
  }

  let futureSyncWarning: string | null = null;
  if (snapshot.paid && String(updated.status || "").toUpperCase() === "PAGO") {
    // A liberação acadêmica decorre diretamente do pagamento confirmado pelo
    // banco. Falhas na projeção auxiliar de inscricoes_online devem permanecer
    // auditáveis, mas não podem impedir o acesso de EAD/Livre/Especialização.
    await activateEnrollmentAfterPayment({ admin } as any, updated);
    await syncOnlineInscriptionPayment({ admin } as any, {
      receivable: updated,
      gatewayProvider: "banese_card",
      environment,
      paymentId: snapshotNossoNumero,
      paymentLinkId: null,
      localStatus: "PAGO",
      legacyPaymentMethod: String(updated.forma_pagamento || settlementMethod),
      pendingStatus: "AGUARDANDO_PAGAMENTO",
    });

    if (
      dependencies.syncFutureInstallments &&
      updated.matricula_id &&
      String(updated.tipo_lancamento || "").toUpperCase() === "MATRICULA"
    ) {
      const { data: matricula, error: matriculaError } = await admin
        .from("matriculas")
        .select(
          "gerar_cobranca_futura, sincronizar_asaas, turmas(gerar_cobrancas_futuras, sincronizar_asaas_futuro)",
        )
        .eq("id", updated.matricula_id)
        .maybeSingle();
      if (matriculaError) throw matriculaError;
      const turma = Array.isArray(matricula?.turmas)
        ? matricula.turmas[0]
        : matricula?.turmas;
      const gerarFutura = matricula?.gerar_cobranca_futura ??
        turma?.gerar_cobrancas_futuras ?? false;
      const syncEnabled = matricula?.sincronizar_asaas ??
        turma?.sincronizar_asaas_futuro ?? true;
      if (gerarFutura && syncEnabled) {
        try {
          await dependencies.syncFutureInstallments(
            updated.matricula_id,
            environment,
          );
        } catch (syncError) {
          futureSyncWarning = syncError instanceof Error
            ? syncError.message
            : String(syncError);
          const { error: warningError } = await admin
            .from("contas_receber")
            .update({
              gateway_last_error:
                `Pagamento Banese conciliado; parcelas futuras pendentes: ${futureSyncWarning}`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", updated.id)
            .eq("status", "PAGO")
            .eq("gateway_provider", "banese_card");
          if (warningError) throw warningError;
        }
      }
    }
  }

  return {
    success: true,
    receivable: updated,
    remoteStatus: snapshot.remoteStatus,
    paid: snapshot.paid,
    payments: snapshot.payments.length,
    futureSyncWarning,
  };
};
