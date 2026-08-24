import { PDFDocument } from "pdf-lib";
import {
  getSignatureStampVisiblePageSize,
  type SignatureStampPdfBox,
  type SignatureStampPdfRotation,
} from "./signature-stamp-placement.ts";
import {
  createDiaryPdfSemanticManifest,
  resolveDiarySignaturePageIndex,
  type DiaryPdfSemanticManifest,
} from "./diary-pdf-semantic-manifest.ts";
import type {
  FrozenPdfSignatureTarget,
  InspectedPdfDocument,
  InspectedPdfPage,
} from "./pdf-document-signature.types.ts";

const PDF_MAX_BYTES = 50 * 1024 * 1024;
const PDF_MAX_PAGES = 500;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

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

export const loadPdf = async (bytes: Uint8Array) => {
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

export const inspectLoadedPdf = (
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
    semanticTarget: manifest.semanticTarget,
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

export const assertFrozenTargetMatches = (
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
    frozen.semanticTarget !== frozen.manifest.semanticTarget ||
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

export const assertDocumentGeometryPreserved = (
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

export const assertPng = (bytes: Uint8Array) => {
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

