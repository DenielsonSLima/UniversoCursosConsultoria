import assert from "node:assert/strict";
import {
  BANESE_DOCUMENT_FIXTURE,
  baneseDocumentFixtureAt,
} from "../../banese/internal/testing/document-fixture.ts";
import {
  assertBaneseReceivableTitleCompatible,
  assertBaneseTransactionBankNumbersCompatible,
  assertBaneseTransactionPixCompatible,
  assertBaneseTransactionTitleCompatible,
  validateBaneseRecoveredBankNumbers,
} from "./banese-reconciliation-contract.ts";

Deno.test("bloqueia identificadores locais divergentes do mesmo recebivel", () => {
  assert.throws(
    () =>
      assertBaneseReceivableTitleCompatible({
        gateway_boleto_nosso_numero: BANESE_DOCUMENT_FIXTURE.ourNumber,
        gateway_payment_id: "999999999",
      }),
    /identificadores locais.*divergem/i,
  );
});

Deno.test("bloqueia identificadores divergentes em transacao legada", () => {
  assert.throws(
    () =>
      assertBaneseTransactionTitleCompatible([{
        bank_slip_our_number: BANESE_DOCUMENT_FIXTURE.ourNumber,
        remote_payment_id: "999999999",
      }], BANESE_DOCUMENT_FIXTURE.ourNumber),
    /identificador divergente/i,
  );
});

const validRaw = {
  NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
  NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
};

Deno.test("valida integralmente numeros bancarios recuperados do Banese", () => {
  const result = validateBaneseRecoveredBankNumbers(validRaw, {
    expectedOurNumber: BANESE_DOCUMENT_FIXTURE.ourNumber,
  });

  assert.deepEqual(result, {
    digitableLine: BANESE_DOCUMENT_FIXTURE.digitableLine,
    barcode: BANESE_DOCUMENT_FIXTURE.barcode,
    hasRemoteDigitableLine: true,
    hasRemoteBarcode: true,
    replacePersistedBankNumbers: false,
  });
});

Deno.test("autoriza reparar apenas DV local invalido do mesmo titulo oficial", () => {
  const officialLine = BANESE_DOCUMENT_FIXTURE.digitableLine;
  const persistedDigit = officialLine[31] === "9"
    ? "0"
    : String(Number(officialLine[31]) + 1);
  const invalidPersistedLine = `${officialLine.slice(0, 31)}${persistedDigit}${
    officialLine.slice(32)
  }`;

  const result = validateBaneseRecoveredBankNumbers(validRaw, {
    digitableLine: invalidPersistedLine,
    barcode: BANESE_DOCUMENT_FIXTURE.barcode,
    expectedOurNumber: BANESE_DOCUMENT_FIXTURE.ourNumber,
  });

  assert.equal(result?.replacePersistedBankNumbers, true);
  assert.equal(result?.digitableLine, officialLine);
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

Deno.test("rejeita par divergente sem Nosso Numero esperado", () => {
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
    /divergem do titulo persistido/i,
  );
});

Deno.test("rejeita par oficial que tenta trocar o codigo de barras local", () => {
  const staleLocalNumbers = baneseDocumentFixtureAt(0, "2026-08-16");

  assert.throws(
    () =>
      validateBaneseRecoveredBankNumbers(validRaw, {
        digitableLine: staleLocalNumbers.digitableLine,
        barcode: staleLocalNumbers.barcode,
        expectedOurNumber: BANESE_DOCUMENT_FIXTURE.ourNumber,
      }),
    /divergem do titulo persistido/i,
  );
});

Deno.test("rejeita Nosso Numero valido de outro titulo no codigo de barras", () => {
  const anotherTitle = baneseDocumentFixtureAt(1);

  assert.throws(
    () =>
      validateBaneseRecoveredBankNumbers({
        NumeroLinhaDigitavel: anotherTitle.digitableLine,
        NumeroCodigoBarras: anotherTitle.barcode,
      }, {
        expectedOurNumber: BANESE_DOCUMENT_FIXTURE.ourNumber,
      }),
    /Nosso Numero.*diverge do titulo conciliado/i,
  );
});

Deno.test("bloqueia transacao Pix divergente ou incompleta antes da mutacao", () => {
  assert.doesNotThrow(() =>
    assertBaneseTransactionPixCompatible(
      [{ pix_payload: null, pix_encoded_image: null }],
      "pix-oficial",
      "imagem-oficial",
    )
  );
  assert.throws(
    () =>
      assertBaneseTransactionPixCompatible(
        [{ pix_payload: "pix-anterior", pix_encoded_image: "imagem-anterior" }],
        "pix-oficial",
        "imagem-oficial",
      ),
    /payload Pix divergente/i,
  );
  assert.throws(
    () =>
      assertBaneseTransactionPixCompatible(
        [{ pix_payload: "pix-oficial", pix_encoded_image: null }],
        "pix-oficial",
        "imagem-oficial",
      ),
    /payload Pix divergente/i,
  );
});

Deno.test("bloqueia numeros bancarios divergentes em transacao com Pix ja persistido", () => {
  const anotherTitle = baneseDocumentFixtureAt(1);
  const recovered = validateBaneseRecoveredBankNumbers(validRaw, {
    expectedOurNumber: BANESE_DOCUMENT_FIXTURE.ourNumber,
  });

  assert.throws(
    () =>
      assertBaneseTransactionBankNumbersCompatible([{
        bank_slip_digitable_line: anotherTitle.digitableLine,
        bank_slip_barcode: anotherTitle.barcode,
      }], recovered),
    /numeros bancarios divergentes/i,
  );
});

Deno.test("aceita reparar linha invalida da transacao somente com o mesmo codigo", () => {
  const validLine = BANESE_DOCUMENT_FIXTURE.digitableLine;
  const invalidDigit = validLine[9] === "9" ? "8" : "9";
  const invalidLine = `${validLine.slice(0, 9)}${invalidDigit}${
    validLine.slice(10)
  }`;
  const recovered = validateBaneseRecoveredBankNumbers(validRaw, {
    expectedOurNumber: BANESE_DOCUMENT_FIXTURE.ourNumber,
  });

  assert.doesNotThrow(() =>
    assertBaneseTransactionBankNumbersCompatible([{
      bank_slip_digitable_line: invalidLine,
      bank_slip_barcode: BANESE_DOCUMENT_FIXTURE.barcode,
    }], recovered)
  );
  assert.throws(
    () =>
      assertBaneseTransactionBankNumbersCompatible([{
        bank_slip_digitable_line: invalidLine,
        bank_slip_barcode: null,
      }], recovered),
    /numeros bancarios divergentes/i,
  );
});
