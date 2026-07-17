import {
  type BaneseFinancialTermsInput,
  normalizeBaneseFinancialTerms,
  type NormalizedBaneseFinancialTerms,
} from "./financial-terms.ts";

const remoteRecord = (value: unknown, label: string) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Formato de ${label} retornado pelo Banese e invalido.`);
  }
  return value as Record<string, unknown>;
};

const remoteTermRecord = (value: unknown, label: string) => {
  const record = remoteRecord(value, label);
  if (Object.keys(record).length === 0) {
    throw new Error(`Conteudo de ${label} retornado pelo Banese e invalido.`);
  }
  return record;
};

const optionalRemoteRecord = (value: unknown, label: string) =>
  value === null || value === undefined ? null : remoteTermRecord(value, label);

const isNumeric = (value: unknown) =>
  (typeof value === "number" ||
    (typeof value === "string" && value.trim() !== "")) &&
  Number.isFinite(Number(value));

const isEmptyRemoteTerm = (term: Record<string, unknown>, type: unknown) => {
  const amountValue = term.Valor ?? term.valor;
  const date = String(term.Data ?? term.data ?? "").slice(0, 10);
  const hasEmptyAmount = amountValue === null || amountValue === undefined ||
    (isNumeric(amountValue) && Number(amountValue) === 0);
  return isNumeric(type) && Number(type) === 0 && hasEmptyAmount &&
    (!date || date === "0001-01-01");
};

export const baneseFinancialTermsFromPayload = (
  value: unknown,
  nominalAmount: number,
  dueDate: string,
): NormalizedBaneseFinancialTerms => {
  const record = remoteRecord(value, "termos financeiros");
  const discountValue = record.Desconto ?? record.desconto;
  if (discountValue != null && !Array.isArray(discountValue)) {
    throw new Error("Formato de desconto retornado pelo Banese e invalido.");
  }
  const discounts = (discountValue ?? [])
    .map((item: unknown) => remoteTermRecord(item, "desconto"))
    .filter((discount: Record<string, unknown>) =>
      !isEmptyRemoteTerm(
        discount,
        discount.TipoDesconto ?? discount.tipoDesconto,
      )
    );
  if (discounts.length > 1) {
    throw new Error(
      "Titulo Banese retornou mais de um desconto nao suportado.",
    );
  }
  const discount = discounts[0] ?? {};
  const rawPenalty = optionalRemoteRecord(
    record.Multa ?? record.multa,
    "multa",
  );
  const rawInterest = optionalRemoteRecord(
    record.Juros ?? record.juros,
    "juros",
  );
  const penalty = !rawPenalty || isEmptyRemoteTerm(
      rawPenalty,
      rawPenalty.TipoMulta ?? rawPenalty.tipoMulta,
    )
    ? {}
    : rawPenalty;
  const interest = !rawInterest || isEmptyRemoteTerm(
      rawInterest,
      rawInterest.TipoJuroMora ?? rawInterest.tipoJuroMora,
    )
    ? {}
    : rawInterest;
  const discountType = Number(
    discount.TipoDesconto ?? discount.tipoDesconto,
  );
  const penaltyType = Number(penalty.TipoMulta ?? penalty.tipoMulta);
  const interestType = Number(
    interest.TipoJuroMora ?? interest.tipoJuroMora,
  );
  if (discounts.length && ![1, 2].includes(discountType)) {
    throw new Error("Tipo de desconto retornado pelo Banese e invalido.");
  }
  if (Object.keys(penalty).length && ![1, 2].includes(penaltyType)) {
    throw new Error("Tipo de multa retornado pelo Banese e invalido.");
  }
  if (Object.keys(interest).length && ![1, 2].includes(interestType)) {
    throw new Error("Tipo de juros retornado pelo Banese e invalido.");
  }

  return normalizeBaneseFinancialTerms({
    nominalAmount,
    dueDate,
    discount: discounts.length
      ? {
        type: discountType === 1 ? "fixed" : "percentage",
        value: Number(discount.Valor ?? discount.valor),
        validUntil: String(discount.Data ?? discount.data ?? ""),
      }
      : null,
    penalty: Object.keys(penalty).length
      ? {
        type: penaltyType === 1 ? "fixed" : "percentage",
        value: Number(penalty.Valor ?? penalty.valor),
        startsOn: String(penalty.Data ?? penalty.data ?? ""),
      }
      : null,
    interest: Object.keys(interest).length
      ? {
        type: interestType === 1 ? "daily-fixed" : "monthly-percentage",
        value: Number(interest.Valor ?? interest.valor),
        startsOn: String(interest.Data ?? interest.data ?? ""),
      }
      : null,
  });
};

export const assertBaneseFinancialTermsEqual = (
  expected: BaneseFinancialTermsInput,
  actual: BaneseFinancialTermsInput,
) => {
  const expectedNormalized = normalizeBaneseFinancialTerms(expected);
  const actualNormalized = normalizeBaneseFinancialTerms(actual);
  if (JSON.stringify(expectedNormalized) !== JSON.stringify(actualNormalized)) {
    throw new Error(
      "Desconto, multa ou juros retornados pelo Banese divergem do titulo solicitado.",
    );
  }
  return actualNormalized;
};
