import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import test from "node:test";

import {
  createElectronicSignatureReceiptPdf,
  createElectronicSignatureStampTemplatePreviewPdf,
  createElectronicSignatureTemplatePreviewPdf,
  type ElectronicSignatureReceiptPayload,
  toElectronicSignatureReceiptPresentation,
} from "./comprovante-assinatura-eletronica.pdf.ts";
import {
  ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS,
  type ElectronicSignatureDocumentEditor,
} from "../../../shared/assinatura-eletronica/assinatura-eletronica.contract.ts";
import { createDefaultElectronicSignatureStampTemplate } from "../../../shared/assinatura-eletronica/signature-stamp-template.ts";

const CUSTOM_STAMP_ASSET_ID = "33333333-3333-4333-8333-333333333333";
const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

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
          body: "Texto institucional de propriedade do serviço.",
        },
        {
          id: "consent",
          title: "DA RATIFICAÇÃO DO CONSENTIMENTO",
          body: "Texto institucional de consentimento das partes.",
        },
        {
          id: "terms_update",
          title: "DA ATUALIZAÇÃO DOS TERMOS DE USO",
          body: "Texto institucional sobre atualização dos termos.",
        },
        {
          id: "contact",
          title: "COMO ENTRAR EM CONTATO",
          body: "Texto institucional com os canais oficiais de contato.",
        },
        {
          id: "copies",
          title: "OBTENÇÃO DE CÓPIAS",
          body: "Texto institucional para obtenção da cópia final.",
        },
      ],
    },
  ],
  signatureStamp: {
    enabled: false,
    canonicalLabel: "Documento assinado eletronicamente",
    assetId: null,
    template: createDefaultElectronicSignatureStampTemplate(),
    autoLayout: { ...ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS },
  },
});

const legacyV3EditorFixture = () => {
  const current = editorFixture();
  return {
    schemaVersion: 3,
    pages: [
      {
        ...current.pages[0],
        watermark: {
          enabled: true,
          source: "TEXT",
          label: "MARCA LEGADA PAGINA UM",
          assetId: null,
          opacity: 0.08,
          scalePercent: 60,
          rotationDegrees: -45,
        },
      },
      {
        ...current.pages[1],
        watermark: {
          enabled: true,
          source: "TEXT",
          label: "MARCA LEGADA PAGINA DOIS",
          assetId: null,
          opacity: 0.08,
          scalePercent: 60,
          rotationDegrees: -45,
        },
      },
    ],
    signatureStamp: {
      enabled: false,
      canonicalLabel: "Documento assinado eletronicamente",
      assetId: null,
      layout: "HORIZONTAL",
      slots: [
        {
          role: "PROFESSOR",
          pageTarget: "LAST_PAGE",
          coordinateSpace: "PAGE_TOP_LEFT_BP_V1",
          xBp: 9_000,
          yBp: 69_000,
          widthBp: 38_000,
          heightBp: 14_000,
        },
        {
          role: "COORDENADOR",
          pageTarget: "LAST_PAGE",
          coordinateSpace: "PAGE_TOP_LEFT_BP_V1",
          xBp: 53_000,
          yBp: 69_000,
          widthBp: 38_000,
          heightBp: 14_000,
        },
      ],
    },
  };
};

const fixture = (): ElectronicSignatureReceiptPayload => ({
  institution: {
    name: "Universo Cursos e Consultoria",
    legalName: "",
    cnpj: "00.000.000/0000-00",
    address: "Avenida de Exemplo",
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
  institutionalWatermark: { dataUrl: ONE_PIXEL_PNG, format: "PNG" },
  presentation: {
    policyName: "Política Institucional de Assinatura Eletrônica",
    policyVersionLabel: "Versão 1.0",
    confirmationMessage:
      "A confirmação será registrada somente após a conclusão segura da assinatura e da trilha de evidências autorizada.",
    receiptTitle: "Comprovante de Assinatura Eletrônica",
    receiptMessage:
      "A autenticidade deve ser conferida pelo QR Code ou pela URL de validação.",
    editor: editorFixture(),
  },
  document: {
    type: "Termo de ciencia",
    reference: "TER-2026-0001",
    version: "v3",
    originalHash: {
      algorithm: "SHA-256",
      value: "b".repeat(64),
    },
    hash: {
      algorithm: "SHA-256",
      value: "a".repeat(64),
    },
  },
  status: "ASSINADO",
  participants: [
    { id: "aluno", name: "Ana de Exemplo", role: "Aluno(a)" },
    {
      id: "instituicao",
      name: "Secretaria Academica",
      role: "Representante institucional",
    },
  ],
  events: [
    { type: "DOCUMENTO_FECHADO", occurredAt: "2026-08-18T12:00:00.000Z" },
    {
      type: "DOCUMENTO_DISPONIBILIZADO",
      occurredAt: "2026-08-18T12:01:00.000Z",
    },
    {
      type: "LEITURA_CONFIRMADA",
      occurredAt: "2026-08-18T12:02:00.000Z",
      participantId: "aluno",
    },
    {
      type: "AUTENTICACAO_CONFIRMADA",
      occurredAt: "2026-08-18T12:03:00.000Z",
      participantId: "aluno",
      method: "CONTA_E_OTP",
    },
    {
      type: "ASSINATURA_CONCLUIDA",
      occurredAt: "2026-08-18T12:04:00.000Z",
      participantId: "aluno",
      method: "CONTA_E_OTP",
    },
  ],
  validation: {
    code: "ASS-2026-0001",
    url: "https://universocc.com.br/validador?code=ASS-2026-0001",
  },
});

const extractPdfText = async (blob: Blob) => {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    useSystemFonts: true,
  });
  const document = await task.promise;
  const pages = await Promise.all(
    Array.from({ length: document.numPages }, async (_, index) => {
      const page = await document.getPage(index + 1);
      const content = await page.getTextContent();
      return content.items.map((item) => ("str" in item ? item.str : "")).join(
        "\n",
      );
    }),
  );
  await document.destroy();
  return {
    pageCount: pages.length,
    pages,
    text: pages.join("\n"),
  };
};

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
  assert.match(
    text,
    /www\.universocc\.com\.br\/validador\?code=ASS-2026-0001/i,
  );
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
  assert.match(extracted.text, /Documento assinado digitalmente/i);
  assert.doesNotMatch(extracted.text, /validade jur[ií]dica/i);
  assert.match(extracted.text, /(?:^|\n)Signatário(?:\n|$)/i);
  assert.match(extracted.text, /Assinante:\s*Maria S\. Lima/i);
  assert.match(extracted.text, /CPF:\s*12\*\.\*\*\*\.\*\*9-01/i);
  assert.match(extracted.text, /Data:\s*20\/08\/2026,\s*15:42/i);
  assert.match(extracted.text, /Hash\s+SHA-256:\s*a91f…5e7c/i);
  assert.match(extracted.text, /CÓD\.\s+VALIDAÇÃO/i);
  assert.match(extracted.text, /SIG-00000000-0000-40/i);
  assert.match(extracted.text, /www\.universocc\.com\.br\/validador/i);
  assert.doesNotMatch(extracted.text, /https:\/\//i);
  assert.match(extracted.text, /3 exemplos neutros de N signatários/i);
  assert.doesNotMatch(extracted.text, /PROFESSOR|COORDENADOR/i);
  assert.doesNotMatch(extracted.text, /Página 3|3 de 3/i);

  const output = process.env.ELECTRONIC_SIGNATURE_STAMP_PREVIEW_OUTPUT;
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
  assert.doesNotMatch(extracted.text, /ASSINATURA ELETRÔNICA/i);
  assert.match(extracted.text, /Assinante:\s*Maria S\. Lima/i);
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
    dataUrl: ONE_PIXEL_PNG,
    format: "PNG",
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
    /watermark_landscape_<polo_id>/i,
  );
  await assert.rejects(
    () => createElectronicSignatureReceiptPdf(source),
    /watermark_landscape_<polo_id>/i,
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
