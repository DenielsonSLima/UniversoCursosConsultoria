import assert from "node:assert/strict";
import {
  BANESE_DOCUMENT_FIXTURE,
  baneseDocumentFixtureAt,
} from "../internal/testing/document-fixture.ts";
import { advanceBaneseNossoNumeroAfterCollision } from "./adapter/auth.ts";
import {
  type BaneseBoletoCollisionExpectation,
  classifyBaneseBoletoCollision,
} from "./adapter/boleto-collision.ts";
import {
  baneseResponseIdentity,
  makeBaneseTitleResponse,
} from "./adapter-test-fixtures.ts";

const expected: BaneseBoletoCollisionExpectation = {
  ourNumber: BANESE_DOCUMENT_FIXTURE.ourNumber,
  amount: BANESE_DOCUMENT_FIXTURE.amount,
  dueDate: BANESE_DOCUMENT_FIXTURE.dueDate,
  agency: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
  account: BANESE_DOCUMENT_FIXTURE.beneficiary.account,
  documentNumber: baneseResponseIdentity.NumeroDocumento,
  companyTitleId: baneseResponseIdentity.IdTituloEmpresa,
  payerDocument: baneseResponseIdentity.Pagador.NumeroCPFCNPJ,
};

Deno.test("classificador reconhece MATCH somente apos validacao integral", async () => {
  const result = await classifyBaneseBoletoCollision(
    makeBaneseTitleResponse(),
    expected,
  );

  assert.equal(result.classification, "MATCH");
  assert.equal(result.audit.reason, "FULL_MATCH");
  assert.equal(result.audit.internallyConsistent, true);
  assert.deepEqual(Object.values(result.audit.relations), [
    "MATCH",
    "MATCH",
    "MATCH",
    "MATCH",
    "MATCH",
    "MATCH",
  ]);
});

Deno.test("classificador preserva zero inicial do CPF retornado como numero", async () => {
  const payerDocument = "08496821501";
  const result = await classifyBaneseBoletoCollision(
    makeBaneseTitleResponse(
      BANESE_DOCUMENT_FIXTURE.amount,
      BANESE_DOCUMENT_FIXTURE.dueDate,
      { Pagador: { NumeroCPFCNPJ: Number(payerDocument) } },
    ),
    { ...expected, payerDocument },
  );

  assert.equal(result.classification, "MATCH");
  assert.equal(result.audit.relations.payerDocument, "MATCH");
});

Deno.test("classificador exige tipo juridico para CNPJ numericamente ambiguo", async () => {
  const payerDocument = "00012345678901";
  const matching = await classifyBaneseBoletoCollision(
    makeBaneseTitleResponse(
      BANESE_DOCUMENT_FIXTURE.amount,
      BANESE_DOCUMENT_FIXTURE.dueDate,
      { Pagador: { TipoPessoa: "J", NumeroCPFCNPJ: "12345678901" } },
    ),
    { ...expected, payerDocument },
  );
  const wrongType = await classifyBaneseBoletoCollision(
    makeBaneseTitleResponse(
      BANESE_DOCUMENT_FIXTURE.amount,
      BANESE_DOCUMENT_FIXTURE.dueDate,
      { Pagador: { TipoPessoa: "F", NumeroCPFCNPJ: "12345678901" } },
    ),
    { ...expected, payerDocument },
  );
  const missingType = await classifyBaneseBoletoCollision(
    makeBaneseTitleResponse(
      BANESE_DOCUMENT_FIXTURE.amount,
      BANESE_DOCUMENT_FIXTURE.dueDate,
      { Pagador: { NumeroCPFCNPJ: "12345678901" } },
    ),
    { ...expected, payerDocument },
  );

  assert.equal(matching.classification, "MATCH");
  assert.equal(wrongType.classification, "INDETERMINATE");
  assert.equal(wrongType.audit.relations.payerDocument, "DIFFERENT");
  assert.equal(missingType.classification, "INDETERMINATE");
  assert.equal(missingType.audit.relations.payerDocument, "MISSING");
});

Deno.test("classificador reconhece FOREIGN somente com identidades fortes completas divergentes", async () => {
  const result = await classifyBaneseBoletoCollision(
    makeBaneseTitleResponse(
      BANESE_DOCUMENT_FIXTURE.amount,
      BANESE_DOCUMENT_FIXTURE.dueDate,
      {
        NumeroDocumento: "documento-remoto-antigo",
        IdTituloEmpresa: "titulo-remoto-antigo",
      },
    ),
    expected,
  );

  assert.equal(result.classification, "FOREIGN");
  assert.equal(result.audit.reason, "STRONG_TITLE_IDENTITIES_DIVERGE");
  assert.equal(result.audit.remoteComplete, true);
  assert.equal(result.audit.internallyConsistent, true);
});

Deno.test("resposta completa internamente inconsistente nunca vira FOREIGN", async () => {
  const anotherTitle = baneseDocumentFixtureAt(1);
  const result = await classifyBaneseBoletoCollision(
    makeBaneseTitleResponse(
      BANESE_DOCUMENT_FIXTURE.amount,
      BANESE_DOCUMENT_FIXTURE.dueDate,
      { NumeroCodigoBarras: anotherTitle.barcode },
    ),
    expected,
  );

  assert.equal(result.classification, "INDETERMINATE");
  assert.equal(result.audit.reason, "REMOTE_RESPONSE_INCONSISTENT");
  assert.equal(result.audit.remoteComplete, true);
  assert.equal(result.audit.internallyConsistent, false);
});

Deno.test("campo remoto ausente ou malformado permanece INDETERMINATE", async () => {
  const complete = makeBaneseTitleResponse();
  const cases = [
    { ...complete, NumeroDocumento: undefined },
    { ...complete, IdTituloEmpresa: undefined },
    { ...complete, Pagador: undefined },
    { ...complete, NossoNumero: undefined },
    { ...complete, NumeroLinhaDigitavel: "123" },
    { ...complete, NumeroCodigoBarras: "123" },
    { ...complete, ValorNominal: undefined },
    { ...complete, DataVencimento: undefined },
    { ...complete, NumeroDocumento: { valor: "documento" } },
    { ...complete, IdTituloEmpresa: ["titulo"] },
    { ...complete, Pagador: { NumeroCPFCNPJ: true } },
    { ...complete, ValorNominal: true },
    { ...complete, DataVencimento: new Date() },
  ];

  for (const raw of cases) {
    const result = await classifyBaneseBoletoCollision(raw, expected);
    assert.equal(result.classification, "INDETERMINATE");
  }
});

Deno.test("divergencia parcial nunca e promovida a FOREIGN", async () => {
  const oneStrongIdentityDiffers = await classifyBaneseBoletoCollision(
    makeBaneseTitleResponse(
      BANESE_DOCUMENT_FIXTURE.amount,
      BANESE_DOCUMENT_FIXTURE.dueDate,
      { NumeroDocumento: "outro-documento" },
    ),
    expected,
  );
  const sameIdentityDifferentAmount = await classifyBaneseBoletoCollision(
    makeBaneseTitleResponse(BANESE_DOCUMENT_FIXTURE.amount + 1),
    expected,
  );

  assert.equal(oneStrongIdentityDiffers.classification, "INDETERMINATE");
  assert.equal(sameIdentityDifferentAmount.classification, "INDETERMINATE");
  assert.equal(
    oneStrongIdentityDiffers.audit.reason,
    "IDENTITY_DIVERGENCE_NOT_CONCLUSIVE",
  );
});

Deno.test("fingerprint SHA-256 e auditoria nao expõem PII, numeros bancarios ou Pix", async () => {
  const pixPayload =
    "00020101021226840014br.gov.bcb.pix2562qrcode-h.banese.example/segredo6304ABCD";
  const raw = makeBaneseTitleResponse(
    BANESE_DOCUMENT_FIXTURE.amount,
    BANESE_DOCUMENT_FIXTURE.dueDate,
    { QrCode: pixPayload },
  );
  const first = await classifyBaneseBoletoCollision(raw, expected);
  const second = await classifyBaneseBoletoCollision(
    { ...raw, QrCode: `${pixPayload}-outro` },
    expected,
  );
  const otherPii = await classifyBaneseBoletoCollision(
    {
      ...raw,
      NumeroDocumento: "outro-documento-remoto",
      IdTituloEmpresa: "outro-titulo-remoto",
      Pagador: { NumeroCPFCNPJ: 98765432100 },
    },
    {
      ...expected,
      documentNumber: "outro-documento-remoto",
      companyTitleId: "outro-titulo-remoto",
      payerDocument: 98765432100,
    },
  );
  const serialized = JSON.stringify(first);

  assert.match(first.fingerprintSha256, /^[a-f0-9]{64}$/);
  assert.equal(first.fingerprintSha256, second.fingerprintSha256);
  assert.equal(first.fingerprintSha256, otherPii.fingerprintSha256);
  for (
    const forbidden of [
      String(expected.payerDocument),
      String(expected.documentNumber),
      String(expected.companyTitleId),
      String(raw.NumeroCodigoBarras),
      String(raw.NumeroLinhaDigitavel),
      pixPayload,
    ]
  ) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

Deno.test("avanço por FOREIGN usa um único RPC, token CAS e parser direto", async () => {
  const calls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
  const replacement = baneseDocumentFixtureAt(1).ourNumber;
  const expectedCreationToken = "22222222-2222-4222-8222-222222222222";
  const admin = {
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args });
      return {
        data: {
          nossoNumero: replacement,
          convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
          agencia: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
          alreadyReserved: false,
          collisionPreflightEnabled: true,
        },
        error: null,
      };
    },
  };

  const result = await advanceBaneseNossoNumeroAfterCollision(admin, {
    receivableId: BANESE_DOCUMENT_FIXTURE.receivableId,
    environment: "production",
    convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
    agencia: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
    expectedNossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
    collisionStage: "PREFLIGHT_GET",
    responseFingerprint: "a".repeat(64),
    expectedCreationToken,
  });

  assert.equal(result.nossoNumero, replacement);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fn, "advance_banese_nosso_numero_after_collision");
  assert.equal(
    calls[0].args?.p_expected_creation_token,
    expectedCreationToken,
  );
});
