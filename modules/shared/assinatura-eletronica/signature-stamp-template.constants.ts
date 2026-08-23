import type {
  ElectronicSignatureStampTemplateBinding,
  ElectronicSignatureStampTemplateElement,
  ElectronicSignatureStampTemplateElementId,
  ElectronicSignatureStampTemplateFont,
  ElectronicSignatureStampTemplateHiddenElementId,
  ElectronicSignatureStampTemplateV1,
} from "./assinatura-eletronica.contract.ts";

export const SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE = 100_000;
export const SIGNATURE_STAMP_TEMPLATE_SURFACE_ASPECT_WIDTH = 19;
export const SIGNATURE_STAMP_TEMPLATE_SURFACE_ASPECT_HEIGHT = 7;

export const SIGNATURE_STAMP_TEMPLATE_ELEMENT_SPECS = [
  { id: "seal", kind: "IMAGE", binding: "STAMP_ASSET", label: null },
  { id: "signerRole", kind: "TEXT", binding: "SIGNER_ROLE", label: "" },
  { id: "title", kind: "TEXT", binding: "DISPLAY_TITLE", label: "" },
  { id: "signerName", kind: "TEXT", binding: "SIGNER_NAME", label: "" },
  { id: "signedAt", kind: "TEXT", binding: "SIGNED_AT", label: "Data: " },
  {
    id: "signerCpfMasked",
    kind: "TEXT",
    binding: "SIGNER_CPF_MASKED",
    label: "CPF: ",
  },
  {
    id: "signatureHash",
    kind: "TEXT",
    binding: "SIGNATURE_HASH",
    label: "Hash SHA-256: ",
  },
  {
    id: "verificationCode",
    kind: "TEXT",
    binding: "VERIFICATION_CODE",
    label: "Código de verificação: ",
  },
  {
    id: "verificationUrl",
    kind: "TEXT",
    binding: "VERIFICATION_URL",
    label: "Verifique em: ",
  },
  {
    id: "verificationQr",
    kind: "QR",
    binding: "VERIFICATION_URL",
    label: null,
  },
  { id: "divider", kind: "LINE", binding: "DECORATIVE", label: null },
] as const satisfies readonly {
  id: ElectronicSignatureStampTemplateElementId;
  kind: ElectronicSignatureStampTemplateElement["kind"];
  binding: ElectronicSignatureStampTemplateBinding;
  label: string | null;
}[];

export const SIGNATURE_STAMP_TEMPLATE_OPTIONAL_VISUAL_ELEMENT_IDS = [
  "signerRole",
  "title",
  "divider",
] as const satisfies readonly ElectronicSignatureStampTemplateHiddenElementId[];

const TEMPLATE_ELEMENT_NAMES: Record<
  ElectronicSignatureStampTemplateElementId,
  string
> = {
  seal: "Imagem do carimbo",
  signerRole: "Papel do signatário",
  title: "Título canônico",
  signerName: "Nome do signatário",
  signedAt: "Data e hora probatória",
  signerCpfMasked: "CPF mascarado",
  signatureHash: "Hash individual",
  verificationCode: "Código de verificação",
  verificationUrl: "URL de verificação",
  verificationQr: "QR individual",
  divider: "Linha decorativa",
};

export const isSignatureStampTemplateFontBold = (
  font: ElectronicSignatureStampTemplateFont,
) => font.includes("_BOLD");

export const isSignatureStampTemplateFontOblique = (
  font: ElectronicSignatureStampTemplateFont,
) => font.endsWith("_OBLIQUE");

export const updateSignatureStampTemplateFontVariant = (
  font: ElectronicSignatureStampTemplateFont,
  options: { bold?: boolean; oblique?: boolean },
): ElectronicSignatureStampTemplateFont => {
  const family = font.startsWith("COURIER") ? "COURIER" : "HELVETICA";
  const bold = options.bold ?? isSignatureStampTemplateFontBold(font);
  const oblique = options.oblique ?? isSignatureStampTemplateFontOblique(font);
  return `${family}${bold ? "_BOLD" : ""}${
    oblique ? "_OBLIQUE" : ""
  }` as ElectronicSignatureStampTemplateFont;
};

export const getSignatureStampTemplateElementName = (
  id: ElectronicSignatureStampTemplateElementId,
) => TEMPLATE_ELEMENT_NAMES[id];

export const cloneElectronicSignatureStampTemplate = (
  template: ElectronicSignatureStampTemplateV1,
): ElectronicSignatureStampTemplateV1 => ({
  schemaVersion: 1,
  coordinateSpace: "STAMP_TOP_LEFT_BP_V1",
  elements: template.elements.map((element) => ({
    ...element,
    style: { ...element.style },
  })) as ElectronicSignatureStampTemplateElement[],
  ...(template.hiddenElementIds
    ? { hiddenElementIds: [...template.hiddenElementIds] }
    : {}),
});

export const createDefaultElectronicSignatureStampTemplate = () => ({
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
      xBp: 71_000,
      yBp: 39_000,
      widthBp: 29_000,
      heightBp: 19_000,
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
      xBp: 71_000,
      yBp: 59_000,
      widthBp: 29_000,
      heightBp: 26_000,
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
      xBp: 65_000,
      yBp: 3_000,
      widthBp: 35_000,
      heightBp: 35_000,
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
} as const satisfies ElectronicSignatureStampTemplateV1);
