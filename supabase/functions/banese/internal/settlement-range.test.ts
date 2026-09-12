import assert from "node:assert/strict";
import { nextNationalBankingDay } from "./banking-calendar.ts";
import { calculateBaneseSettlementRange } from "./settlement-range.ts";

const terms = {
  nominalAmount: 279.9, dueDate: "2026-09-06",
  discount: { type: "fixed" as const, value: 19.9, validUntil: "2026-09-06" },
  penalty: { type: "fixed" as const, value: 5.6, startsOn: "2026-09-07" },
  interest: { type: "daily-fixed" as const, value: 0.09, startsOn: "2026-09-07" },
};

Deno.test("domingo seguido de Independência mantém desconto até terça sem alterar termos", () => {
  const original = JSON.stringify(terms);
  const range = calculateBaneseSettlementRange(terms, "2026-09-08");
  assert.equal(range.bankingDueDate, "2026-09-08");
  assert.equal(range.bankingExtension, true);
  assert.deepEqual([range.minimumAmount, range.expectedAmount, range.maximumAmount], [260, 260, 260]);
  assert.equal(range.paymentDate, "2026-09-08");
  assert.equal(range.isLate, false);
  assert.deepEqual(range.breakdown, {
    nominalAmount: 279.9, discountAmount: 19.9, penaltyAmount: 0, interestAmount: 0,
    daysAfterDue: 0, interestAccrualDays: 0,
  });
  for (const amount of [259.99, 260.01, 270, 279.9, 285.68]) {
    assert.equal(amount >= range.minimumAmount && amount <= range.maximumAmount, false);
  }
  assert.equal(JSON.stringify(terms), original);
});

Deno.test("dia posterior à prorrogação mantém cálculo contratual de atraso", () => {
  const range = calculateBaneseSettlementRange(terms, "2026-09-09");
  assert.equal(range.bankingExtension, false);
  assert.equal(range.isLate, true);
  assert.equal(range.isDiscountActive, false);
  assert.equal(range.expectedAmount, 285.77);
  assert.equal(range.breakdown.interestAccrualDays, 3);
});

Deno.test("calendário nacional2026 inclui carnaval, Paixão, Corpus e feriados fixos", () => {
  for (const [due, expected] of [
    ["2026-01-01", "2026-01-02"], ["2026-02-14", "2026-02-18"],
    ["2026-02-16", "2026-02-18"], ["2026-02-17", "2026-02-18"],
    ["2026-04-03", "2026-04-06"], ["2026-04-21", "2026-04-22"],
    ["2026-05-01", "2026-05-04"], ["2026-06-04", "2026-06-05"],
    ["2026-09-06", "2026-09-08"], ["2026-10-12", "2026-10-13"],
    ["2026-11-02", "2026-11-03"], ["2026-11-15", "2026-11-16"],
    ["2026-11-20", "2026-11-23"], ["2026-12-25", "2026-12-28"],
    ["2026-02-18", "2026-02-18"], ["2026-06-05", "2026-06-05"],
  ]) assert.equal(nextNationalBankingDay(due), expected, due);
});

Deno.test("ano sem calendário conferido não concede desconto prorrogado", () => {
  assert.equal(nextNationalBankingDay("2027-09-05"), null);
  const range = calculateBaneseSettlementRange({
    nominalAmount: 279.9, dueDate: "2027-09-05",
    discount: { type: "fixed", value: 19.9 },
    penalty: { type: "fixed", value: 5.6 },
    interest: { type: "daily-fixed", value: 0.09 },
  }, "2027-09-06");
  assert.equal(range.bankingExtension, false);
  assert.equal(range.expectedAmount, 285.59);
});

Deno.test("prorrogação não ressuscita desconto antecipado nem aceita data inválida", () => {
  const range = calculateBaneseSettlementRange({ ...terms,
    discount: { type: "fixed", value: 19.9, validUntil: "2026-09-04" },
  }, "2026-09-08");
  assert.equal(range.expectedAmount, 279.9);
  assert.equal(range.isDiscountActive, false);
  assert.throws(() => nextNationalBankingDay("2026-02-29"));
});
