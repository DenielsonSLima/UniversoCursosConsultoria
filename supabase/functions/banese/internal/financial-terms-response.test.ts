import assert from "node:assert/strict";
import { baneseFinancialTermsFromPayload } from "./financial-terms-response.ts";

const AMOUNT = 279.9;
const DUE_DATE = "2027-01-15";

Deno.test("TipoJuroMora 3 vazio representa juros isentos", () => {
  const normalized = baneseFinancialTermsFromPayload(
    {
      Juros: { TipoJuroMora: 3, Valor: null, Data: null },
    },
    AMOUNT,
    DUE_DATE,
  );

  assert.equal(normalized.interest, null);
});

Deno.test("TipoJuroMora 3 aceita valor zero e data valida", () => {
  const normalized = baneseFinancialTermsFromPayload(
    {
      Juros: { TipoJuroMora: 3, Valor: 0, Data: "2027-01-16" },
    },
    AMOUNT,
    DUE_DATE,
  );

  assert.equal(normalized.interest, null);
});

Deno.test("TipoJuroMora 3 com valor positivo continua bloqueado", () => {
  assert.throws(
    () =>
      baneseFinancialTermsFromPayload(
        {
          Juros: { TipoJuroMora: 3, Valor: 0.19, Data: "2027-01-16" },
        },
        AMOUNT,
        DUE_DATE,
      ),
    /Tipo de juros.*invalido/i,
  );
});
