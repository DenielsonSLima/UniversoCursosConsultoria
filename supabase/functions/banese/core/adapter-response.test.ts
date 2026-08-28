import assert from "node:assert/strict";
import {
  BANESE_DOCUMENT_FIXTURE,
  baneseDocumentFixtureAt,
} from "../internal/testing/document-fixture.ts";
import { validateBaneseBoletoResponse } from "./adapter.ts";
import { baneseResponseIdentity, validInput } from "./adapter-test-fixtures.ts";

const validResponseExpectation = {
  ourNumber: BANESE_DOCUMENT_FIXTURE.ourNumber,
  amount: BANESE_DOCUMENT_FIXTURE.amount,
  dueDate: BANESE_DOCUMENT_FIXTURE.dueDate,
  agency: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
  account: BANESE_DOCUMENT_FIXTURE.beneficiary.account,
  documentNumber: BANESE_DOCUMENT_FIXTURE.receivableId.slice(0, 15),
  companyTitleId: BANESE_DOCUMENT_FIXTURE.receivableId.slice(0, 25),
  payerDocument: validInput.payer.document,
};

const validResponse = {
  NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
  NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
  NossoNumero: Number(BANESE_DOCUMENT_FIXTURE.ourNumber),
  ...baneseResponseIdentity,
};

const assertRemoteValidationFailure = (
  run: () => unknown,
  message: RegExp,
) => {
  assert.throws(run, (error: any) => {
    assert.equal(error?.remotePaymentCreated, true);
    assert.match(String(error?.message || ""), message);
    return true;
  });
};

Deno.test("aceita retorno Banese correspondente ao titulo solicitado", () => {
  const result = validateBaneseBoletoResponse(
    validResponse,
    validResponseExpectation,
  );

  assert.equal(result.codigoBarras, BANESE_DOCUMENT_FIXTURE.barcode);
  assert.equal(result.linhaDigitavel, BANESE_DOCUMENT_FIXTURE.digitableLine);
});

Deno.test("recuperacao exige a identidade remota completa do titulo", () => {
  const responseWithoutIdentity = {
    NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
    NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
    NossoNumero: Number(BANESE_DOCUMENT_FIXTURE.ourNumber),
  };

  assertRemoteValidationFailure(
    () =>
      validateBaneseBoletoResponse(responseWithoutIdentity, {
        ...validResponseExpectation,
        requireRemoteTitleIdentity: true,
      }),
    /NumeroDocumento.*diverge/i,
  );
});

Deno.test("rejeita Nosso Numero remoto divergente antes de persistir", () => {
  const anotherTitle = baneseDocumentFixtureAt(1);

  assertRemoteValidationFailure(
    () =>
      validateBaneseBoletoResponse({
        ...validResponse,
        NossoNumero: anotherTitle.ourNumber,
      }, validResponseExpectation),
    /Nosso Numero retornado diverge/i,
  );
});

Deno.test("rejeita Nosso Numero ASBACE de outro titulo", () => {
  const anotherTitle = baneseDocumentFixtureAt(1);

  assertRemoteValidationFailure(
    () =>
      validateBaneseBoletoResponse({
        ...validResponse,
        NumeroLinhaDigitavel: anotherTitle.digitableLine,
        NumeroCodigoBarras: anotherTitle.barcode,
      }, validResponseExpectation),
    /Nosso Numero da chave ASBACE diverge/i,
  );
});

Deno.test("rejeita identidade remota de documento, titulo ou pagador divergente", () => {
  const cases = [
    {
      response: { ...validResponse, NumeroDocumento: "outro-documento" },
      message: /NumeroDocumento.*diverge/i,
    },
    {
      response: { ...validResponse, IdTituloEmpresa: "outro-titulo" },
      message: /IdTituloEmpresa.*diverge/i,
    },
    {
      response: {
        ...validResponse,
        Pagador: { NumeroCPFCNPJ: 99999999999 },
      },
      message: /CPF\/CNPJ.*diverge/i,
    },
  ];
  for (const testCase of cases) {
    assertRemoteValidationFailure(
      () =>
        validateBaneseBoletoResponse(
          testCase.response,
          validResponseExpectation,
        ),
      testCase.message,
    );
  }
});

Deno.test("rejeita valor codificado divergente do titulo solicitado", () => {
  assertRemoteValidationFailure(
    () =>
      validateBaneseBoletoResponse(validResponse, {
        ...validResponseExpectation,
        amount: BANESE_DOCUMENT_FIXTURE.amount + 1,
      }),
    /Valor codificado.*diverge/i,
  );
});

Deno.test("rejeita fator de vencimento divergente do titulo solicitado", () => {
  assertRemoteValidationFailure(
    () =>
      validateBaneseBoletoResponse(validResponse, {
        ...validResponseExpectation,
        dueDate: "2026-08-16",
      }),
    /Fator de vencimento.*diverge/i,
  );
});
