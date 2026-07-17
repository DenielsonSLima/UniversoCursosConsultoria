export type BaneseDiscount = {
  type: "fixed" | "percentage";
  value: number;
  validUntil?: string | null;
};
export type BanesePenalty = {
  type: "fixed" | "percentage";
  value: number;
  startsOn?: string | null;
};
export type BaneseInterest = {
  type: "daily-fixed" | "monthly-percentage";
  value: number;
  startsOn?: string | null;
};
export type BaneseFinancialTermsInput = {
  nominalAmount: number;
  dueDate: string;
  discount?: BaneseDiscount | null;
  penalty?: BanesePenalty | null;
  interest?: BaneseInterest | null;
};
export type NormalizedBaneseFinancialTerms = {
  nominalAmount: number;
  dueDate: string;
  discount: (BaneseDiscount & { validUntil: string }) | null;
  penalty: (BanesePenalty & { startsOn: string }) | null;
  interest: (BaneseInterest & { startsOn: string }) | null;
};
export type BaneseFinancialTermsPayload = {
  Desconto?: Array<{
    Data: string;
    Valor: number;
    TipoDesconto: 1 | 2;
  }>;
  Multa?: {
    Data: string;
    Valor: number;
    TipoMulta: 1 | 2;
  };
  Juros?: {
    Data: string;
    Valor: number;
    TipoJuroMora: 1 | 2;
  };
};
export type BaneseFinancialTermsPdf = {
  discount: string | null;
  penalty: string | null;
  interest: string | null;
  lines: string[];
};
export type BaneseAcceptablePaymentRange = {
  paymentDate: string;
  minimumAmount: number;
  expectedAmount: number;
  maximumAmount: number;
  isDiscountActive: boolean;
  isLate: boolean;
  breakdown: {
    nominalAmount: number;
    discountAmount: number;
    penaltyAmount: number;
    interestAmount: number;
    daysAfterDue: number;
    interestAccrualDays: number;
  };
};

const DAY_MS = 86_400_000;
const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const assertIsoDate = (value: unknown, field: string) => {
  const normalized = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(field + " deve estar no formato YYYY-MM-DD.");
  }
  const [year, month, day] = normalized.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    year < 1 || month < 1 || month > 12 || day < 1 ||
    day > days[month - 1]
  ) {
    throw new Error(field + " nao representa uma data de calendario valida.");
  }
  return normalized;
};

const nextIsoDate = (isoDate: string) =>
  new Date(Date.parse(isoDate + "T00:00:00Z") + DAY_MS)
    .toISOString()
    .slice(0, 10);

const daysBetween = (startDate: string, endDate: string) =>
  Math.round(
    (Date.parse(endDate + "T00:00:00Z") -
      Date.parse(startDate + "T00:00:00Z")) / DAY_MS,
  );

const normalizeNominalAmount = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Valor nominal deve ser um numero finito maior que zero.");
  }
  const normalized = roundMoney(parsed);
  if (normalized <= 0) {
    throw new Error("Valor nominal deve representar ao menos um centavo.");
  }
  return normalized;
};

const normalizeTermValue = (
  value: unknown,
  field: string,
  percentage: boolean,
) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(field + " deve ser um numero finito maior que zero.");
  }
  const normalized = percentage
    ? Number(parsed.toFixed(6))
    : roundMoney(parsed);
  if (normalized <= 0) {
    throw new Error(field + " deve ser maior que zero apos normalizacao.");
  }
  if (percentage && normalized >= 100) {
    throw new Error(field + " percentual deve ser menor que 100%.");
  }
  return normalized;
};

export const normalizeBaneseFinancialTerms = (
  input: BaneseFinancialTermsInput,
): NormalizedBaneseFinancialTerms => {
  const nominalAmount = normalizeNominalAmount(input?.nominalAmount);
  const dueDate = assertIsoDate(input?.dueDate, "Data de vencimento");
  const dayAfterDueDate = nextIsoDate(dueDate);

  let discount: NormalizedBaneseFinancialTerms["discount"] = null;
  if (input?.discount) {
    const type = input.discount.type;
    if (type !== "fixed" && type !== "percentage") {
      throw new Error("Tipo de desconto Banese invalido.");
    }
    const value = normalizeTermValue(
      input.discount.value,
      "Desconto",
      type === "percentage",
    );
    if (type === "fixed" && value >= nominalAmount) {
      throw new Error("Desconto fixo deve ser menor que o valor nominal.");
    }
    const validUntil = input.discount.validUntil
      ? assertIsoDate(input.discount.validUntil, "Data limite do desconto")
      : dueDate;
    if (validUntil > dueDate) {
      throw new Error(
        "Data limite do desconto nao pode ser posterior ao vencimento.",
      );
    }
    discount = { type, value, validUntil };
  }

  let penalty: NormalizedBaneseFinancialTerms["penalty"] = null;
  if (input?.penalty) {
    const type = input.penalty.type;
    if (type !== "fixed" && type !== "percentage") {
      throw new Error("Tipo de multa Banese invalido.");
    }
    const value = normalizeTermValue(
      input.penalty.value,
      "Multa",
      type === "percentage",
    );
    if (type === "fixed" && value >= nominalAmount) {
      throw new Error("Multa fixa deve ser menor que o valor nominal.");
    }
    const startsOn = input.penalty.startsOn
      ? assertIsoDate(input.penalty.startsOn, "Data inicial da multa")
      : dayAfterDueDate;
    if (startsOn <= dueDate) {
      throw new Error(
        "Data inicial da multa deve ser posterior ao vencimento.",
      );
    }
    penalty = { type, value, startsOn };
  }

  let interest: NormalizedBaneseFinancialTerms["interest"] = null;
  if (input?.interest) {
    const type = input.interest.type;
    if (type !== "daily-fixed" && type !== "monthly-percentage") {
      throw new Error("Tipo de juros Banese invalido.");
    }
    const value = normalizeTermValue(
      input.interest.value,
      "Juros",
      type === "monthly-percentage",
    );
    const startsOn = input.interest.startsOn
      ? assertIsoDate(input.interest.startsOn, "Data inicial dos juros")
      : dayAfterDueDate;
    if (startsOn <= dueDate) {
      throw new Error(
        "Data inicial dos juros deve ser posterior ao vencimento.",
      );
    }
    interest = { type, value, startsOn };
  }

  return { nominalAmount, dueDate, discount, penalty, interest };
};

export const mapBaneseFinancialTermsToPayload = (
  input: BaneseFinancialTermsInput,
): BaneseFinancialTermsPayload => {
  const terms = normalizeBaneseFinancialTerms(input);
  const payload: BaneseFinancialTermsPayload = {};
  if (terms.discount) {
    payload.Desconto = [{
      Data: terms.discount.validUntil,
      Valor: terms.discount.value,
      TipoDesconto: terms.discount.type === "fixed" ? 1 : 2,
    }];
  }
  if (terms.penalty) {
    payload.Multa = {
      Data: terms.penalty.startsOn,
      Valor: terms.penalty.value,
      TipoMulta: terms.penalty.type === "fixed" ? 1 : 2,
    };
  }
  if (terms.interest) {
    payload.Juros = {
      Data: terms.interest.startsOn,
      Valor: terms.interest.value,
      TipoJuroMora: terms.interest.type === "daily-fixed" ? 1 : 2,
    };
  }
  return payload;
};

const formatDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split("-");
  return day + "/" + month + "/" + year;
};

const formatMoney = (value: number) =>
  "R$ " + value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatPercentage = (value: number) =>
  value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }) + "%";

export const formatBaneseFinancialTermsForPdf = (
  input: BaneseFinancialTermsInput,
): BaneseFinancialTermsPdf => {
  const terms = normalizeBaneseFinancialTerms(input);
  const discount = terms.discount
    ? (terms.discount.validUntil === terms.dueDate
      ? "Desconto até o vencimento (" + formatDate(terms.dueDate) + ")"
      : "Desconto até " + formatDate(terms.discount.validUntil)) +
      ": " +
      (terms.discount.type === "fixed"
        ? formatMoney(terms.discount.value)
        : formatPercentage(terms.discount.value))
    : null;
  const penalty = terms.penalty
    ? "Multa a partir de " + formatDate(terms.penalty.startsOn) + ": " +
      (terms.penalty.type === "fixed"
        ? formatMoney(terms.penalty.value)
        : formatPercentage(terms.penalty.value))
    : null;
  const interest = terms.interest
    ? "Juros a partir de " + formatDate(terms.interest.startsOn) + ": " +
      (terms.interest.type === "daily-fixed"
        ? formatMoney(terms.interest.value) + " por dia (dias corridos)"
        : formatPercentage(terms.interest.value) +
          " ao mês (dias corridos)")
    : null;
  const lines = [discount, penalty, interest].filter(
    (line): line is string => Boolean(line),
  );
  return { discount, penalty, interest, lines };
};

const amountBounds = (value: number) => {
  const cents = value * 100;
  const nearestCent = Math.round(cents);
  if (Math.abs(cents - nearestCent) < 1e-8) {
    const exact = nearestCent / 100;
    return { minimum: exact, maximum: exact };
  }
  return {
    minimum: Math.floor(cents + 1e-8) / 100,
    maximum: Math.ceil(cents - 1e-8) / 100,
  };
};

export const calculateBaneseAcceptablePaymentRange = (
  input: BaneseFinancialTermsInput,
  paymentDateValue: string,
): BaneseAcceptablePaymentRange => {
  const terms = normalizeBaneseFinancialTerms(input);
  const paymentDate = assertIsoDate(paymentDateValue, "Data de pagamento");
  const isDiscountActive = Boolean(
    terms.discount && paymentDate <= terms.discount.validUntil,
  );
  const isPenaltyActive = Boolean(
    terms.penalty && paymentDate >= terms.penalty.startsOn,
  );
  const interestAccrualDays = terms.interest &&
      paymentDate >= terms.interest.startsOn
    ? daysBetween(terms.interest.startsOn, paymentDate) + 1
    : 0;

  const discountRaw = isDiscountActive && terms.discount
    ? terms.discount.type === "fixed"
      ? terms.discount.value
      : terms.nominalAmount * terms.discount.value / 100
    : 0;
  const penaltyRaw = isPenaltyActive && terms.penalty
    ? terms.penalty.type === "fixed"
      ? terms.penalty.value
      : terms.nominalAmount * terms.penalty.value / 100
    : 0;
  const interestRaw = interestAccrualDays > 0 && terms.interest
    ? terms.interest.type === "daily-fixed"
      ? terms.interest.value * interestAccrualDays
      : terms.nominalAmount * terms.interest.value / 100 *
        interestAccrualDays / 30
    : 0;

  const discountBounds = amountBounds(discountRaw);
  const penaltyBounds = amountBounds(penaltyRaw);
  const interestBounds = amountBounds(interestRaw);
  const discountAmount = roundMoney(discountRaw);
  const penaltyAmount = roundMoney(penaltyRaw);
  const interestAmount = roundMoney(interestRaw);
  const minimumAmount = Math.max(
    0.01,
    roundMoney(
      terms.nominalAmount - discountBounds.maximum + penaltyBounds.minimum +
        interestBounds.minimum,
    ),
  );
  const maximumAmount = Math.max(
    minimumAmount,
    roundMoney(
      terms.nominalAmount - discountBounds.minimum + penaltyBounds.maximum +
        interestBounds.maximum,
    ),
  );
  const expectedAmount = Math.min(
    maximumAmount,
    Math.max(
      minimumAmount,
      roundMoney(
        terms.nominalAmount - discountAmount + penaltyAmount + interestAmount,
      ),
    ),
  );

  return {
    paymentDate,
    minimumAmount,
    expectedAmount,
    maximumAmount,
    isDiscountActive,
    isLate: paymentDate > terms.dueDate,
    breakdown: {
      nominalAmount: terms.nominalAmount,
      discountAmount,
      penaltyAmount,
      interestAmount,
      daysAfterDue: Math.max(0, daysBetween(terms.dueDate, paymentDate)),
      interestAccrualDays,
    },
  };
};
