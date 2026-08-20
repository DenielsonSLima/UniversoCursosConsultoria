import { assertValidPdfImage, type PdfImage } from "./diario-pdf-image.core.ts";
export { assertValidPdfImage, type PdfImage } from "./diario-pdf-image.core.ts";

const getImageFormat = (
  contentType: string,
  source: string,
): PdfImage["format"] => {
  const type = contentType.toLowerCase();
  const path = source.toLowerCase();
  if (type.includes("png") || path.includes(".png")) return "PNG";
  if (type.includes("webp") || path.includes(".webp")) return "WEBP";
  return "JPEG";
};

/**
 * Converte imagens base64 locais sem depender de `fetch(data:)`.
 * A CSP de produção não permite `data:` em `connect-src`, e o Safari também
 * pode recusar esse fetch quando `mode: "cors"` é informado.
 */
export const decodePdfImageDataUrl = (source: string): PdfImage | null => {
  const match = source.match(
    /^data:image\/(png|jpe?g|webp);base64,([\s\S]+)$/i,
  );
  if (!match) return null;

  const payload = match[2].replace(/\s+/g, "");
  if (!payload || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) return null;

  try {
    const binary = globalThis.atob(payload);
    const bytes = Uint8Array.from(
      binary,
      (character) => character.charCodeAt(0),
    );
    const format = getImageFormat(match[1], source);
    return assertValidPdfImage({ bytes, format }, "A imagem local do PDF");
  } catch {
    return null;
  }
};

export const loadPdfImage = async (
  source?: string | null,
): Promise<PdfImage | null> => {
  if (!source) return null;
  if (source.startsWith("data:")) return decodePdfImageDataUrl(source);

  try {
    const response = await fetch(source, {
      mode: "cors",
      credentials: "omit",
    });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0) return null;
    return assertValidPdfImage({
      bytes,
      format: getImageFormat(
        response.headers.get("content-type") || "",
        source,
      ),
    }, "A imagem remota do PDF");
  } catch {
    return null;
  }
};
