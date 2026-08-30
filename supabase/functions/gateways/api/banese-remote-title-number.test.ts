import assert from "node:assert/strict";
import { normalizeBaneseRemoteTitleNumber } from "./banese.ts";

Deno.test("normaliza zeros à esquerda apenas no Nosso Número retornado pelo Banese", () => {
  assert.equal(normalizeBaneseRemoteTitleNumber("97280"), "000097280");
  assert.equal(normalizeBaneseRemoteTitleNumber("000097280"), "000097280");
});

Deno.test("recusa Nosso Número remoto vazio ou maior que nove dígitos", () => {
  assert.throws(
    () => normalizeBaneseRemoteTitleNumber(""),
    /Nosso Numero retornado.*invalido/i,
  );
  assert.throws(
    () => normalizeBaneseRemoteTitleNumber("1234567890"),
    /Nosso Numero retornado.*invalido/i,
  );
});
