import type {
  ElectronicSignatureStampAutoLayoutV1,
  ElectronicSignatureStampContentLayout,
  ElectronicSignatureStampCoordinateSpace,
  ElectronicSignatureStampLayout,
  ElectronicSignatureStampTemplateFont as SharedElectronicSignatureStampTemplateFont,
} from "./assinatura-eletronica.contract.ts";
import type { DiaryPdfSemanticManifest } from "./diary-pdf-semantic-manifest.ts";
import type {
  SignatureStampPdfBox,
  SignatureStampPdfPageGeometry,
} from "./signature-stamp-placement.ts";

export interface InspectedPdfPage extends SignatureStampPdfPageGeometry {
  pageIndex: number;
  pageNumber: number;
  mediaBox: SignatureStampPdfBox;
  visibleWidth: number;
  visibleHeight: number;
}

export interface InspectedPdfDocument {
  sha256: string;
  byteLength: number;
  pageCount: number;
  pages: readonly InspectedPdfPage[];
}

export interface FrozenPdfSignatureTarget {
  originalSha256: string;
  pageCount: number;
  semanticTarget: "DIARIO_LAST_CONTENT_PAGE" | "DIARIO_BACK_COVER";
  manifest: DiaryPdfSemanticManifest;
  targetPageIndex: number;
  targetPage: InspectedPdfPage;
}

export interface AppliedSignatureStampPlacement {
  coordinateSpace: ElectronicSignatureStampCoordinateSpace;
  xBp: number;
  yBp: number;
  widthBp: number;
  heightBp: number;
}

export interface AppliedSignatureStamp {
  role: string;
  participantId: string;
  signerName: string;
  signerCpfMasked: string;
  signedAt: string;
  timeZone: string;
  signatureEventId: string;
  signatureHash: string;
  verificationCode: string;
  verificationUrl: string;
  placement: AppliedSignatureStampPlacement;
}

export type ElectronicSignatureStampTemplateFont =
  SharedElectronicSignatureStampTemplateFont;

export type ElectronicSignatureStampTemplateTextAlign =
  | "LEFT"
  | "CENTER"
  | "RIGHT";

export type ElectronicSignatureStampTemplateBinding =
  | "STAMP_ASSET"
  | "SIGNER_ROLE"
  | "DISPLAY_TITLE"
  | "SIGNER_NAME"
  | "SIGNED_AT"
  | "SIGNER_CPF_MASKED"
  | "SIGNATURE_HASH"
  | "VERIFICATION_CODE"
  | "VERIFICATION_URL"
  | "DECORATIVE";

interface ElectronicSignatureStampTemplateElementBase {
  id: string;
  kind: "IMAGE" | "TEXT" | "QR" | "LINE";
  binding: ElectronicSignatureStampTemplateBinding;
  xBp: number;
  yBp: number;
  widthBp: number;
  heightBp: number;
}

export interface ElectronicSignatureStampTemplateTextElement
  extends ElectronicSignatureStampTemplateElementBase {
  kind: "TEXT";
  binding: Exclude<
    ElectronicSignatureStampTemplateBinding,
    "STAMP_ASSET" | "DECORATIVE"
  >;
  style: {
    font: ElectronicSignatureStampTemplateFont;
    fontSizeBp: number;
    color: string;
    align: ElectronicSignatureStampTemplateTextAlign;
    label: string;
  };
}

export interface ElectronicSignatureStampTemplateImageElement
  extends ElectronicSignatureStampTemplateElementBase {
  id: "seal";
  kind: "IMAGE";
  binding: "STAMP_ASSET";
  style: { fit: "CONTAIN"; opacityBp: number };
}

export interface ElectronicSignatureStampTemplateQrElement
  extends ElectronicSignatureStampTemplateElementBase {
  id: "verificationQr";
  kind: "QR";
  binding: "VERIFICATION_URL";
  style: { quietZoneModules: 4 };
}

export interface ElectronicSignatureStampTemplateLineElement
  extends ElectronicSignatureStampTemplateElementBase {
  id: "divider";
  kind: "LINE";
  binding: "DECORATIVE";
  style: { color: string; widthBp: number };
}

export type ElectronicSignatureStampTemplateElement =
  | ElectronicSignatureStampTemplateTextElement
  | ElectronicSignatureStampTemplateImageElement
  | ElectronicSignatureStampTemplateQrElement
  | ElectronicSignatureStampTemplateLineElement;

export type ElectronicSignatureStampTemplateHiddenElementId =
  | "signerRole"
  | "title"
  | "divider";

export interface ElectronicSignatureStampTemplateV1 {
  schemaVersion: 1;
  coordinateSpace: "STAMP_TOP_LEFT_BP_V1";
  elements: readonly ElectronicSignatureStampTemplateElement[];
  hiddenElementIds?: readonly ElectronicSignatureStampTemplateHiddenElementId[];
}

export interface ApplySignatureStampsInput {
  originalBytes: Uint8Array;
  frozenTarget: FrozenPdfSignatureTarget;
  layout?: ElectronicSignatureStampLayout;
  contentLayout?: ElectronicSignatureStampContentLayout;
  template?: ElectronicSignatureStampTemplateV1;
  autoLayout?: ElectronicSignatureStampAutoLayoutV1;
  stampPngBytes: Uint8Array;
  verificationUrl: string;
  stamps: readonly AppliedSignatureStamp[];
}

export interface ApplySignatureStampsResult {
  originalSha256: string;
  finalSha256: string;
  finalBytes: Uint8Array;
  pageCount: number;
  targetPageIndex: number;
  targetPage: InspectedPdfPage;
}

export interface PreparedSignatureStamp extends AppliedSignatureStamp {
  formattedSignedAt: string;
}
