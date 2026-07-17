import assert from "node:assert/strict";
import {
  assertBaneseAsbaceField,
  baneseDueDateFactor,
  calculateBaneseAsbaceDoubleDigit,
} from "./bank-fields.ts";
import { BANESE_DOCUMENT_FIXTURE } from "./testing/document-fixture.ts";

Deno.test("calcula ciclos antigo e atual do fator de vencimento", () => {
  assert.equal(baneseDueDateFactor("2000-07-03"), "1000");
  assert.equal(baneseDueDateFactor("2025-02-21"), "9999");
  assert.equal(baneseDueDateFactor("2025-02-22"), "1000");
  assert.equal(baneseDueDateFactor("2025-02-23"), "1001");
  assert.equal(baneseDueDateFactor("2049-10-13"), "9999");
});

Deno.test("rejeita vencimento fora dos ciclos FEBRABAN documentados", () => {
  assert.throws(() => baneseDueDateFactor("1999-12-31"), /fora dos ciclos/i);
  assert.throws(() => baneseDueDateFactor("2049-10-14"), /fora dos ciclos/i);
});

Deno.test("calcula duplo digito da chave ASBACE conforme vetor", () => {
  assert.equal(
    calculateBaneseAsbaceDoubleDigit("33031006490000004681047"),
    "22",
  );
  assert.equal(
    calculateBaneseAsbaceDoubleDigit("15010557855000004683047"),
    "38",
  );
});

Deno.test("valida agencia, conta, Nosso Numero, banco e DD da chave ASBACE", () => {
  const context = {
    agency: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
    account: BANESE_DOCUMENT_FIXTURE.beneficiary.account,
    ourNumber: BANESE_DOCUMENT_FIXTURE.ourNumber,
  };
  assert.doesNotThrow(() =>
    assertBaneseAsbaceField(BANESE_DOCUMENT_FIXTURE.barcode, context)
  );
  assert.throws(
    () =>
      assertBaneseAsbaceField(BANESE_DOCUMENT_FIXTURE.barcode, {
        ...context,
        account: "031006491",
      }),
    /conta diverge/i,
  );
  const invalidDd = `${BANESE_DOCUMENT_FIXTURE.barcode.slice(0, -1)}3`;
  assert.throws(
    () => assertBaneseAsbaceField(invalidDd, context),
    /duplo digito/i,
  );
});
