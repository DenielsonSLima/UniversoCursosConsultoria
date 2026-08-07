import type {
  ManualSettlementBreakdown,
  ManualSettlementPaymentMethod,
  NormalizedManualSettlementRequest,
} from "./manual-settlement.types.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATABASE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CENTS = 9_000_000_000_000_000;
const PAYMENT_METHODS = new Set<ManualSettlementPaymentMethod>([
  "BOLETO",
  "PIX",
  "CARTAO",
  "DINHEIRO",
]);

const malformedMoneyError = (label: string) =>
  new Error(`${label} possui separadores decimais inválidos.`);

const strictGroupedInteger = (value: string, separator: "." | ",") => {
  const escapedSeparator = separator === "." ? "\\." : ",";
  return new RegExp(
    `^[1-9][0-9]{0,2}(?:${escapedSeparator}[0-9]{3})+$`,
  ).test(value);
};

const normalizedMoneyString = (value: string, label: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "0";
  const raw = trimmed.replace(/^R\$[\s\u00a0]*/i, "");
  if (!raw) {
    throw new Error(`${label} possui formato monetário inválido.`);
  }
  if (/R\$/i.test(raw) || /[\s\u00a0]/.test(raw)) {
    throw new Error(`${label} possui formato monetário inválido.`);
  }
  if (raw.startsWith("-") || raw.startsWith("+")) {
    throw new Error(`${label} não pode ser negativo.`);
  }
  if (!/^[0-9.,]+$/.test(raw)) {
    throw new Error(
      `${label} deve ser informado em reais, com no máximo dois centavos.`,
    );
  }

  if (!/[0-9]/.test(raw)) throw malformedMoneyError(label);

  const commaCount = (raw.match(/,/g) || []).length;
  const dotCount = (raw.match(/\./g) || []).length;

  if (commaCount > 0 && dotCount > 0) {
    const decimalSeparator = raw.lastIndexOf(",") > raw.lastIndexOf(".")
      ? ","
      : ".";
    const groupingSeparator = decimalSeparator === "," ? "." : ",";
    const decimalCount = decimalSeparator === "," ? commaCount : dotCount;
    if (decimalCount !== 1) throw malformedMoneyError(label);

    const [groupedInteger, decimals = ""] = raw.split(decimalSeparator);
    if (!decimals) throw malformedMoneyError(label);
    if (decimals.length > 2) {
      throw new Error(`${label} deve ter no máximo duas casas decimais.`);
    }
    if (!/^[0-9]{0,2}$/.test(decimals)) {
      throw malformedMoneyError(label);
    }
    if (
      !groupedInteger ||
      (groupedInteger.includes(groupingSeparator)
        ? !strictGroupedInteger(groupedInteger, groupingSeparator)
        : !/^[0-9]+$/.test(groupedInteger))
    ) {
      throw malformedMoneyError(label);
    }
    const integer = groupedInteger.replace(/[.,]/g, "");
    return `${integer}.${decimals.padEnd(2, "0")}`;
  }

  if (commaCount > 0) {
    if (commaCount !== 1) throw malformedMoneyError(label);
    const [integer = "", decimals = ""] = raw.split(",");
    if (!decimals) throw malformedMoneyError(label);
    if (decimals.length > 2) {
      throw new Error(`${label} deve ter no máximo duas casas decimais.`);
    }
    if (!/^[0-9]*$/.test(integer) || !/^[0-9]{0,2}$/.test(decimals)) {
      throw malformedMoneyError(label);
    }
    return `${integer || "0"}.${decimals.padEnd(2, "0")}`;
  }

  if (dotCount > 1) {
    if (!strictGroupedInteger(raw, ".")) throw malformedMoneyError(label);
    return raw.replace(/\./g, "");
  }

  if (dotCount === 1) {
    const [integer = "", decimals = ""] = raw.split(".");
    if (!decimals) throw malformedMoneyError(label);
    if (decimals.length === 3) {
      if (!strictGroupedInteger(raw, ".")) {
        throw malformedMoneyError(label);
      }
      return `${integer}${decimals}`;
    }
    if (decimals.length > 2) {
      throw new Error(`${label} deve ter no máximo duas casas decimais.`);
    }
    if (!/^[0-9]*$/.test(integer) || !/^[0-9]{0,2}$/.test(decimals)) {
      throw malformedMoneyError(label);
    }
    return `${integer || "0"}.${decimals.padEnd(2, "0")}`;
  }

  return raw;
};

export const moneyToCents = (
  value: unknown,
  label: string,
  options: { allowZero?: boolean } = {},
) => {
  let cents: number;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${label} inválido.`);
    const scaled = value * 100;
    if (Math.abs(scaled - Math.round(scaled)) > 0.000001) {
      throw new Error(`${label} deve ter no máximo duas casas decimais.`);
    }
    cents = Math.round(scaled);
  } else {
    const normalized = normalizedMoneyString(String(value ?? ""), label);
    const [integerPart, decimalPart = ""] = normalized.split(".");
    const integer = Number(integerPart || "0");
    if (!Number.isSafeInteger(integer)) {
      throw new Error(`${label} excede o limite permitido.`);
    }
    cents = integer * 100 + Number(decimalPart.padEnd(2, "0") || "0");
  }

  if (!Number.isSafeInteger(cents) || cents < 0 || cents > MAX_CENTS) {
    throw new Error(`${label} inválido ou fora do limite permitido.`);
  }
  if (options.allowZero !== true && cents === 0) {
    throw new Error(`${label} deve ser maior que zero.`);
  }
  return cents;
};

const assertIsoPaymentDate = (value: unknown, now: Date) => {
  const paymentDate = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    throw new Error("Data de pagamento inválida para baixa manual.");
  }
  const parsed = new Date(`${paymentDate}T12:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== paymentDate
  ) {
    throw new Error("Data de pagamento inexistente.");
  }
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Maceio",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  if (paymentDate > today) {
    throw new Error(
      "Data de pagamento futura não é permitida na baixa manual.",
    );
  }
  return paymentDate;
};

export const normalizeManualSettlementRequest = (
  body: Record<string, unknown>,
  receivable: any,
  now = new Date(),
): NormalizedManualSettlementRequest => {
  const receivableId = String(body.receivableId || "").trim();
  const idempotencyKey = String(body.idempotencyKey || "").trim();
  const accountId = String(body.contaBancariaId || "").trim();
  if (!UUID_RE.test(receivableId)) {
    throw new Error("Cobrança inválida para baixa manual.");
  }
  if (!UUID_RE.test(idempotencyKey)) {
    throw new Error(
      "Identificador idempotente inválido. Feche e abra a baixa novamente.",
    );
  }
  if (!DATABASE_UUID_RE.test(accountId)) {
    throw new Error("Conta bancária obrigatória para baixa manual.");
  }

  const paymentMethod = String(body.formaPagamento || "")
    .trim()
    .toUpperCase() as ManualSettlementPaymentMethod;
  if (!PAYMENT_METHODS.has(paymentMethod)) {
    throw new Error("Forma de pagamento inválida para baixa manual.");
  }

  const breakdown: ManualSettlementBreakdown = {
    currency: "BRL",
    principalCents: moneyToCents(receivable?.valor, "Valor principal"),
    interestCents: moneyToCents(body.valorJuros ?? 0, "Juros", {
      allowZero: true,
    }),
    penaltyCents: moneyToCents(body.valorMulta ?? 0, "Multa", {
      allowZero: true,
    }),
    additionCents: moneyToCents(body.valorAcrescimo ?? 0, "Acréscimo", {
      allowZero: true,
    }),
    discountCents: moneyToCents(body.valorDesconto ?? 0, "Desconto", {
      allowZero: true,
    }),
    receivedCents: moneyToCents(body.valorPago, "Valor recebido"),
  };

  const gross = breakdown.principalCents + breakdown.interestCents +
    breakdown.penaltyCents + breakdown.additionCents;
  if (breakdown.discountCents >= gross) {
    throw new Error(
      "O desconto deve ser menor que o valor principal somado aos encargos.",
    );
  }
  const expected = gross - breakdown.discountCents;
  if (breakdown.receivedCents !== expected) {
    throw new Error(
      `Valor recebido divergente: a composição informada totaliza R$ ${
        (expected / 100).toFixed(2).replace(".", ",")
      }.`,
    );
  }

  return {
    receivableId,
    idempotencyKey,
    accountId,
    paymentDate: assertIsoPaymentDate(body.dataPagamento, now),
    paymentMethod,
    breakdown,
  };
};

const stableFingerprintPayload = (
  request: NormalizedManualSettlementRequest,
) => ({
  receivableId: request.receivableId,
  accountId: request.accountId,
  paymentDate: request.paymentDate,
  paymentMethod: request.paymentMethod,
  ...request.breakdown,
});

export const manualSettlementFingerprint = async (
  request: NormalizedManualSettlementRequest,
) => {
  const bytes = new TextEncoder().encode(
    JSON.stringify(stableFingerprintPayload(request)),
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};
