import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";

import {
  type ElectronicSignatureDocumentEditor,
} from "./assinatura-eletronica.contract.ts";
import {
  formatSignatureStampDateTime,
  freezeDiaryPdfSignatureTarget,
} from "./pdf-document-signature.server.ts";
import { createSignedPdfArtifacts } from "../../gestor/secretaria/assinatura-eletronica/signature-pdf-artifacts.server.ts";

import {
  ONE_PIXEL_PNG,
  ONE_PIXEL_PNG_DATA_URL,
  VERIFICATION_URL,
  VERIFICATION_DISPLAY_URL,
  PROFESSOR_PARTICIPANT_ID,
  COORDINATOR_PARTICIPANT_ID,
  CONTENT_LAYOUT,
  GLOBAL_AUTO_LAYOUT,
  GLOBAL_STAMP_TEMPLATE,
  stamps,
  globalTemplateStamps,
  createVectorPdf,
  diaryManifest,
  extractPdfText,
} from "./pdf-document-signature.server.fixtures.ts";

test("formatação do carimbo registra segundos, offset e fuso", () => {
  assert.equal(
    formatSignatureStampDateTime("2026-08-19T16:14:15Z", "America/Maceio"),
    "19/08/2026 13:14:15 UTC-03:00 (America/Maceio)",
  );
});

const editorFixture = (): ElectronicSignatureDocumentEditor => ({
  schemaVersion: 5,
  pages: [
    {
      page: 1,
      template: "EVIDENCE",
    },
    {
      page: 2,
      template: "LEGAL_TEXTS",
      sections: [
        {
          id: "ownership",
          title: "DA PROPRIEDADE",
          body: "Texto institucional de propriedade.",
        },
        {
          id: "consent",
          title: "DO CONSENTIMENTO",
          body: "Texto institucional de consentimento.",
        },
        {
          id: "terms_update",
          title: "DOS TERMOS",
          body: "Texto institucional sobre termos.",
        },
        {
          id: "contact",
          title: "DO CONTATO",
          body: "Texto institucional sobre contato.",
        },
        {
          id: "copies",
          title: "DAS CÓPIAS",
          body: "Texto institucional sobre cópias.",
        },
      ],
    },
  ],
  signatureStamp: {
    enabled: false,
    canonicalLabel: "Documento assinado eletronicamente",
    assetId: null,
    template: GLOBAL_STAMP_TEMPLATE,
    autoLayout: GLOBAL_AUTO_LAYOUT,
  },
});

test("orquestrador repassa o template global ao final vetorial e gera comprovante de duas páginas", async () => {
  const originalBytes = await createVectorPdf({
    landscape: true,
    imprimirInstrucoes: true,
  });
  const frozenTarget = await freezeDiaryPdfSignatureTarget(originalBytes, {
    manifest: diaryManifest(4, true),
  });
  const result = await createSignedPdfArtifacts({
    originalBytes,
    frozenTarget,
    template: GLOBAL_STAMP_TEMPLATE,
    autoLayout: GLOBAL_AUTO_LAYOUT,
    stampPngBytes: ONE_PIXEL_PNG,
    verificationUrl: VERIFICATION_URL,
    stamps: globalTemplateStamps(),
    receiptPayload: {
      institution: {
        name: "Universo Cursos e Consultoria",
        legalName: "",
        cnpj: "00.000.000/0000-00",
        address: "Avenida Exemplo",
        number: "100",
        complement: "",
        neighborhood: "Centro",
        city: "Maceio",
        state: "AL",
        postalCode: "57000-000",
        phone: "(82) 00000-0000",
        email: "documento@example.invalid",
        isHeadquarters: true,
      },
      logo: null,
      institutionalWatermark: {
        image: {
          dataUrl: ONE_PIXEL_PNG_DATA_URL,
          format: "PNG",
        },
        settings: { opacity: 1, scale: 100, rotate: false },
      },
      presentation: {
        policyName: "Política do Diário de Classe",
        policyVersionLabel: "Versão 1",
        confirmationMessage:
          "As partes confirmaram o documento congelado e a ordem institucional.",
        receiptTitle: "Comprovante de Assinatura Eletrônica",
        receiptMessage:
          "Confira a autenticidade pelo QR Code ou pela URL pública.",
        editor: editorFixture(),
      },
      document: {
        type: "Diário de Classe",
        reference: "DIARIO-1",
        version: "1",
      },
      status: "ASSINADO",
      participants: [
        {
          id: PROFESSOR_PARTICIPANT_ID,
          name: "Professora Ana Souza",
          role: "Professor",
        },
        {
          id: COORDINATOR_PARTICIPANT_ID,
          name: "Coordenador Bruno Lima",
          role: "Coordenador de curso",
        },
      ],
      events: [
        { type: "DOCUMENTO_FECHADO", occurredAt: "2026-08-19T16:10:00Z" },
        {
          type: "AUTENTICACAO_CONFIRMADA",
          occurredAt: "2026-08-19T16:14:15Z",
          participantId: PROFESSOR_PARTICIPANT_ID,
          method: "SENHA_REAUTENTICADA",
        },
        {
          type: "ASSINATURA_CONCLUIDA",
          occurredAt: "2026-08-19T16:14:15Z",
          participantId: PROFESSOR_PARTICIPANT_ID,
          method: "SENHA_REAUTENTICADA",
        },
        {
          type: "AUTENTICACAO_CONFIRMADA",
          occurredAt: "2026-08-19T16:16:17Z",
          participantId: COORDINATOR_PARTICIPANT_ID,
          method: "SENHA_REAUTENTICADA",
        },
        {
          type: "ASSINATURA_CONCLUIDA",
          occurredAt: "2026-08-19T16:16:17Z",
          participantId: COORDINATOR_PARTICIPANT_ID,
          method: "SENHA_REAUTENTICADA",
        },
      ],
      validation: {
        code: "DIARIO-1",
        url: VERIFICATION_URL,
      },
    },
  });
  const receipt = await extractPdfText(result.receiptPdfBytes);
  const finalDocument = await extractPdfText(result.finalPdfBytes);

  assert.equal(result.receiptPageCount, 2);
  assert.equal(receipt.pageCount, 2);
  assert.equal(finalDocument.pageCount, result.originalPageCount + 2);
  assert.match(result.originalSha256, /^[a-f0-9]{64}$/u);
  assert.match(result.finalSha256, /^[a-f0-9]{64}$/u);
  assert.match(result.receiptSha256, /^[a-f0-9]{64}$/u);
  assert.notEqual(result.originalSha256, result.finalSha256);
  assert.match(receipt.text, new RegExp(result.originalSha256, "u"));
  assert.match(receipt.text, new RegExp(result.signedBodySha256, "u"));
  assert.notEqual(result.signedBodySha256, result.finalSha256);
  assert.match(finalDocument.text, /COMPROVANTE DE ASSINATURA ELETRÔNICA/iu);
  assert.match(receipt.text, /13:14:15 UTC-03:00/u);
  assert.match(receipt.text, /13:16:17 UTC-03:00/u);
  assert.match(receipt.text, /DIARIO-1/u);
  assert.ok(receipt.text.includes(VERIFICATION_DISPLAY_URL));
  assert.doesNotMatch(receipt.text, /validador\?code=/u);
  assert.doesNotMatch(receipt.text, /https:\/\//u);
  assert.doesNotMatch(receipt.text, /SIG-[0-9A-F-]{36}/u);

  const qaDirectory = process.env.SIGNATURE_PDF_QA_DIR;
  if (qaDirectory) {
    await mkdir(qaDirectory, { recursive: true });
    await Promise.all([
      writeFile(`${qaDirectory}/diario-original.pdf`, originalBytes),
      writeFile(`${qaDirectory}/diario-final.pdf`, result.finalPdfBytes),
      writeFile(`${qaDirectory}/comprovante.pdf`, result.receiptPdfBytes),
    ]);
  }
});

test("orquestrador rejeita divergência entre carimbos e evidências do comprovante", async () => {
  const originalBytes = await createVectorPdf({ landscape: true });
  const frozenTarget = await freezeDiaryPdfSignatureTarget(originalBytes, {
    manifest: diaryManifest(3, false),
  });
  const editor = editorFixture();
  const baseReceipt = {
    institution: {
      name: "Universo Cursos e Consultoria",
      legalName: "",
      cnpj: "00.000.000/0000-00",
      address: "Avenida Exemplo",
      number: "100",
      complement: "",
      neighborhood: "Centro",
      city: "Maceio",
      state: "AL",
      postalCode: "57000-000",
      phone: "(82) 00000-0000",
      email: "documento@example.invalid",
      isHeadquarters: true,
    },
    logo: null,
    institutionalWatermark: null,
    presentation: {
      policyName: "Política do Diário de Classe",
      policyVersionLabel: "Versão 1",
      confirmationMessage: "Confirmação do documento.",
      receiptTitle: "Comprovante de Assinatura Eletrônica",
      receiptMessage: "Confira a autenticidade pelo validador público.",
      editor,
    },
    document: { type: "Diário de Classe", reference: "DIARIO-1", version: "1" },
    status: "ASSINADO" as const,
    participants: [
      {
        id: PROFESSOR_PARTICIPANT_ID,
        name: "Nome divergente",
        role: "Professor",
      },
      {
        id: COORDINATOR_PARTICIPANT_ID,
        name: "Coordenador Bruno Lima",
        role: "Coordenador de curso",
      },
    ],
    events: [
      {
        type: "AUTENTICACAO_CONFIRMADA" as const,
        occurredAt: "2026-08-19T16:14:15Z",
        participantId: PROFESSOR_PARTICIPANT_ID,
        method: "CONTA_E_PIN" as const,
      },
      {
        type: "AUTENTICACAO_CONFIRMADA" as const,
        occurredAt: "2026-08-19T16:16:17Z",
        participantId: COORDINATOR_PARTICIPANT_ID,
        method: "CONTA_E_PIN" as const,
      },
    ],
    validation: {
      code: "DIARIO-1",
      url: VERIFICATION_URL,
    },
  };

  await assert.rejects(
    () =>
      createSignedPdfArtifacts({
        originalBytes,
        frozenTarget,
        layout: "HORIZONTAL",
        contentLayout: CONTENT_LAYOUT,
        stampPngBytes: ONE_PIXEL_PNG,
        verificationUrl: VERIFICATION_URL,
        stamps: stamps(),
        receiptPayload: baseReceipt,
      }),
    /signatário do carimbo diverge/i,
  );

  await assert.rejects(
    () =>
      createSignedPdfArtifacts({
        originalBytes,
        frozenTarget,
        layout: "HORIZONTAL",
        contentLayout: CONTENT_LAYOUT,
        stampPngBytes: ONE_PIXEL_PNG,
        verificationUrl: VERIFICATION_URL,
        stamps: stamps(),
        receiptPayload: {
          ...baseReceipt,
          participants: [
            {
              id: PROFESSOR_PARTICIPANT_ID,
              name: "Professora Ana Souza",
              role: "Professor",
            },
            {
              id: COORDINATOR_PARTICIPANT_ID,
              name: "Coordenador Bruno Lima",
              role: "Coordenador de curso",
            },
          ],
        },
      }),
    /conclusão da assinatura não corresponde/i,
  );
});
