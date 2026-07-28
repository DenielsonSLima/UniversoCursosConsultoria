export type PdfImage = {
  bytes: Uint8Array;
  format: 'PNG' | 'JPEG' | 'WEBP';
};

const getImageFormat = (
  contentType: string,
  source: string,
): PdfImage['format'] => {
  const type = contentType.toLowerCase();
  const path = source.toLowerCase();
  if (type.includes('png') || path.includes('.png')) return 'PNG';
  if (type.includes('webp') || path.includes('.webp')) return 'WEBP';
  return 'JPEG';
};

const hasExpectedSignature = (
  bytes: Uint8Array,
  format: PdfImage['format'],
) => {
  if (format === 'PNG') {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    return signature.every((byte, index) => bytes[index] === byte);
  }
  if (format === 'JPEG') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return (
    bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50
  );
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

  const payload = match[2].replace(/\s+/g, '');
  if (!payload || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) return null;

  try {
    const binary = globalThis.atob(payload);
    const bytes = Uint8Array.from(
      binary,
      (character) => character.charCodeAt(0),
    );
    const format = getImageFormat(match[1], source);
    return hasExpectedSignature(bytes, format) ? { bytes, format } : null;
  } catch {
    return null;
  }
};

export const loadPdfImage = async (
  source?: string | null,
): Promise<PdfImage | null> => {
  if (!source) return null;
  if (source.startsWith('data:')) return decodePdfImageDataUrl(source);

  try {
    const response = await fetch(source, {
      mode: 'cors',
      credentials: 'omit',
    });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0) return null;
    return {
      bytes,
      format: getImageFormat(
        response.headers.get('content-type') || '',
        source,
      ),
    };
  } catch {
    return null;
  }
};
