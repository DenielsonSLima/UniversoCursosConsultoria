import {
  getCanonicalPdfInlineImage,
  MAX_INLINE_IMAGE_BYTES,
} from "./canonical-document-vector-pdf.core.ts";

export * from "./canonical-document-vector-pdf.core.ts";

/** QR é o único raster dinâmico: um ativo pequeno, isolado e de alta resolução. */
export const createCanonicalPdfQr = async (code: string | null | undefined) => {
  const normalized = String(code || "").trim();
  if (!normalized) return null;
  // Carregamento sob demanda mantém consumidores puramente vetoriais, como o
  // relatório do Caixa, independentes do runtime Node usado pela biblioteca QR.
  const { createDocumentValidationQrDataUrl } = await import(
    "../../../shared/document-validation/document-validation.qr.ts"
  );
  const dataUrl = await createDocumentValidationQrDataUrl(normalized, {
    size: 640,
    margin: 1,
    errorCorrectionLevel: "H",
  });
  return getCanonicalPdfInlineImage(dataUrl);
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(
        reader.error ||
          new Error("Não foi possível preparar a imagem do documento."),
      );
    reader.readAsDataURL(blob);
  });

/**
 * Fotos podem ser incorporadas como ativo separado quando o servidor entrega
 * uma URL CORS acessível. Uma falha de foto não invalida a credencial.
 */
export const resolveCanonicalPdfPhoto = async (
  source: string | null | undefined,
) => {
  const inline = getCanonicalPdfInlineImage(source);
  if (inline) return inline;
  const url = String(source || "").trim();
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const response = await fetch(url, { cache: "force-cache", mode: "cors" });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/") || blob.size > MAX_INLINE_IMAGE_BYTES) {
      return null;
    }
    return getCanonicalPdfInlineImage(await blobToDataUrl(blob));
  } catch {
    return null;
  }
};

export const runWithConcurrency = async <Input, Output>(
  values: readonly Input[],
  limit: number,
  task: (value: Input, index: number) => Promise<Output>,
) => {
  const results = new Array<Output>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(values[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), values.length) }, worker),
  );
  return results;
};
