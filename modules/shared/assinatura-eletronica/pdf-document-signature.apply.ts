import { StandardFonts } from "pdf-lib";
import { createLocalQrCodeDataUrl } from "../qrcode/local-qrcode.ts";
import {
  deriveAutomaticSignatureStampPlacements,
  normalizeElectronicSignatureStampAutoLayout,
} from "./signature-stamp-template.ts";
import {
  assertDocumentGeometryPreserved,
  assertFrozenTargetMatches,
  assertPng,
  calculatePdfSha256,
  inspectLoadedPdf,
  loadPdf,
} from "./pdf-document-signature.inspection.ts";
import { normalizeElectronicSignatureStampTemplate } from "./pdf-document-signature.template.ts";
import {
  prepareContentLayout,
  prepareStamps,
} from "./pdf-document-signature.validation.ts";
import { drawStamp } from "./pdf-document-signature.legacy-renderer.ts";
import { drawTemplateStamp } from "./pdf-document-signature.template-renderer.ts";
import { assertDiaryBackCoverSignaturePlacements } from "./pdf-document-signature.semantic-placement.ts";
import type {
  ApplySignatureStampsInput,
  ApplySignatureStampsResult,
} from "./pdf-document-signature.types.ts";

export const applyElectronicSignatureStamps = async (
  input: ApplySignatureStampsInput,
): Promise<ApplySignatureStampsResult> => {
  assertPng(input.stampPngBytes);
  const usesGlobalTemplate = input.template !== undefined;
  const semanticManifest = input.frozenTarget.manifest;
  const usesSemanticBackCover = semanticManifest.schemaVersion === 2;
  if (
    (usesSemanticBackCover && !usesGlobalTemplate) ||
    (usesGlobalTemplate
      ? input.layout !== undefined || input.contentLayout !== undefined ||
        (!usesSemanticBackCover && input.autoLayout === undefined)
      : (input.layout !== "HORIZONTAL" && input.layout !== "COMPACT") ||
        input.contentLayout === undefined || input.autoLayout !== undefined)
  ) {
    throw new Error(
      "O documento precisa usar exclusivamente o template global ou o layout histórico do carimbo.",
    );
  }
  const template = usesGlobalTemplate
    ? normalizeElectronicSignatureStampTemplate(input.template)
    : null;
  const autoLayout = template && input.autoLayout !== undefined
    ? normalizeElectronicSignatureStampAutoLayout(input.autoLayout)
    : null;
  const contentLayout = template
    ? null
    : prepareContentLayout(input.contentLayout!);
  const preparedStamps = prepareStamps(input.stamps, input.verificationUrl);
  if (usesSemanticBackCover) {
    assertDiaryBackCoverSignaturePlacements(
      semanticManifest,
      preparedStamps,
    );
  } else if (autoLayout) {
    const expectedPlacements = deriveAutomaticSignatureStampPlacements(
      autoLayout,
      preparedStamps.length,
    );
    preparedStamps.forEach((stamp, index) => {
      const expected = expectedPlacements[index];
      if (
        !expected ||
        stamp.placement.coordinateSpace !== expected.coordinateSpace ||
        stamp.placement.xBp !== expected.xBp ||
        stamp.placement.yBp !== expected.yBp ||
        stamp.placement.widthBp !== expected.widthBp ||
        stamp.placement.heightBp !== expected.heightBp
      ) {
        throw new Error(
          "A posição automática do carimbo diverge do template congelado.",
        );
      }
    });
  }
  const qrDataUrls: readonly string[] = await Promise.all(
    preparedStamps.map((stamp) =>
      createLocalQrCodeDataUrl(stamp.verificationUrl, {
        size: 320,
        margin: 4,
        errorCorrectionLevel: "H",
      })
    ),
  );
  const [pdf, originalSha256] = await Promise.all([
    loadPdf(input.originalBytes),
    calculatePdfSha256(input.originalBytes),
  ]);
  const inspection = inspectLoadedPdf(
    pdf,
    originalSha256,
    input.originalBytes.byteLength,
  );
  assertFrozenTargetMatches(inspection, input.frozenTarget);

  const page = pdf.getPage(input.frozenTarget.targetPageIndex);
  const [
    regularFont,
    boldFont,
    obliqueFont,
    boldObliqueFont,
    monoFont,
    monoBoldFont,
    monoObliqueFont,
    monoBoldObliqueFont,
    image,
    qrImages,
  ] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
    pdf.embedFont(StandardFonts.HelveticaOblique),
    pdf.embedFont(StandardFonts.HelveticaBoldOblique),
    pdf.embedFont(StandardFonts.Courier),
    pdf.embedFont(StandardFonts.CourierBold),
    pdf.embedFont(StandardFonts.CourierOblique),
    pdf.embedFont(StandardFonts.CourierBoldOblique),
    pdf.embedPng(Uint8Array.from(input.stampPngBytes)),
    Promise.all(qrDataUrls.map((dataUrl) => pdf.embedPng(dataUrl))),
  ]);
  preparedStamps.forEach((stamp, index) =>
    template
      ? drawTemplateStamp({
        page,
        geometry: inspection.pages[input.frozenTarget.targetPageIndex],
        stamp,
        template,
        fonts: {
          HELVETICA: regularFont,
          HELVETICA_BOLD: boldFont,
          HELVETICA_OBLIQUE: obliqueFont,
          HELVETICA_BOLD_OBLIQUE: boldObliqueFont,
          COURIER: monoFont,
          COURIER_BOLD: monoBoldFont,
          COURIER_OBLIQUE: monoObliqueFont,
          COURIER_BOLD_OBLIQUE: monoBoldObliqueFont,
        },
        image,
        qrImage: qrImages[index]!,
      })
      : drawStamp({
        page,
        geometry: inspection.pages[input.frozenTarget.targetPageIndex],
        stamp,
        layout: input.layout!,
        contentLayout: contentLayout!,
        regularFont,
        boldFont,
        monoFont,
        image,
        qrImage: qrImages[index]!,
      })
  );

  const finalBytes = await pdf.save({
    useObjectStreams: false,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });
  const [finalPdf, finalSha256] = await Promise.all([
    loadPdf(finalBytes),
    calculatePdfSha256(finalBytes),
  ]);
  if (finalSha256 === inspection.sha256) {
    throw new Error(
      "O documento final não incorporou os carimbos eletrônicos.",
    );
  }
  const finalInspection = inspectLoadedPdf(
    finalPdf,
    finalSha256,
    finalBytes.byteLength,
  );
  assertDocumentGeometryPreserved(inspection, finalInspection);
  return {
    originalSha256: inspection.sha256,
    finalSha256,
    finalBytes,
    pageCount: inspection.pageCount,
    targetPageIndex: input.frozenTarget.targetPageIndex,
    targetPage: finalInspection.pages[input.frozenTarget.targetPageIndex],
  };
};

