import type { GatewayChargeResult } from "../gateways/router.ts";
import {
  assertBaneseBankNumbers,
  assertBaneseDueDateFactor,
} from "../banese/internal/bank-fields.ts";
import { normalizeBaneseFinancialTerms } from "../banese/internal/financial-terms.ts";
import {
  normalizeBanesePixPayload,
  normalizeBanesePixQrImage,
} from "../banese/internal/pix-validation.ts";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const FINGERPRINT_RE = /^[0-9a-f]{64}$/;

export type ManualCycleIssuanceRequest = {
  action: "generate" | "resume";
  matriculaId: string;
  cicloNumero: number;
  primeiroVencimento: string | null;
  requestId: string | null;
  expectedRegraFingerprint: string | null;
  expectedPoliticaFingerprint: string | null;
  expectedCronogramaFingerprint: string | null;
};

export type ManualCycleProgress = {
  cicloNumero: number;
  quantidadeItens: number;
  emitidosBanese: number;
  pendentesEmissao: number;
  emRevisao: number;
};

export type ManualCycleReceivableSummary = {
  id: string;
  chave: string;
  tipo: "MATRICULA" | "REMATRICULA" | "PARCELA";
  numero: number;
  descricao: string;
  valor: string;
  vencimento: string;
  status: string;
  emissaoBanese: string;
};

export type ManualCycleContext = {
  requestId: string;
  replayed: boolean;
  matriculaId: string;
  turmaId: string;
  poloId: string;
  ciclo: ManualCycleProgress & {
    numero: number;
    status: string;
    total: string;
    recebiveis: ManualCycleReceivableSummary[];
  };
  cicloManual: unknown;
};

export class IssuanceHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = "MANUAL_CYCLE_ISSUANCE_FAILED",
    readonly progress: ManualCycleProgress | null = null,
  ) {
    super(message);
    this.name = "IssuanceHttpError";
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const stringValue = (value: unknown) => String(value ?? "").trim();
const decimalValue = (value: unknown) => {
  const candidate = stringValue(value);
  return /^\d+(?:\.\d{1,2})?$/.test(candidate) ? candidate : null;
};

const validIsoDate = (value: unknown) => {
  const candidate = stringValue(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return false;
  const [year, month, day] = candidate.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
};

const requiredUuid = (value: unknown, field: string) => {
  const candidate = stringValue(value);
  if (!UUID_RE.test(candidate)) {
    throw new IssuanceHttpError(400, `${field} inválido.`, "INVALID_REQUEST");
  }
  return candidate;
};

const optionalFingerprint = (value: unknown, field: string) => {
  const candidate = stringValue(value);
  if (!FINGERPRINT_RE.test(candidate)) {
    throw new IssuanceHttpError(400, `${field} inválido.`, "INVALID_REQUEST");
  }
  return candidate;
};

export const parseIssuanceRequest = (
  value: unknown,
): ManualCycleIssuanceRequest => {
  const body = asRecord(value);
  if (!body) {
    throw new IssuanceHttpError(400, "Requisição inválida.", "INVALID_REQUEST");
  }
  const action = stringValue(body.action);
  if (action !== "generate" && action !== "resume") {
    throw new IssuanceHttpError(400, "Ação inválida.", "INVALID_REQUEST");
  }
  const matriculaId = requiredUuid(body.matriculaId, "Matrícula");
  const cicloNumero = Number(body.cicloNumero);
  if (!Number.isInteger(cicloNumero) || cicloNumero < 1 || cicloNumero > 2) {
    throw new IssuanceHttpError(400, "Ciclo inválido.", "INVALID_REQUEST");
  }
  if (action === "resume") {
    return {
      action,
      matriculaId,
      cicloNumero,
      primeiroVencimento: null,
      requestId: null,
      expectedRegraFingerprint: null,
      expectedPoliticaFingerprint: null,
      expectedCronogramaFingerprint: null,
    };
  }
  const primeiroVencimento = body.primeiroVencimento === undefined
    ? null
    : stringValue(body.primeiroVencimento);
  if (cicloNumero === 2 && !validIsoDate(primeiroVencimento)) {
    throw new IssuanceHttpError(
      400,
      "O 2º ciclo exige um primeiro vencimento válido.",
      "INVALID_REQUEST",
    );
  }
  if (primeiroVencimento !== null && !validIsoDate(primeiroVencimento)) {
    throw new IssuanceHttpError(400, "Vencimento inválido.", "INVALID_REQUEST");
  }
  return {
    action,
    matriculaId,
    cicloNumero,
    primeiroVencimento,
    requestId: requiredUuid(body.requestId, "Identificador da requisição"),
    expectedRegraFingerprint: optionalFingerprint(
      body.expectedRegraFingerprint,
      "Fingerprint da regra",
    ),
    expectedPoliticaFingerprint: optionalFingerprint(
      body.expectedPoliticaFingerprint,
      "Fingerprint da política",
    ),
    expectedCronogramaFingerprint: optionalFingerprint(
      body.expectedCronogramaFingerprint,
      "Fingerprint do cronograma",
    ),
  };
};

const parseProgress = (value: Record<string, unknown>): ManualCycleProgress => {
  const progress = {
    cicloNumero: Number(value.cicloNumero ?? value.numero),
    quantidadeItens: Number(value.quantidadeItens),
    emitidosBanese: Number(value.emitidosBanese ?? 0),
    pendentesEmissao: Number(value.pendentesEmissao ?? 0),
    emRevisao: Number(value.emRevisao ?? 0),
  };
  if (
    !Object.values(progress).every(Number.isInteger) ||
    progress.cicloNumero < 1 || progress.cicloNumero > 2 ||
    progress.quantidadeItens < 1 || progress.quantidadeItens > 61 ||
    progress.emitidosBanese < 0 || progress.pendentesEmissao < 0 ||
    progress.emRevisao < 0 ||
    progress.emitidosBanese + progress.pendentesEmissao +
          progress.emRevisao !== progress.quantidadeItens
  ) {
    throw new Error("Progresso do ciclo manual inválido.");
  }
  return progress;
};

const parseReceivableSummary = (
  value: unknown,
): ManualCycleReceivableSummary => {
  const item = asRecord(value);
  const type = stringValue(item?.tipo).toUpperCase();
  const number = Number(item?.numero);
  if (
    !item || !UUID_RE.test(stringValue(item.id)) ||
    !stringValue(item.chave) ||
    !["MATRICULA", "REMATRICULA", "PARCELA"].includes(type) ||
    !Number.isInteger(number) || number < 0 ||
    !stringValue(item.descricao) || !decimalValue(item.valor) ||
    !validIsoDate(item.vencimento)
  ) {
    throw new Error("Recebível do ciclo manual inválido.");
  }
  return {
    id: stringValue(item.id),
    chave: stringValue(item.chave),
    tipo: type as ManualCycleReceivableSummary["tipo"],
    numero: number,
    descricao: stringValue(item.descricao),
    valor: decimalValue(item.valor)!,
    vencimento: stringValue(item.vencimento),
    status: stringValue(item.status).toUpperCase(),
    emissaoBanese: stringValue(item.emissaoBanese).toUpperCase(),
  };
};

export const parseCycleContext = (value: unknown): ManualCycleContext => {
  const envelope = asRecord(value);
  const cycle = asRecord(envelope?.ciclo);
  const receivables = Array.isArray(cycle?.recebiveis)
    ? cycle.recebiveis.map(parseReceivableSummary)
    : [];
  const requestId = stringValue(envelope?.requestId);
  const matriculaId = stringValue(envelope?.matriculaId);
  const turmaId = stringValue(envelope?.turmaId);
  const poloId = stringValue(envelope?.poloId);
  if (
    !envelope || !cycle || !UUID_RE.test(requestId) ||
    (matriculaId && !UUID_RE.test(matriculaId)) ||
    (turmaId && !UUID_RE.test(turmaId)) ||
    (poloId && !UUID_RE.test(poloId)) ||
    !decimalValue(cycle.total) || receivables.length < 1 ||
    new Set(receivables.map((item) => item.id)).size !== receivables.length ||
    new Set(receivables.map((item) => item.chave)).size !== receivables.length
  ) {
    throw new Error("Contexto de emissão do ciclo manual inválido.");
  }
  const progress = parseProgress({
    ...cycle,
    pendentesEmissao: cycle.pendentesEmissao ??
      receivables.filter((item) => item.emissaoBanese !== "EMITIDO").length,
  });
  if (progress.quantidadeItens !== receivables.length) {
    throw new Error("Quantidade de recebíveis do ciclo manual diverge.");
  }
  return {
    requestId,
    replayed: envelope.replayed === true,
    matriculaId,
    turmaId,
    poloId,
    ciclo: {
      numero: Number(cycle.numero),
      status: stringValue(cycle.status),
      total: decimalValue(cycle.total)!,
      recebiveis: receivables,
      ...progress,
    },
    cicloManual: envelope.cicloManual ?? null,
  };
};

export const deterministicReceivableRequestId = async (
  requestId: string,
  receivableId: string,
) => {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        `technical-manual-cycle:${requestId}:${receivableId}`,
      ),
    ),
  );
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = Array.from(digest.slice(0, 16))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${
    hex.slice(16, 20)
  }-${hex.slice(20, 32)}`;
};

const nineDigitIdentity = (value: unknown, field: string) => {
  const digits = stringValue(value).replace(/\D/g, "");
  if (!/^\d{1,9}$/.test(digits)) {
    throw new Error(`${field} Banese inválido.`);
  }
  return digits.padStart(9, "0");
};

export const validateBaneseGatewayResult = (
  value: GatewayChargeResult,
  receivable: Record<string, unknown>,
): GatewayChargeResult => {
  const amount = Number(receivable.valor);
  const dueDate = stringValue(receivable.data_vencimento).slice(0, 10);
  const ourNumber = nineDigitIdentity(value.bankSlipOurNumber, "Nosso Número");
  const paymentId = nineDigitIdentity(value.remotePaymentId, "Pagamento");
  if (paymentId !== ourNumber || value.providerCode !== "banese_card") {
    throw new Error("Identidade do título BolePix Banese diverge.");
  }
  const bank = assertBaneseBankNumbers(
    value.bankSlipDigitableLine,
    value.bankSlipBarcode,
  );
  assertBaneseDueDateFactor(bank.barcode, dueDate);
  if (bank.barcode.slice(30, 39) !== ourNumber) {
    throw new Error(
      "Nosso Número diverge da chave ASBACE do código de barras.",
    );
  }
  const pix = normalizeBanesePixPayload(value.pixPayload, amount);
  const qr = normalizeBanesePixQrImage(value.pixEncodedImage);
  if (!value.financialTerms) {
    throw new Error("Emissão BolePix sem termos financeiros confirmados.");
  }
  const financialTerms = normalizeBaneseFinancialTerms(
    value.financialTerms as Parameters<
      typeof normalizeBaneseFinancialTerms
    >[0],
  );
  if (
    Math.round(financialTerms.nominalAmount * 100) !==
      Math.round(amount * 100) ||
    financialTerms.dueDate !== dueDate || value.remoteStatus !== "PENDING" ||
    !UUID_RE.test(stringValue(value.issuerPoloId)) ||
    value.issuerPoloId !== stringValue(receivable.gateway_issuer_polo_id)
  ) {
    throw new Error(
      "Resultado BolePix Banese não confirma valor, vencimento, situação ou emissor.",
    );
  }
  return {
    ...value,
    remotePaymentId: paymentId,
    remotePaymentLinkId: null,
    bankSlipOurNumber: ourNumber,
    bankSlipDigitableLine: bank.digitableLine,
    bankSlipBarcode: bank.barcode,
    pixPayload: pix.payload,
    pixEncodedImage: qr,
    financialTerms,
    rawPayload: asRecord(value.rawPayload) ?? {},
  };
};

export const errorMessage = (error: unknown) =>
  (error instanceof Error
    ? error.message
    : String(error || "Erro desconhecido"))
    .slice(0, 2_000);

export const remotePaymentMayExist = (error: unknown) =>
  Boolean(
    error && typeof error === "object" &&
      (error as Record<string, unknown>).remotePaymentCreated === true,
  );
