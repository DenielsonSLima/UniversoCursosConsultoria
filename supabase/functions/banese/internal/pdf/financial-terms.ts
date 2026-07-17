import {
  type BaneseFinancialTermsInput,
  normalizeBaneseFinancialTerms,
} from "../financial-terms.ts";
import {
  formatBaneseDocumentAmount,
  formatBaneseDocumentDate,
} from "../types.ts";

export type BaneseFinancialTermField = {
  label: string;
  value: string;
};

const money = (value: number) => `R$ ${formatBaneseDocumentAmount(value)}`;

const percentage = (value: number) =>
  `${value.toLocaleString("pt-BR", { maximumFractionDigits: 6 })}%`;

export const presentBaneseFinancialTerms = (
  input: BaneseFinancialTermsInput,
) => {
  const terms = normalizeBaneseFinancialTerms(input);
  const discountAmount = terms.discount
    ? terms.discount.type === "fixed"
      ? terms.discount.value
      : terms.nominalAmount * terms.discount.value / 100
    : 0;
  const amountUntilDue = Math.round(
    Math.max(0, terms.nominalAmount - discountAmount) * 100,
  ) / 100;
  const discount: BaneseFinancialTermField = terms.discount
    ? {
      label: `Desconto até ${
        formatBaneseDocumentDate(terms.discount.validUntil)
      }`,
      value: `${
        terms.discount.type === "fixed"
          ? money(terms.discount.value)
          : percentage(terms.discount.value)
      } | Pague ${money(amountUntilDue)}`,
    }
    : { label: "Desconto até o vencimento", value: "Sem desconto" };
  const penalty: BaneseFinancialTermField = terms.penalty
    ? {
      label: `Multa a partir de ${
        formatBaneseDocumentDate(terms.penalty.startsOn)
      }`,
      value: terms.penalty.type === "fixed"
        ? money(terms.penalty.value)
        : percentage(terms.penalty.value),
    }
    : { label: "Multa após o vencimento", value: "Sem multa" };
  const interest: BaneseFinancialTermField = terms.interest
    ? {
      label: `Juros a partir de ${
        formatBaneseDocumentDate(terms.interest.startsOn)
      }`,
      value: terms.interest.type === "daily-fixed"
        ? `${money(terms.interest.value)} ao dia`
        : `${percentage(terms.interest.value)} ao mês`,
    }
    : { label: "Juros após o vencimento", value: "Sem juros" };

  return { terms, discount, penalty, interest, amountUntilDue };
};
