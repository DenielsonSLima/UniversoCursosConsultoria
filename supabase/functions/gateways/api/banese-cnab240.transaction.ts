import {
  activateEnrollmentAfterPayment,
  syncOnlineInscriptionPayment,
} from "../webhook/domain/ead-enrollment.ts";
import {
  baneseReceivableTitleFilter,
  baneseTransactionTitleFilter,
} from "./banese.ts";
import {
  Environment,
  ImportEventResult,
  ImportResultType,
  ParsedEvent,
} from "./banese-cnab240.types.ts";

const safeEnv = (value: unknown): Environment =>
  value === "production" ? "production" : "sandbox";

const movementToStatus = (movementCode: string, paid: boolean) => {
  if (!movementCode) return "CNAB-SEM-CODIGO";
  if (paid) return "PAID";
  return `CNAB-${movementCode}`;
};

const appendCnabEventInPayload = (
  payload: any,
  event: ParsedEvent,
  fileName: string | null,
  importId: string,
) => {
  const base = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload
    : {};
  const previous = Array.isArray(base.cnab240Events) ? base.cnab240Events : [];
  const next = {
    id: importId,
    fileName,
    line: event.lineNumber,
    lote: event.lote,
    nossoNumero: event.nossoNumero,
    movement: event.movementCode,
    paid: event.paid,
    paidAmount: event.paidAmount,
    occurrenceDate: event.occurrenceDate,
    segmentTMovement: event.segmentTMovement,
    processedAt: new Date().toISOString(),
  };
  return {
    ...base,
    cnab240: {
      ...(base.cnab240 || {}),
      lastImport: {
        id: importId,
        fileName,
        linha: event.lineNumber,
        movimentacao: event.movementCode,
        pago: event.paid,
      },
    },
    cnab240Events: [...previous, next].slice(-25),
  };
};

const upsertTransaction = async (
  admin: any,
  receivable: any,
  environment: Environment,
  event: ParsedEvent,
  remoteStatus: string,
  errorMessage: string | null,
  importId: string,
  fileName: string | null,
) => {
  const syncedAt = new Date().toISOString();
  const basePayload = {
    receivable_id: receivable?.id || null,
    provider_code: "banese_card",
    environment,
    payment_method: "BOLETO",
    remote_payment_id: event.nossoNumero,
    remote_status: remoteStatus,
    amount: receivable?.valor != null
      ? Number(receivable.valor)
      : event.paidAmount,
    bank_slip_our_number: event.nossoNumero,
    bank_slip_digitable_line: receivable?.gateway_boleto_linha_digitavel ||
      null,
    bank_slip_barcode: receivable?.gateway_boleto_codigo_barras || null,
    invoice_url: receivable?.gateway_invoice_url || null,
    bank_slip_url: receivable?.gateway_bank_slip_url || null,
    installments: Number(receivable?.gateway_installments || 1),
    origin_polo_id: receivable?.polo_id || null,
    issuer_polo_id: receivable?.gateway_issuer_polo_id || null,
    last_error: errorMessage || null,
    synced_at: syncedAt,
    updated_at: syncedAt,
  } as Record<string, unknown>;

  const { data: existingRows, error: fetchError } = await admin
    .from("payment_gateway_transactions")
    .select("id, raw_payload")
    .eq("provider_code", "banese_card")
    .eq("payment_method", "BOLETO")
    .eq("environment", environment)
    .or(baneseTransactionTitleFilter(event.nossoNumero));
  if (fetchError) throw fetchError;

  const existing = existingRows?.[0];
  const rawPayload = appendCnabEventInPayload(
    existing?.raw_payload,
    event,
    fileName,
    importId,
  );

  if (existing?.id) {
    const { error: updateError } = await admin
      .from("payment_gateway_transactions")
      .update({
        ...basePayload,
        raw_payload: rawPayload,
      })
      .eq("id", existing.id)
      .eq("provider_code", "banese_card")
      .eq("environment", environment)
      .eq("payment_method", "BOLETO");
    if (updateError) throw updateError;
    return existing.id;
  }

  const { data: inserted, error: insertError } = await admin
    .from("payment_gateway_transactions")
    .insert({
      ...basePayload,
      raw_payload: rawPayload,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return inserted.id;
};

export const applyCnab240Event = async (
  admin: any,
  requestedEnvironment: Environment,
  event: ParsedEvent,
  fileName: string | null,
  importId: string,
): Promise<ImportEventResult> => {
  const syncedAt = new Date().toISOString();
  const movementCode = event.movementCode.padStart(2, "0");
  const paid = event.paid;
  const remoteStatus = movementToStatus(movementCode, paid);

  const receivableQuery = await admin
    .from("contas_receber")
    .select(
      "id, status, valor, polo_id, gateway_environment, gateway_boleto_nosso_numero, gateway_boleto_linha_digitavel, gateway_boleto_codigo_barras, gateway_installments, gateway_issuer_polo_id, gateway_invoice_url, gateway_bank_slip_url",
    )
    .eq("gateway_provider", "banese_card")
    .eq("gateway_payment_method", "BOLETO")
    .or(baneseReceivableTitleFilter(event.nossoNumero))
    .limit(2);
  if (receivableQuery.error) throw receivableQuery.error;

  const candidates = receivableQuery.data || [];
  if (!candidates.length) {
    await upsertTransaction(
      admin,
      null,
      requestedEnvironment,
      event,
      remoteStatus,
      "Titular nao encontrado pelo Nosso Numero informado no retorno CNAB240.",
      importId,
      fileName,
    );
    return {
      action: "not_found",
      status: "warning" as ImportResultType,
      message: "Recebivel nao encontrado",
      paymentApplied: false,
    };
  }

  if (candidates.length > 1) {
    await upsertTransaction(
      admin,
      null,
      requestedEnvironment,
      event,
      remoteStatus,
      "Mais de um recebivel Banese encontrado para o mesmo Nosso Numero no retorno.",
      importId,
      fileName,
    );
    return {
      action: "conflict",
      status: "error" as ImportResultType,
      message: "Mais de um recebivel encontrado para o mesmo Nosso Numero.",
      paymentApplied: false,
    };
  }

  const receivable = candidates[0];
  const targetEnvironment = safeEnv(
    receivable.gateway_environment || requestedEnvironment,
  );
  const shouldSettle = paid &&
    String(receivable.status || "").toUpperCase() !== "PAGO" &&
    event.paidAmount > 0;
  const paymentDate = event.occurrenceDate || syncedAt.slice(0, 10);
  const receivableUpdate: Record<string, unknown> = {
    gateway_status: remoteStatus,
    gateway_synced_at: syncedAt,
    gateway_last_error: null,
    updated_at: syncedAt,
  };

  if (!receivable.gateway_boleto_nosso_numero) {
    receivableUpdate.gateway_boleto_nosso_numero = event.nossoNumero;
  }

  if (shouldSettle) {
    receivableUpdate.status = "PAGO";
    receivableUpdate.valor_pago = event.paidAmount;
    receivableUpdate.data_pagamento = paymentDate;
    receivableUpdate.forma_pagamento = "BOLETO";
    receivableUpdate.origem_pagamento = "BANESE";
  }

  const { data: updatedReceivable, error: updateReceivableError } = await admin
    .from("contas_receber")
    .update(receivableUpdate)
    .eq("id", receivable.id)
    .select("*")
    .maybeSingle();
  if (updateReceivableError) throw updateReceivableError;
  if (!updatedReceivable) {
    throw new Error("Falha ao atualizar recebivel do retorno CNAB240.");
  }

  const transactionPayloadError = event.paidAmount <= 0
    ? "Valor pago no CNAB240 invalido para baixa automatica."
    : null;
  const transactionId = await upsertTransaction(
    admin,
    updatedReceivable,
    targetEnvironment,
    event,
    remoteStatus,
    transactionPayloadError,
    importId,
    fileName,
  );

  if (shouldSettle && event.paidAmount > 0 && !transactionPayloadError) {
    await syncOnlineInscriptionPayment({ admin } as any, {
      receivable: updatedReceivable,
      gatewayProvider: "banese_card",
      environment: targetEnvironment,
      paymentId: event.nossoNumero,
      paymentLinkId: null,
      localStatus: "PAGO",
      legacyPaymentMethod: "BOLETO",
      pendingStatus: "AGUARDANDO_PAGAMENTO",
    });
    await activateEnrollmentAfterPayment({ admin } as any, updatedReceivable);
  }

  return {
    action: shouldSettle ? "paid" : "updated",
    status: "success" as ImportResultType,
    message: shouldSettle
      ? "Recebivel dado como pago pelo retorno CNAB240."
      : `Movimento identificado (${movementCode}) e registrado.`,
    paymentApplied: shouldSettle,
    transactionId,
  };
};
