import {
  concatTransformationMatrix,
  PDFDocument,
  type PDFFont,
  type PDFPage,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  StandardFonts,
} from "pdf-lib";

import type {
  ElectronicSignatureStampAutoLayoutV1,
  ElectronicSignatureStampContentLayout,
  ElectronicSignatureStampCoordinateSpace,
  ElectronicSignatureStampLayout,
} from "./assinatura-eletronica.contract.ts";
import {
  ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS,
  ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_LIMITS,
  ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE,
} from "./assinatura-eletronica.contract.ts";
import {
  getSignatureStampVisiblePageSize,
  SIGNATURE_STAMP_COORDINATE_SCALE,
  SIGNATURE_STAMP_MAX_HEIGHT_BP,
  SIGNATURE_STAMP_MAX_WIDTH_BP,
  SIGNATURE_STAMP_MIN_HEIGHT_BP,
  SIGNATURE_STAMP_MIN_WIDTH_BP,
  type SignatureStampPdfBox,
  type SignatureStampPdfPageGeometry,
  type SignatureStampPdfRotation,
  signatureStampPlacementToVisibleBottomLeftRect,
  signatureStampVisibleSpaceToPdfMatrix,
} from "./signature-stamp-placement.ts";
import {
  createDiaryPdfSemanticManifest,
  type DiaryPdfSemanticManifest,
  resolveDiarySignaturePageIndex,
} from "./diary-pdf-semantic-manifest.ts";
import { createLocalQrCodeDataUrl } from "../qrcode/local-qrcode.ts";
import {
  createDefaultElectronicSignatureStampTemplate,
  deriveAutomaticSignatureStampPlacements,
  normalizeElectronicSignatureStampAutoLayout,
} from "./signature-stamp-template.ts";

export { resolveDiarySignaturePageIndex } from "./diary-pdf-semantic-manifest.ts";

const PDF_MAX_BYTES = 50 * 1024 * 1024;
const PDF_MAX_PAGES = 500;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const MASKED_CPF_PATTERN = /^\*{3}[.]\*{3}[.]\*{3}-\d{2}$/u;
const SIGNED_AT_WITH_SECONDS_PATTERN =
  /T\d{2}:\d{2}:\d{2}(?:[.]\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const STAMP_ROLE_LABELS: Record<string, string> = {
  PROFESSOR: "Professor",
  COORDENADOR: "Coordenador de curso",
};
const STAMP_ROLE_CHIPS: Record<string, string> = {
  PROFESSOR: "PROFESSOR",
  COORDENADOR: "COORDENADOR",
};

const stampRoleLabel = (role: string) => STAMP_ROLE_LABELS[role] || role;
const stampRoleChip = (role: string) => STAMP_ROLE_CHIPS[role] || role;

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
  semanticTarget: "DIARIO_LAST_CONTENT_PAGE";
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
  /** Papel congelado no participante; não participa do layout do template. */
  role: string;
  /** Identificador imutável do participante, usado para cruzar o comprovante. */
  participantId: string;
  signerName: string;
  /** CPF minimizado e autorizado pelo backend; o compositor nunca recebe CPF integral. */
  signerCpfMasked: string;
  signedAt: string;
  timeZone: string;
  /** Evento ASSINATURA_CONCLUIDA que originou esta prova individual. */
  signatureEventId: string;
  /** SHA-256 canônico do evento individual na cadeia de evidências. */
  signatureHash: string;
  /** Código público opaco, sempre derivado do identificador do evento. */
  verificationCode: string;
  /** URL pública individual, codificada pelo QR deste carimbo. */
  verificationUrl: string;
  placement: AppliedSignatureStampPlacement;
}

export type ElectronicSignatureStampTemplateFont =
  | "HELVETICA"
  | "HELVETICA_BOLD"
  | "COURIER";

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
  /** Coordenadas inteiras no canvas normalizado STAMP_TOP_LEFT_BP_V1. */
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
    /** Escala pela altura da instância final. */
    fontSizeBp: number;
    color: string;
    align: ElectronicSignatureStampTemplateTextAlign;
    /** Prefixo canônico fechado por id; nunca é texto livre do editor. */
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

/**
 * Um único desenho global, reutilizado por todas as instâncias/signatários.
 * Somente posição e dimensões são configuráveis; bindings e estilos são
 * canônicos. Os valores probatórios vêm do evento congelado e nunca são
 * persistidos como texto do modelo.
 */
export interface ElectronicSignatureStampTemplateV1 {
  schemaVersion: 1;
  coordinateSpace: "STAMP_TOP_LEFT_BP_V1";
  elements: readonly ElectronicSignatureStampTemplateElement[];
}

export interface ApplySignatureStampsInput {
  originalBytes: Uint8Array;
  frozenTarget: FrozenPdfSignatureTarget;
  /** Histórico v1/v2. É mutuamente exclusivo com `template`. */
  layout?: ElectronicSignatureStampLayout;
  /** Histórico v1/v2. É mutuamente exclusivo com `template`. */
  contentLayout?: ElectronicSignatureStampContentLayout;
  /** Editor global v5 / geometria congelada v3. */
  template?: ElectronicSignatureStampTemplateV1;
  /** Regra neutra congelada que distribui o mesmo template por participante. */
  autoLayout?: ElectronicSignatureStampAutoLayoutV1;
  stampPngBytes: Uint8Array;
  /** URL canônica resolvida e autorizada pelo adaptador server-side. */
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

const assertPdfSize = (bytes: Uint8Array) => {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new Error("O PDF original não foi informado.");
  }
  if (bytes.byteLength > PDF_MAX_BYTES) {
    throw new Error("O PDF original excede o limite de 50 MiB.");
  }
};

const bytesContainAscii = (bytes: Uint8Array, value: string) => {
  const pattern = new TextEncoder().encode(value);
  outer: for (
    let index = 0;
    index <= bytes.length - pattern.length;
    index += 1
  ) {
    for (let offset = 0; offset < pattern.length; offset += 1) {
      if (bytes[index + offset] !== pattern[offset]) continue outer;
    }
    return true;
  }
  return false;
};

const assertPdfHasNoExistingCryptographicSignature = (bytes: Uint8Array) => {
  if (
    bytesContainAscii(bytes, "/ByteRange") ||
    bytesContainAscii(bytes, "/Type/Sig") ||
    bytesContainAscii(bytes, "/Type /Sig")
  ) {
    throw new Error(
      "O PDF original já contém assinatura criptográfica e não pode ser regravado por este compositor.",
    );
  }
};

const loadPdf = async (bytes: Uint8Array) => {
  assertPdfSize(bytes);
  assertPdfHasNoExistingCryptographicSignature(bytes);
  try {
    return await PDFDocument.load(Uint8Array.from(bytes), {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
  } catch (error) {
    throw new Error(
      "O PDF original está corrompido, criptografado ou não é suportado.",
      {
        cause: error,
      },
    );
  }
};

export const calculatePdfSha256 = async (bytes: Uint8Array) => {
  const stableBuffer = Uint8Array.from(bytes).buffer;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", stableBuffer);
  return Array.from(
    new Uint8Array(digest),
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
};

const toBox = (
  box: { x: number; y: number; width: number; height: number },
  label: string,
): SignatureStampPdfBox => {
  const normalized = {
    x: Number(box.x),
    y: Number(box.y),
    width: Number(box.width),
    height: Number(box.height),
  };
  if (
    Object.values(normalized).some((value) => !Number.isFinite(value)) ||
    normalized.width <= 0 ||
    normalized.height <= 0
  ) {
    throw new Error(`${label} do PDF é inválida.`);
  }
  return normalized;
};

const normalizeRotation = (value: number): SignatureStampPdfRotation => {
  const normalized = ((Math.round(value) % 360) + 360) % 360;
  if (
    normalized !== 0 && normalized !== 90 && normalized !== 180 &&
    normalized !== 270
  ) {
    throw new Error("A rotação da página do PDF não é suportada.");
  }
  return normalized;
};

const inspectLoadedPdf = (
  pdf: PDFDocument,
  sha256: string,
  byteLength: number,
): InspectedPdfDocument => {
  const pageCount = pdf.getPageCount();
  if (pageCount < 1 || pageCount > PDF_MAX_PAGES) {
    throw new Error(`O PDF precisa ter entre 1 e ${PDF_MAX_PAGES} páginas.`);
  }
  const pages = pdf.getPages().map((page, pageIndex): InspectedPdfPage => {
    const mediaBox = toBox(page.getMediaBox(), "A MediaBox");
    const cropBox = toBox(page.getCropBox(), "A CropBox");
    const tolerance = 0.001;
    if (
      cropBox.x < mediaBox.x - tolerance ||
      cropBox.y < mediaBox.y - tolerance ||
      cropBox.x + cropBox.width > mediaBox.x + mediaBox.width + tolerance ||
      cropBox.y + cropBox.height > mediaBox.y + mediaBox.height + tolerance
    ) {
      throw new Error(
        `A CropBox da página ${pageIndex + 1} excede a MediaBox.`,
      );
    }
    const rotationDegrees = normalizeRotation(page.getRotation().angle);
    const visible = getSignatureStampVisiblePageSize({
      cropBox,
      rotationDegrees,
    });
    return {
      pageIndex,
      pageNumber: pageIndex + 1,
      mediaBox,
      cropBox,
      rotationDegrees,
      visibleWidth: visible.width,
      visibleHeight: visible.height,
    };
  });
  return { sha256, byteLength, pageCount, pages };
};

export const inspectPdfOriginal = async (
  bytes: Uint8Array,
): Promise<InspectedPdfDocument> => {
  const [pdf, sha256] = await Promise.all([
    loadPdf(bytes),
    calculatePdfSha256(bytes),
  ]);
  return inspectLoadedPdf(pdf, sha256, bytes.byteLength);
};

export const freezeDiaryPdfSignatureTarget = async (
  originalBytes: Uint8Array,
  options: { manifest: DiaryPdfSemanticManifest },
): Promise<FrozenPdfSignatureTarget> => {
  const inspection = await inspectPdfOriginal(originalBytes);
  const manifest = createDiaryPdfSemanticManifest(options.manifest);
  const targetPageIndex = resolveDiarySignaturePageIndex({
    pageCount: inspection.pageCount,
    manifest,
  });
  return {
    originalSha256: inspection.sha256,
    pageCount: inspection.pageCount,
    semanticTarget: "DIARIO_LAST_CONTENT_PAGE",
    manifest,
    targetPageIndex,
    targetPage: inspection.pages[targetPageIndex],
  };
};

const assertBoxEquals = (
  actual: SignatureStampPdfBox,
  expected: SignatureStampPdfBox,
) => {
  const keys = ["x", "y", "width", "height"] as const;
  return keys.every((key) => Math.abs(actual[key] - expected[key]) <= 0.001);
};

const assertFrozenTargetMatches = (
  inspection: InspectedPdfDocument,
  frozen: FrozenPdfSignatureTarget,
) => {
  const expectedHash = String(frozen.originalSha256 || "").trim().toLowerCase();
  if (
    !SHA256_PATTERN.test(expectedHash) || inspection.sha256 !== expectedHash
  ) {
    throw new Error("O hash do PDF original diverge do documento congelado.");
  }
  if (
    frozen.semanticTarget !== "DIARIO_LAST_CONTENT_PAGE" ||
    frozen.pageCount !== inspection.pageCount ||
    !Number.isInteger(frozen.targetPageIndex) ||
    frozen.targetPageIndex < 0 ||
    frozen.targetPageIndex >= inspection.pageCount
  ) {
    throw new Error(
      "A página semântica congelada do Diário não corresponde ao PDF original.",
    );
  }
  const semanticTargetPageIndex = resolveDiarySignaturePageIndex({
    pageCount: inspection.pageCount,
    manifest: frozen.manifest,
  });
  if (semanticTargetPageIndex !== frozen.targetPageIndex) {
    throw new Error(
      "O alvo congelado diverge do manifesto semântico do Diário.",
    );
  }
  const actual = inspection.pages[frozen.targetPageIndex];
  const expected = frozen.targetPage;
  if (
    expected.pageIndex !== actual.pageIndex ||
    expected.pageNumber !== actual.pageNumber ||
    expected.rotationDegrees !== actual.rotationDegrees ||
    !assertBoxEquals(actual.mediaBox, expected.mediaBox) ||
    !assertBoxEquals(actual.cropBox, expected.cropBox)
  ) {
    throw new Error("A geometria da página congelada diverge do PDF original.");
  }
};

const assertDocumentGeometryPreserved = (
  original: InspectedPdfDocument,
  finalDocument: InspectedPdfDocument,
) => {
  if (original.pageCount !== finalDocument.pageCount) {
    throw new Error(
      "O documento final alterou a quantidade de páginas do PDF original.",
    );
  }
  original.pages.forEach((page, pageIndex) => {
    const finalPage = finalDocument.pages[pageIndex];
    if (
      !finalPage ||
      page.rotationDegrees !== finalPage.rotationDegrees ||
      !assertBoxEquals(page.mediaBox, finalPage.mediaBox) ||
      !assertBoxEquals(page.cropBox, finalPage.cropBox)
    ) {
      throw new Error(
        `O documento final alterou a geometria da página ${pageIndex + 1}.`,
      );
    }
  });
};

const assertPng = (bytes: Uint8Array) => {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength < PNG_SIGNATURE.length ||
    PNG_SIGNATURE.some((value, index) => bytes[index] !== value)
  ) {
    throw new Error(
      "A imagem configurada para o carimbo precisa ser um PNG válido.",
    );
  }
};

const STAMP_TEMPLATE_COORDINATE_SCALE = 100_000;
const STAMP_TEMPLATE_COLOR_PATTERN = /^#[0-9A-F]{6}$/u;
const STAMP_TEMPLATE_ELEMENT_SPECS = [
  { id: "seal", kind: "IMAGE", binding: "STAMP_ASSET", label: null },
  { id: "signerRole", kind: "TEXT", binding: "SIGNER_ROLE", label: "" },
  { id: "title", kind: "TEXT", binding: "DISPLAY_TITLE", label: "" },
  {
    id: "signerName",
    kind: "TEXT",
    binding: "SIGNER_NAME",
    label: "Assinante: ",
  },
  {
    id: "signedAt",
    kind: "TEXT",
    binding: "SIGNED_AT",
    label: "Data: ",
  },
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
] as const;

const asTemplateRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const hasExactTemplateKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
) => {
  const keys = Object.keys(value);
  return keys.length === expected.length &&
    keys.every((key) => expected.includes(key));
};

const hasCanonicalTemplateStyle = (
  candidate: Record<string, unknown>,
  canonical: Record<string, unknown>,
) => (
  hasExactTemplateKeys(candidate, Object.keys(canonical)) &&
  Object.entries(canonical).every(([key, value]) => candidate[key] === value)
);

const templateRectsOverlap = (
  left: Pick<
    ElectronicSignatureStampTemplateElementBase,
    "xBp" | "yBp" | "widthBp" | "heightBp"
  >,
  right: Pick<
    ElectronicSignatureStampTemplateElementBase,
    "xBp" | "yBp" | "widthBp" | "heightBp"
  >,
) =>
  left.xBp < right.xBp + right.widthBp &&
  left.xBp + left.widthBp > right.xBp &&
  left.yBp < right.yBp + right.heightBp &&
  left.yBp + left.heightBp > right.yBp;

/**
 * Normalizador autoritativo compartilhado pelo compositor e pela Edge. O
 * contrato é fechado para impedir textos arbitrários, bindings trocados e
 * sobreposição da quiet zone do QR.
 */
export const normalizeElectronicSignatureStampTemplate = (
  value: unknown,
): ElectronicSignatureStampTemplateV1 => {
  const source = asTemplateRecord(value);
  if (
    !source ||
    !hasExactTemplateKeys(source, [
      "schemaVersion",
      "coordinateSpace",
      "elements",
    ]) ||
    source.schemaVersion !== 1 ||
    source.coordinateSpace !== "STAMP_TOP_LEFT_BP_V1" ||
    !Array.isArray(source.elements) ||
    source.elements.length !== STAMP_TEMPLATE_ELEMENT_SPECS.length
  ) {
    throw new Error("O template global do carimbo eletrônico é inválido.");
  }

  const canonicalElements = createDefaultElectronicSignatureStampTemplate()
    .elements;
  const elements = source.elements.map((candidate, index) => {
    const element = asTemplateRecord(candidate);
    const spec = STAMP_TEMPLATE_ELEMENT_SPECS[index];
    const canonicalElement = canonicalElements[index];
    if (
      !canonicalElement || !element ||
      !hasExactTemplateKeys(element, [
        "id",
        "kind",
        "binding",
        "xBp",
        "yBp",
        "widthBp",
        "heightBp",
        "style",
      ]) ||
      element.id !== spec.id ||
      element.kind !== spec.kind ||
      element.binding !== spec.binding
    ) {
      throw new Error(
        `O elemento ${index + 1} do template global do carimbo é inválido.`,
      );
    }
    const xBp = Number(element.xBp);
    const yBp = Number(element.yBp);
    const widthBp = Number(element.widthBp);
    const heightBp = Number(element.heightBp);
    if (
      !Number.isInteger(element.xBp) || !Number.isInteger(element.yBp) ||
      !Number.isInteger(element.widthBp) ||
      !Number.isInteger(element.heightBp) ||
      xBp < 0 || yBp < 0 || widthBp <= 0 || heightBp <= 0 ||
      xBp + widthBp > STAMP_TEMPLATE_COORDINATE_SCALE ||
      yBp + heightBp > STAMP_TEMPLATE_COORDINATE_SCALE
    ) {
      throw new Error(
        `As coordenadas de ${spec.id} no template global são inválidas.`,
      );
    }
    const style = asTemplateRecord(element.style);
    if (!style) {
      throw new Error(`O estilo de ${spec.id} no template global é inválido.`);
    }
    if (
      !hasCanonicalTemplateStyle(
        style,
        canonicalElement.style as Record<string, unknown>,
      )
    ) {
      throw new Error(`O estilo de ${spec.id} no template global é imutável.`);
    }
    if (
      (spec.kind === "IMAGE" && (widthBp < 5_000 || heightBp < 5_000)) ||
      (spec.kind === "QR" &&
        (widthBp !== heightBp || widthBp < 29_000 || widthBp > 40_000)) ||
      (spec.kind === "LINE" && widthBp < 5_000)
    ) {
      throw new Error(
        `A geometria de ${spec.id} no template global é inválida.`,
      );
    }
    return {
      id: spec.id,
      kind: spec.kind,
      binding: spec.binding,
      xBp,
      yBp,
      widthBp,
      heightBp,
      style: { ...style },
    } as ElectronicSignatureStampTemplateElement;
  });

  const qr = elements[9];
  if (
    qr.kind !== "QR" || elements.some((element, index) => (
      index !== 9 && templateRectsOverlap(qr, element)
    ))
  ) {
    throw new Error(
      "A quiet zone do QR individual se sobrepõe a outro elemento do template.",
    );
  }

  return {
    schemaVersion: 1,
    coordinateSpace: "STAMP_TOP_LEFT_BP_V1",
    elements,
  };
};

const assertSafeSingleLine = (
  value: string,
  label: string,
  maximumLength: number,
) => {
  const normalized = String(value || "").trim().replace(/\s+/gu, " ");
  const hasControlCharacter = Array.from(normalized).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
  if (!normalized || normalized.length > maximumLength || hasControlCharacter) {
    throw new Error(`${label} do carimbo é inválido.`);
  }
  return normalized;
};

const validateCanonicalVerificationUrl = (rawUrl: string) => {
  const normalized = assertSafeSingleLine(rawUrl, "A URL de verificação", 500);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("A URL de verificação do carimbo é inválida.");
  }
  const parameters = [...url.searchParams.entries()];
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== "/validador" ||
    parameters.length !== 1 ||
    parameters[0][0] !== "code" ||
    !parameters[0][1] ||
    url.toString() !== normalized
  ) {
    throw new Error(
      "A URL de verificação do carimbo não corresponde ao validador público.",
    );
  }
  return url.toString();
};

const prepareIndividualVerification = (
  stamp: AppliedSignatureStamp,
  documentVerificationUrl: string,
) => {
  const signatureEventId = assertSafeSingleLine(
    stamp.signatureEventId,
    "O identificador do evento de assinatura",
    36,
  ).toLowerCase();
  if (!UUID_PATTERN.test(signatureEventId)) {
    throw new Error(
      "O identificador do evento individual do carimbo é inválido.",
    );
  }
  const verificationCode = assertSafeSingleLine(
    stamp.verificationCode,
    "O código individual de verificação",
    40,
  );
  const expectedVerificationCode = `SIG-${signatureEventId.toUpperCase()}`;
  if (verificationCode !== expectedVerificationCode) {
    throw new Error(
      "O código individual do carimbo diverge do evento de assinatura.",
    );
  }
  const verificationUrl = validateCanonicalVerificationUrl(
    stamp.verificationUrl,
  );
  const individualUrl = new URL(verificationUrl);
  const documentUrl = new URL(documentVerificationUrl);
  if (
    individualUrl.origin !== documentUrl.origin ||
    individualUrl.pathname !== documentUrl.pathname ||
    individualUrl.searchParams.get("code") !== verificationCode
  ) {
    throw new Error(
      "A URL individual do carimbo diverge da validação pública autorizada.",
    );
  }
  return { signatureEventId, verificationCode, verificationUrl };
};

const assertPlacement = (stamp: AppliedSignatureStamp) => {
  const placement = stamp.placement;
  const values = [
    placement.xBp,
    placement.yBp,
    placement.widthBp,
    placement.heightBp,
  ];
  if (
    placement.coordinateSpace !== "PAGE_TOP_LEFT_BP_V1" ||
    values.some((value) => !Number.isInteger(value)) ||
    placement.widthBp < SIGNATURE_STAMP_MIN_WIDTH_BP ||
    placement.widthBp > SIGNATURE_STAMP_MAX_WIDTH_BP ||
    placement.heightBp < SIGNATURE_STAMP_MIN_HEIGHT_BP ||
    placement.heightBp > SIGNATURE_STAMP_MAX_HEIGHT_BP ||
    placement.xBp < 0 ||
    placement.yBp < 0 ||
    placement.xBp + placement.widthBp > SIGNATURE_STAMP_COORDINATE_SCALE ||
    placement.yBp + placement.heightBp > SIGNATURE_STAMP_COORDINATE_SCALE
  ) {
    throw new Error(
      `A posição do carimbo de ${stampRoleLabel(stamp.role)} é inválida.`,
    );
  }
};

export const formatSignatureStampDateTime = (
  signedAt: string,
  timeZone: string,
) => {
  if (!SIGNED_AT_WITH_SECONDS_PATTERN.test(String(signedAt || ""))) {
    throw new Error(
      "A data da assinatura precisa conter segundos e offset explícito.",
    );
  }
  const instant = new Date(signedAt);
  if (Number.isNaN(instant.getTime())) {
    throw new Error("A data da assinatura é inválida.");
  }
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    throw new Error("O fuso horário da assinatura é inválido.");
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  const displayedUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMinutes = Math.round((displayedUtc - instant.getTime()) / 60_000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const offsetRemainder = String(absoluteOffset % 60).padStart(2, "0");
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second} UTC${sign}${offsetHours}:${offsetRemainder} (${timeZone})`;
};

const assertFontCanEncode = (font: PDFFont, text: string, label: string) => {
  try {
    font.encodeText(text);
  } catch {
    throw new Error(
      `${label} contém caracteres incompatíveis com a fonte vetorial do carimbo.`,
    );
  }
};

const resolveFittedTextSize = (
  font: PDFFont,
  text: string,
  options: {
    maxWidth: number;
    maximumSize: number;
    minimumSize: number;
    label: string;
  },
) => {
  assertFontCanEncode(font, text, options.label);
  let size = options.maximumSize;
  while (
    size > options.minimumSize &&
    font.widthOfTextAtSize(text, size) > options.maxWidth
  ) {
    size = Math.max(options.minimumSize, size - 0.2);
  }
  if (font.widthOfTextAtSize(text, size) > options.maxWidth) {
    throw new Error(
      `${options.label} não cabe integralmente na área configurada do carimbo.`,
    );
  }
  return size;
};

const drawFittedText = (
  page: PDFPage,
  font: PDFFont,
  text: string,
  options: {
    x: number;
    y: number;
    maxWidth: number;
    maximumSize: number;
    minimumSize: number;
    color: ReturnType<typeof rgb>;
    label: string;
  },
) => {
  const size = resolveFittedTextSize(font, text, options);
  page.drawText(text, {
    x: options.x,
    y: options.y,
    size,
    font,
    color: options.color,
  });
};

type SignatureStampIcon =
  | "PERSON"
  | "IDENTITY"
  | "CALENDAR"
  | "HASH"
  | "SHIELD"
  | "GLOBE";

const STAMP_NAVY = rgb(0.031, 0.157, 0.275);
const STAMP_BLUE = rgb(0.114, 0.306, 0.847);
const STAMP_TEXT = rgb(0.059, 0.09, 0.165);
const STAMP_MUTED = rgb(0.278, 0.333, 0.412);
const STAMP_RULE = rgb(0.796, 0.835, 0.882);
const STAMP_WHITE = rgb(1, 1, 1);

const toPathNumber = (value: number) => Number(value.toFixed(3));

/**
 * `drawSvgPath` preserva a borda como geometria PDF. O eixo Y do path SVG é
 * descendente, por isso o ponto de ancoragem é o topo do retângulo.
 */
const roundedRectanglePath = (
  width: number,
  height: number,
  radius: number,
) => {
  const w = toPathNumber(width);
  const h = toPathNumber(height);
  const r = toPathNumber(Math.min(radius, width / 2, height / 2));
  return [
    `M ${r} 0`,
    `L ${toPathNumber(w - r)} 0`,
    `C ${w} 0 ${w} 0 ${w} ${r}`,
    `L ${w} ${toPathNumber(h - r)}`,
    `C ${w} ${h} ${w} ${h} ${toPathNumber(w - r)} ${h}`,
    `L ${r} ${h}`,
    `C 0 ${h} 0 ${h} 0 ${toPathNumber(h - r)}`,
    `L 0 ${r}`,
    `C 0 0 0 0 ${r} 0`,
    "Z",
  ].join(" ");
};

const drawRoundedRectangle = (
  page: PDFPage,
  options: {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
    color?: ReturnType<typeof rgb>;
    borderColor?: ReturnType<typeof rgb>;
    borderWidth?: number;
  },
) => {
  page.drawSvgPath(
    roundedRectanglePath(options.width, options.height, options.radius),
    {
      x: options.x,
      y: options.y + options.height,
      color: options.color,
      borderColor: options.borderColor,
      borderWidth: options.borderWidth,
    },
  );
};

const drawStampIcon = (
  page: PDFPage,
  icon: SignatureStampIcon,
  x: number,
  y: number,
  size: number,
) => {
  const stroke = Math.max(0.45, size * 0.075);
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const line = (
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ) =>
    page.drawLine({
      start: { x: startX, y: startY },
      end: { x: endX, y: endY },
      thickness: stroke,
      color: STAMP_NAVY,
    });

  switch (icon) {
    case "PERSON":
      page.drawCircle({
        x: centerX,
        y: y + size * 0.72,
        size: size * 0.17,
        color: STAMP_NAVY,
      });
      page.drawSvgPath("M 0 4 C 0 1.3 1.8 0 4 0 C 6.2 0 8 1.3 8 4", {
        x: x + size * 0.08,
        y: y + size * 0.48,
        scale: size / 9,
        borderColor: STAMP_NAVY,
        borderWidth: stroke,
      });
      return;
    case "IDENTITY":
      page.drawRectangle({
        x: x + size * 0.08,
        y: y + size * 0.13,
        width: size * 0.84,
        height: size * 0.7,
        borderColor: STAMP_NAVY,
        borderWidth: stroke,
      });
      page.drawCircle({
        x: x + size * 0.31,
        y: y + size * 0.5,
        size: size * 0.1,
        borderColor: STAMP_NAVY,
        borderWidth: stroke,
      });
      line(x + size * 0.5, y + size * 0.59, x + size * 0.82, y + size * 0.59);
      line(x + size * 0.5, y + size * 0.4, x + size * 0.76, y + size * 0.4);
      return;
    case "CALENDAR":
      page.drawRectangle({
        x: x + size * 0.1,
        y: y + size * 0.08,
        width: size * 0.8,
        height: size * 0.74,
        borderColor: STAMP_NAVY,
        borderWidth: stroke,
      });
      line(x + size * 0.1, y + size * 0.57, x + size * 0.9, y + size * 0.57);
      line(x + size * 0.3, y + size * 0.72, x + size * 0.3, y + size * 0.94);
      line(x + size * 0.7, y + size * 0.72, x + size * 0.7, y + size * 0.94);
      page.drawCircle({
        x: centerX,
        y: y + size * 0.32,
        size: stroke,
        color: STAMP_BLUE,
      });
      return;
    case "HASH":
      line(x + size * 0.32, y + size * 0.08, x + size * 0.42, y + size * 0.92);
      line(x + size * 0.62, y + size * 0.08, x + size * 0.72, y + size * 0.92);
      line(x + size * 0.08, y + size * 0.38, x + size * 0.9, y + size * 0.38);
      line(x + size * 0.12, y + size * 0.68, x + size * 0.94, y + size * 0.68);
      return;
    case "SHIELD":
      page.drawSvgPath(
        "M 4 0 L 8 1.5 L 8 4.7 C 8 7 6.4 8.8 4 10 C 1.6 8.8 0 7 0 4.7 L 0 1.5 Z",
        {
          x: x + size * 0.1,
          y: y + size * 0.96,
          scale: size / 10,
          borderColor: STAMP_NAVY,
          borderWidth: stroke,
        },
      );
      line(x + size * 0.31, y + size * 0.5, x + size * 0.45, y + size * 0.35);
      line(x + size * 0.45, y + size * 0.35, x + size * 0.72, y + size * 0.66);
      return;
    case "GLOBE":
      page.drawCircle({
        x: centerX,
        y: centerY,
        size: size * 0.43,
        borderColor: STAMP_NAVY,
        borderWidth: stroke,
      });
      page.drawEllipse({
        x: centerX,
        y: centerY,
        xScale: size * 0.2,
        yScale: size * 0.43,
        borderColor: STAMP_NAVY,
        borderWidth: stroke,
      });
      line(x + size * 0.08, centerY, x + size * 0.92, centerY);
  }
};

const drawLabeledStampLine = (
  page: PDFPage,
  options: {
    icon: SignatureStampIcon;
    iconX: number;
    y: number;
    iconSize: number;
    textX: number;
    maxWidth: number;
    label: string;
    value: string;
    labelFont: PDFFont;
    valueFont: PDFFont;
    maximumSize: number;
    minimumSize: number;
    color: ReturnType<typeof rgb>;
    errorLabel: string;
  },
) => {
  assertFontCanEncode(options.labelFont, options.label, options.errorLabel);
  assertFontCanEncode(options.valueFont, options.value, options.errorLabel);
  const gap = 1.8;
  let size = options.maximumSize;
  const widthAtSize = (candidate: number) =>
    options.labelFont.widthOfTextAtSize(options.label, candidate) + gap +
    options.valueFont.widthOfTextAtSize(options.value, candidate);
  while (size > options.minimumSize && widthAtSize(size) > options.maxWidth) {
    size = Math.max(options.minimumSize, size - 0.2);
  }
  if (widthAtSize(size) > options.maxWidth) {
    throw new Error(
      `${options.errorLabel} não cabe integralmente na área configurada do carimbo.`,
    );
  }
  drawStampIcon(
    page,
    options.icon,
    options.iconX,
    options.y - options.iconSize * 0.18,
    options.iconSize,
  );
  page.drawText(options.label, {
    x: options.textX,
    y: options.y,
    size,
    font: options.labelFont,
    color: options.color,
  });
  page.drawText(options.value, {
    x: options.textX +
      options.labelFont.widthOfTextAtSize(options.label, size) + gap,
    y: options.y,
    size,
    font: options.valueFont,
    color: options.color,
  });
};

const prepareContentLayout = (
  contentLayout: ElectronicSignatureStampContentLayout,
) => {
  if (!contentLayout || typeof contentLayout !== "object") {
    throw new Error("A distribuição interna do carimbo não foi informada.");
  }
  const keys = [
    "sealScalePercent",
    "lineSpacingPercent",
    "qrScalePercent",
  ] as const;
  keys.forEach((key) => {
    const value = contentLayout[key];
    const limit = ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_LIMITS[key];
    if (
      !Number.isInteger(value) || value < limit.min || value > limit.max ||
      value % limit.step !== 0
    ) {
      throw new Error(`O ajuste ${key} do carimbo é inválido.`);
    }
  });
  return { ...contentLayout };
};

const toPlacementContract = (stamp: AppliedSignatureStamp) => ({
  pageTarget: "LAST_PAGE" as const,
  coordinateSpace: stamp.placement.coordinateSpace,
  xBp: stamp.placement.xBp,
  yBp: stamp.placement.yBp,
  widthBp: stamp.placement.widthBp,
  heightBp: stamp.placement.heightBp,
});

const prepareStamps = (
  stamps: readonly AppliedSignatureStamp[],
  verificationUrl: string,
) => {
  if (
    !Array.isArray(stamps) || stamps.length < 1 ||
    stamps.length > ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS.maxSigners
  ) {
    throw new Error(
      "A quantidade de carimbos excede a capacidade segura do modelo global.",
    );
  }
  stamps.forEach(assertPlacement);
  for (let leftIndex = 0; leftIndex < stamps.length; leftIndex += 1) {
    const left = toPlacementContract(stamps[leftIndex]);
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < stamps.length;
      rightIndex += 1
    ) {
      const right = toPlacementContract(stamps[rightIndex]);
      if (
        left.xBp < right.xBp + right.widthBp &&
        left.xBp + left.widthBp > right.xBp &&
        left.yBp < right.yBp + right.heightBp &&
        left.yBp + left.heightBp > right.yBp
      ) {
        throw new Error("Os carimbos automáticos não podem se sobrepor.");
      }
    }
  }
  const canonicalVerificationUrl = validateCanonicalVerificationUrl(
    verificationUrl,
  );
  const prepared = stamps.map((stamp) => ({
    ...stamp,
    role: assertSafeSingleLine(stamp.role, "O papel do signatário", 80),
    participantId: (() => {
      if (!UUID_PATTERN.test(stamp.participantId)) {
        throw new Error(
          "O identificador do participante do carimbo é inválido.",
        );
      }
      return stamp.participantId;
    })(),
    signerName: assertSafeSingleLine(
      stamp.signerName,
      "O nome do signatário",
      160,
    ),
    signerCpfMasked: assertSafeSingleLine(
      stamp.signerCpfMasked,
      "O CPF mascarado do signatário",
      14,
    ),
    signatureHash: assertSafeSingleLine(
      stamp.signatureHash,
      "O hash individual da assinatura",
      64,
    ).toLowerCase(),
    ...prepareIndividualVerification(stamp, canonicalVerificationUrl),
    formattedSignedAt: formatSignatureStampDateTime(
      stamp.signedAt,
      stamp.timeZone,
    ),
  })) as Array<AppliedSignatureStamp & { formattedSignedAt: string }>;
  prepared.forEach((stamp) => {
    if (!MASKED_CPF_PATTERN.test(stamp.signerCpfMasked)) {
      throw new Error(
        "O CPF do carimbo precisa permanecer mascarado no formato ***.***.***-NN.",
      );
    }
    if (!SHA256_PATTERN.test(stamp.signatureHash)) {
      throw new Error("O hash individual da assinatura é inválido.");
    }
  });
  if (
    new Set(prepared.map((stamp) => stamp.signatureEventId)).size !==
      prepared.length ||
    new Set(prepared.map((stamp) => stamp.signatureHash)).size !==
      prepared.length ||
    new Set(prepared.map((stamp) => stamp.verificationCode)).size !==
      prepared.length ||
    new Set(prepared.map((stamp) => stamp.verificationUrl)).size !==
      prepared.length
  ) {
    throw new Error(
      "Cada carimbo precisa possuir prova e validação públicas individuais.",
    );
  }
  return prepared;
};

const drawStamp = ({
  page,
  geometry,
  stamp,
  layout,
  contentLayout,
  regularFont,
  boldFont,
  monoFont,
  image,
  qrImage,
}: {
  page: PDFPage;
  geometry: InspectedPdfPage;
  stamp: AppliedSignatureStamp & { formattedSignedAt: string };
  layout: ElectronicSignatureStampLayout;
  contentLayout: ElectronicSignatureStampContentLayout;
  regularFont: PDFFont;
  boldFont: PDFFont;
  monoFont: PDFFont;
  image: Awaited<ReturnType<PDFDocument["embedPng"]>>;
  qrImage: Awaited<ReturnType<PDFDocument["embedPng"]>>;
}) => {
  const placement = toPlacementContract(stamp);
  const rect = signatureStampPlacementToVisibleBottomLeftRect(
    placement,
    geometry,
  );
  const matrix = signatureStampVisibleSpaceToPdfMatrix(geometry);
  const compact = layout === "COMPACT";
  const narrow = rect.width < 220;
  const padding = Math.max(
    narrow ? 2.8 : 3.4,
    Math.min(5.5, rect.height * 0.055, rect.width * 0.014),
  );
  const borderRadius = Math.max(3.5, Math.min(6, rect.height * 0.07));
  const innerBorderInset = Math.max(1.6, Math.min(2.4, rect.height * 0.025));
  const roleChipHeight = Math.max(
    narrow ? 6 : 7.2,
    Math.min(narrow ? 7.2 : 8.8, rect.height * 0.105),
  );
  const sealBaseSize = Math.min(
    rect.height * (narrow ? 0.5 : compact ? 0.56 : 0.57),
    rect.width * (narrow ? 0.12 : compact ? 0.145 : 0.15),
  );
  const sealSize = sealBaseSize * contentLayout.sealScalePercent / 100;
  const sealMaximum = rect.height - padding * 2 - roleChipHeight - 2;
  if (sealSize < (narrow ? 14 : 20) || sealSize > sealMaximum) {
    throw new Error(
      `O selo do carimbo de ${
        stampRoleLabel(stamp.role)
      } excede a área segura.`,
    );
  }
  const qrBaseSize = Math.min(
    rect.height * (narrow ? 0.45 : compact ? 0.54 : 0.57),
    rect.width * (narrow ? 0.12 : compact ? 0.14 : 0.15),
  );
  const qrSize = qrBaseSize * contentLayout.qrScalePercent / 100;
  const qrCaptionHeight = Math.max(6.4, Math.min(7.5, rect.height * 0.085));
  const qrMaximum = rect.height - padding * 2 - qrCaptionHeight;
  if (qrSize < (narrow ? 17 : 20) || qrSize > qrMaximum) {
    throw new Error(
      `O QR individual do carimbo de ${
        stampRoleLabel(stamp.role)
      } excede a área segura.`,
    );
  }

  const roleChipText = stampRoleChip(stamp.role);
  const roleChipTextSize = Math.max(
    narrow ? 3 : 3.8,
    Math.min(narrow ? 3.7 : 4.5, roleChipHeight * 0.5),
  );
  const roleChipWidth = Math.max(
    narrow ? 26 : 37,
    boldFont.widthOfTextAtSize(roleChipText, roleChipTextSize) +
      (narrow ? 4 : 8),
  );
  const sealColumnWidth = Math.max(sealSize, roleChipWidth);
  const sealX = rect.x + padding + (sealColumnWidth - sealSize) / 2;
  const sealAreaBottom = rect.y + padding + roleChipHeight + 2;
  const sealAreaHeight = rect.height - padding * 2 - roleChipHeight - 2;
  const sealY = sealAreaBottom + (sealAreaHeight - sealSize) / 2;
  const roleChipX = rect.x + padding + (sealColumnWidth - roleChipWidth) / 2;
  const roleChipY = rect.y + padding;

  const qrX = rect.x + rect.width - padding - qrSize;
  const qrY = rect.y + padding + qrCaptionHeight;
  const dividerX = qrX - padding * 0.8;
  const iconX = rect.x + padding + sealColumnWidth + padding;
  const iconSize = Math.max(
    narrow ? 4.5 : 5.8,
    Math.min(narrow ? 5.2 : 7.2, rect.height * 0.082),
  );
  const textX = iconX + iconSize + (narrow ? 1.6 : 2.4);
  const textRight = dividerX - padding * 0.8;
  const textWidth = textRight - textX;
  const titleWidth = textRight - iconX;
  if (textWidth < (narrow ? 88 : 105) || titleWidth < (narrow ? 94 : 115)) {
    throw new Error(
      `O carimbo de ${
        stampRoleLabel(stamp.role)
      } não possui largura segura para os dados e o QR individual.`,
    );
  }
  const titleSize = resolveFittedTextSize(
    boldFont,
    ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE,
    {
      maxWidth: titleWidth,
      maximumSize: narrow
        ? Math.max(5.6, Math.min(6.4, rect.height * 0.08))
        : Math.max(7.4, Math.min(9, rect.height * 0.105)),
      minimumSize: narrow ? 4.8 : 5.8,
      label: "O título visual do carimbo",
    },
  );
  const titleX = iconX + (
        titleWidth - boldFont.widthOfTextAtSize(
          ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE,
          titleSize,
        )
      ) / 2;
  const titleY = rect.y + rect.height - padding - titleSize;
  const titleRuleY = titleY - Math.max(3, titleSize * 0.42);
  const firstLineY = titleRuleY - Math.max(7.1, rect.height * 0.085);
  const minimumTextBottom = rect.y + padding + 1.5;
  const lineSpacingBase = Math.min(
    7.3,
    (firstLineY - minimumTextBottom) / (5.5 * 1.05),
  );
  const lineStep = lineSpacingBase * contentLayout.lineSpacingPercent / 100;
  const lastLineY = firstLineY - lineStep * 5.5;
  const minimumLineStep = narrow || rect.height < 65 ? 4.8 : 5.6;
  if (lineStep < minimumLineStep || lastLineY < minimumTextBottom) {
    throw new Error(
      `O espaçamento das linhas do carimbo de ${
        stampRoleLabel(stamp.role)
      } não é legível.`,
    );
  }

  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(
      matrix.a,
      matrix.b,
      matrix.c,
      matrix.d,
      matrix.e,
      matrix.f,
    ),
  );
  drawRoundedRectangle(page, {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    radius: borderRadius,
    color: STAMP_WHITE,
    borderColor: STAMP_NAVY,
    borderWidth: 1.05,
  });
  drawRoundedRectangle(page, {
    x: rect.x + innerBorderInset,
    y: rect.y + innerBorderInset,
    width: rect.width - innerBorderInset * 2,
    height: rect.height - innerBorderInset * 2,
    radius: Math.max(2, borderRadius - innerBorderInset),
    borderColor: STAMP_BLUE,
    borderWidth: 0.35,
  });

  const sealCenterX = sealX + sealSize / 2;
  const sealCenterY = sealY + sealSize / 2;
  page.drawCircle({
    x: sealCenterX,
    y: sealCenterY,
    size: sealSize / 2,
    color: STAMP_WHITE,
    borderColor: STAMP_NAVY,
    borderWidth: Math.max(0.7, sealSize * 0.018),
  });
  page.drawCircle({
    x: sealCenterX,
    y: sealCenterY,
    size: sealSize * 0.43,
    borderColor: STAMP_BLUE,
    borderWidth: Math.max(0.35, sealSize * 0.009),
  });
  const sealImageSize = sealSize * 0.7;
  page.drawImage(image, {
    x: sealCenterX - sealImageSize / 2,
    y: sealCenterY - sealImageSize / 2,
    width: sealImageSize,
    height: sealImageSize,
  });
  drawRoundedRectangle(page, {
    x: roleChipX,
    y: roleChipY,
    width: roleChipWidth,
    height: roleChipHeight,
    radius: roleChipHeight / 2,
    color: STAMP_NAVY,
  });
  page.drawText(roleChipText, {
    x: roleChipX + (
          roleChipWidth - boldFont.widthOfTextAtSize(
            roleChipText,
            roleChipTextSize,
          )
        ) / 2,
    y: roleChipY + (roleChipHeight - roleChipTextSize) / 2 + 0.6,
    size: roleChipTextSize,
    font: boldFont,
    color: STAMP_WHITE,
  });

  page.drawLine({
    start: { x: dividerX, y: rect.y + padding },
    end: {
      x: dividerX,
      y: rect.y + rect.height - padding,
    },
    thickness: 0.45,
    color: STAMP_RULE,
  });
  page.drawRectangle({
    x: qrX - 0.8,
    y: qrY - 0.8,
    width: qrSize + 1.6,
    height: qrSize + 1.6,
    color: STAMP_WHITE,
  });
  page.drawImage(qrImage, {
    x: qrX,
    y: qrY,
    width: qrSize,
    height: qrSize,
  });
  const stackedQrCaption = qrSize < 36;
  const qrCaptionLines = stackedQrCaption
    ? ["VALIDAÇÃO", "INDIVIDUAL"]
    : ["VALIDAÇÃO INDIVIDUAL"];
  const qrCaptionSize = Math.min(
    ...qrCaptionLines.map((line) =>
      resolveFittedTextSize(boldFont, line, {
        maxWidth: qrSize + padding,
        maximumSize: stackedQrCaption ? 2.9 : 3.7,
        minimumSize: stackedQrCaption ? 2.4 : 3.1,
        label: "A legenda do QR individual",
      })
    ),
  );
  qrCaptionLines.forEach((line, index) => {
    page.drawText(line, {
      x: qrX + (
            qrSize - boldFont.widthOfTextAtSize(line, qrCaptionSize)
          ) / 2,
      y: rect.y + padding + (qrCaptionLines.length - index - 1) *
          (qrCaptionSize + 0.2) +
        0.5,
      size: qrCaptionSize,
      font: boldFont,
      color: STAMP_NAVY,
    });
  });

  page.drawText(ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE, {
    x: titleX,
    y: titleY,
    size: titleSize,
    font: boldFont,
    color: STAMP_NAVY,
  });
  const titleRuleCenter = iconX + titleWidth / 2;
  page.drawLine({
    start: { x: iconX, y: titleRuleY },
    end: { x: titleRuleCenter - 3, y: titleRuleY },
    thickness: 0.45,
    color: STAMP_NAVY,
  });
  page.drawCircle({
    x: titleRuleCenter,
    y: titleRuleY,
    size: 1.05,
    color: STAMP_BLUE,
  });
  page.drawLine({
    start: { x: titleRuleCenter + 3, y: titleRuleY },
    end: { x: textRight, y: titleRuleY },
    thickness: 0.45,
    color: STAMP_NAVY,
  });

  drawLabeledStampLine(page, {
    icon: "PERSON",
    iconX,
    y: firstLineY,
    iconSize,
    textX,
    maxWidth: textWidth,
    label: "Assinante:",
    value: stamp.signerName,
    labelFont: boldFont,
    valueFont: regularFont,
    maximumSize: Math.min(6.8, lineStep * 0.9),
    minimumSize: narrow ? 3.8 : 4.8,
    color: STAMP_TEXT,
    errorLabel: "O nome do signatário",
  });
  drawLabeledStampLine(page, {
    icon: "IDENTITY",
    iconX,
    y: firstLineY - lineStep * 0.95,
    iconSize,
    textX,
    maxWidth: textWidth,
    label: "CPF:",
    value: stamp.signerCpfMasked,
    labelFont: boldFont,
    valueFont: regularFont,
    maximumSize: Math.min(5.7, lineStep * 0.78),
    minimumSize: narrow ? 3.6 : 4.5,
    color: STAMP_MUTED,
    errorLabel: "O CPF mascarado do signatário",
  });
  const visibleSignedAt = stamp.formattedSignedAt.replace(
    /\s+\([^)]*\)$/u,
    "",
  );
  drawLabeledStampLine(page, {
    icon: "CALENDAR",
    iconX,
    y: firstLineY - lineStep * 1.9,
    iconSize,
    textX,
    maxWidth: textWidth,
    label: "Data:",
    value: visibleSignedAt,
    labelFont: boldFont,
    valueFont: regularFont,
    maximumSize: Math.min(5.35, lineStep * 0.74),
    minimumSize: narrow ? 3.6 : 4.5,
    color: STAMP_MUTED,
    errorLabel: "A data da assinatura",
  });
  drawLabeledStampLine(page, {
    icon: "HASH",
    iconX,
    y: firstLineY - lineStep * 2.95,
    iconSize,
    textX,
    maxWidth: textWidth,
    label: "SHA-256:",
    value: stamp.signatureHash.slice(0, 32),
    labelFont: boldFont,
    valueFont: monoFont,
    maximumSize: Math.min(4.8, lineStep * 0.66),
    minimumSize: narrow ? 3.4 : 4.5,
    color: STAMP_TEXT,
    errorLabel: "O hash individual da assinatura",
  });
  const minimumTechnicalSize = narrow ? 3.4 : 4.5;
  const hashLabelWidth = boldFont.widthOfTextAtSize(
    "SHA-256:",
    minimumTechnicalSize,
  ) + 1.8;
  drawFittedText(page, monoFont, stamp.signatureHash.slice(32), {
    x: textX + hashLabelWidth,
    y: firstLineY - lineStep * 3.57,
    maxWidth: textWidth - hashLabelWidth,
    maximumSize: Math.min(4.8, lineStep * 0.66),
    minimumSize: minimumTechnicalSize,
    color: STAMP_TEXT,
    label: "A continuação do hash individual da assinatura",
  });
  drawLabeledStampLine(page, {
    icon: "SHIELD",
    iconX,
    y: firstLineY - lineStep * 4.55,
    iconSize,
    textX,
    maxWidth: textWidth,
    label: "SIG:",
    value: stamp.verificationCode,
    labelFont: boldFont,
    valueFont: monoFont,
    maximumSize: Math.min(4.7, lineStep * 0.65),
    minimumSize: narrow ? 3.3 : 4.5,
    color: STAMP_BLUE,
    errorLabel: "O código individual de verificação",
  });
  const publicValidatorUrl = new URL(stamp.verificationUrl);
  drawLabeledStampLine(page, {
    icon: "GLOBE",
    iconX,
    y: firstLineY - lineStep * 5.5,
    iconSize,
    textX,
    maxWidth: textWidth,
    label: "Verifique em:",
    value: `https://${publicValidatorUrl.host}${publicValidatorUrl.pathname}`,
    labelFont: boldFont,
    valueFont: regularFont,
    maximumSize: Math.min(4.7, lineStep * 0.65),
    minimumSize: narrow ? 3.4 : 4.3,
    color: STAMP_BLUE,
    errorLabel: "A URL individual de verificação",
  });
  page.pushOperators(popGraphicsState());
};

interface TemplateStampFonts {
  HELVETICA: PDFFont;
  HELVETICA_BOLD: PDFFont;
  COURIER: PDFFont;
}

interface TemplateStampRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const templateHexColorToRgb = (value: string) => {
  if (!STAMP_TEMPLATE_COLOR_PATTERN.test(value)) {
    throw new Error("A cor do elemento do template global é inválida.");
  }
  return rgb(
    Number.parseInt(value.slice(1, 3), 16) / 255,
    Number.parseInt(value.slice(3, 5), 16) / 255,
    Number.parseInt(value.slice(5, 7), 16) / 255,
  );
};

const templateElementToVisibleRect = (
  stampRect: SignatureStampPdfBox,
  element: ElectronicSignatureStampTemplateElement,
): TemplateStampRect => {
  const x = stampRect.x +
    stampRect.width * element.xBp / STAMP_TEMPLATE_COORDINATE_SCALE;
  const top = stampRect.y + stampRect.height -
    stampRect.height * element.yBp / STAMP_TEMPLATE_COORDINATE_SCALE;
  const width = stampRect.width * element.widthBp /
    STAMP_TEMPLATE_COORDINATE_SCALE;
  const height = stampRect.height * element.heightBp /
    STAMP_TEMPLATE_COORDINATE_SCALE;
  return { x, y: top - height, width, height };
};

const templateTextLines = (
  element: ElectronicSignatureStampTemplateTextElement,
  stamp: AppliedSignatureStamp & { formattedSignedAt: string },
) => {
  const label = element.style.label;
  switch (element.binding) {
    case "SIGNER_ROLE":
      return [stampRoleChip(stamp.role)];
    case "DISPLAY_TITLE":
      return [ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE];
    case "SIGNER_NAME":
      return [`${label}${stamp.signerName}`];
    case "SIGNED_AT": {
      const visibleSignedAt = stamp.formattedSignedAt.replace(
        /\s+\([^)]*\)$/u,
        "",
      );
      return [`${label}${visibleSignedAt}`];
    }
    case "SIGNER_CPF_MASKED":
      return [`${label}${stamp.signerCpfMasked}`];
    case "SIGNATURE_HASH":
      return [
        `${label}${stamp.signatureHash.slice(0, 32)}`,
        stamp.signatureHash.slice(32),
      ];
    case "VERIFICATION_CODE":
      return [`${label}${stamp.verificationCode}`];
    case "VERIFICATION_URL": {
      const url = new URL(stamp.verificationUrl);
      return [
        `${label}${url.origin}${url.pathname}`,
        `?${url.searchParams.toString()}`,
      ];
    }
  }
};

const resolveTemplateTextSize = (
  font: PDFFont,
  lines: readonly string[],
  elementRect: TemplateStampRect,
  configuredSize: number,
  label: string,
) => {
  const minimumSize = 3.2;
  if (configuredSize < minimumSize) {
    throw new Error(`${label} ficou menor que o limite físico de leitura.`);
  }
  lines.forEach((line) => assertFontCanEncode(font, line, label));
  let size = configuredSize;
  const fits = (candidate: number) => {
    const lineHeight = candidate * 1.14;
    return lines.length * lineHeight <= elementRect.height + 0.001 &&
      lines.every((line) =>
        font.widthOfTextAtSize(line, candidate) <= elementRect.width + 0.001
      );
  };
  while (size > minimumSize && !fits(size)) {
    size = Math.max(minimumSize, size - 0.1);
  }
  if (!fits(size)) {
    throw new Error(
      `${label} não cabe integralmente no elemento configurado do carimbo.`,
    );
  }
  return size;
};

const drawTemplateText = (
  page: PDFPage,
  stampRect: SignatureStampPdfBox,
  element: ElectronicSignatureStampTemplateTextElement,
  stamp: AppliedSignatureStamp & { formattedSignedAt: string },
  fonts: TemplateStampFonts,
) => {
  const rect = templateElementToVisibleRect(stampRect, element);
  const font = fonts[element.style.font];
  const lines = templateTextLines(element, stamp);
  const configuredSize = stampRect.height * element.style.fontSizeBp /
    STAMP_TEMPLATE_COORDINATE_SCALE;
  const size = resolveTemplateTextSize(
    font,
    lines,
    rect,
    configuredSize,
    `O texto ${element.id}`,
  );
  const lineHeight = size * 1.14;
  const firstBaseline = rect.y + rect.height - size;
  lines.forEach((line, index) => {
    const lineWidth = font.widthOfTextAtSize(line, size);
    const x = element.style.align === "CENTER"
      ? rect.x + (rect.width - lineWidth) / 2
      : element.style.align === "RIGHT"
      ? rect.x + rect.width - lineWidth
      : rect.x;
    page.drawText(line, {
      x,
      y: firstBaseline - lineHeight * index,
      size,
      font,
      color: templateHexColorToRgb(element.style.color),
    });
  });
};

const drawTemplateStamp = ({
  page,
  geometry,
  stamp,
  template,
  fonts,
  image,
  qrImage,
}: {
  page: PDFPage;
  geometry: InspectedPdfPage;
  stamp: AppliedSignatureStamp & { formattedSignedAt: string };
  template: ElectronicSignatureStampTemplateV1;
  fonts: TemplateStampFonts;
  image: Awaited<ReturnType<PDFDocument["embedPng"]>>;
  qrImage: Awaited<ReturnType<PDFDocument["embedPng"]>>;
}) => {
  const stampRect = signatureStampPlacementToVisibleBottomLeftRect(
    toPlacementContract(stamp),
    geometry,
  );
  const matrix = signatureStampVisibleSpaceToPdfMatrix(geometry);
  const radius = Math.max(3, Math.min(7, stampRect.height * 0.065));
  const inset = Math.max(1.2, Math.min(2.4, stampRect.height * 0.022));

  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(
      matrix.a,
      matrix.b,
      matrix.c,
      matrix.d,
      matrix.e,
      matrix.f,
    ),
  );
  drawRoundedRectangle(page, {
    ...stampRect,
    radius,
    color: STAMP_WHITE,
    borderColor: STAMP_NAVY,
    borderWidth: 1.05,
  });
  drawRoundedRectangle(page, {
    x: stampRect.x + inset,
    y: stampRect.y + inset,
    width: stampRect.width - inset * 2,
    height: stampRect.height - inset * 2,
    radius: Math.max(1.5, radius - inset),
    borderColor: STAMP_BLUE,
    borderWidth: 0.35,
  });

  template.elements.forEach((element) => {
    const rect = templateElementToVisibleRect(stampRect, element);
    if (element.kind === "TEXT") {
      drawTemplateText(page, stampRect, element, stamp, fonts);
      return;
    }
    if (element.kind === "IMAGE") {
      const scale = Math.min(
        rect.width / image.width,
        rect.height / image.height,
      );
      const width = image.width * scale;
      const height = image.height * scale;
      if (width < 1 || height < 1) {
        throw new Error(
          "A imagem livre do carimbo ficou menor que o limite físico.",
        );
      }
      page.drawImage(image, {
        x: rect.x + (rect.width - width) / 2,
        y: rect.y + (rect.height - height) / 2,
        width,
        height,
        opacity: element.style.opacityBp / STAMP_TEMPLATE_COORDINATE_SCALE,
      });
      return;
    }
    if (element.kind === "QR") {
      const size = Math.min(rect.width, rect.height);
      if (size < 24) {
        throw new Error(
          `O QR individual do carimbo de ${
            stampRoleLabel(stamp.role)
          } ficou menor que 24 pt.`,
        );
      }
      page.drawRectangle({
        x: rect.x + (rect.width - size) / 2,
        y: rect.y + (rect.height - size) / 2,
        width: size,
        height: size,
        color: STAMP_WHITE,
      });
      page.drawImage(qrImage, {
        x: rect.x + (rect.width - size) / 2,
        y: rect.y + (rect.height - size) / 2,
        width: size,
        height: size,
      });
      return;
    }
    const thickness = stampRect.height * element.style.widthBp /
      STAMP_TEMPLATE_COORDINATE_SCALE;
    if (thickness < 0.1) {
      throw new Error("A linha do template ficou menor que o limite físico.");
    }
    const color = templateHexColorToRgb(element.style.color);
    if (rect.height > rect.width) {
      page.drawLine({
        start: { x: rect.x + rect.width / 2, y: rect.y },
        end: { x: rect.x + rect.width / 2, y: rect.y + rect.height },
        thickness,
        color,
      });
    } else {
      page.drawLine({
        start: { x: rect.x, y: rect.y + rect.height / 2 },
        end: { x: rect.x + rect.width, y: rect.y + rect.height / 2 },
        thickness,
        color,
      });
    }
  });
  page.pushOperators(popGraphicsState());
};

export const applyElectronicSignatureStamps = async (
  input: ApplySignatureStampsInput,
): Promise<ApplySignatureStampsResult> => {
  assertPng(input.stampPngBytes);
  const usesGlobalTemplate = input.template !== undefined;
  if (
    usesGlobalTemplate
      ? input.layout !== undefined || input.contentLayout !== undefined ||
        input.autoLayout === undefined
      : (input.layout !== "HORIZONTAL" && input.layout !== "COMPACT") ||
        input.contentLayout === undefined || input.autoLayout !== undefined
  ) {
    throw new Error(
      "O documento precisa usar exclusivamente o template global ou o layout histórico do carimbo.",
    );
  }
  const template = usesGlobalTemplate
    ? normalizeElectronicSignatureStampTemplate(input.template)
    : null;
  const autoLayout = template
    ? normalizeElectronicSignatureStampAutoLayout(input.autoLayout)
    : null;
  const contentLayout = template
    ? null
    : prepareContentLayout(input.contentLayout!);
  const preparedStamps = prepareStamps(input.stamps, input.verificationUrl);
  if (autoLayout) {
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
  const [regularFont, boldFont, monoFont, image, qrImages] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
    pdf.embedFont(StandardFonts.Courier),
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
          COURIER: monoFont,
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
