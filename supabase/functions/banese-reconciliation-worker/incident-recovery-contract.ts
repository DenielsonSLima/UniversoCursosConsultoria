import { gatewayPrimaryUrl } from "../gateways/router.ts";
import {
  assertBaneseBankNumbers,
  assertBaneseDueDateFactor,
  calculateBaneseOurNumberDigit,
} from "../banese/internal/bank-fields.ts";
import {
  normalizeBanesePixPayload,
  normalizeBanesePixQrImage,
} from "../banese/internal/pix-validation.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const BANESE_INCIDENT_SCOPE = Object.freeze({
  environment: "production",
  convenio: "15261",
  agencia: "033",
  candidateStart: 1,
  candidateEnd: 23,
  maxTargets: 13,
});

// Allowlist imutavel do incidente. A tabela privada continua sendo a fonte do
// estado, mas uma insercao futura nela nunca amplia silenciosamente este lote.
export const BANESE_INCIDENT_RECEIVABLE_IDS = Object.freeze([
  "08090770-b1d0-4f43-a885-38d3e9859a78",
  "0c5bcdb3-024c-406a-a958-f87260504413",
  "0fe770f0-4bcd-4574-a827-9cf6876e6399",
  "1b47c345-3939-4414-89e5-6ba50fccee91",
  "2bae97e2-cf1c-4153-8da3-6bd9cd41903c",
  "2d5a7b98-ba37-4817-9060-7ab40b6b16d5",
  "38eae118-b430-49a1-8c14-2a99d123d85e",
  "425a9594-cf03-4dd2-a264-fd9ecfc8343f",
  "5c6e5c87-ce71-4185-80af-6c1a0b1e330f",
  "6a9ddb18-d9c7-4b3e-9ed3-c6884d1b4477",
  "87d5ac5d-7796-4627-b3a2-6df97efb6f29",
  "ddf366cf-a365-4a92-81d2-49499203ef32",
  "efe9d997-bf46-4580-83b4-701132d5e815",
]);

const incidentReceivableIds = new Set(BANESE_INCIDENT_RECEIVABLE_IDS);

export type BaneseIncidentTarget = {
  receivable_id: string;
  environment: string;
  convenio: string;
  agencia: string;
  candidate_start: number;
  candidate_end: number;
  state: string;
  completed_at?: string | null;
};

export type BaneseIncidentRecoveryReport = {
  processed: number;
  ready: number;
  recovered: number;
  reconciled: number;
  busy: number;
  failed: number;
};

export const classifyBaneseIncidentRecoveryFailure = (error: unknown) => {
  const message = error instanceof Error
    ? error.message
    : String(error ?? "");
  const status = message.match(/\(([1-5][0-9]{2})\)/)?.[1] || "UNKNOWN";
  if (/recusou autenticacao/i.test(message)) return `AUTH_HTTP_${status}`;
  if (/autenticacao sem access token/i.test(message)) return "AUTH_TOKEN_MISSING";
  if (/Client ID e Client Secret/i.test(message)) return "AUTH_CONFIG_MISSING";
  if (/consulta de recuperacao.*falhou/i.test(message)) {
    return "RECOVERY_LOOKUP_NETWORK";
  }
  if (/recusou a consulta de recuperacao/i.test(message)) {
    return `RECOVERY_LOOKUP_HTTP_${status}`;
  }
  if (/identidade indeterminada/i.test(message)) {
    return "RECOVERY_LOOKUP_IDENTITY_INCOMPLETE";
  }
  if (/linha digitavel\/codigo de barras/i.test(message)) {
    return "BANK_NUMBERS_INVALID";
  }
  if (/termos|Desconto|Juros|Multa/i.test(message)) {
    return "FINANCIAL_TERMS_MISMATCH";
  }
  if (/QrCode Pix valido/i.test(message)) return "PIX_MISSING";
  if (/Nosso Numero|reserva|ownership/i.test(message)) return "RESERVATION";
  if (/fetch|network|conexao|conexão/i.test(message)) return "NETWORK";
  return error instanceof Error ? `UNCLASSIFIED_${error.name}` : "UNCLASSIFIED";
};

export const normalizedIncidentText = (value: unknown) =>
  String(value ?? "").trim();
export const normalizedIncidentStatus = (value: unknown) =>
  normalizedIncidentText(value).toUpperCase();

export const isBaneseIncidentTarget = (
  value: unknown,
): value is BaneseIncidentTarget => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const target = value as Record<string, unknown>;
  const receivableId = normalizedIncidentText(target.receivable_id)
    .toLowerCase();
  return UUID_PATTERN.test(receivableId) &&
    incidentReceivableIds.has(receivableId) &&
    target.environment === BANESE_INCIDENT_SCOPE.environment &&
    target.convenio === BANESE_INCIDENT_SCOPE.convenio &&
    target.agencia === BANESE_INCIDENT_SCOPE.agencia &&
    Number(target.candidate_start) === BANESE_INCIDENT_SCOPE.candidateStart &&
    Number(target.candidate_end) === BANESE_INCIDENT_SCOPE.candidateEnd &&
    ["PENDING", "RECOVERED", "EXHAUSTED"].includes(
      normalizedIncidentStatus(target.state),
    );
};

export const isBaneseIncidentReceivable = (
  receivable: Record<string, unknown>,
) =>
  incidentReceivableIds.has(
    normalizedIncidentText(receivable.id).toLowerCase(),
  ) && receivable.gateway_provider === "banese_card" &&
  receivable.gateway_environment === BANESE_INCIDENT_SCOPE.environment &&
  normalizedIncidentStatus(receivable.gateway_payment_method) === "BOLETO" &&
  normalizedIncidentText(receivable.gateway_boleto_convenio) ===
    BANESE_INCIDENT_SCOPE.convenio &&
  normalizedIncidentText(receivable.gateway_boleto_agencia) ===
    BANESE_INCIDENT_SCOPE.agencia &&
  !normalizedIncidentText(receivable.gateway_cnab_file_id);

export const isBaneseIncidentDocumentReady = (
  receivable: Record<string, unknown>,
) => {
  if (
    !isBaneseIncidentReceivable(receivable) ||
    normalizedIncidentStatus(receivable.gateway_submission_channel) !==
      "API" ||
    normalizedIncidentStatus(receivable.gateway_submission_status) !==
      "API_REGISTERED" ||
    normalizedIncidentText(receivable.gateway_creation_token) ||
    !normalizedIncidentStatus(receivable.gateway_status) ||
    normalizedIncidentStatus(receivable.gateway_status) === "CREATING" ||
    normalizedIncidentText(receivable.gateway_last_error).startsWith(
      "BANESE_IDENTITY_QUARANTINED:",
    ) ||
    !["PENDENTE", "VENCIDO", "PAGO"].includes(
      normalizedIncidentStatus(receivable.status),
    ) ||
    !gatewayPrimaryUrl(receivable) ||
    !normalizedIncidentText(receivable.gateway_boleto_issued_at) ||
    !receivable.gateway_financial_terms ||
    typeof receivable.gateway_financial_terms !== "object" ||
    !normalizedIncidentText(receivable.gateway_financial_terms_confirmed_at)
  ) return false;

  const nossoNumero = normalizedIncidentText(
    receivable.gateway_boleto_nosso_numero,
  );
  const paymentId = normalizedIncidentText(receivable.gateway_payment_id);
  const linhaDigitavel = normalizedIncidentText(
    receivable.gateway_boleto_linha_digitavel,
  );
  const codigoBarras = normalizedIncidentText(
    receivable.gateway_boleto_codigo_barras,
  );
  const dueDate = normalizedIncidentText(receivable.data_vencimento).slice(
    0,
    10,
  );
  const amount = Number(receivable.valor);
  if (
    !/^\d{9}$/.test(nossoNumero) || paymentId !== nossoNumero ||
    !/^\d{47}$/.test(linhaDigitavel) || !/^\d{44}$/.test(codigoBarras) ||
    !Number.isFinite(amount) || amount <= 0 ||
    codigoBarras.slice(30, 39) !== nossoNumero ||
    Number(codigoBarras.slice(9, 19)) !== Math.round(amount * 100) ||
    calculateBaneseOurNumberDigit(
        BANESE_INCIDENT_SCOPE.agencia,
        nossoNumero.slice(0, 8),
      ) !== nossoNumero[8]
  ) return false;

  try {
    assertBaneseBankNumbers(linhaDigitavel, codigoBarras);
    assertBaneseDueDateFactor(codigoBarras, dueDate);
    normalizeBanesePixPayload(receivable.gateway_pix_payload, amount);
    normalizeBanesePixQrImage(receivable.gateway_pix_encoded_image);
    return true;
  } catch {
    return false;
  }
};

export const hasBaneseIncidentMaterialRemoteEvidence = (
  receivable: Record<string, unknown>,
) => {
  if (!isBaneseIncidentReceivable(receivable)) return false;
  if (
    ["API_REGISTERED", "API_AMBIGUOUS"].includes(
      normalizedIncidentStatus(receivable.gateway_submission_status),
    )
  ) return true;
  return [
    receivable.gateway_payment_id,
    receivable.gateway_payment_link_id,
    receivable.gateway_invoice_url,
    receivable.gateway_bank_slip_url,
    receivable.gateway_boleto_linha_digitavel,
    receivable.gateway_boleto_codigo_barras,
    receivable.gateway_boleto_issued_at,
    receivable.gateway_pix_payload,
    receivable.gateway_pix_encoded_image,
    receivable.gateway_transaction_receipt_url,
  ].some((value) => Boolean(normalizedIncidentText(value)));
};

export const shouldPauseNormalReconciliationForIncident = (
  report: BaneseIncidentRecoveryReport,
) => report.busy > 0 || report.failed > 0;
