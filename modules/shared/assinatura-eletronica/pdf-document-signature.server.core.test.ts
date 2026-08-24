import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";

import {
  ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE,
} from "./assinatura-eletronica.contract.ts";
import {
  applyElectronicSignatureStamps,
  type ElectronicSignatureStampTemplateV1,
  freezeDiaryPdfSignatureTarget,
  inspectPdfOriginal,
  normalizeElectronicSignatureStampTemplate,
  resolveDiarySignaturePageIndex,
} from "./pdf-document-signature.server.ts";

import {
  ONE_PIXEL_PNG,
  VERIFICATION_URL,
  PROFESSOR_VERIFICATION_CODE,
  COORDINATOR_VERIFICATION_CODE,
  PROFESSOR_SIGNATURE_HASH,
  COORDINATOR_SIGNATURE_HASH,
  THIRD_VERIFICATION_CODE,
  CONTENT_LAYOUT,
  GLOBAL_AUTO_LAYOUT,
  GLOBAL_STAMP_TEMPLATE,
  stamps,
  globalTemplateStamps,
  threeGlobalTemplateStamps,
  createVectorPdf,
  diaryManifest,
  extractPdfText,
} from "./pdf-document-signature.server.fixtures.ts";

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

test("PDF final aceita QR acima de 40% quando não existe colisão real", () => {
  const largeQrTemplate = {
    ...GLOBAL_STAMP_TEMPLATE,
    elements: GLOBAL_STAMP_TEMPLATE.elements.map((element) =>
      element.id === "verificationQr"
        ? {
          ...element,
          xBp: 50_000,
          yBp: 0,
          widthBp: 50_000,
          heightBp: 50_000,
        }
        : element
    ),
  } satisfies ElectronicSignatureStampTemplateV1;

  const normalized = normalizeElectronicSignatureStampTemplate(
    largeQrTemplate,
  );
  const qr = normalized.elements.find((element) =>
    element.id === "verificationQr"
  );

  assert.equal(qr?.widthBp, 50_000);
  assert.equal(qr?.heightBp, 50_000);
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
  assert.match(compactExtractedText, /CPF:12\*\.\*\*\*\.\*\*9-09/i);
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
    /Assinado digitalmente\s+(?:PROFESSOR|COORDENADOR)/u,
  );
  assert.doesNotMatch(
    extracted.pages[3],
    /Assinado digitalmente/i,
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
  assert.match(compactText, /ProfessoraAnaSouza/u);
  assert.doesNotMatch(pageText, /Assinante:/u);
  assert.match(compactText, /CPF:12\*\.\*\*\*\.\*\*9-09/u);
  assert.match(compactText, /13:14:15UTC-03:00/u);
  assert.match(compactText, new RegExp(PROFESSOR_SIGNATURE_HASH, "u"));
  assert.match(compactText, new RegExp(COORDINATOR_SIGNATURE_HASH, "u"));
  assert.match(compactText, new RegExp(PROFESSOR_VERIFICATION_CODE, "u"));
  assert.match(compactText, new RegExp(COORDINATOR_VERIFICATION_CODE, "u"));
  assert.match(
    compactText,
    /www\.universocc\.com\.br\/validador/u,
  );
  assert.doesNotMatch(compactText, /validador\?code=/u);
  assert.doesNotMatch(compactText, /https:\/\//u);
  assert.doesNotMatch(pageText, /validade jurídica/iu);

  const qaDirectory = process.env.SIGNATURE_PDF_QA_DIR;
  if (qaDirectory) {
    await mkdir(qaDirectory, { recursive: true });
    await writeFile(
      `${qaDirectory}/diario-template-global-tipografia.pdf`,
      result.finalBytes,
    );
  }
});

test("itens visuais opcionais podem ficar ocultos no PDF sem alterar a prova", async () => {
  const hiddenVisualTemplate = {
    ...GLOBAL_STAMP_TEMPLATE,
    hiddenElementIds: ["signerRole", "title", "divider"] as const,
  };
  const normalized = normalizeElectronicSignatureStampTemplate(
    hiddenVisualTemplate,
  );
  assert.deepEqual(normalized.hiddenElementIds, [
    "signerRole",
    "title",
    "divider",
  ]);

  const originalBytes = await createVectorPdf({ landscape: true });
  const frozenTarget = await freezeDiaryPdfSignatureTarget(originalBytes, {
    manifest: diaryManifest(3, false),
  });
  const result = await applyElectronicSignatureStamps({
    originalBytes,
    frozenTarget,
    template: hiddenVisualTemplate,
    autoLayout: GLOBAL_AUTO_LAYOUT,
    stampPngBytes: ONE_PIXEL_PNG,
    verificationUrl: VERIFICATION_URL,
    stamps: globalTemplateStamps(),
  });
  const pageText = (await extractPdfText(result.finalBytes)).pages[
    result.targetPageIndex
  ];
  const compactText = pageText.replace(/\s+/gu, "");

  assert.doesNotMatch(pageText, /\bPROFESSOR\b/u);
  assert.doesNotMatch(pageText, /\bCOORDENADOR\b/u);
  assert.doesNotMatch(
    pageText,
    new RegExp(ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE, "u"),
  );
  assert.match(compactText, new RegExp(PROFESSOR_SIGNATURE_HASH, "u"));
  assert.match(compactText, new RegExp(PROFESSOR_VERIFICATION_CODE, "u"));
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
  const styledTemplate = globalThis.structuredClone(
    GLOBAL_STAMP_TEMPLATE,
  ) as unknown as {
    elements: Array<{ style: Record<string, unknown> }>;
  };
  styledTemplate.elements[2].style.font = "HELVETICA_BOLD_OBLIQUE";
  styledTemplate.elements[2].style.fontSizeBp = 12_000;
  styledTemplate.elements[2].style.align = "RIGHT";
  styledTemplate.elements[6].style.font = "COURIER_OBLIQUE";
  styledTemplate.elements[7].style.font = "COURIER_BOLD_OBLIQUE";
  const normalizedStyled = normalizeElectronicSignatureStampTemplate(
    styledTemplate,
  );
  const normalizedTitle = normalizedStyled.elements[2];
  const normalizedHash = normalizedStyled.elements[6];
  const normalizedCode = normalizedStyled.elements[7];
  assert.equal(normalizedTitle.kind, "TEXT");
  assert.equal(normalizedHash.kind, "TEXT");
  assert.equal(normalizedCode.kind, "TEXT");
  if (
    normalizedTitle.kind !== "TEXT" || normalizedHash.kind !== "TEXT" ||
    normalizedCode.kind !== "TEXT"
  ) {
    assert.fail("O fixture tipográfico precisa apontar apenas para textos.");
  }
  assert.equal(normalizedTitle.style.font, "HELVETICA_BOLD_OBLIQUE");
  assert.equal(normalizedTitle.style.fontSizeBp, 12_000);
  assert.equal(normalizedTitle.style.align, "RIGHT");
  assert.equal(normalizedHash.style.font, "COURIER_OBLIQUE");
  assert.equal(
    normalizedCode.style.font,
    "COURIER_BOLD_OBLIQUE",
  );

  const legacySignerLabel = globalThis.structuredClone(
    GLOBAL_STAMP_TEMPLATE,
  ) as unknown as {
    elements: Array<{ style: Record<string, unknown> }>;
  };
  legacySignerLabel.elements[3].style.label = "Assinante: ";
  const normalizedLegacySigner = normalizeElectronicSignatureStampTemplate(
    legacySignerLabel,
  ).elements[3];
  assert.equal(normalizedLegacySigner.kind, "TEXT");
  if (normalizedLegacySigner.kind !== "TEXT") {
    assert.fail("O fixture legado do nome precisa continuar sendo texto.");
  }
  assert.equal(normalizedLegacySigner.style.label, "Assinante: ");

  const unsteppedFontSize = globalThis.structuredClone(
    GLOBAL_STAMP_TEMPLATE,
  ) as unknown as {
    elements: Array<{ style: Record<string, unknown> }>;
  };
  unsteppedFontSize.elements[2].style.fontSizeBp = 10_250;
  assert.throws(
    () => normalizeElectronicSignatureStampTemplate(unsteppedFontSize),
    /estilo de title.*imutável/i,
  );

  const arbitraryLabel = globalThis.structuredClone(
    GLOBAL_STAMP_TEMPLATE,
  ) as unknown as {
    elements: Array<{ style: Record<string, unknown> }>;
  };
  arbitraryLabel.elements[3].style.label = "Nome livre: ";
  assert.throws(
    () => normalizeElectronicSignatureStampTemplate(arbitraryLabel),
    /estilo de signerName.*imutável/i,
  );

  const hiddenHash = globalThis.structuredClone(
    GLOBAL_STAMP_TEMPLATE,
  ) as unknown as {
    elements: Array<{ style: Record<string, unknown> }>;
  };
  hiddenHash.elements[6].style.color = "#FFFFFF";
  assert.throws(
    () => normalizeElectronicSignatureStampTemplate(hiddenHash),
    /estilo de signatureHash.*imutável/i,
  );

  const qrOverlap = globalThis.structuredClone(
    GLOBAL_STAMP_TEMPLATE,
  ) as unknown as {
    elements: Array<Record<string, unknown>>;
  };
  // A projeção por extremos leva o quadro lógico de 35% até a borda real.
  // Em 52%, o quadrado visível ainda invade a coluna de texto; em 60%, não.
  qrOverlap.elements[9].xBp = 52_000;
  assert.throws(
    () => normalizeElectronicSignatureStampTemplate(qrOverlap),
    /quiet zone do QR individual/i,
  );

  const qrLogicalSideGutter = globalThis.structuredClone(
    GLOBAL_STAMP_TEMPLATE,
  ) as unknown as {
    elements: Array<Record<string, unknown>>;
  };
  qrLogicalSideGutter.elements[1].xBp = 65_000;
  qrLogicalSideGutter.elements[1].yBp = 3_000;
  qrLogicalSideGutter.elements[1].widthBp = 6_000;
  qrLogicalSideGutter.elements[1].heightBp = 9_000;
  const normalizedSideGutter = normalizeElectronicSignatureStampTemplate(
    qrLogicalSideGutter,
  );
  assert.equal(normalizedSideGutter.elements[1].xBp, 65_000);

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
