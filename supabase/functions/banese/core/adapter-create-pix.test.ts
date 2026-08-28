import assert from "node:assert/strict";
import {
  BANESE_DOCUMENT_FIXTURE,
} from "../internal/testing/document-fixture.ts";
import {
  buildBanesePixImageFixture,
  buildBanesePixPayloadFixture,
} from "../internal/testing/pix-fixture.ts";
import { normalizeBanesePixPayload } from "../internal/pix-validation.ts";
import { createBaneseBoletoCharge } from "./adapter.ts";
import {
  creationFetch,
  makeBaneseTitleResponse,
  reservedBoletoInput,
} from "./adapter-test-fixtures.ts";

Deno.test("producao aceita valor comercial acima de 10 e retorno sem pix", async () => {
  const originalFetch = globalThis.fetch;
  const amount = 149.9;
  const response = makeBaneseTitleResponse(
    amount,
    BANESE_DOCUMENT_FIXTURE.dueDate,
    {
      // A API pode desserializar o campo numérico sem os zeros à esquerda.
      NossoNumero: Number(BANESE_DOCUMENT_FIXTURE.ourNumber),
      ValorNominalNumerico: amount,
      NossoNumeroSemDv: BANESE_DOCUMENT_FIXTURE.ourNumber.slice(0, 8),
    },
  );
  const { calls, fetcher } = creationFetch(response);
  globalThis.fetch = fetcher as typeof fetch;

  try {
    const result = await createBaneseBoletoCharge({
      ...reservedBoletoInput(false),
      environment: "production",
      amount,
      financialTerms: null,
    });
    assert.equal(result.id, BANESE_DOCUMENT_FIXTURE.ourNumber);
    assert.equal(result.bankSlipOurNumber, BANESE_DOCUMENT_FIXTURE.ourNumber);
    assert.equal(result.pixPayload, null);
    assert.equal(result.pixEncodedImage, null);
    assert.deepEqual(
      calls.filter((call) => call.url.includes("/boletos")).map((call) =>
        call.method
      ),
      ["GET", "POST"],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("producao aceita retornos de pix no retorno da criacao", async () => {
  const originalFetch = globalThis.fetch;
  const amount = 8.5;
  const response = makeBaneseTitleResponse(
    amount,
    BANESE_DOCUMENT_FIXTURE.dueDate,
    {
      brCodeEMV: buildBanesePixPayloadFixture("TXID-TESTE", amount),
      qrcode: `data:image/png;base64,${buildBanesePixImageFixture(1)}`,
    },
  );
  const { fetcher } = creationFetch(response);
  globalThis.fetch = fetcher as typeof fetch;

  try {
    const result = await createBaneseBoletoCharge({
      ...reservedBoletoInput(false),
      environment: "production",
      amount,
      financialTerms: null,
    });
    assert.equal(typeof result.pixPayload, "string");
    assert.equal(typeof result.pixEncodedImage, "string");
    assert.equal(
      result.pixPayload?.length,
      buildBanesePixPayloadFixture("TXID-TESTE", amount).length,
    );
    assert.match(result.pixEncodedImage ?? "", /^data:image\/png;base64,/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("producao preserva BolePix do POST quando confirmacao financeira nao repete o QR", async () => {
  const originalFetch = globalThis.fetch;
  const amount = 8.5;
  const common = makeBaneseTitleResponse(amount);
  const creationResponse = {
    ...common,
    BolePix: {
      brCodeEMV: buildBanesePixPayloadFixture("TXID-POST", amount),
      qrCode: `data:image/png;base64,${buildBanesePixImageFixture(1)}`,
    },
  };
  const { fetcher } = creationFetch(creationResponse, common);
  globalThis.fetch = fetcher as typeof fetch;

  try {
    const result = await createBaneseBoletoCharge({
      ...reservedBoletoInput(false),
      environment: "production",
      amount,
      financialTerms: {
        nominalAmount: amount,
        dueDate: BANESE_DOCUMENT_FIXTURE.dueDate,
      },
    });
    assert.equal(typeof result.pixPayload, "string");
    assert.equal(typeof result.pixEncodedImage, "string");
    const diagnostic = (result.raw as any)?.pixDiagnostic;
    assert.equal(diagnostic?.source, "creation");
    assert.equal(diagnostic?.complete, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("producao aceita GUI Banese minusculo e renderiza QR a partir do EMV oficial", async () => {
  const originalFetch = globalThis.fetch;
  const amount = 129.9;
  const officialPayload = buildBanesePixPayloadFixture(
    "TXID-BANESE",
    amount,
    "br.gov.bcb.pix",
  );
  const response = makeBaneseTitleResponse(
    amount,
    BANESE_DOCUMENT_FIXTURE.dueDate,
    {
      BolePix: { qrCode: officialPayload },
    },
  );
  const { fetcher } = creationFetch(response);
  globalThis.fetch = fetcher as typeof fetch;

  try {
    const result = await createBaneseBoletoCharge({
      ...reservedBoletoInput(false),
      environment: "production",
      amount,
      financialTerms: null,
    });
    assert.equal(result.pixPayload, officialPayload);
    assert.match(result.pixEncodedImage ?? "", /^data:image\/png;base64,/);
    const diagnostic = (result.raw as any)?.pixDiagnostic;
    assert.equal(diagnostic?.source, "creation");
    assert.equal(
      diagnostic?.attempts?.[0]?.imageSource,
      "generated_from_official_emv",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("producao aceita o campo QrCode textual com GUI Banese minuscula", async () => {
  const originalFetch = globalThis.fetch;
  const amount = 102;
  const officialQrCode = buildBanesePixPayloadFixture(
    "BANESE-QR-CODE",
    amount,
    "br.gov.bcb.pix",
  );
  const response = makeBaneseTitleResponse(
    amount,
    BANESE_DOCUMENT_FIXTURE.dueDate,
    {
      QrCode: officialQrCode,
    },
  );
  const { fetcher } = creationFetch(response);
  globalThis.fetch = fetcher as typeof fetch;

  try {
    const result = await createBaneseBoletoCharge({
      ...reservedBoletoInput(false),
      environment: "production",
      amount,
      financialTerms: null,
    });
    assert.equal(result.pixPayload, officialQrCode);
    assert.match(result.pixEncodedImage ?? "", /^data:image\/png;base64,/);
    const diagnostic = (result.raw as any)?.pixDiagnostic;
    assert.equal(diagnostic?.source, "creation");
    assert.equal(
      diagnostic?.attempts?.[0]?.imageSource,
      "generated_from_official_emv",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("producao aceita o payload minimo documentado pelo Banese no POST", async () => {
  const originalFetch = globalThis.fetch;
  const amount = 102;
  const fullResponse = makeBaneseTitleResponse(
    amount,
    BANESE_DOCUMENT_FIXTURE.dueDate,
  );
  const officialQrCode = buildBanesePixPayloadFixture(
    "BANESE-POST-MINIMO",
    amount,
    "br.gov.bcb.pix",
  );
  const response = {
    NumeroCodigoBarras: fullResponse.NumeroCodigoBarras,
    NumeroLinhaDigitavel: fullResponse.NumeroLinhaDigitavel,
    QrCode: officialQrCode,
  };
  const { fetcher } = creationFetch(response);
  globalThis.fetch = fetcher as typeof fetch;

  try {
    const result = await createBaneseBoletoCharge({
      ...reservedBoletoInput(false),
      environment: "production",
      amount,
      financialTerms: null,
    });
    assert.equal(result.bankSlipBarcode, response.NumeroCodigoBarras);
    assert.equal(result.bankSlipDigitableLine, response.NumeroLinhaDigitavel);
    assert.equal(result.pixPayload, officialQrCode);
    assert.match(result.pixEncodedImage ?? "", /^data:image\/png;base64,/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("aceita espaços permitidos pelo EMV no nome do recebedor Banese", () => {
  const payload =
    "00020101021226840014br.gov.bcb.pix2562qrcode-h.banese.b.br/jws/cobv/78923f2a35174d5a965f3c9442ddbe9f5204000053039865802BR5924ARACAJU PREF GABINETE DO6007ARACAJU62070503***6304A8E7";
  const normalized = normalizeBanesePixPayload(payload, 149.9);
  assert.equal(normalized.payload, payload);
});

Deno.test("descarta retorno de pix no formato de linha/barras", async () => {
  const originalFetch = globalThis.fetch;
  const amount = 8.5;
  const response = makeBaneseTitleResponse(
    amount,
    BANESE_DOCUMENT_FIXTURE.dueDate,
    {
      brCodeEMV: "04793153400000279903303100649000000002304772",
      qrcode: `data:image/png;base64,${buildBanesePixImageFixture(1)}`,
    },
  );
  const { fetcher } = creationFetch(response);
  globalThis.fetch = fetcher as typeof fetch;

  try {
    const result = await createBaneseBoletoCharge({
      ...reservedBoletoInput(false),
      environment: "production",
      amount,
      financialTerms: null,
    });
    assert.equal(result.pixPayload, null);
    assert.equal(result.pixEncodedImage, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
