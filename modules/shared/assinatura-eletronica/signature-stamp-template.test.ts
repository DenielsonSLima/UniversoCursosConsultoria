import assert from "node:assert/strict";
import test from "node:test";

import {
  cloneElectronicSignatureStampTemplate,
  createDefaultElectronicSignatureStampTemplate,
  deriveAutomaticSignatureStampPlacements,
  getSignatureStampTemplateElementVisualBounds,
  getSignatureStampTemplateElementVisualBoundsForSurface,
  getSignatureStampTemplateQrCollisionElementIds,
  isSignatureStampTemplateElementOptionalVisual,
  isSignatureStampTemplateElementVisible,
  isSignatureStampTemplateQrClear,
  moveSignatureStampTemplateElement,
  normalizeElectronicSignatureStampAutoLayout,
  normalizeElectronicSignatureStampTemplate,
  placeSignatureStampVerificationBelowQr,
  resizeSignatureStampTemplateElement,
  SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
  templateElementsOverlap,
  updateSignatureStampTemplateFontVariant,
} from "./signature-stamp-template";
import {
  ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS,
  ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE,
  ELECTRONIC_SIGNATURE_STAMP_TEMPLATE_FONT_SIZE_LIMITS,
} from "./assinatura-eletronica.contract";

test("padrão visual usa título e nome sem prefixo", () => {
  const template = createDefaultElectronicSignatureStampTemplate();
  const title = template.elements.find((element) => element.id === "title")!;
  const signerName = template.elements.find((element) =>
    element.id === "signerName"
  )!;

  assert.equal(
    ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE,
    "Assinado digitalmente",
  );
  assert.equal(title.kind, "TEXT");
  assert.equal(signerName.kind, "TEXT");
  if (title.kind !== "TEXT" || signerName.kind !== "TEXT") return;
  assert.equal(title.style.label, "");
  assert.equal(signerName.style.label, "");
});

test("normalizador permite somente tipografia segura por família", () => {
  const template = cloneElectronicSignatureStampTemplate(
    createDefaultElectronicSignatureStampTemplate(),
  );
  const customized = {
    ...template,
    elements: template.elements.map((element) => {
      if (element.id === "title" && element.kind === "TEXT") {
        return {
          ...element,
          style: {
            ...element.style,
            font: "HELVETICA_BOLD_OBLIQUE" as const,
            fontSizeBp:
              ELECTRONIC_SIGNATURE_STAMP_TEMPLATE_FONT_SIZE_LIMITS.maxBp,
            align: "CENTER" as const,
          },
        };
      }
      if (element.id === "signatureHash" && element.kind === "TEXT") {
        return {
          ...element,
          style: {
            ...element.style,
            font: "COURIER_BOLD_OBLIQUE" as const,
            align: "RIGHT" as const,
          },
        };
      }
      return element;
    }),
  };
  const normalized = normalizeElectronicSignatureStampTemplate(customized);
  const title = normalized.elements.find((element) => element.id === "title")!;
  const hash = normalized.elements.find((element) =>
    element.id === "signatureHash"
  )!;
  assert.equal(title.kind, "TEXT");
  assert.equal(hash.kind, "TEXT");
  if (title.kind !== "TEXT" || hash.kind !== "TEXT") return;
  assert.equal(title.style.font, "HELVETICA_BOLD_OBLIQUE");
  assert.equal(title.style.fontSizeBp, 16_000);
  assert.equal(title.style.align, "CENTER");
  assert.equal(hash.style.font, "COURIER_BOLD_OBLIQUE");
  assert.equal(hash.style.align, "RIGHT");

  assert.equal(
    updateSignatureStampTemplateFontVariant("HELVETICA", {
      bold: true,
      oblique: true,
    }),
    "HELVETICA_BOLD_OBLIQUE",
  );
  assert.equal(
    updateSignatureStampTemplateFontVariant("COURIER_BOLD_OBLIQUE", {
      bold: false,
    }),
    "COURIER_OBLIQUE",
  );
});

test("normalizador rejeita tipografia fora da allowlist e campos imutáveis", () => {
  const base = cloneElectronicSignatureStampTemplate(
    createDefaultElectronicSignatureStampTemplate(),
  );
  const mutateTitleStyle = (style: Record<string, unknown>) => ({
    ...base,
    elements: base.elements.map((element) =>
      element.id === "title" && element.kind === "TEXT"
        ? { ...element, style: { ...element.style, ...style } }
        : element
    ),
  });

  for (
    const invalidTemplate of [
      mutateTitleStyle({ font: "COURIER" }),
      mutateTitleStyle({ font: "HELVETICA_BLACK" }),
      mutateTitleStyle({ fontSizeBp: 6_250 }),
      mutateTitleStyle({ fontSizeBp: 3_500 }),
      mutateTitleStyle({ fontSizeBp: 16_500 }),
      mutateTitleStyle({ align: "JUSTIFY" }),
      mutateTitleStyle({ label: "Título livre" }),
      mutateTitleStyle({ color: "#FFFFFF" }),
      mutateTitleStyle({ extra: true }),
    ]
  ) {
    assert.throws(
      () => normalizeElectronicSignatureStampTemplate(invalidTemplate),
      /inválido|imutáveis/i,
    );
  }
});

test("prefixo histórico do nome só é aceito na leitura de snapshots antigos", () => {
  const base = cloneElectronicSignatureStampTemplate(
    createDefaultElectronicSignatureStampTemplate(),
  );
  const legacy = {
    ...base,
    elements: base.elements.map((element) =>
      element.id === "signerName" && element.kind === "TEXT"
        ? {
          ...element,
          style: { ...element.style, label: "Assinante: " },
        }
        : element
    ),
  };

  assert.throws(
    () => normalizeElectronicSignatureStampTemplate(legacy),
    /imutável/i,
  );
  const historical = normalizeElectronicSignatureStampTemplate(legacy, {
    allowLegacySignerNameLabel: true,
  });
  const signerName = historical.elements.find((element) =>
    element.id === "signerName"
  )!;
  assert.equal(signerName.kind, "TEXT");
  if (signerName.kind === "TEXT") {
    assert.equal(signerName.style.label, "Assinante: ");
  }
});

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

test("coluna de validação continua abaixo do QR acima do antigo teto de 40%", () => {
  const base = createDefaultElectronicSignatureStampTemplate();
  const qr = base.elements.find((element) => element.id === "verificationQr")!;
  const grownQr = resizeSignatureStampTemplateElement(qr, 50_000, 50_000);
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

  assert.equal(grownQr.widthBp, 50_000);
  const qrVisualBounds = getSignatureStampTemplateElementVisualBounds(grownQr);
  assert.equal(
    code.yBp,
    Math.round(qrVisualBounds.yBp + qrVisualBounds.heightBp + 1_000),
  );
  assert.equal(url.yBp, code.yBp + code.heightBp + 1_000);
  assert.equal(url.yBp + url.heightBp, 100_000);
  assert.equal(isSignatureStampTemplateQrClear(template), true);
  assert.equal(
    normalizeElectronicSignatureStampTemplate(template).elements.find(
      (element) => element.id === "verificationQr",
    )?.widthBp,
    50_000,
  );
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
