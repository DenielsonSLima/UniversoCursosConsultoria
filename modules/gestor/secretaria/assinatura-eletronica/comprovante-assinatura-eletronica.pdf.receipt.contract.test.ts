import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import test from "node:test";

import {
  createElectronicSignatureReceiptPdf,
  toElectronicSignatureReceiptPresentation,
} from "./comprovante-assinatura-eletronica.pdf.ts";
import {
  editorFixture,
  extractPdfText,
  fixture,
} from "./comprovante-assinatura-eletronica.pdf.contract.fixtures.ts";

test("comprovante de assinatura e vetorial, selecionavel e preserva somente dados autorizados", async () => {
  const result = await createElectronicSignatureReceiptPdf(fixture());
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  const extracted = await extractPdfText(result.blob);
  const { text } = extracted;

  assert.match(
    new globalThis.TextDecoder("latin1").decode(bytes.slice(0, 8)),
    /^%PDF-/,
  );
  assert.equal(result.fileName, "comprovante-assinatura-ter-2026-0001.pdf");
  assert.ok(result.blob.size > 1_000);
  assert.equal(extracted.pageCount, 2);
  assert.match(text, /Comprovante de Assinatura Eletrônica/i);
  assert.match(text, /Política Institucional de Assinatura Eletrônica/i);
  assert.match(
    text,
    /A confirmação será registrada somente após a conclusão segura/i,
  );
  assert.match(text, /TER-2026-0001/);
  assert.match(text, /Ana de Exemplo/);
  assert.match(text, /Conta autenticada e segundo fator/);
  assert.match(text, /ASS-2026-0001/);
  assert.match(text, /HASH DO CORPO ASSINADO/i);
  assert.match(
    text,
    /www\.universocc\.com\.br\/validador/i,
  );
  assert.doesNotMatch(text, /validador\?code=/i);
  assert.doesNotMatch(text, /https:\/\//i);
  assert.match(text, /b{64}/);
  assert.match(text, /a{64}/);
  assert.doesNotMatch(text, /CPF|sess[aã]o|senha|token|\bip\b/i);

  const output = process.env.ELECTRONIC_SIGNATURE_RECEIPT_FIXTURE_OUTPUT;
  if (output) await writeFile(output, bytes);
});

test("comprovante rejeita hash final idêntico ao original congelado", async () => {
  const payload = fixture();
  payload.document.hash.value = payload.document.originalHash.value;

  await assert.rejects(
    () => createElectronicSignatureReceiptPdf(payload),
    /precisam ser distintos/i,
  );
});

test("comprovante rejeita dados tecnicos e pessoais no texto permitido", async () => {
  const payload = fixture();
  payload.events = [{
    type: "RECUSA_REGISTRADA",
    occurredAt: "2026-08-18T12:05:00.000Z",
    participantId: "aluno",
    reason: "IP 192.168.0.10",
  }];
  payload.status = "RECUSADO";

  await assert.rejects(
    () => createElectronicSignatureReceiptPdf(payload),
    /dado tecnico ou pessoal/i,
  );
});

test("comprovante rejeita URL de validacao com parametro nao publico", async () => {
  const payload = fixture();
  payload.validation.url =
    "https://universocc.com.br/validador?code=ASS-2026-0001&token=segredo";

  await assert.rejects(
    () => createElectronicSignatureReceiptPdf(payload),
    /codigo publico/i,
  );
});

test("comprovante rejeita URL de validacao fora do dominio institucional canonico", async () => {
  const payload = fixture();
  payload.validation.url =
    "https://exemplo.invalid/validador?code=ASS-2026-0001";

  await assert.rejects(
    () => createElectronicSignatureReceiptPdf(payload),
    /validador institucional canonico/i,
  );
});

test("comprovante exige que o ultimo evento corresponda ao estado final", async () => {
  const payload = fixture();
  payload.events = [
    ...payload.events,
    {
      type: "CANCELAMENTO_REGISTRADO",
      occurredAt: "2026-08-18T12:05:00.000Z",
      reason: "Documento cancelado após a conclusão.",
    },
  ];

  await assert.rejects(
    () => createElectronicSignatureReceiptPdf(payload),
    /evento terminal correspondente/i,
  );
});

test("assinatura concluida exige participante e metodo no evento terminal", async () => {
  const payload = fixture();
  payload.events = payload.events.map((event) => (
    event.type === "ASSINATURA_CONCLUIDA"
      ? { ...event, participantId: null, method: null }
      : event
  ));

  await assert.rejects(
    () => createElectronicSignatureReceiptPdf(payload),
    /participante e metodo de autenticacao/i,
  );
});

test("comprovante rejeita texto de apresentação que exponha dado técnico", async () => {
  const payload = fixture();
  payload.presentation.confirmationMessage =
    "Use o token de autenticação recebido para confirmar.";

  await assert.rejects(
    () => createElectronicSignatureReceiptPdf(payload),
    /dado tecnico ou pessoal/i,
  );
});

test("apresentação do comprovante preserva os textos e o editor entregues pelo servidor", () => {
  const editor = editorFixture();
  const presentation = toElectronicSignatureReceiptPresentation({
    name: "Política aprovada",
    versionLabel: "Versão 2.1",
    confirmationMessage: "Texto jurídico aprovado.",
    receiptTitle: "Comprovante institucional",
    receiptMessage: "Consulte o QR Code público.",
    editor,
  });

  assert.deepEqual(presentation, {
    policyName: "Política aprovada",
    policyVersionLabel: "Versão 2.1",
    confirmationMessage: "Texto jurídico aprovado.",
    receiptTitle: "Comprovante institucional",
    receiptMessage: "Consulte o QR Code público.",
    editor,
  });
});

