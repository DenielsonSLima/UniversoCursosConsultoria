import assert from "node:assert/strict";
import test from "node:test";

import {
  cloneElectronicSignatureStampTemplate,
  createDefaultElectronicSignatureStampTemplate,
  deriveAutomaticSignatureStampPlacements,
  isSignatureStampTemplateQrClear,
  moveSignatureStampTemplateElement,
  normalizeElectronicSignatureStampAutoLayout,
  normalizeElectronicSignatureStampTemplate,
  resizeSignatureStampTemplateElement,
  templateElementsOverlap,
} from "./signature-stamp-template";
import {
  ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS,
} from "./assinatura-eletronica.contract";

test("template global preserva bindings probatórios ao mover e redimensionar", () => {
  const template = createDefaultElectronicSignatureStampTemplate();
  const seal = template.elements.find((element) => element.id === "seal")!;
  const signerName = template.elements.find((element) =>
    element.id === "signerName"
  )!;
  const divider = template.elements.find((element) =>
    element.id === "divider"
  )!;
  const qr = template.elements.find((element) =>
    element.id === "verificationQr"
  )!;

  const movedSeal = moveSignatureStampTemplateElement(seal, 3_000, -2_000);
  const resizedText = resizeSignatureStampTemplateElement(
    signerName,
    52_000,
    10_000,
  );
  const movedLine = moveSignatureStampTemplateElement(divider, 1_000, 1_000);
  const resizedQr = resizeSignatureStampTemplateElement(qr, 30_000, 27_000);

  assert.equal(movedSeal.binding, "STAMP_ASSET");
  assert.equal(resizedText.binding, "SIGNER_NAME");
  assert.equal(movedLine.binding, "DECORATIVE");
  assert.equal(resizedQr.binding, "VERIFICATION_URL");
  assert.equal(resizedQr.widthBp, resizedQr.heightBp);
  assert.equal(resizedQr.widthBp, 29_000);
});

test("normalizador rejeita QR sobreposto, mas não modifica outros campos", () => {
  const template = cloneElectronicSignatureStampTemplate(
    createDefaultElectronicSignatureStampTemplate(),
  );
  const qrIndex = template.elements.findIndex((element) =>
    element.id === "verificationQr"
  );
  const name = template.elements.find((element) =>
    element.id === "signerName"
  )!;
  const overlapping = cloneElectronicSignatureStampTemplate(template);
  const qr = overlapping.elements[qrIndex]!;
  const qrOverlap = {
    ...overlapping,
    elements: overlapping.elements.map((element, index) => (
      index === qrIndex ? { ...qr, xBp: name.xBp, yBp: name.yBp } : element
    )),
  };

  assert.equal(isSignatureStampTemplateQrClear(qrOverlap), false);
  assert.throws(
    () => normalizeElectronicSignatureStampTemplate(qrOverlap),
    /quiet zone do QR individual/i,
  );
  assert.equal(
    normalizeElectronicSignatureStampTemplate(template).elements.length,
    11,
  );

  const hiddenProof = {
    ...template,
    elements: template.elements.map((element) => (
      element.id === "signatureHash"
        ? { ...element, style: { ...element.style, color: "#FFFFFF" } }
        : element
    )),
  };
  assert.throws(
    () => normalizeElectronicSignatureStampTemplate(hiddenProof),
    /estilo de signatureHash.*imutável/i,
  );
});

test("um modelo global gera blocos neutros para N signatários sem sobreposição", () => {
  const layout = normalizeElectronicSignatureStampAutoLayout({
    ...ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS,
  });
  const placements = deriveAutomaticSignatureStampPlacements(
    layout,
    layout.maxSigners,
  );

  assert.equal(placements.length, layout.maxSigners);
  for (let left = 0; left < placements.length; left += 1) {
    for (let right = left + 1; right < placements.length; right += 1) {
      assert.equal(
        templateElementsOverlap(placements[left], placements[right]),
        false,
      );
    }
  }
  assert.throws(
    () =>
      deriveAutomaticSignatureStampPlacements(layout, layout.maxSigners + 1),
    /capacidade segura/i,
  );
});
