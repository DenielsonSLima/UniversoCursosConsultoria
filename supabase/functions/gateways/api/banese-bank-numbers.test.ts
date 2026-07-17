import assert from "node:assert/strict";
import {
  BANESE_DOCUMENT_FIXTURE,
  baneseDocumentFixtureAt,
} from "../../banese/internal/testing/document-fixture.ts";
import { validateBaneseRecoveredBankNumbers } from "./banese.ts";

const validRaw = {
  NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
  NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
};

Deno.test("valida integralmente numeros bancarios recuperados do Banese", () => {
  const result = validateBaneseRecoveredBankNumbers(validRaw);

  assert.deepEqual(result, {
    digitableLine: BANESE_DOCUMENT_FIXTURE.digitableLine,
    barcode: BANESE_DOCUMENT_FIXTURE.barcode,
    hasRemoteDigitableLine: true,
    hasRemoteBarcode: true,
  });
});

Deno.test("valida retorno parcial contra o numero bancario persistido", () => {
  const result = validateBaneseRecoveredBankNumbers(
    { numeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine },
    { barcode: BANESE_DOCUMENT_FIXTURE.barcode },
  );

  assert.equal(result?.digitableLine, BANESE_DOCUMENT_FIXTURE.digitableLine);
  assert.equal(result?.barcode, BANESE_DOCUMENT_FIXTURE.barcode);
  assert.equal(result?.hasRemoteDigitableLine, true);
  assert.equal(result?.hasRemoteBarcode, false);
});

Deno.test("rejeita retorno Banese com DV de campo corrompido", () => {
  const line = BANESE_DOCUMENT_FIXTURE.digitableLine;
  const invalidDigit = line[9] === "9" ? "0" : String(Number(line[9]) + 1);
  const invalidLine = `${line.slice(0, 9)}${invalidDigit}${line.slice(10)}`;

  assert.throws(
    () =>
      validateBaneseRecoveredBankNumbers({
        NumeroLinhaDigitavel: invalidLine,
        NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
      }),
    /invalidos|digito|mesmo titulo/i,
  );
});

Deno.test("rejeita retorno que nao inicia com banco e moeda 0479", () => {
  const line = `0470${BANESE_DOCUMENT_FIXTURE.digitableLine.slice(4)}`;
  const barcode = `0470${BANESE_DOCUMENT_FIXTURE.barcode.slice(4)}`;

  assert.throws(
    () =>
      validateBaneseRecoveredBankNumbers({
        NumeroLinhaDigitavel: line,
        NumeroCodigoBarras: barcode,
      }),
    /banco Banese 047.*moeda Real/i,
  );
});

Deno.test("rejeita DV geral modulo 11 corrompido", () => {
  const currentDigit = BANESE_DOCUMENT_FIXTURE.barcode[4];
  const invalidDigit = currentDigit === "9"
    ? "0"
    : String(Number(currentDigit) + 1);
  const barcode = `${
    BANESE_DOCUMENT_FIXTURE.barcode.slice(0, 4)
  }${invalidDigit}${BANESE_DOCUMENT_FIXTURE.barcode.slice(5)}`;
  const line = `${
    BANESE_DOCUMENT_FIXTURE.digitableLine.slice(0, 32)
  }${invalidDigit}${BANESE_DOCUMENT_FIXTURE.digitableLine.slice(33)}`;

  assert.throws(
    () =>
      validateBaneseRecoveredBankNumbers({
        NumeroLinhaDigitavel: line,
        NumeroCodigoBarras: barcode,
      }),
    /modulo 11/i,
  );
});

Deno.test("rejeita linha e codigo validos de titulos Banese diferentes", () => {
  const anotherTitle = baneseDocumentFixtureAt(1);

  assert.throws(
    () =>
      validateBaneseRecoveredBankNumbers({
        NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
        NumeroCodigoBarras: anotherTitle.barcode,
      }),
    /mesmo titulo/i,
  );
});

Deno.test("rejeita retorno parcial sem par para validar equivalencia", () => {
  assert.throws(
    () =>
      validateBaneseRecoveredBankNumbers({
        NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
      }),
    /codigo de barras.*44 digitos/i,
  );
});

Deno.test("rejeita numero recuperado divergente do titulo persistido", () => {
  const anotherTitle = baneseDocumentFixtureAt(1);

  assert.throws(
    () =>
      validateBaneseRecoveredBankNumbers({
        NumeroLinhaDigitavel: anotherTitle.digitableLine,
        NumeroCodigoBarras: anotherTitle.barcode,
      }, {
        digitableLine: BANESE_DOCUMENT_FIXTURE.digitableLine,
        barcode: BANESE_DOCUMENT_FIXTURE.barcode,
      }),
    /diverge do titulo persistido/i,
  );
});
