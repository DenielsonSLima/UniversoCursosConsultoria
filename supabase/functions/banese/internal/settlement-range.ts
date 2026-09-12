import {
  type BaneseFinancialTermsInput,
  calculateBaneseAcceptablePaymentRange,
  normalizeBaneseFinancialTerms,
} from "./financial-terms.ts";
import { nextNationalBankingDay } from "./banking-calendar.ts";

// Preserve canonical contract dates and the original late-payment calculation.
// Only the grace window through the next national banking day uses due-date
// conditions. This is one exact cent range, never a union spanning late amounts.
export const calculateBaneseSettlementRange = (
  input: BaneseFinancialTermsInput,
  paymentDate: string,
) => {
  const terms = normalizeBaneseFinancialTerms(input);
  const contractual = calculateBaneseAcceptablePaymentRange(terms, paymentDate);
  const bankingDueDate = nextNationalBankingDay(terms.dueDate);
  const bankingExtension = bankingDueDate !== null &&
    paymentDate > terms.dueDate && paymentDate <= bankingDueDate;
  const range = bankingExtension
    ? { ...calculateBaneseAcceptablePaymentRange(terms, terms.dueDate), paymentDate }
    : contractual;
  return { ...range, bankingDueDate, bankingExtension };
};
