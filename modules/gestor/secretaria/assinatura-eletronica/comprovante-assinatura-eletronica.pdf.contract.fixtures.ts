import type { ElectronicSignatureReceiptPayload } from "./comprovante-assinatura-eletronica.pdf.ts";
import {
  ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS,
  type ElectronicSignatureDocumentEditor,
} from "../../../shared/assinatura-eletronica/assinatura-eletronica.contract.ts";
import { createDefaultElectronicSignatureStampTemplate } from "../../../shared/assinatura-eletronica/signature-stamp-template.ts";

export const CUSTOM_STAMP_ASSET_ID = "33333333-3333-4333-8333-333333333333";
export const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export const editorFixture = (): ElectronicSignatureDocumentEditor => ({
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

export const legacyV3EditorFixture = () => {
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

export const fixture = (): ElectronicSignatureReceiptPayload => ({
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
  institutionalWatermark: {
    image: { dataUrl: ONE_PIXEL_PNG, format: "PNG" },
    settings: { opacity: 1, scale: 100, rotate: false },
  },
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

export const extractPdfText = async (blob: Blob) => {
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


