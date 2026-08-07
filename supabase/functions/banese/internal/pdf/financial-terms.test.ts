import assert from "node:assert/strict";
import { presentBaneseFinancialTerms } from "./financial-terms.ts";

Deno.test("boleto e carne exibem o juros tecnico como valor diario", () => {
  const result = presentBaneseFinancialTerms({
    nominalAmount: 279.9,
    dueDate: "2026-08-10",
    discount: { type: "fixed", value: 19.9 },
    penalty: { type: "percentage", value: 2 },
    interest: { type: "monthly-percentage", value: 1 },
  });

  assert.equal(result.discount.value, "R$ 19,90 | Pague R$ 260,00");
  assert.equal(result.penalty.value, "2% = R$ 5,60");
  assert.equal(result.interest.value, "R$ 0,09 ao dia");
});
