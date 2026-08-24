import assert from "node:assert/strict";
import test from "node:test";

import {
  cloneElectronicSignatureStampTemplate,
  createDefaultElectronicSignatureStampTemplate,
  getSignatureStampTemplateElementVisualBounds,
  isSignatureStampTemplateElementOptionalVisual,
  isSignatureStampTemplateElementVisible,
  isSignatureStampTemplateQrClear,
  moveSignatureStampTemplateElement,
  normalizeElectronicSignatureStampTemplate,
  placeSignatureStampVerificationBelowQr,
  resizeSignatureStampTemplateElement,
  updateSignatureStampTemplateFontVariant,
} from "./signature-stamp-template.ts";
import {
  ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE,
  ELECTRONIC_SIGNATURE_STAMP_TEMPLATE_FONT_SIZE_LIMITS,
} from "./assinatura-eletronica.contract.ts";

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
