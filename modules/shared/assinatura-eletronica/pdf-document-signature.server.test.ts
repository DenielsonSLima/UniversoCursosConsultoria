import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";

import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";

import {
  ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS,
  ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_DEFAULTS,
  ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE,
  type ElectronicSignatureDocumentEditor,
} from "./assinatura-eletronica.contract";
import { createDiaryPdfSemanticManifest } from "./diary-pdf-semantic-manifest";
import {
  type AppliedSignatureStamp,
  applyElectronicSignatureStamps,
  type ElectronicSignatureStampTemplateV1,
  formatSignatureStampDateTime,
  freezeDiaryPdfSignatureTarget,
  inspectPdfOriginal,
  normalizeElectronicSignatureStampTemplate,
  resolveDiarySignaturePageIndex,
} from "./pdf-document-signature.server";
import { deriveAutomaticSignatureStampPlacements } from "./signature-stamp-template";
import { createSignedPdfArtifacts } from "../../gestor/secretaria/assinatura-eletronica/signature-pdf-artifacts.server";

const ONE_PIXEL_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  ),
  (character) => character.charCodeAt(0),
);
const ONE_PIXEL_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const VERIFICATION_URL = "https://universocc.com.br/validador?code=DIARIO-1";
const PROFESSOR_EVENT_ID = "11111111-1111-4111-8111-111111111111";
const COORDINATOR_EVENT_ID = "22222222-2222-4222-8222-222222222222";
const PROFESSOR_PARTICIPANT_ID = "33333333-3333-4333-8333-333333333333";
const COORDINATOR_PARTICIPANT_ID = "44444444-4444-4444-8444-444444444444";
const THIRD_PARTICIPANT_ID = "55555555-5555-4555-8555-555555555555";
const THIRD_EVENT_ID = "66666666-6666-4666-8666-666666666666";
const PROFESSOR_VERIFICATION_CODE = `SIG-${PROFESSOR_EVENT_ID.toUpperCase()}`;
const COORDINATOR_VERIFICATION_CODE =
  `SIG-${COORDINATOR_EVENT_ID.toUpperCase()}`;
const PROFESSOR_VERIFICATION_URL =
  `https://universocc.com.br/validador?code=${PROFESSOR_VERIFICATION_CODE}`;
const COORDINATOR_VERIFICATION_URL =
  `https://universocc.com.br/validador?code=${COORDINATOR_VERIFICATION_CODE}`;
const PROFESSOR_SIGNATURE_HASH = "a".repeat(64);
const COORDINATOR_SIGNATURE_HASH = "b".repeat(64);
const THIRD_SIGNATURE_HASH = "c".repeat(64);
const THIRD_VERIFICATION_CODE = `SIG-${THIRD_EVENT_ID.toUpperCase()}`;
const THIRD_VERIFICATION_URL =
  `https://universocc.com.br/validador?code=${THIRD_VERIFICATION_CODE}`;
const CONTENT_LAYOUT = {
  ...ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_DEFAULTS,
};
const GLOBAL_AUTO_LAYOUT = {
  ...ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS,
};

const GLOBAL_STAMP_TEMPLATE = {
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
        font: "HELVETICA_BOLD",
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
        font: "HELVETICA",
        fontSizeBp: 7_500,
        color: "#071A33",
        align: "LEFT",
        label: "Assinante: ",
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
        font: "COURIER",
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
        font: "COURIER",
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

const placement = (role: AppliedSignatureStamp["role"]) => ({
  coordinateSpace: "PAGE_TOP_LEFT_BP_V1" as const,
  xBp: role === "PROFESSOR" ? 5_000 : 53_000,
  yBp: 78_000,
  widthBp: 42_000,
  heightBp: 14_000,
});

const stamps = (): readonly [AppliedSignatureStamp, AppliedSignatureStamp] => [
  {
    role: "PROFESSOR",
    participantId: PROFESSOR_PARTICIPANT_ID,
    signerName: "Professora Ana Souza",
    signerCpfMasked: "***.***.***-09",
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

const globalTemplateStamps = (): readonly [
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

const threeGlobalTemplateStamps = (): readonly AppliedSignatureStamp[] => {
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
      signerCpfMasked: "***.***.***-11",
      signedAt: "2026-08-19T13:18:19-03:00",
      signatureEventId: THIRD_EVENT_ID,
      signatureHash: THIRD_SIGNATURE_HASH,
      verificationCode: THIRD_VERIFICATION_CODE,
      verificationUrl: THIRD_VERIFICATION_URL,
      placement: placements[2]!,
    },
  ];
};

const createVectorPdf = async ({
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

const diaryManifest = (pageCount: number, imprimirInstrucoes: boolean) => (
  createDiaryPdfSemanticManifest({
    pageCount,
    targetPageIndex: pageCount - (imprimirInstrucoes ? 2 : 1),
    instructionsPageIndex: imprimirInstrucoes ? pageCount - 1 : null,
  })
);

const extractPdfText = async (bytes: Uint8Array) => {
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

test("inspeção preserva orientação real de PDFs retrato e paisagem", async () => {
  const portrait = await inspectPdfOriginal(await createVectorPdf());
  const landscape = await inspectPdfOriginal(
    await createVectorPdf({ landscape: true }),
  );

  assert.equal(portrait.pageCount, 3);
  assert.ok(portrait.pages[0].visibleHeight > portrait.pages[0].visibleWidth);
  assert.equal(landscape.pageCount, 3);
  assert.ok(landscape.pages[0].visibleWidth > landscape.pages[0].visibleHeight);
  assert.match(portrait.sha256, /^[a-f0-9]{64}$/u);
});

test("página semântica do Diário ignora a folha opcional de instruções", async () => {
  const withoutInstructions = await createVectorPdf({ landscape: true });
  const withInstructions = await createVectorPdf({
    landscape: true,
    imprimirInstrucoes: true,
  });
  const frozenWithout = await freezeDiaryPdfSignatureTarget(
    withoutInstructions,
    {
      manifest: diaryManifest(3, false),
    },
  );
  const frozenWith = await freezeDiaryPdfSignatureTarget(withInstructions, {
    manifest: diaryManifest(4, true),
  });

  assert.equal(
    resolveDiarySignaturePageIndex({
      pageCount: 3,
      manifest: diaryManifest(3, false),
    }),
    2,
  );
  assert.equal(
    resolveDiarySignaturePageIndex({
      pageCount: 4,
      manifest: diaryManifest(4, true),
    }),
    2,
  );
  assert.equal(frozenWithout.targetPageIndex, 2);
  assert.equal(frozenWith.targetPageIndex, 2);

  await assert.rejects(
    () =>
      freezeDiaryPdfSignatureTarget(withInstructions, {
        manifest: diaryManifest(3, false),
      }),
    /manifesto semântico diverge da quantidade de páginas/i,
  );
});

test("carimba Professor e Coordenador na página congelada sem rasterizar as páginas", async () => {
  const originalBytes = await createVectorPdf({
    landscape: true,
    imprimirInstrucoes: true,
  });
  const frozenTarget = await freezeDiaryPdfSignatureTarget(originalBytes, {
    manifest: diaryManifest(4, true),
  });
  const result = await applyElectronicSignatureStamps({
    originalBytes,
    frozenTarget,
    layout: "HORIZONTAL",
    contentLayout: CONTENT_LAYOUT,
    stampPngBytes: ONE_PIXEL_PNG,
    verificationUrl: VERIFICATION_URL,
    stamps: stamps(),
  });
  const extracted = await extractPdfText(result.finalBytes);

  assert.equal(result.targetPageIndex, 2);
  assert.notEqual(result.finalSha256, result.originalSha256);
  assert.equal(
    extracted.pages[2].split(ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE).length -
      1,
    2,
  );
  assert.match(extracted.pages[2], /Professora Ana Souza/i);
  assert.match(extracted.pages[2], /Coordenador Bruno Lima/i);
  assert.match(extracted.pages[2], /Professor/i);
  assert.match(extracted.pages[2], /COORDENADOR/u);
  assert.match(extracted.pages[2], /13:14:15 UTC-03:00/i);
  const compactExtractedText = extracted.pages[2].replace(/\s+/gu, "");
  assert.match(compactExtractedText, /CPF:\*\*\*\.\*\*\*\.\*\*\*-09/i);
  assert.match(compactExtractedText, new RegExp(PROFESSOR_SIGNATURE_HASH, "u"));
  assert.match(
    compactExtractedText,
    new RegExp(COORDINATOR_SIGNATURE_HASH, "u"),
  );
  assert.match(
    extracted.pages[2],
    new RegExp(PROFESSOR_VERIFICATION_CODE, "u"),
  );
  assert.match(
    extracted.pages[2],
    new RegExp(COORDINATOR_VERIFICATION_CODE, "u"),
  );
  assert.match(extracted.pages[2], /VALIDAÇÃO INDIVIDUAL/u);
  assert.doesNotMatch(extracted.pages[2], /validade jurídica/iu);
  assert.doesNotMatch(
    extracted.pages[2],
    /Documento assinado digitalmente\s+(?:PROFESSOR|COORDENADOR)/u,
  );
  assert.doesNotMatch(
    extracted.pages[3],
    /Documento assinado digitalmente/i,
  );
});

test("template global único compõe duas instâncias automáticas com provas individuais", async () => {
  const normalized = normalizeElectronicSignatureStampTemplate(
    GLOBAL_STAMP_TEMPLATE,
  );
  assert.deepEqual(
    normalized.elements.map(({ id, kind, binding }) => ({ id, kind, binding })),
    GLOBAL_STAMP_TEMPLATE.elements.map(({ id, kind, binding }) => ({
      id,
      kind,
      binding,
    })),
  );
  const originalBytes = await createVectorPdf({ landscape: true });
  const frozenTarget = await freezeDiaryPdfSignatureTarget(originalBytes, {
    manifest: diaryManifest(3, false),
  });
  const result = await applyElectronicSignatureStamps({
    originalBytes,
    frozenTarget,
    template: GLOBAL_STAMP_TEMPLATE,
    autoLayout: GLOBAL_AUTO_LAYOUT,
    stampPngBytes: ONE_PIXEL_PNG,
    verificationUrl: VERIFICATION_URL,
    stamps: globalTemplateStamps(),
  });
  const extracted = await extractPdfText(result.finalBytes);
  const pageText = extracted.pages[result.targetPageIndex];
  const compactText = pageText.replace(/\s+/gu, "");

  assert.equal(
    pageText.split(ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE).length - 1,
    2,
  );
  assert.match(pageText, /PROFESSOR/u);
  assert.match(pageText, /COORDENADOR/u);
  assert.match(compactText, /Assinante:ProfessoraAnaSouza/u);
  assert.match(compactText, /CPF:\*\*\*\.\*\*\*\.\*\*\*-09/u);
  assert.match(compactText, /13:14:15UTC-03:00/u);
  assert.match(compactText, new RegExp(PROFESSOR_SIGNATURE_HASH, "u"));
  assert.match(compactText, new RegExp(COORDINATOR_SIGNATURE_HASH, "u"));
  assert.match(compactText, new RegExp(PROFESSOR_VERIFICATION_CODE, "u"));
  assert.match(compactText, new RegExp(COORDINATOR_VERIFICATION_CODE, "u"));
  assert.match(
    compactText,
    /https:\/\/universocc\.com\.br\/validador\?code=SIG-/u,
  );
  assert.doesNotMatch(pageText, /validade jurídica/iu);
});

test("o mesmo template global é repetido para N signatários sem papel no layout", async () => {
  const originalBytes = await createVectorPdf({ landscape: true });
  const frozenTarget = await freezeDiaryPdfSignatureTarget(originalBytes, {
    manifest: diaryManifest(3, false),
  });
  const result = await applyElectronicSignatureStamps({
    originalBytes,
    frozenTarget,
    template: GLOBAL_STAMP_TEMPLATE,
    autoLayout: GLOBAL_AUTO_LAYOUT,
    stampPngBytes: ONE_PIXEL_PNG,
    verificationUrl: VERIFICATION_URL,
    stamps: threeGlobalTemplateStamps(),
  });
  const pageText = (await extractPdfText(result.finalBytes)).pages[
    result.targetPageIndex
  ];

  assert.equal(
    pageText.split(ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE).length - 1,
    3,
  );
  assert.match(pageText, /Gestora Carla Melo/u);
  assert.match(pageText, new RegExp(THIRD_VERIFICATION_CODE, "u"));
});

test("template global rejeita texto livre, quiet zone sobreposta e mistura com layout histórico", async () => {
  const arbitraryLabel = globalThis.structuredClone(GLOBAL_STAMP_TEMPLATE) as unknown as {
    elements: Array<{ style: Record<string, unknown> }>;
  };
  arbitraryLabel.elements[3].style.label = "Nome livre: ";
  assert.throws(
    () => normalizeElectronicSignatureStampTemplate(arbitraryLabel),
    /estilo de signerName.*imutável/i,
  );

  const hiddenHash = globalThis.structuredClone(GLOBAL_STAMP_TEMPLATE) as unknown as {
    elements: Array<{ style: Record<string, unknown> }>;
  };
  hiddenHash.elements[6].style.color = "#FFFFFF";
  assert.throws(
    () => normalizeElectronicSignatureStampTemplate(hiddenHash),
    /estilo de signatureHash.*imutável/i,
  );

  const qrOverlap = globalThis.structuredClone(GLOBAL_STAMP_TEMPLATE) as unknown as {
    elements: Array<Record<string, unknown>>;
  };
  qrOverlap.elements[9].xBp = 60_000;
  assert.throws(
    () => normalizeElectronicSignatureStampTemplate(qrOverlap),
    /quiet zone do QR individual/i,
  );

  const originalBytes = await createVectorPdf({ landscape: true });
  const frozenTarget = await freezeDiaryPdfSignatureTarget(originalBytes, {
    manifest: diaryManifest(3, false),
  });
  await assert.rejects(
    () =>
      applyElectronicSignatureStamps({
        originalBytes,
        frozenTarget,
        template: GLOBAL_STAMP_TEMPLATE,
        layout: "HORIZONTAL",
        contentLayout: CONTENT_LAYOUT,
        stampPngBytes: ONE_PIXEL_PNG,
        verificationUrl: VERIFICATION_URL,
        stamps: globalTemplateStamps(),
      }),
    /exclusivamente o template global ou o layout histórico/i,
  );
});

test("o mesmo contrato de carimbo funciona em páginas retrato e paisagem", async (context) => {
  for (const landscape of [false, true]) {
    await context.test(landscape ? "paisagem" : "retrato", async () => {
      const originalBytes = await createVectorPdf({ landscape });
      const frozenTarget = await freezeDiaryPdfSignatureTarget(originalBytes, {
        manifest: diaryManifest(3, false),
      });
      const result = await applyElectronicSignatureStamps({
        originalBytes,
        frozenTarget,
        layout: "HORIZONTAL",
        contentLayout: CONTENT_LAYOUT,
        stampPngBytes: ONE_PIXEL_PNG,
        verificationUrl: VERIFICATION_URL,
        stamps: stamps(),
      });
      const extracted = await extractPdfText(result.finalBytes);
      assert.match(
        extracted.pages[result.targetPageIndex],
        /Professora Ana Souza/i,
      );
      assert.equal(
        frozenTarget.targetPage.visibleWidth >
          frozenTarget.targetPage.visibleHeight,
        landscape,
      );
    });
  }
});

test("aplicação respeita CropBox deslocada e rotações 0/90/180/270", async (context) => {
  for (const rotation of [0, 90, 180, 270] as const) {
    await context.test(`rotação ${rotation}`, async () => {
      const originalBytes = await createVectorPdf({
        landscape: true,
        rotation,
        customBoxes: true,
      });
      const frozenTarget = await freezeDiaryPdfSignatureTarget(originalBytes, {
        manifest: diaryManifest(3, false),
      });
      const result = await applyElectronicSignatureStamps({
        originalBytes,
        frozenTarget,
        layout: "COMPACT",
        contentLayout: CONTENT_LAYOUT,
        stampPngBytes: ONE_PIXEL_PNG,
        verificationUrl: VERIFICATION_URL,
        stamps: stamps(),
      });
      const finalInspection = await inspectPdfOriginal(result.finalBytes);
      const target = finalInspection.pages[result.targetPageIndex];
      const extracted = await extractPdfText(result.finalBytes);

      assert.equal(target.rotationDegrees, rotation);
      assert.deepEqual(target.cropBox, {
        x: 30,
        y: 40,
        width: 600,
        height: 400,
      });
      assert.deepEqual(target.mediaBox, {
        x: -20,
        y: -10,
        width: 700,
        height: 500,
      });
      assert.match(
        extracted.pages[result.targetPageIndex],
        /Documento assinado digitalmente/i,
      );
      assert.match(
        extracted.pages[result.targetPageIndex],
        /Professora Ana Souza/i,
      );

      const qaDirectory = process.env.SIGNATURE_PDF_QA_DIR;
      if (qaDirectory) {
        await mkdir(qaDirectory, { recursive: true });
        await writeFile(
          `${qaDirectory}/diario-rotation-${rotation}.pdf`,
          result.finalBytes,
        );
      }
    });
  }
});

test("hash divergente do original congelado bloqueia o carimbo", async () => {
  const originalBytes = await createVectorPdf({ landscape: true });
  const frozenTarget = await freezeDiaryPdfSignatureTarget(originalBytes, {
    manifest: diaryManifest(3, false),
  });

  await assert.rejects(
    () =>
      applyElectronicSignatureStamps({
        originalBytes,
        frozenTarget: { ...frozenTarget, originalSha256: "0".repeat(64) },
        layout: "HORIZONTAL",
        contentLayout: CONTENT_LAYOUT,
        stampPngBytes: ONE_PIXEL_PNG,
        verificationUrl: VERIFICATION_URL,
        stamps: stamps(),
      }),
    /hash do PDF original diverge/i,
  );
});

test("carimbo rejeita URL externa e coordenadas fora da página", async () => {
  const originalBytes = await createVectorPdf({ landscape: true });
  const frozenTarget = await freezeDiaryPdfSignatureTarget(originalBytes, {
    manifest: diaryManifest(3, false),
  });
  const [professor, coordenador] = stamps();

  await assert.rejects(
    () =>
      applyElectronicSignatureStamps({
        originalBytes,
        frozenTarget,
        layout: "HORIZONTAL",
        contentLayout: CONTENT_LAYOUT,
        stampPngBytes: ONE_PIXEL_PNG,
        verificationUrl: VERIFICATION_URL,
        stamps: [
          {
            ...professor,
            verificationUrl:
              `https://example.com/validador?code=${PROFESSOR_VERIFICATION_CODE}`,
          },
          coordenador,
        ],
      }),
    /URL individual do carimbo diverge/i,
  );

  await assert.rejects(
    () =>
      applyElectronicSignatureStamps({
        originalBytes,
        frozenTarget,
        layout: "HORIZONTAL",
        contentLayout: CONTENT_LAYOUT,
        stampPngBytes: ONE_PIXEL_PNG,
        verificationUrl: VERIFICATION_URL,
        stamps: [
          {
            ...professor,
            placement: { ...professor.placement, xBp: 70_000 },
          },
          coordenador,
        ],
      }),
    /posição do carimbo de Professor é inválida/i,
  );

  await assert.rejects(
    () =>
      applyElectronicSignatureStamps({
        originalBytes,
        frozenTarget,
        layout: "HORIZONTAL",
        contentLayout: CONTENT_LAYOUT,
        stampPngBytes: ONE_PIXEL_PNG,
        verificationUrl: VERIFICATION_URL,
        stamps: [...stamps(), stamps()[0]] as unknown as readonly [
          AppliedSignatureStamp,
          AppliedSignatureStamp,
        ],
      }),
    /carimbos automáticos não podem se sobrepor/i,
  );
});

test("carimbo rejeita CPF integral, hash inválido e prova individual duplicada", async () => {
  const originalBytes = await createVectorPdf({ landscape: true });
  const frozenTarget = await freezeDiaryPdfSignatureTarget(originalBytes, {
    manifest: diaryManifest(3, false),
  });
  const [professor, coordenador] = stamps();
  const base = {
    originalBytes,
    frozenTarget,
    layout: "HORIZONTAL" as const,
    contentLayout: CONTENT_LAYOUT,
    stampPngBytes: ONE_PIXEL_PNG,
    verificationUrl: VERIFICATION_URL,
  };

  await assert.rejects(
    () =>
      applyElectronicSignatureStamps({
        ...base,
        stamps: [
          { ...professor, signerCpfMasked: "123.456.789-09" },
          coordenador,
        ],
      }),
    /precisa permanecer mascarado/i,
  );
  await assert.rejects(
    () =>
      applyElectronicSignatureStamps({
        ...base,
        stamps: [{ ...professor, signatureHash: "a".repeat(63) }, coordenador],
      }),
    /hash individual da assinatura é inválido/i,
  );
  await assert.rejects(
    () =>
      applyElectronicSignatureStamps({
        ...base,
        stamps: [professor, {
          ...coordenador,
          signatureHash: professor.signatureHash,
        }],
      }),
    /prova e validação públicas individuais/i,
  );
  await assert.rejects(
    () =>
      applyElectronicSignatureStamps({
        ...base,
        stamps: [{
          ...professor,
          verificationCode: COORDINATOR_VERIFICATION_CODE,
          verificationUrl: COORDINATOR_VERIFICATION_URL,
        }, coordenador],
      }),
    /código individual do carimbo diverge do evento/i,
  );
  await assert.rejects(
    () =>
      applyElectronicSignatureStamps({
        ...base,
        stamps: [professor, {
          ...coordenador,
          signatureEventId: professor.signatureEventId,
          signatureHash: professor.signatureHash,
          verificationCode: professor.verificationCode,
          verificationUrl: professor.verificationUrl,
        }],
      }),
    /prova e validação públicas individuais/i,
  );
});

test("layout mínimo legível mantém CPF, hash completo, código e QR individual", async () => {
  const originalBytes = await createVectorPdf({ landscape: true });
  const frozenTarget = await freezeDiaryPdfSignatureTarget(originalBytes, {
    manifest: diaryManifest(3, false),
  });
  const [professor, coordenador] = stamps();
  const result = await applyElectronicSignatureStamps({
    originalBytes,
    frozenTarget,
    layout: "COMPACT",
    contentLayout: CONTENT_LAYOUT,
    stampPngBytes: ONE_PIXEL_PNG,
    verificationUrl: VERIFICATION_URL,
    stamps: [
      {
        ...professor,
        placement: {
          ...professor.placement,
          xBp: 1_000,
          yBp: 86_000,
          widthBp: 38_000,
          heightBp: 14_000,
        },
      },
      {
        ...coordenador,
        placement: {
          ...coordenador.placement,
          xBp: 61_000,
          yBp: 86_000,
          widthBp: 38_000,
          heightBp: 14_000,
        },
      },
    ],
  });
  const extracted = await extractPdfText(result.finalBytes);
  const compactExtractedText = extracted.pages[result.targetPageIndex].replace(
    /\s+/gu,
    "",
  );

  assert.match(compactExtractedText, /CPF:\*{3}[.]\*{3}[.]\*{3}-09/u);
  assert.match(compactExtractedText, new RegExp(PROFESSOR_SIGNATURE_HASH, "u"));
  assert.match(
    compactExtractedText,
    new RegExp(COORDINATOR_SIGNATURE_HASH, "u"),
  );
  assert.match(
    extracted.pages[result.targetPageIndex],
    new RegExp(PROFESSOR_VERIFICATION_CODE, "u"),
  );
  assert.match(
    extracted.pages[result.targetPageIndex],
    new RegExp(COORDINATOR_VERIFICATION_CODE, "u"),
  );

  const qaDirectory = process.env.SIGNATURE_PDF_QA_DIR;
  if (qaDirectory) {
    await mkdir(qaDirectory, { recursive: true });
    await writeFile(
      `${qaDirectory}/diario-stamp-minimum.pdf`,
      result.finalBytes,
    );
  }
});

test("fatores internos válidos alteram o desenho e valores fora do passo falham fechados", async () => {
  const originalBytes = await createVectorPdf({ landscape: true });
  const frozenTarget = await freezeDiaryPdfSignatureTarget(originalBytes, {
    manifest: diaryManifest(3, false),
  });
  const base = {
    originalBytes,
    frozenTarget,
    layout: "HORIZONTAL" as const,
    stampPngBytes: ONE_PIXEL_PNG,
    verificationUrl: VERIFICATION_URL,
    stamps: stamps(),
  };
  const minimum = await applyElectronicSignatureStamps({
    ...base,
    contentLayout: {
      sealScalePercent: 70,
      lineSpacingPercent: 85,
      qrScalePercent: 85,
    },
  });
  const maximum = await applyElectronicSignatureStamps({
    ...base,
    contentLayout: {
      sealScalePercent: 130,
      lineSpacingPercent: 105,
      qrScalePercent: 115,
    },
  });

  assert.notEqual(minimum.finalSha256, maximum.finalSha256);
  const qaDirectory = process.env.SIGNATURE_PDF_QA_DIR;
  if (qaDirectory) {
    await mkdir(qaDirectory, { recursive: true });
    await Promise.all([
      writeFile(
        `${qaDirectory}/diario-stamp-content-layout-minimum.pdf`,
        minimum.finalBytes,
      ),
      writeFile(
        `${qaDirectory}/diario-stamp-content-layout-maximum.pdf`,
        maximum.finalBytes,
      ),
    ]);
  }
  await assert.rejects(
    () =>
      applyElectronicSignatureStamps({
        ...base,
        contentLayout: {
          sealScalePercent: 72,
          lineSpacingPercent: 100,
          qrScalePercent: 100,
        },
      }),
    /ajuste sealScalePercent do carimbo é inválido/i,
  );
});

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
        dataUrl: ONE_PIXEL_PNG_DATA_URL,
        format: "PNG",
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

  assert.equal(result.receiptPageCount, 2);
  assert.equal(receipt.pageCount, 2);
  assert.match(result.originalSha256, /^[a-f0-9]{64}$/u);
  assert.match(result.finalSha256, /^[a-f0-9]{64}$/u);
  assert.match(result.receiptSha256, /^[a-f0-9]{64}$/u);
  assert.notEqual(result.originalSha256, result.finalSha256);
  assert.match(receipt.text, new RegExp(result.originalSha256, "u"));
  assert.match(receipt.text, new RegExp(result.finalSha256, "u"));
  assert.match(receipt.text, /13:14:15 UTC-03:00/u);
  assert.match(receipt.text, /13:16:17 UTC-03:00/u);
  assert.match(receipt.text, /DIARIO-1/u);
  assert.ok(receipt.text.includes(VERIFICATION_URL));
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

test("Diário rejeita conclusão com CONTA_E_PIN em vez de senha reautenticada", async () => {
  const originalBytes = await createVectorPdf({ landscape: true });
  const frozenTarget = await freezeDiaryPdfSignatureTarget(originalBytes, {
    manifest: diaryManifest(3, false),
  });

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
            {
              type: "ASSINATURA_CONCLUIDA",
              occurredAt: "2026-08-19T16:14:15Z",
              participantId: PROFESSOR_PARTICIPANT_ID,
              method: "CONTA_E_PIN",
            },
            {
              type: "ASSINATURA_CONCLUIDA",
              occurredAt: "2026-08-19T16:16:17Z",
              participantId: COORDINATOR_PARTICIPANT_ID,
              method: "CONTA_E_PIN",
            },
          ],
          validation: { code: "DIARIO-1", url: VERIFICATION_URL },
        },
      }),
    /assinatura do Diário exige conclusão com senha reautenticada/i,
  );
});

test("alvo congelado rejeita página válida que diverge do manifesto do Diário", async () => {
  const originalBytes = await createVectorPdf({
    landscape: true,
    imprimirInstrucoes: true,
  });
  const frozenTarget = await freezeDiaryPdfSignatureTarget(originalBytes, {
    manifest: diaryManifest(4, true),
  });
  const forgedPage = (await inspectPdfOriginal(originalBytes)).pages[1];

  await assert.rejects(
    () =>
      applyElectronicSignatureStamps({
        originalBytes,
        frozenTarget: {
          ...frozenTarget,
          targetPageIndex: 1,
          targetPage: forgedPage,
        },
        layout: "HORIZONTAL",
        contentLayout: CONTENT_LAYOUT,
        stampPngBytes: ONE_PIXEL_PNG,
        verificationUrl: VERIFICATION_URL,
        stamps: stamps(),
      }),
    /alvo congelado diverge do manifesto semântico/i,
  );
});
