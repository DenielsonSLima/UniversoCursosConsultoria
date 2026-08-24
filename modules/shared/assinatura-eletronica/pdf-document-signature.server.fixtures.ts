import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";

import {
  ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS,
  ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_DEFAULTS,
  type ElectronicSignatureDocumentEditor,
} from "./assinatura-eletronica.contract.ts";
import { createDiaryPdfSemanticManifest } from "./diary-pdf-semantic-manifest.ts";
import {
  type AppliedSignatureStamp,
  type ElectronicSignatureStampTemplateV1,
} from "./pdf-document-signature.server.ts";
import { deriveAutomaticSignatureStampPlacements } from "./signature-stamp-template.ts";

export const ONE_PIXEL_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  ),
  (character) => character.charCodeAt(0),
);
export const ONE_PIXEL_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
export const VERIFICATION_URL = "https://universocc.com.br/validador?code=DIARIO-1";
export const VERIFICATION_DISPLAY_URL = "www.universocc.com.br/validador";
export const PROFESSOR_EVENT_ID = "11111111-1111-4111-8111-111111111111";
export const COORDINATOR_EVENT_ID = "22222222-2222-4222-8222-222222222222";
export const PROFESSOR_PARTICIPANT_ID = "33333333-3333-4333-8333-333333333333";
export const COORDINATOR_PARTICIPANT_ID = "44444444-4444-4444-8444-444444444444";
export const THIRD_PARTICIPANT_ID = "55555555-5555-4555-8555-555555555555";
export const THIRD_EVENT_ID = "66666666-6666-4666-8666-666666666666";
export const PROFESSOR_VERIFICATION_CODE = `SIG-${PROFESSOR_EVENT_ID.toUpperCase()}`;
export const COORDINATOR_VERIFICATION_CODE =
  `SIG-${COORDINATOR_EVENT_ID.toUpperCase()}`;
export const PROFESSOR_VERIFICATION_URL =
  `https://universocc.com.br/validador?code=${PROFESSOR_VERIFICATION_CODE}`;
export const COORDINATOR_VERIFICATION_URL =
  `https://universocc.com.br/validador?code=${COORDINATOR_VERIFICATION_CODE}`;
export const PROFESSOR_SIGNATURE_HASH = "a".repeat(64);
export const COORDINATOR_SIGNATURE_HASH = "b".repeat(64);
export const THIRD_SIGNATURE_HASH = "c".repeat(64);
export const THIRD_VERIFICATION_CODE = `SIG-${THIRD_EVENT_ID.toUpperCase()}`;
export const THIRD_VERIFICATION_URL =
  `https://universocc.com.br/validador?code=${THIRD_VERIFICATION_CODE}`;
export const CONTENT_LAYOUT = {
  ...ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_DEFAULTS,
};
export const GLOBAL_AUTO_LAYOUT = {
  ...ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS,
};

export const GLOBAL_STAMP_TEMPLATE = {
  schemaVersion: 1,
  coordinateSpace: "STAMP_TOP_LEFT_BP_V1",
  elements: [
    {
      id: "seal",
      kind: "IMAGE",
      binding: "STAMP_ASSET",
      xBp: 2_000,
      yBp: 18_000,
      widthBp: 19_000,
      heightBp: 64_000,
      style: { fit: "CONTAIN", opacityBp: 100_000 },
    },
    {
      id: "signerRole",
      kind: "TEXT",
      binding: "SIGNER_ROLE",
      xBp: 23_000,
      yBp: 3_000,
      widthBp: 48_000,
      heightBp: 9_000,
      style: {
        font: "HELVETICA_BOLD",
        fontSizeBp: 9_000,
        color: "#071A33",
        align: "LEFT",
        label: "",
      },
    },
    {
      id: "title",
      kind: "TEXT",
      binding: "DISPLAY_TITLE",
      xBp: 23_000,
      yBp: 14_000,
      widthBp: 48_000,
      heightBp: 10_000,
      style: {
        font: "HELVETICA_BOLD_OBLIQUE",
        fontSizeBp: 10_000,
        color: "#071A33",
        align: "LEFT",
        label: "",
      },
    },
    {
      id: "signerName",
      kind: "TEXT",
      binding: "SIGNER_NAME",
      xBp: 23_000,
      yBp: 29_000,
      widthBp: 48_000,
      heightBp: 9_000,
      style: {
        font: "HELVETICA_OBLIQUE",
        fontSizeBp: 7_500,
        color: "#071A33",
        align: "LEFT",
        label: "",
      },
    },
    {
      id: "signedAt",
      kind: "TEXT",
      binding: "SIGNED_AT",
      xBp: 23_000,
      yBp: 40_000,
      widthBp: 48_000,
      heightBp: 8_000,
      style: {
        font: "HELVETICA",
        fontSizeBp: 6_500,
        color: "#071A33",
        align: "LEFT",
        label: "Data: ",
      },
    },
    {
      id: "signerCpfMasked",
      kind: "TEXT",
      binding: "SIGNER_CPF_MASKED",
      xBp: 23_000,
      yBp: 50_000,
      widthBp: 48_000,
      heightBp: 8_000,
      style: {
        font: "HELVETICA",
        fontSizeBp: 6_500,
        color: "#071A33",
        align: "LEFT",
        label: "CPF: ",
      },
    },
    {
      id: "signatureHash",
      kind: "TEXT",
      binding: "SIGNATURE_HASH",
      xBp: 23_000,
      yBp: 59_000,
      widthBp: 48_000,
      heightBp: 14_000,
      style: {
        font: "COURIER_OBLIQUE",
        fontSizeBp: 5_500,
        color: "#071A33",
        align: "LEFT",
        label: "Hash SHA-256: ",
      },
    },
    {
      id: "verificationCode",
      kind: "TEXT",
      binding: "VERIFICATION_CODE",
      xBp: 23_000,
      yBp: 74_000,
      widthBp: 48_000,
      heightBp: 7_000,
      style: {
        font: "COURIER_BOLD_OBLIQUE",
        fontSizeBp: 6_000,
        color: "#071A33",
        align: "LEFT",
        label: "Código de verificação: ",
      },
    },
    {
      id: "verificationUrl",
      kind: "TEXT",
      binding: "VERIFICATION_URL",
      xBp: 23_000,
      yBp: 83_000,
      widthBp: 48_000,
      heightBp: 14_000,
      style: {
        font: "HELVETICA",
        fontSizeBp: 5_500,
        color: "#071A33",
        align: "LEFT",
        label: "Verifique em: ",
      },
    },
    {
      id: "verificationQr",
      kind: "QR",
      binding: "VERIFICATION_URL",
      xBp: 71_000,
      yBp: 29_000,
      widthBp: 29_000,
      heightBp: 29_000,
      style: { quietZoneModules: 4 },
    },
    {
      id: "divider",
      kind: "LINE",
      binding: "DECORATIVE",
      xBp: 23_000,
      yBp: 26_000,
      widthBp: 48_000,
      heightBp: 1_000,
      style: { color: "#071A33", widthBp: 500 },
    },
  ],
} as const satisfies ElectronicSignatureStampTemplateV1;

export const placement = (role: AppliedSignatureStamp["role"]) => ({
  coordinateSpace: "PAGE_TOP_LEFT_BP_V1" as const,
  xBp: role === "PROFESSOR" ? 5_000 : 53_000,
  yBp: 78_000,
  widthBp: 42_000,
  heightBp: 14_000,
});

export const stamps = (): readonly [AppliedSignatureStamp, AppliedSignatureStamp] => [
  {
    role: "PROFESSOR",
    participantId: PROFESSOR_PARTICIPANT_ID,
    signerName: "Professora Ana Souza",
    signerCpfMasked: "12*.***.**9-09",
    signedAt: "2026-08-19T13:14:15-03:00",
    timeZone: "America/Maceio",
    signatureEventId: PROFESSOR_EVENT_ID,
    signatureHash: PROFESSOR_SIGNATURE_HASH,
    verificationCode: PROFESSOR_VERIFICATION_CODE,
    verificationUrl: PROFESSOR_VERIFICATION_URL,
    placement: placement("PROFESSOR"),
  },
  {
    role: "COORDENADOR",
    participantId: COORDINATOR_PARTICIPANT_ID,
    signerName: "Coordenador Bruno Lima",
    signerCpfMasked: "***.***.***-10",
    signedAt: "2026-08-19T13:16:17-03:00",
    timeZone: "America/Maceio",
    signatureEventId: COORDINATOR_EVENT_ID,
    signatureHash: COORDINATOR_SIGNATURE_HASH,
    verificationCode: COORDINATOR_VERIFICATION_CODE,
    verificationUrl: COORDINATOR_VERIFICATION_URL,
    placement: placement("COORDENADOR"),
  },
];

export const globalTemplateStamps = (): readonly [
  AppliedSignatureStamp,
  AppliedSignatureStamp,
] => {
  const [professor, coordinator] = stamps();
  const [firstPlacement, secondPlacement] =
    deriveAutomaticSignatureStampPlacements(GLOBAL_AUTO_LAYOUT, 2);
  return [
    {
      ...professor,
      placement: firstPlacement!,
    },
    {
      ...coordinator,
      placement: secondPlacement!,
    },
  ];
};

export const threeGlobalTemplateStamps = (): readonly AppliedSignatureStamp[] => {
  const [professor, coordinator] = stamps();
  const placements = deriveAutomaticSignatureStampPlacements(
    GLOBAL_AUTO_LAYOUT,
    3,
  );
  return [
    { ...professor, placement: placements[0]! },
    { ...coordinator, placement: placements[1]! },
    {
      ...professor,
      role: "GESTOR",
      participantId: THIRD_PARTICIPANT_ID,
      signerName: "Gestora Carla Melo",
      signerCpfMasked: "98*.***.**7-11",
      signedAt: "2026-08-19T13:18:19-03:00",
      signatureEventId: THIRD_EVENT_ID,
      signatureHash: THIRD_SIGNATURE_HASH,
      verificationCode: THIRD_VERIFICATION_CODE,
      verificationUrl: THIRD_VERIFICATION_URL,
      placement: placements[2]!,
    },
  ];
};

export const createVectorPdf = async ({
  landscape = false,
  imprimirInstrucoes = false,
  rotation = 0,
  customBoxes = false,
}: {
  landscape?: boolean;
  imprimirInstrucoes?: boolean;
  rotation?: 0 | 90 | 180 | 270;
  customBoxes?: boolean;
} = {}) => {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pageSize: [number, number] = landscape
    ? [841.89, 595.28]
    : [595.28, 841.89];
  const labels = imprimirInstrucoes
    ? [
      "CAPA VETORIAL",
      "FREQUENCIA VETORIAL",
      "CONTEUDO E ASSINATURAS",
      "INSTRUCOES",
    ]
    : ["CAPA VETORIAL", "FREQUENCIA VETORIAL", "CONTEUDO E ASSINATURAS"];
  labels.forEach((label, index) => {
    const page = pdf.addPage(pageSize);
    page.drawText(label, {
      x: 50,
      y: pageSize[1] - 70,
      size: 16,
      font,
      color: rgb(0.05, 0.1, 0.2),
    });
    page.drawLine({
      start: { x: 50, y: pageSize[1] - 80 },
      end: { x: pageSize[0] - 50, y: pageSize[1] - 80 },
      thickness: 1,
      color: rgb(0.1, 0.4, 0.8),
    });
    if (index === labels.length - (imprimirInstrucoes ? 2 : 1)) {
      page.setRotation(degrees(rotation));
      if (customBoxes) {
        page.setMediaBox(-20, -10, 700, 500);
        page.setCropBox(30, 40, 600, 400);
      }
    }
  });
  return pdf.save({ useObjectStreams: false, addDefaultPage: false });
};

export const diaryManifest = (pageCount: number, imprimirInstrucoes: boolean) => (
  createDiaryPdfSemanticManifest({
    pageCount,
    targetPageIndex: pageCount - (imprimirInstrucoes ? 2 : 1),
    instructionsPageIndex: imprimirInstrucoes ? pageCount - 1 : null,
  })
);

export const extractPdfText = async (bytes: Uint8Array) => {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: Uint8Array.from(bytes),
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
  return { pageCount: pages.length, pages, text: pages.join("\n") };
};

export const editorFixture = (): ElectronicSignatureDocumentEditor => ({
  schemaVersion: 5,
  pages: [
    { page: 1, template: "EVIDENCE" },
    {
      page: 2,
      template: "LEGAL_TEXTS",
      sections: [
        { id: "ownership", title: "DA PROPRIEDADE", body: "Texto institucional de propriedade." },
        { id: "consent", title: "DO CONSENTIMENTO", body: "Texto institucional de consentimento." },
        { id: "terms_update", title: "DOS TERMOS", body: "Texto institucional sobre termos." },
        { id: "contact", title: "DO CONTATO", body: "Texto institucional sobre contato." },
        { id: "copies", title: "DAS CÓPIAS", body: "Texto institucional sobre cópias." },
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
