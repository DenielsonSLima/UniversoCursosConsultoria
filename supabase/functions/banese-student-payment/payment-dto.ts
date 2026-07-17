import {
  assertBaneseBankNumbers,
  assertBaneseDueDateFactor,
} from "../banese/internal/bank-fields.ts";
import {
  normalizeBanesePixPayload,
  normalizeBanesePixQrImage,
} from "../banese/internal/pix-validation.ts";
import { normalizeBaneseFinancialTerms } from "../banese/internal/financial-terms.ts";
import type {
  BaneseEnvironment,
  BaneseStudentChargeDto,
  BaneseStudentFinancialTermsDto,
  BaneseStudentPaymentDto,
  BaneseStudentPaymentRow,
  BaneseStudentPixDto,
} from "./types.ts";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CANCELED_STATUSES = new Set([
  "CANCELADO",
  "CANCELED",
  "ESTORNADO",
  "DEVOLVIDO",
  "REFUNDED",
  "CANCELED_BY_BANK",
]);
const CARNET_LOCAL_STATUSES = new Set([
  "PENDENTE",
  "VENCIDO",
  "AGUARDANDO_CONFIRMACAO",
]);
const CARNET_BANK_STATUSES = new Set([
  "",
  "2",
  "PENDING",
  "OPEN",
  "REGISTERED",
  "CREATED",
]);
const SAFE_LOCAL_STATUSES = new Set([
  "PENDENTE",
  "VENCIDO",
  "AGUARDANDO_CONFIRMACAO",
  "PAGO",
  "DEVOLVIDO",
  "CANCELADO",
  "ESTORNADO",
  "SUSPENSO",
]);
const SAFE_BANK_STATUSES = new Set([
  "PENDING",
  "OPEN",
  "REGISTERED",
  "CREATED",
  "REGISTERING",
  "PROCESSING",
  "PAID",
  "RECEIVED",
  "CONFIRMED",
  "CANCELED",
  "CANCELED_BY_BANK",
  "REFUNDED",
  "SUSPENDED",
  "REJECTED",
  "REJECTED_TIMEOUT",
  "EXPIRED",
  "PROTESTED",
]);

const onlyDigits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const normalizedUpper = (value: unknown) =>
  String(value ?? "").trim().toUpperCase();

const redactSensitiveText = (value: string) =>
  value
    .replace(/https?:\/\/\S+/gi, "[link protegido]")
    .replace(/\bwww\.\S+/gi, "[link protegido]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[documento protegido]")
    .replace(
      /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,
      "[documento protegido]",
    )
    .replace(/\b\d{11,14}\b/g, "[documento protegido]");

const safeText = (value: unknown, fallback: string, maxLength: number) => {
  const text = String(value ?? "").trim();
  return redactSensitiveText(text || fallback).slice(0, maxLength);
};

const safeOptionalText = (value: unknown, maxLength: number) => {
  const text = String(value ?? "").trim();
  return text ? redactSensitiveText(text).slice(0, maxLength) : null;
};

const safeIsoDate = (value: unknown) => {
  const text = String(value ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};

const safeAmount = (value: unknown, required: boolean) => {
  if (value === null || value === undefined || String(value).trim() === "") {
    if (required) throw new Error("Valor nominal da cobranca Banese invalido.");
    return null;
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || (required && amount <= 0)) {
    if (required) throw new Error("Valor nominal da cobranca Banese invalido.");
    return null;
  }
  return Number(amount.toFixed(2));
};

const normalizeEnvironment = (value: unknown): BaneseEnvironment =>
  String(value ?? "").trim().toLowerCase() === "production"
    ? "production"
    : "sandbox";

const normalizeLocalStatus = (value: unknown) => {
  const status = normalizedUpper(value);
  return SAFE_LOCAL_STATUSES.has(status) ? status : "INDEFINIDO";
};

const normalizeBankStatus = (value: unknown) => {
  const status = normalizedUpper(value);
  if (status === "2") return "REGISTERED";
  return SAFE_BANK_STATUSES.has(status) ? status : "UNKNOWN";
};

const firstRelation = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

const courseAndClass = (row: BaneseStudentPaymentRow) => {
  const turma = firstRelation(row.turmas);
  const curso = firstRelation(turma?.cursos);
  return {
    courseName: safeOptionalText(curso?.nome, 120),
    className: safeOptionalText(turma?.nome, 120),
  };
};

const sanitizePix = (
  row: BaneseStudentPaymentRow,
  amount: number,
): BaneseStudentPixDto => {
  const environment = normalizeEnvironment(row.gateway_environment);
  if (environment === "sandbox") {
    return {
      state: "sandbox-unavailable",
      copyAndPaste: null,
      qrCodeImage: null,
    };
  }

  try {
    const copyAndPaste = normalizeBanesePixPayload(
      row.gateway_pix_payload,
      amount,
    ).payload;
    const qrCodeImage = normalizeBanesePixQrImage(
      row.gateway_pix_encoded_image,
    );
    if (qrCodeImage.length > 250_000) {
      throw new Error("Imagem Pix excede o limite do DTO do aluno.");
    }
    return { state: "available", copyAndPaste, qrCodeImage };
  } catch {
    return { state: "pending", copyAndPaste: null, qrCodeImage: null };
  }
};

const bankTitle = (row: BaneseStudentPaymentRow) => {
  const { digitableLine, barcode } = assertBaneseBankNumbers(
    row.gateway_boleto_linha_digitavel,
    row.gateway_boleto_codigo_barras,
  );
  const amount = safeAmount(row.valor, true) as number;
  const encodedAmount = Number(barcode.slice(9, 19)) / 100;
  if (Math.abs(encodedAmount - amount) > 0.001) {
    throw new Error(
      "Valor do recebivel diverge do valor codificado no boleto Banese.",
    );
  }
  const dueDate = safeIsoDate(row.data_vencimento);
  if (!dueDate) {
    throw new Error("Vencimento da cobranca Banese invalido.");
  }
  assertBaneseDueDateFactor(barcode, dueDate);
  const ourNumber = onlyDigits(row.gateway_boleto_nosso_numero);
  if (ourNumber.length !== 9) {
    throw new Error("Nosso Numero da cobranca Banese invalido.");
  }
  return { digitableLine, barcode, ourNumber };
};

const sanitizeFinancialTerms = (
  row: BaneseStudentPaymentRow,
  amount: number,
  dueDate: string,
): BaneseStudentFinancialTermsDto => {
  const unconfirmed: BaneseStudentFinancialTermsDto = {
    confirmed: false,
    discount: null,
    penalty: null,
    interest: null,
  };
  if (
    !row.gateway_financial_terms ||
    typeof row.gateway_financial_terms !== "object" ||
    !row.gateway_financial_terms_confirmed_at ||
    Number.isNaN(Date.parse(row.gateway_financial_terms_confirmed_at))
  ) return unconfirmed;

  const terms = normalizeBaneseFinancialTerms({
    ...(row.gateway_financial_terms as any),
    nominalAmount: amount,
    dueDate,
  });
  const discountAmount = terms.discount
    ? terms.discount.type === "fixed"
      ? terms.discount.value
      : amount * terms.discount.value / 100
    : 0;
  return {
    confirmed: true,
    discount: terms.discount
      ? {
        ...terms.discount,
        amountUntilDue: Number(
          Math.max(0, amount - discountAmount).toFixed(2),
        ),
      }
      : null,
    penalty: terms.penalty,
    interest: terms.interest,
  };
};

const issuerSignature = (row: BaneseStudentPaymentRow) => {
  const agreement = onlyDigits(row.gateway_boleto_convenio);
  const agency = onlyDigits(row.gateway_boleto_agencia);
  const issuer = String(row.gateway_issuer_polo_id ?? "").trim();
  return agreement && agency.length === 3 && agency !== "000" &&
      UUID_RE.test(issuer)
    ? `${agreement}|${agency}|${issuer}`
    : null;
};

const isRegisteredBaneseBoleto = (row: BaneseStudentPaymentRow) => {
  try {
    bankTitle(row);
    return normalizedUpper(row.gateway_payment_method) === "BOLETO" &&
      String(row.gateway_provider ?? "").trim().toLowerCase() === "banese_card";
  } catch {
    return false;
  }
};

const installmentOrder = (row: BaneseStudentPaymentRow) => {
  const value = Number(row.parcela_numero);
  return Number.isInteger(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
};

export const isActiveStudentStatus = (value: unknown) =>
  !["INATIVO", "INACTIVE", "BLOQUEADO", "CANCELADO"].includes(
    normalizedUpper(value),
  );

const isPayableCarnetRow = (row: BaneseStudentPaymentRow) =>
  CARNET_LOCAL_STATUSES.has(normalizedUpper(row.status)) &&
  CARNET_BANK_STATUSES.has(normalizedUpper(row.gateway_status));

export const maskStudentDocument = (value: unknown) => {
  const digits = onlyDigits(value);
  if (digits.length === 11) return `***.***.***-${digits.slice(-2)}`;
  if (digits.length === 14) return `**.***.***/${digits.slice(8, 12)}-**`;
  return "Documento protegido";
};

export const selectSafeInstallmentRows = (
  selected: BaneseStudentPaymentRow,
  candidates: BaneseStudentPaymentRow[],
) => {
  if (
    normalizedUpper(selected.tipo_lancamento) !== "PARCELA" ||
    !selected.cliente_id ||
    !selected.matricula_id ||
    !isPayableCarnetRow(selected) ||
    CANCELED_STATUSES.has(normalizedUpper(selected.status)) ||
    CANCELED_STATUSES.has(normalizedUpper(selected.gateway_status))
  ) return [selected];

  const selectedIssuer = issuerSignature(selected);
  if (!selectedIssuer) return [selected];

  const rows = candidates.filter((row) =>
    row.cliente_id === selected.cliente_id &&
    row.matricula_id === selected.matricula_id &&
    normalizeEnvironment(row.gateway_environment) ===
      normalizeEnvironment(selected.gateway_environment) &&
    normalizedUpper(row.tipo_lancamento) === "PARCELA" &&
    isPayableCarnetRow(row) &&
    !CANCELED_STATUSES.has(normalizedUpper(row.status)) &&
    !CANCELED_STATUSES.has(normalizedUpper(row.gateway_status)) &&
    issuerSignature(row) === selectedIssuer &&
    isRegisteredBaneseBoleto(row)
  ).sort((left, right) =>
    installmentOrder(left) - installmentOrder(right) ||
    String(left.data_vencimento ?? "").localeCompare(
      String(right.data_vencimento ?? ""),
    ) ||
    left.id.localeCompare(right.id)
  );

  if (rows.length < 3 || !rows.some((row) => row.id === selected.id)) {
    return [selected];
  }

  const uniqueFields = [
    rows.map((row) => onlyDigits(row.gateway_boleto_nosso_numero)),
    rows.map((row) => onlyDigits(row.gateway_boleto_linha_digitavel)),
    rows.map((row) => onlyDigits(row.gateway_boleto_codigo_barras)),
  ];
  const hasMissingOrDuplicate = uniqueFields.some((values) =>
    values.some((value) => !value) || new Set(values).size !== rows.length
  );
  return hasMissingOrDuplicate ? [selected] : rows;
};

export const deriveOpaqueGroupMarker = async (
  groupKey: string,
  secret: string,
) => {
  if (!groupKey || secret.length < 16) {
    throw new Error("Segredo do marcador de grupo nao configurado.");
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(groupKey)),
  );
  const base64 = btoa(String.fromCharCode(...signature))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `grp_${base64.slice(0, 32)}`;
};

export const sanitizeBaneseStudentCharge = (
  row: BaneseStudentPaymentRow,
  groupMarker: string,
): BaneseStudentChargeDto => {
  if (!UUID_RE.test(row.id) || !groupMarker.startsWith("grp_")) {
    throw new Error("Identificador da cobranca Banese invalido.");
  }
  const amount = safeAmount(row.valor, true) as number;
  const installment = Number(row.parcela_numero);
  const relation = courseAndClass(row);
  const { digitableLine, barcode } = bankTitle(row);
  const dueDate = safeIsoDate(row.data_vencimento);
  if (!dueDate) throw new Error("Vencimento da cobranca Banese invalido.");
  return {
    id: row.id,
    groupMarker,
    description: safeText(row.descricao, "Cobrança Universo Cursos", 160),
    category: safeOptionalText(row.categoria, 60),
    chargeType: safeOptionalText(row.tipo_lancamento, 40),
    installmentNumber: Number.isInteger(installment) && installment > 0
      ? installment
      : null,
    amount,
    amountPaid: safeAmount(row.valor_pago, false),
    dueDate,
    paymentDate: safeIsoDate(row.data_pagamento),
    status: normalizeLocalStatus(row.status),
    bankStatus: normalizeBankStatus(row.gateway_status),
    environment: normalizeEnvironment(row.gateway_environment),
    ...relation,
    boleto: { digitableLine, barcode },
    financialTerms: sanitizeFinancialTerms(row, amount, dueDate),
    pix: sanitizePix(row, amount),
  };
};

export const buildBaneseStudentPaymentDto = (
  selected: BaneseStudentPaymentRow,
  installments: BaneseStudentPaymentRow[],
  groupMarker: string,
  payer: { name: unknown; document: unknown },
): BaneseStudentPaymentDto => {
  const safeInstallments = installments.map((row) =>
    sanitizeBaneseStudentCharge(row, groupMarker)
  );
  const selectedDto = safeInstallments.find((row) => row.id === selected.id) ??
    sanitizeBaneseStudentCharge(selected, groupMarker);
  return {
    payment: selectedDto,
    installments: safeInstallments,
    group: {
      marker: groupMarker,
      kind: safeInstallments.length >= 3 ? "carnet" : "single",
      installmentCount: safeInstallments.length,
    },
    payer: {
      name: safeText(payer.name, "Aluno Universo Cursos", 100),
      documentMasked: maskStudentDocument(payer.document),
    },
  };
};
