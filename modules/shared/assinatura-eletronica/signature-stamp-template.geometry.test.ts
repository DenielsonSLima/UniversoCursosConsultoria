import assert from "node:assert/strict";
import test from "node:test";

import {
  cloneElectronicSignatureStampTemplate,
  createDefaultElectronicSignatureStampTemplate,
  deriveAutomaticSignatureStampPlacements,
  getSignatureStampTemplateElementVisualBounds,
  getSignatureStampTemplateElementVisualBoundsForSurface,
  getSignatureStampTemplateQrCollisionElementIds,
  isSignatureStampTemplateQrClear,
  moveSignatureStampTemplateElement,
  normalizeElectronicSignatureStampAutoLayout,
  placeSignatureStampVerificationBelowQr,
  resizeSignatureStampTemplateElement,
  SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
  templateElementsOverlap,
} from "./signature-stamp-template.ts";
import {
  ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS,
} from "./assinatura-eletronica.contract.ts";


test("o QR usa o quadrado visível para seleção e colisão", () => {
  const template = createDefaultElectronicSignatureStampTemplate();
  const qr = template.elements.find((element) =>
    element.id === "verificationQr"
  )!;
  const visualBounds = getSignatureStampTemplateElementVisualBounds(qr);

  assert.ok(visualBounds.xBp > qr.xBp);
  assert.equal(visualBounds.yBp, qr.yBp);
  assert.ok(
    Math.abs(
      visualBounds.widthBp * 19 - visualBounds.heightBp * 7,
    ) < 0.001,
  );

  const grownQr = resizeSignatureStampTemplateElement(
    qr,
    31_000,
    31_000,
  );
  const grownTemplate = placeSignatureStampVerificationBelowQr({
    ...template,
    elements: template.elements.map((element) =>
      element.id === "verificationQr" ? grownQr : element
    ),
  });

  assert.deepEqual(
    getSignatureStampTemplateQrCollisionElementIds(grownTemplate),
    [],
  );
  assert.equal(isSignatureStampTemplateQrClear(grownTemplate), true);

  const grownVisualBounds = getSignatureStampTemplateElementVisualBounds(
    grownQr,
  );
  const overlapping = {
    ...grownTemplate,
    elements: grownTemplate.elements.map((element) =>
      element.id === "signerName"
        ? {
          ...element,
          xBp: grownVisualBounds.xBp,
          yBp: grownVisualBounds.yBp,
          widthBp: 8_000,
          heightBp: 8_000,
        }
        : element
    ),
  };
  assert.deepEqual(
    getSignatureStampTemplateQrCollisionElementIds(overlapping),
    ["signerName"],
  );
  assert.equal(isSignatureStampTemplateQrClear(overlapping), false);
});

test("QR de 30% alcança as quatro bordas sem quadro invisível", () => {
  const base = createDefaultElectronicSignatureStampTemplate().elements.find(
    (element) => element.id === "verificationQr",
  )!;
  const qr = resizeSignatureStampTemplateElement(base, 30_000, 30_000);
  const atTopLeft = moveSignatureStampTemplateElement(
    qr,
    -SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
    -SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
  );
  const topLeftBounds = getSignatureStampTemplateElementVisualBounds(
    atTopLeft,
  );

  assert.equal(topLeftBounds.xBp, 0);
  assert.equal(topLeftBounds.yBp, 0);

  const atBottomRight = moveSignatureStampTemplateElement(
    atTopLeft,
    SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
    SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
  );
  const bottomRightBounds = getSignatureStampTemplateElementVisualBounds(
    atBottomRight,
  );

  assert.equal(atBottomRight.xBp, 70_000);
  assert.equal(atBottomRight.yBp, 70_000);
  assert.ok(
    Math.abs(
      bottomRightBounds.xBp + bottomRightBounds.widthBp -
        SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
    ) < 0.001,
  );
  assert.ok(
    Math.abs(
      bottomRightBounds.yBp + bottomRightBounds.heightBp -
        SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
    ) < 0.001,
  );
});

test("alça e controles +/- redimensionam o QR junto às bordas", () => {
  const base = createDefaultElectronicSignatureStampTemplate().elements.find(
    (element) => element.id === "verificationQr",
  )!;
  const qr30 = resizeSignatureStampTemplateElement(base, 30_000, 30_000);
  const atBottomRight = moveSignatureStampTemplateElement(
    qr30,
    SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
    SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
  );

  const resizedByHandle = resizeSignatureStampTemplateElement(
    atBottomRight,
    52_000,
    52_000,
  );
  const handleBounds = getSignatureStampTemplateElementVisualBounds(
    resizedByHandle,
  );
  assert.equal(resizedByHandle.widthBp, 52_000);
  assert.equal(resizedByHandle.heightBp, 52_000);
  assert.ok(
    Math.abs(
      handleBounds.xBp + handleBounds.widthBp -
        SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
    ) < 0.001,
  );
  assert.ok(
    Math.abs(
      handleBounds.yBp + handleBounds.heightBp -
        SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
    ) < 0.001,
  );

  const resizedByControl = resizeSignatureStampTemplateElement(
    resizedByHandle,
    64_000,
    64_000,
  );
  const controlBounds = getSignatureStampTemplateElementVisualBounds(
    resizedByControl,
  );
  assert.equal(resizedByControl.widthBp, 64_000);
  assert.equal(resizedByControl.heightBp, 64_000);
  assert.ok(
    Math.abs(
      controlBounds.xBp + controlBounds.widthBp -
        SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
    ) < 0.001,
  );
  assert.ok(
    Math.abs(
      controlBounds.yBp + controlBounds.heightBp -
        SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
    ) < 0.001,
  );

  const canvasLimited = resizeSignatureStampTemplateElement(
    resizedByControl,
    150_000,
    150_000,
  );
  const canvasLimitedBounds = getSignatureStampTemplateElementVisualBounds(
    canvasLimited,
  );
  assert.equal(
    canvasLimited.widthBp,
    SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
  );
  assert.equal(
    canvasLimited.heightBp,
    SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
  );
  assert.ok(canvasLimitedBounds.xBp >= 0);
  assert.ok(canvasLimitedBounds.yBp >= 0);
  assert.ok(
    canvasLimitedBounds.xBp + canvasLimitedBounds.widthBp <=
      SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
  );
  assert.ok(
    canvasLimitedBounds.yBp + canvasLimitedBounds.heightBp <=
      SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
  );
});

test("mover ou redimensionar o QR não altera código nem URL", () => {
  const template = cloneElectronicSignatureStampTemplate(
    createDefaultElectronicSignatureStampTemplate(),
  );
  const qrIndex = template.elements.findIndex((element) =>
    element.id === "verificationQr"
  );
  const baseline = cloneElectronicSignatureStampTemplate(template);
  const codeBefore = baseline.elements.find((element) =>
    element.id === "verificationCode"
  )!;
  const urlBefore = baseline.elements.find((element) =>
    element.id === "verificationUrl"
  )!;
  const resizedQr = resizeSignatureStampTemplateElement(
    moveSignatureStampTemplateElement(
      template.elements[qrIndex]!,
      8_000,
      6_000,
    ),
    30_000,
    30_000,
  );
  const edited = {
    ...template,
    elements: template.elements.map((element, index) =>
      index === qrIndex ? resizedQr : element
    ),
  };

  assert.deepEqual(
    edited.elements.find((element) => element.id === "verificationCode"),
    codeBefore,
  );
  assert.deepEqual(
    edited.elements.find((element) => element.id === "verificationUrl"),
    urlBefore,
  );
});

test("editor e PDF compartilham a mesma projeção quadrada do QR", () => {
  const base = createDefaultElectronicSignatureStampTemplate().elements.find(
    (element) => element.id === "verificationQr",
  )!;
  const qr = moveSignatureStampTemplateElement(
    resizeSignatureStampTemplateElement(base, 30_000, 30_000),
    SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
    SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
  );
  const editorBounds = getSignatureStampTemplateElementVisualBounds(qr);
  const pdfBounds = getSignatureStampTemplateElementVisualBoundsForSurface(
    qr,
    38,
    14,
  );

  for (const field of ["xBp", "yBp", "widthBp", "heightBp"] as const) {
    assert.ok(
      Math.abs(pdfBounds[field] - editorBounds[field]) < 0.001,
      `${field} deve manter a mesma projeção no editor e no PDF`,
    );
  }
  assert.ok(
    Math.abs(pdfBounds.widthBp * 38 - pdfBounds.heightBp * 14) < 0.001,
  );
  assert.ok(
    Math.abs(
      pdfBounds.xBp + pdfBounds.widthBp -
        SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
    ) < 0.001,
  );
  assert.ok(
    Math.abs(
      pdfBounds.yBp + pdfBounds.heightBp -
        SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
    ) < 0.001,
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
