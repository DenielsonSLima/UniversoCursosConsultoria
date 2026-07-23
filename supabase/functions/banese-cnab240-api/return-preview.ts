import {
  calculateBaneseAcceptablePaymentRange,
  normalizeBaneseFinancialTerms,
} from "../banese/internal/financial-terms.ts";
import type { ParsedEvent } from "../gateways/api/banese-cnab240.types.ts";
import { BANESE_CNAB_PROVIDER, safeCnabError } from "./policy.ts";
import { type CnabContext, digits } from "./shared.ts";

const RETURN_RECEIVABLE_SELECT =
  "id,status,valor,cliente_id,matricula_id,turma_id,tipo_lancamento,polo_id,updated_at,gateway_provider,gateway_environment,gateway_payment_method,gateway_payment_id,gateway_payment_link_id,gateway_boleto_nosso_numero,gateway_boleto_convenio,gateway_creation_token,gateway_status,gateway_financial_terms,gateway_financial_terms_confirmed_at,gateway_submission_channel,gateway_submission_status";

const titleNumber = (receivable: any) =>
  digits(
    receivable?.gateway_boleto_nosso_numero ||
      receivable?.gateway_payment_id,
  ).slice(-9).padStart(9, "0");

const findReceivable = async (
  admin: any,
  context: CnabContext,
  event: ParsedEvent,
) => {
  const { data, error } = await admin
    .from("contas_receber")
    .select(RETURN_RECEIVABLE_SELECT)
    .eq("gateway_provider", BANESE_CNAB_PROVIDER)
    .eq("gateway_environment", context.environment)
    .eq("gateway_payment_method", "BOLETO")
    .or(
      `gateway_boleto_nosso_numero.eq.${event.nossoNumero},and(gateway_boleto_nosso_numero.is.null,gateway_payment_id.eq.${event.nossoNumero})`,
    )
    .limit(3);
  if (error) throw error;
  return (data || []).filter((receivable: any) =>
    digits(receivable.gateway_boleto_convenio) === context.convenio &&
    titleNumber(receivable) === event.nossoNumero
  );
};

export const loadReturnReceivableCandidates = async (
  admin: any,
  context: CnabContext,
  events: ParsedEvent[],
) => {
  const titleNumbers = [...new Set(events.map((event) => event.nossoNumero))];
  const rowsById = new Map<string, any>();
  for (let index = 0; index < titleNumbers.length; index += 200) {
    const batch = titleNumbers.slice(index, index + 200);
    const baseQuery = () =>
      admin
        .from("contas_receber")
        .select(RETURN_RECEIVABLE_SELECT)
        .eq("gateway_provider", BANESE_CNAB_PROVIDER)
        .eq("gateway_environment", context.environment)
        .eq("gateway_payment_method", "BOLETO")
        .eq("gateway_boleto_convenio", context.convenio);
    const [byOurNumber, byLegacyPaymentId] = await Promise.all([
      baseQuery().in("gateway_boleto_nosso_numero", batch).limit(1_000),
      baseQuery()
        .is("gateway_boleto_nosso_numero", null)
        .in("gateway_payment_id", batch)
        .limit(1_000),
    ]);
    if (byOurNumber.error) throw byOurNumber.error;
    if (byLegacyPaymentId.error) throw byLegacyPaymentId.error;
    for (
      const receivable of [
        ...(byOurNumber.data || []),
        ...(byLegacyPaymentId.data || []),
      ]
    ) {
      rowsById.set(receivable.id, receivable);
    }
  }

  const candidates = new Map<string, any[]>();
  for (const receivable of rowsById.values()) {
    if (digits(receivable.gateway_boleto_convenio) !== context.convenio) {
      continue;
    }
    const number = titleNumber(receivable);
    candidates.set(number, [...(candidates.get(number) || []), receivable]);
  }
  return candidates;
};

export const existingEventFingerprints = async (
  admin: any,
  context: CnabContext,
  fingerprints: string[],
) => {
  const existing = new Set<string>();
  for (let index = 0; index < fingerprints.length; index += 100) {
    const batch = fingerprints.slice(index, index + 100);
    const { data, error } = await admin
      .from("payment_gateway_cnab_records")
      .select("event_fingerprint")
      .eq("provider_code", BANESE_CNAB_PROVIDER)
      .eq("environment", context.environment)
      .eq("convenio", context.convenio)
      .eq("record_type", "RETURN_EVENT")
      .not("applied_at", "is", null)
      .in("event_fingerprint", batch);
    if (error) throw error;
    for (const row of data || []) {
      if (row.event_fingerprint) existing.add(row.event_fingerprint);
    }
  }
  return existing;
};

export const hasConfirmedBaneseSubmission = (receivable: any) => {
  const channel = String(receivable?.gateway_submission_channel || "")
    .trim().toUpperCase();
  const status = String(receivable?.gateway_submission_status || "")
    .trim().toUpperCase();
  return (channel === "API" && status === "API_REGISTERED") ||
    (channel === "CNAB" &&
      ["CNAB_GENERATED", "CNAB_SENT", "CNAB_REGISTERED"].includes(status));
};

export const previewReturnEvent = async (
  admin: any,
  context: CnabContext,
  event: ParsedEvent,
  prefetchedCandidates?: any[],
) => {
  const candidates = prefetchedCandidates ??
    await findReceivable(admin, context, event);
  const base = {
    receivable_id: null as string | null,
    record_type: "RETURN_EVENT",
    line_number: event.lineNumber,
    sequence_number: null,
    nosso_numero: event.nossoNumero,
    movement_code: event.movementCode,
    occurrence_codes: event.liquidationReasonCodes,
    nominal_amount: event.nominalAmount,
    paid_amount: event.paidAmount,
    expected_min_amount: null as number | null,
    expected_max_amount: null as number | null,
    occurrence_date: event.occurrenceDate,
    liquidation_channel: event.settlementChannel || "NAO_IDENTIFICADO",
    status: "REVIEW_REQUIRED",
    message: "",
    raw_payload: {
      lot: event.lote,
      segmentTMovement: event.segmentTMovement,
      reasonCodes: event.liquidationReasonCodes,
    },
    expected_receivable_status: null as string | null,
    expected_receivable_updated_at: null as string | null,
  };

  if (!candidates.length) {
    return {
      ...base,
      message:
        "Nosso Número não localizado no convênio e ambiente selecionados.",
    };
  }
  if (candidates.length > 1) {
    return {
      ...base,
      message: "Mais de uma cobrança corresponde ao Nosso Número informado.",
    };
  }

  const receivable = candidates[0];
  base.receivable_id = receivable.id;
  base.expected_receivable_status = receivable.status;
  base.expected_receivable_updated_at = receivable.updated_at;
  if (
    !["PENDENTE", "VENCIDO"].includes(
      String(receivable.status || "").toUpperCase(),
    )
  ) {
    return {
      ...base,
      message: "Status financeiro atual não permite conciliação automática.",
    };
  }
  if (
    receivable.gateway_creation_token ||
    String(receivable.gateway_status || "").toUpperCase() === "CREATING"
  ) {
    return {
      ...base,
      message:
        "Cobrança possui criação remota em andamento; reconcilie a API antes da baixa.",
    };
  }
  if (!hasConfirmedBaneseSubmission(receivable)) {
    return {
      ...base,
      message:
        "Cobrança não possui registro externo confirmado por API ou remessa CNAB.",
    };
  }
  if (!event.paid) {
    return {
      ...base,
      status: "MATCHED",
      message:
        `Movimento ${event.movementCode} identificado sem baixa financeira.`,
    };
  }
  if (!event.occurrenceDate || !event.nominalAmount || event.paidAmount <= 0) {
    return {
      ...base,
      message: "Liquidação sem data, valor nominal ou valor pago válido.",
    };
  }
  if (
    !receivable.gateway_financial_terms ||
    !receivable.gateway_financial_terms_confirmed_at
  ) {
    return {
      ...base,
      message: "Cobrança sem snapshot confirmado dos termos financeiros.",
    };
  }

  let range;
  try {
    const terms = normalizeBaneseFinancialTerms({
      ...receivable.gateway_financial_terms,
      nominalAmount: Number(receivable.valor || 0),
    });
    range = calculateBaneseAcceptablePaymentRange(
      terms,
      event.occurrenceDate,
    );
  } catch (error) {
    return {
      ...base,
      message: `Termos financeiros inválidos: ${safeCnabError(error)}`,
    };
  }
  base.expected_min_amount = range.minimumAmount;
  base.expected_max_amount = range.maximumAmount;

  if (Math.abs(event.nominalAmount - Number(receivable.valor || 0)) >= 0.01) {
    return {
      ...base,
      message: "Valor nominal do retorno diverge da cobrança.",
    };
  }
  if (
    event.paidAmount < range.minimumAmount ||
    event.paidAmount > range.maximumAmount
  ) {
    return {
      ...base,
      message:
        "Valor pago está fora da faixa de desconto, multa e juros confirmada.",
    };
  }
  return {
    ...base,
    status: "MATCHED",
    message: event.settlementChannel === "PIX"
      ? "Liquidação BolePix identificada pelo motivo 61."
      : "Liquidação por boleto validada.",
  };
};

export const parsedEventFromRecord = (record: any): ParsedEvent => ({
  lineNumber: Number(record.line_number || 0),
  lote: String(record.raw_payload?.lot || "0000"),
  nossoNumero: String(record.nosso_numero || ""),
  movementCode: String(record.movement_code || ""),
  nominalAmount: Number(record.nominal_amount || 0),
  paidAmount: Number(record.paid_amount || 0),
  occurrenceDate: record.occurrence_date || null,
  segmentTMovement: String(
    record.raw_payload?.segmentTMovement || record.movement_code || "",
  ),
  liquidationReasonCodes: Array.isArray(record.occurrence_codes)
    ? record.occurrence_codes
    : [],
  settlementChannel: ["PIX", "BOLETO"].includes(record.liquidation_channel)
    ? record.liquidation_channel
    : null,
  paid: ["06", "17"].includes(String(record.movement_code || "")),
  rawTLine: null,
  rawULine: "",
});
