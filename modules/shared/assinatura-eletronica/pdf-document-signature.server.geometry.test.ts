import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";

import {
  type AppliedSignatureStamp,
  applyElectronicSignatureStamps,
  freezeDiaryPdfSignatureTarget,
  inspectPdfOriginal,
} from "./pdf-document-signature.server.ts";

import {
  ONE_PIXEL_PNG,
  VERIFICATION_URL,
  PROFESSOR_VERIFICATION_CODE,
  COORDINATOR_VERIFICATION_CODE,
  COORDINATOR_VERIFICATION_URL,
  PROFESSOR_SIGNATURE_HASH,
  COORDINATOR_SIGNATURE_HASH,
  CONTENT_LAYOUT,
  stamps,
  createVectorPdf,
  diaryManifest,
  extractPdfText,
} from "./pdf-document-signature.server.fixtures.ts";

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
        /Assinado digitalmente/i,
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

  assert.match(compactExtractedText, /CPF:12\*[.]\*{3}[.]\*{2}9-09/u);
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
