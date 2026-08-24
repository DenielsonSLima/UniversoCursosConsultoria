import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import test from "node:test";

import {
  createElectronicSignatureReceiptPdf,
  createElectronicSignatureStampTemplatePreviewPdf,
  createElectronicSignatureTemplatePreviewPdf,
} from "./comprovante-assinatura-eletronica.pdf.ts";
import type { ElectronicSignatureDocumentEditor } from "../../../shared/assinatura-eletronica/assinatura-eletronica.contract.ts";
import {
  CUSTOM_STAMP_ASSET_ID,
  ONE_PIXEL_PNG,
  editorFixture,
  extractPdfText,
  fixture,
  legacyV3EditorFixture,
} from "./comprovante-assinatura-eletronica.pdf.contract.fixtures.ts";

test("prévia usa o PDF real de duas páginas sem fabricar evidências ou QR", async () => {
  const source = fixture();
  const result = await createElectronicSignatureTemplatePreviewPdf({
    institution: source.institution,
    logo: source.logo,
    institutionalWatermark: source.institutionalWatermark,
    signatureStampAssets: {},
    presentation: source.presentation,
  });
  const extracted = await extractPdfText(result.blob);

  assert.equal(extracted.pageCount, 2);
  assert.equal(
    (extracted.text.match(/PRÉVIA DO MODELO — SEM VALIDADE/g) || []).length,
    4,
  );
  assert.match(extracted.pages[0], /Gerado no fechamento/i);
  assert.match(
    extracted.pages[0],
    /A autenticidade deve ser conferida pelo QR Code ou pela URL de validação/i,
  );
  assert.match(
    extracted.pages[0],
    /QR Code, código e URL ficam disponíveis somente após a conclusão/i,
  );
  assert.match(extracted.pages[1], /DA RATIFICAÇÃO DO CONSENTIMENTO/i);
  assert.doesNotMatch(
    extracted.text,
    /ASSINADO|Ana de Exemplo|ASS-2026-0001|a{64}|https:\/\//i,
  );
});

test("aba do carimbo gera uma única folha vetorial para a última página do documento original", async () => {
  const source = fixture();
  const result = await createElectronicSignatureStampTemplatePreviewPdf({
    institution: source.institution,
    logo: source.logo,
    institutionalWatermark: source.institutionalWatermark,
    signatureStampAssets: {},
    presentation: source.presentation,
  });
  const extracted = await extractPdfText(result.blob);

  assert.equal(extracted.pageCount, 1);
  assert.match(extracted.text, /Assinado digitalmente/i);
  assert.doesNotMatch(extracted.text, /Documento assinado digitalmente/i);
  assert.doesNotMatch(extracted.text, /validade jur[ií]dica/i);
  assert.match(extracted.text, /(?:^|\n)Signatário(?:\n|$)/i);
  assert.match(extracted.text, /Maria S\. Lima/i);
  assert.doesNotMatch(extracted.text, /Assinante:/i);
  assert.match(extracted.text, /CPF:\s*12\*\.\*\*\*\.\*\*9-01/i);
  assert.match(extracted.text, /Data:\s*20\/08\/2026,\s*15:42/i);
  assert.match(extracted.text, /Hash\s+SHA-256:\s*a91f…5e7c/i);
  assert.match(extracted.text, /CÓD\.\s+VALIDAÇÃO/i);
  assert.match(extracted.text, /SIG-00000000-0000-40/i);
  assert.match(extracted.text, /www\.universocc\.com\.br\/validador/i);
  assert.doesNotMatch(extracted.text, /validador\?code=/i);
  assert.doesNotMatch(extracted.text, /https:\/\//i);
  assert.match(extracted.text, /3 exemplos neutros de N signatários/i);
  assert.doesNotMatch(extracted.text, /PROFESSOR|COORDENADOR/i);
  assert.doesNotMatch(extracted.text, /Página 3|3 de 3/i);

  const output = process.env.ELECTRONIC_SIGNATURE_STAMP_PREVIEW_OUTPUT;
  if (output) {
    await writeFile(output, new Uint8Array(await result.blob.arrayBuffer()));
  }
});

test("prévia vetorial aceita tamanho, alinhamento, negrito e itálico do template", async () => {
  const source = fixture();
  const template = source.presentation.editor.signatureStamp.template;
  const title = template.elements.find((element) => element.id === "title");
  const signerName = template.elements.find((element) =>
    element.id === "signerName"
  );
  const signatureHash = template.elements.find((element) =>
    element.id === "signatureHash"
  );
  const verificationCode = template.elements.find((element) =>
    element.id === "verificationCode"
  );
  assert.equal(title?.kind, "TEXT");
  assert.equal(signerName?.kind, "TEXT");
  assert.equal(signatureHash?.kind, "TEXT");
  assert.equal(verificationCode?.kind, "TEXT");
  if (
    title?.kind !== "TEXT" || signerName?.kind !== "TEXT" ||
    signatureHash?.kind !== "TEXT" || verificationCode?.kind !== "TEXT"
  ) {
    assert.fail("O fixture tipográfico precisa apontar apenas para textos.");
  }
  title.style.font = "HELVETICA_BOLD_OBLIQUE";
  title.style.fontSizeBp = 12_000;
  title.style.align = "RIGHT";
  signerName.style.font = "HELVETICA_OBLIQUE";
  signatureHash.style.font = "COURIER_OBLIQUE";
  verificationCode.style.font = "COURIER_BOLD_OBLIQUE";

  const result = await createElectronicSignatureStampTemplatePreviewPdf({
    institution: source.institution,
    logo: source.logo,
    institutionalWatermark: source.institutionalWatermark,
    signatureStampAssets: {},
    presentation: source.presentation,
  });
  const extracted = await extractPdfText(result.blob);

  assert.equal(extracted.pageCount, 1);
  assert.match(extracted.text, /Assinado digitalmente/i);
  assert.match(extracted.text, /Maria S\. Lima/i);
  assert.doesNotMatch(extracted.text, /Assinante:/i);
  assert.match(extracted.text, /www\.universocc\.com\.br\/validador/i);
  assert.doesNotMatch(extracted.text, /validador\?code=/i);

  signatureHash.style.font = "COURIER";
  verificationCode.style.font = "COURIER_BOLD";
  const courierResult = await createElectronicSignatureStampTemplatePreviewPdf(
    {
      institution: source.institution,
      logo: source.logo,
      institutionalWatermark: source.institutionalWatermark,
      signatureStampAssets: {},
      presentation: source.presentation,
    },
  );
  assert.equal((await extractPdfText(courierResult.blob)).pageCount, 1);

  const output = process.env.ELECTRONIC_SIGNATURE_STAMP_TYPOGRAPHY_OUTPUT;
  if (output) {
    await writeFile(output, new Uint8Array(await result.blob.arrayBuffer()));
  }
});

test("prévia do carimbo pode ocultar itens visuais sem ocultar provas", async () => {
  const source = fixture();
  source.presentation.editor.signatureStamp.template = {
    ...source.presentation.editor.signatureStamp.template,
    hiddenElementIds: ["signerRole", "title", "divider"],
  };

  const result = await createElectronicSignatureStampTemplatePreviewPdf({
    institution: source.institution,
    logo: source.logo,
    institutionalWatermark: source.institutionalWatermark,
    signatureStampAssets: {},
    presentation: source.presentation,
  });
  const extracted = await extractPdfText(result.blob);

  assert.doesNotMatch(extracted.text, /(?:^|\n)Signatário(?:\n|$)/i);
  assert.doesNotMatch(extracted.text, /Assinado digitalmente/i);
  assert.match(extracted.text, /Maria S\. Lima/i);
  assert.doesNotMatch(extracted.text, /Assinante:/i);
  assert.match(extracted.text, /Hash\s+SHA-256:\s*a91f…5e7c/i);
  assert.match(extracted.text, /CÓD\.\s+VALIDAÇÃO/i);
});

test("imagem própria do carimbo usa campo separado e precisa ser resolvida", async () => {
  const source = fixture();
  source.presentation.editor.signatureStamp.assetId = CUSTOM_STAMP_ASSET_ID;

  await assert.rejects(
    () =>
      createElectronicSignatureStampTemplatePreviewPdf({
        institution: source.institution,
        logo: source.logo,
        institutionalWatermark: source.institutionalWatermark,
        signatureStampAssets: {},
        presentation: source.presentation,
      }),
    /imagem própria do carimbo não foi resolvida/i,
  );

  const result = await createElectronicSignatureStampTemplatePreviewPdf({
    institution: source.institution,
    logo: source.logo,
    institutionalWatermark: source.institutionalWatermark,
    signatureStampAssets: {
      [CUSTOM_STAMP_ASSET_ID]: { dataUrl: ONE_PIXEL_PNG, format: "PNG" },
    },
    presentation: source.presentation,
  });
  assert.equal((await extractPdfText(result.blob)).pageCount, 1);
});

test("prévia rejeita alteração de binding no template global fechado", async () => {
  const source = fixture();
  const malformedEditor = JSON.parse(
    JSON.stringify(source.presentation.editor),
  ) as {
    signatureStamp: { template: { elements: Array<Record<string, unknown>> } };
  };
  malformedEditor.signatureStamp.template.elements[2].binding = "SIGNER_NAME";
  source.presentation.editor =
    malformedEditor as unknown as ElectronicSignatureDocumentEditor;

  await assert.rejects(
    () =>
      createElectronicSignatureStampTemplatePreviewPdf({
        institution: source.institution,
        logo: source.logo,
        institutionalWatermark: source.institutionalWatermark,
        signatureStampAssets: {},
        presentation: source.presentation,
      }),
    /template global/i,
  );
});

test("prévia aplica a única marca-d'água institucional canônica nas duas páginas", async () => {
  const source = fixture();
  source.institutionalWatermark = {
    image: { dataUrl: ONE_PIXEL_PNG, format: "PNG" },
    settings: { opacity: 1, scale: 100, rotate: false },
  };

  const result = await createElectronicSignatureTemplatePreviewPdf({
    institution: source.institution,
    logo: source.logo,
    institutionalWatermark: source.institutionalWatermark,
    signatureStampAssets: {},
    presentation: source.presentation,
  });

  assert.equal((await extractPdfText(result.blob)).pageCount, 2);

  const output = process.env.ELECTRONIC_SIGNATURE_TEMPLATE_PREVIEW_OUTPUT;
  if (output) {
    await writeFile(output, new Uint8Array(await result.blob.arrayBuffer()));
  }
});

test("prévia descarta marca-d'água editável de snapshot v3 e usa o padrão institucional", async () => {
  const source = fixture();
  const legacyEditor = legacyV3EditorFixture();
  source.presentation.editor =
    legacyEditor as unknown as ElectronicSignatureDocumentEditor;

  const result = await createElectronicSignatureTemplatePreviewPdf({
    institution: source.institution,
    logo: source.logo,
    institutionalWatermark: source.institutionalWatermark,
    signatureStampAssets: {},
    presentation: source.presentation,
  });
  const extracted = await extractPdfText(result.blob);

  assert.equal(extracted.pageCount, 2);
  assert.doesNotMatch(extracted.text, /MARCA LEGADA/i);
});

test("prévia lê snapshot legado v1 e o normaliza para o formato atual", async () => {
  const source = fixture();
  const current = editorFixture();
  const legacyEditor = {
    schemaVersion: 1,
    pages: [
      {
        ...current.pages[0],
        watermark: {
          enabled: true,
          source: "INSTITUTIONAL_BRAND",
          label: null,
          opacity: 0.08,
          scalePercent: 60,
          rotationDegrees: -45,
        },
      },
      {
        ...current.pages[1],
        watermark: {
          enabled: false,
          source: "TEXT",
          label: "UNIVERSO",
          opacity: 0.08,
          scalePercent: 60,
          rotationDegrees: -45,
        },
      },
    ],
  };
  source.presentation.editor =
    legacyEditor as unknown as ElectronicSignatureDocumentEditor;

  const result = await createElectronicSignatureTemplatePreviewPdf({
    institution: source.institution,
    logo: source.logo,
    institutionalWatermark: source.institutionalWatermark,
    signatureStampAssets: {},
    presentation: source.presentation,
  });

  assert.equal((await extractPdfText(result.blob)).pageCount, 2);
});

test("prévia e comprovante falham fechados sem a marca institucional canônica", async () => {
  const source = fixture();
  source.institutionalWatermark = null;
  const previewPayload = {
    institution: source.institution,
    logo: source.logo,
    institutionalWatermark: source.institutionalWatermark,
    signatureStampAssets: {},
    presentation: source.presentation,
  };

  await assert.rejects(
    () => createElectronicSignatureTemplatePreviewPdf(previewPayload),
    /marca-d'água institucional canônica retrato do polo/i,
  );
  await assert.rejects(
    () => createElectronicSignatureReceiptPdf(source),
    /marca-d'água institucional canônica retrato do polo/i,
  );
});

test("prévia preserva a área segura com os limites aceitos pelo editor", async () => {
  const source = fixture();
  source.presentation.confirmationMessage =
    "Confirmação institucional registrada conforme a política aprovada. "
      .repeat(10).slice(0, 600);
  source.presentation.receiptMessage =
    "Consulte o comprovante público após o fechamento autorizado. ".repeat(5)
      .slice(0, 240);
  source.presentation.editor = editorFixture();
  source.presentation.editor.pages[1].sections = source.presentation.editor
    .pages[1].sections.map((section, index) => ({
      ...section,
      title: `BLOCO INSTITUCIONAL ${index + 1} `.repeat(4).slice(0, 80),
      body: `Conteúdo institucional seguro do bloco ${index + 1}. `.repeat(8)
        .slice(0, 200),
    }));

  const result = await createElectronicSignatureTemplatePreviewPdf({
    institution: source.institution,
    logo: source.logo,
    institutionalWatermark: source.institutionalWatermark,
    signatureStampAssets: {},
    presentation: source.presentation,
  });
  const extracted = await extractPdfText(result.blob);
  assert.equal(extracted.pageCount, 2);
  assert.match(extracted.pages[1], /BLOCO INSTITUCIONAL 5/i);
});

test("comprovante preserva a area segura no limite de participantes e eventos", async () => {
  const payload = fixture();
  payload.document.type = "Documento institucional de assinatura ".repeat(3)
    .slice(0, 80);
  payload.document.reference = "REFERENCIA-LONGA-".repeat(7).slice(0, 100);
  payload.document.version = "VERSAO-".repeat(7).slice(0, 40);
  payload.participants = Array.from({ length: 6 }, (_, index) => ({
    id: `parte-${index + 1}`,
    name: `Participante autorizado ${index + 1} `.repeat(5).slice(0, 100),
    role: `Representante institucional ${index + 1} `.repeat(4).slice(0, 80),
  }));
  payload.events = [
    { type: "DOCUMENTO_FECHADO", occurredAt: "2026-08-18T12:00:00.000Z" },
    {
      type: "DOCUMENTO_DISPONIBILIZADO",
      occurredAt: "2026-08-18T12:01:00.000Z",
    },
    {
      type: "LEITURA_CONFIRMADA",
      occurredAt: "2026-08-18T12:02:00.000Z",
      participantId: "parte-1",
    },
    {
      type: "AUTENTICACAO_CONFIRMADA",
      occurredAt: "2026-08-18T12:03:00.000Z",
      participantId: "parte-1",
      method: "CONTA_E_OTP",
    },
    {
      type: "LEITURA_CONFIRMADA",
      occurredAt: "2026-08-18T12:04:00.000Z",
      participantId: "parte-2",
    },
    {
      type: "AUTENTICACAO_CONFIRMADA",
      occurredAt: "2026-08-18T12:05:00.000Z",
      participantId: "parte-2",
      method: "CONTA_E_OTP",
    },
    {
      type: "LEITURA_CONFIRMADA",
      occurredAt: "2026-08-18T12:06:00.000Z",
      participantId: "parte-3",
    },
    {
      type: "ASSINATURA_CONCLUIDA",
      occurredAt: "2026-08-18T12:07:00.000Z",
      participantId: "parte-3",
      method: "CONTA_E_OTP",
    },
  ];

  const result = await createElectronicSignatureReceiptPdf(payload);
  assert.ok(result.blob.size > 1_000);
  assert.equal((await extractPdfText(result.blob)).pageCount, 2);
  const output = process.env.ELECTRONIC_SIGNATURE_RECEIPT_MAX_FIXTURE_OUTPUT;
  if (output) {
    await writeFile(output, new Uint8Array(await result.blob.arrayBuffer()));
  }
});

