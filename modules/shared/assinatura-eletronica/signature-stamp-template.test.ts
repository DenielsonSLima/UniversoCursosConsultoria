import assert from "node:assert/strict";
import test from "node:test";

import {
  cloneElectronicSignatureStampTemplate,
  createDefaultElectronicSignatureStampTemplate,
  deriveAutomaticSignatureStampPlacements,
  getSignatureStampTemplateElementVisualBounds,
  getSignatureStampTemplateQrCollisionElementIds,
  isSignatureStampTemplateElementOptionalVisual,
  isSignatureStampTemplateElementVisible,
  isSignatureStampTemplateQrClear,
  moveSignatureStampTemplateElement,
  normalizeElectronicSignatureStampAutoLayout,
  normalizeElectronicSignatureStampTemplate,
  placeSignatureStampVerificationBelowQr,
  resizeSignatureStampTemplateElement,
  resizeSignatureStampTemplateElementFromCenter,
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

test("padrão posiciona código e URL de verificação abaixo do QR", () => {
  const template = placeSignatureStampVerificationBelowQr(
    createDefaultElectronicSignatureStampTemplate(),
  );
  const qr = template.elements.find((element) =>
    element.id === "verificationQr"
  )!;
  const code = template.elements.find((element) =>
    element.id === "verificationCode"
  )!;
  const url = template.elements.find((element) =>
    element.id === "verificationUrl"
  )!;

  assert.equal(code.binding, "VERIFICATION_CODE");
  assert.equal(url.binding, "VERIFICATION_URL");
  assert.equal(code.xBp, 71_000);
  assert.equal(code.widthBp, 29_000);
  const qrVisualBounds = getSignatureStampTemplateElementVisualBounds(qr);
  assert.ok(code.yBp >= qrVisualBounds.yBp + qrVisualBounds.heightBp);
  assert.ok(url.yBp > code.yBp + code.heightBp);
  assert.equal(url.xBp, code.xBp);
  assert.equal(url.widthBp, code.widthBp);
  assert.equal(isSignatureStampTemplateQrClear(template), true);
});

test("coluna de validação continua abaixo do QR no tamanho máximo", () => {
  const base = createDefaultElectronicSignatureStampTemplate();
  const qr = base.elements.find((element) => element.id === "verificationQr")!;
  const grownQr = resizeSignatureStampTemplateElement(qr, 40_000, 40_000);
  const template = placeSignatureStampVerificationBelowQr({
    ...base,
    elements: base.elements.map((element) =>
      element.id === "verificationQr" ? grownQr : element
    ),
  });
  const code = template.elements.find((element) =>
    element.id === "verificationCode"
  )!;
  const url = template.elements.find((element) =>
    element.id === "verificationUrl"
  )!;

  assert.equal(grownQr.widthBp, 40_000);
  const qrVisualBounds = getSignatureStampTemplateElementVisualBounds(grownQr);
  assert.equal(
    code.yBp,
    Math.round(qrVisualBounds.yBp + qrVisualBounds.heightBp + 1_000),
  );
  assert.equal(url.yBp, code.yBp + code.heightBp + 1_000);
  assert.equal(url.yBp + url.heightBp, 90_000);
  assert.equal(isSignatureStampTemplateQrClear(template), true);
});

test("somente itens visuais opcionais podem ser ocultados sem alterar a prova", () => {
  const legacyTemplate = createDefaultElectronicSignatureStampTemplate();
  const hiddenVisualTemplate = {
    ...legacyTemplate,
    hiddenElementIds: ["signerRole", "title", "divider"] as const,
  };
  const normalized = normalizeElectronicSignatureStampTemplate(
    hiddenVisualTemplate,
  );

  assert.equal(
    normalizeElectronicSignatureStampTemplate(legacyTemplate).hiddenElementIds,
    undefined,
  );
  assert.deepEqual(normalized.hiddenElementIds, [
    "signerRole",
    "title",
    "divider",
  ]);
  assert.equal(
    isSignatureStampTemplateElementVisible(normalized, "signerRole"),
    false,
  );
  assert.equal(
    isSignatureStampTemplateElementVisible(normalized, "signatureHash"),
    true,
  );
  assert.equal(
    isSignatureStampTemplateElementVisible(normalized, "title"),
    false,
  );
  assert.equal(
    isSignatureStampTemplateElementOptionalVisual("divider"),
    true,
  );
  assert.equal(
    isSignatureStampTemplateElementOptionalVisual("signatureHash"),
    false,
  );
  assert.deepEqual(
    cloneElectronicSignatureStampTemplate(normalized).hiddenElementIds,
    ["signerRole", "title", "divider"],
  );

  assert.throws(
    () =>
      normalizeElectronicSignatureStampTemplate({
        ...legacyTemplate,
        hiddenElementIds: ["signatureHash"],
      }),
    /lista de elementos ocultos/i,
  );
});

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
