import assert from "node:assert/strict";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { embedBanesePixQr } from "./pdf/branding.ts";
import {
  BANESE_DOCUMENT_FIXTURE,
  baneseDocumentFixtureAt,
} from "./testing/document-fixture.ts";
import {
  buildBanesePixImageFixture,
  buildBanesePixPayloadFixture,
} from "./testing/pix-fixture.ts";
import { normalizeBaneseBoletoDocument } from "./types.ts";

const sandboxPix = {
  copyAndPaste: "payload-pix-que-nao-pode-ser-impresso-em-homologacao",
  qrCodeBase64: "imagem-que-nao-deve-ser-processada-em-homologacao",
  txid: "TXID-HOMOLOGACAO",
};

Deno.test("descarta Pix em sandbox antes de validar ou renderizar QR", async () => {
  const input = {
    ...BANESE_DOCUMENT_FIXTURE,
    pix: sandboxPix,
  };

  const normalized = normalizeBaneseBoletoDocument(input);
  assert.equal(normalized.pix, null);

  const pdf = await PDFDocument.create();
  assert.equal(await embedBanesePixQr(pdf, input), null);
});

Deno.test("rejeita data inexistente no calendario", () => {
  for (const dueDate of ["2026-02-29", "2026-04-31", "0000-01-01"]) {
    assert.throws(
      () =>
        normalizeBaneseBoletoDocument({
          ...BANESE_DOCUMENT_FIXTURE,
          dueDate,
        }),
      /data de calendario valida/i,
    );
  }
});

Deno.test("aceita 29 de fevereiro em ano bissexto", () => {
  const result = normalizeBaneseBoletoDocument(
    baneseDocumentFixtureAt(0, "2028-02-29"),
  );
  assert.equal(result.dueDate, "2028-02-29");
});

Deno.test("rejeita fator de vencimento divergente da data impressa", () => {
  const nextDayBankNumbers = baneseDocumentFixtureAt(0, "2026-08-16");
  assert.throws(
    () =>
      normalizeBaneseBoletoDocument({
        ...nextDayBankNumbers,
        dueDate: "2026-08-15",
      }),
    /fator de vencimento.*diverge/i,
  );
});

Deno.test("rejeita data ISO com horario anexado", () => {
  assert.throws(
    () =>
      normalizeBaneseBoletoDocument({
        ...BANESE_DOCUMENT_FIXTURE,
        issueDate: "2026-07-16T10:00:00Z",
      }),
    /formato YYYY-MM-DD/i,
  );
});

Deno.test("exige codigo do beneficiario sem inferir a conta", () => {
  assert.throws(
    () =>
      normalizeBaneseBoletoDocument({
        ...BANESE_DOCUMENT_FIXTURE,
        beneficiary: {
          ...BANESE_DOCUMENT_FIXTURE.beneficiary,
          beneficiaryCode: "",
        },
      }),
    /codigo do beneficiario Banese.*obrigatorio/i,
  );
});

Deno.test("aceita Pix de producao somente com EMV, CRC, valor, TXID e imagem coerentes", () => {
  const result = normalizeBaneseBoletoDocument({
    ...BANESE_DOCUMENT_FIXTURE,
    environment: "production",
    pix: {
      copyAndPaste: buildBanesePixPayloadFixture("TXID-PRODUCAO"),
      qrCodeBase64: buildBanesePixImageFixture(1),
      txid: "TXID-PRODUCAO",
    },
  });
  assert.equal(result.pix?.txid, "TXID-PRODUCAO");
  assert.match(result.pix?.qrCodeBase64 ?? "", /^data:image\/png;base64,/);
});

Deno.test("aceita documento de producao sem pix quando não retornado", () => {
  const result = normalizeBaneseBoletoDocument({
    ...BANESE_DOCUMENT_FIXTURE,
    environment: "production",
    pix: null,
  });
  assert.equal(result.pix, null);
});

Deno.test("rejeita Pix de producao com CRC, valor, TXID ou imagem divergente", () => {
  const validPayload = buildBanesePixPayloadFixture("TXID-CORRETO");
  for (
    const pix of [
      {
        copyAndPaste: `${validPayload.slice(0, -1)}0`,
        qrCodeBase64: buildBanesePixImageFixture(1),
        txid: "TXID-CORRETO",
      },
      {
        copyAndPaste: buildBanesePixPayloadFixture("TXID-CORRETO", 10),
        qrCodeBase64: buildBanesePixImageFixture(1),
        txid: "TXID-CORRETO",
      },
      {
        copyAndPaste: validPayload,
        qrCodeBase64: buildBanesePixImageFixture(1),
        txid: "TXID-DIFERENTE",
      },
      {
        copyAndPaste: validPayload,
        qrCodeBase64: "base64-sem-assinatura-de-imagem-valida",
        txid: "TXID-CORRETO",
      },
    ]
  ) {
    assert.throws(() =>
      normalizeBaneseBoletoDocument({
        ...BANESE_DOCUMENT_FIXTURE,
        environment: "production",
        pix,
      })
    );
  }
});
