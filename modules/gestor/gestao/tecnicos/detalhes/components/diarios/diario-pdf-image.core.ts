export type PdfImage = {
  bytes: Uint8Array;
  format: "PNG" | "JPEG" | "WEBP";
};

const MAX_PDF_IMAGE_BYTES = 12 * 1024 * 1024;

const hasExpectedSignature = (
  bytes: Uint8Array,
  format: PdfImage["format"],
) => {
  if (format === "PNG") {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    return signature.every((byte, index) => bytes[index] === byte);
  }
  if (format === "JPEG") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
    bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 &&
    bytes[10] === 0x42 && bytes[11] === 0x50
  );
};

export const assertValidPdfImage = (
  image: PdfImage | null,
  label: string,
): PdfImage | null => {
  if (image === null) return null;
  if (
    !image || !(image.bytes instanceof Uint8Array) ||
    image.bytes.byteLength === 0 ||
    image.bytes.byteLength > MAX_PDF_IMAGE_BYTES ||
    !["PNG", "JPEG", "WEBP"].includes(image.format) ||
    !hasExpectedSignature(image.bytes, image.format)
  ) {
    throw new Error(`${label} não é uma imagem PNG, JPEG ou WEBP válida.`);
  }
  return image;
};
