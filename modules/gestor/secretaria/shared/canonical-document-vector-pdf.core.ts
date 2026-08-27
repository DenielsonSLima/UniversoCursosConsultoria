import type { jsPDF } from "jspdf";

export type CanonicalPdfImageFormat = "PNG" | "JPEG" | "WEBP";

export interface CanonicalPdfImage {
  dataUrl: string;
  format: CanonicalPdfImageFormat;
}

export interface CanonicalPdfWatermark {
  enabled: boolean;
  /** URL/data URI mantida no snapshot; compositores browser podem resolvê-la. */
  imageUrl: string | null;
  /** Imagem isolada já resolvida, sem rasterizar a página. */
  image?: CanonicalPdfImage | null;
  label: string | null;
  opacity: number | null;
  /** Percentual configurado em Configurações > Marca d'água (10 a 100). */
  scale?: number | null;
  /** Booleano do editor ou ângulo explícito para snapshots especializados. */
  rotate?: boolean | number | null;
}

export interface CanonicalPdfWatermarkStyle {
  opacity: number;
  scale: number;
  rotation: number;
}

type PdfGStateConstructor = new (parameters: { opacity: number }) => unknown;

const DATA_IMAGE_PATTERN = /^data:image\/(png|jpe?g|webp);base64,/i;
export const MAX_INLINE_IMAGE_BYTES = 16 * 1024 * 1024;

/** Núcleo vetorial puro compartilhado por browser e runtime Edge. */
export const getCanonicalPdfInlineImage = (
  value: string | null | undefined,
): CanonicalPdfImage | null => {
  const source = String(value || "").trim();
  const match = DATA_IMAGE_PATTERN.exec(source);
  if (!match || source.length > MAX_INLINE_IMAGE_BYTES) return null;

  const type = match[1].toLowerCase();
  return {
    dataUrl: source,
    format: type === "png" ? "PNG" : type === "webp" ? "WEBP" : "JPEG",
  };
};

export const normalizeCanonicalPdfText = (value: string | null | undefined) =>
  String(value || "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2010\u2011\u2012\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2022/g, "·");

export const truncatePdfText = (
  pdf: jsPDF,
  value: string,
  maxWidth: number,
  maxLines = 1,
) => {
  const lines = pdf.splitTextToSize(
    normalizeCanonicalPdfText(value),
    maxWidth,
  ) as string[];
  if (lines.length <= maxLines) return lines;

  const visible = lines.slice(0, maxLines);
  const index = visible.length - 1;
  let last = visible[index].replace(/[\s·.,;:!?-]+$/u, "");
  while (last && pdf.getTextWidth(`${last}…`) > maxWidth) {
    last = last.slice(0, -1).trimEnd();
  }
  visible[index] = `${last}…`;
  return visible;
};

export const drawCanonicalPdfText = (
  pdf: jsPDF,
  value: string | null | undefined,
  x: number,
  y: number,
  options: {
    align?: "left" | "center" | "right";
    maxWidth?: number;
    maxLines?: number;
    lineHeight?: number;
  } = {},
) => {
  const text = normalizeCanonicalPdfText(value);
  if (!text) return 0;
  const lines = options.maxWidth
    ? truncatePdfText(
      pdf,
      text,
      options.maxWidth,
      options.maxLines ?? Number.MAX_SAFE_INTEGER,
    )
    : [text];
  pdf.text(lines, x, y, {
    align: options.align ?? "left",
    baseline: "top",
    lineHeightFactor: options.lineHeight ?? 1.2,
  });
  return lines.length;
};

const clampOpacity = (value: number | null | undefined, fallback = 0.08) => {
  const opacity = Number(value);
  return Number.isFinite(opacity)
    ? Math.min(1, Math.max(0, opacity))
    : fallback;
};

const clampScale = (value: number | null | undefined, fallback = 100) => {
  const scale = Number(value);
  return Number.isFinite(scale)
    ? Math.min(100, Math.max(10, scale))
    : fallback;
};

const normalizeRotation = (
  value: boolean | number | null | undefined,
  fallback: number,
) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "boolean") return value ? fallback : 0;
  const angle = Number(value);
  return Number.isFinite(angle) ? Math.min(360, Math.max(-360, angle)) : fallback;
};

export const normalizeCanonicalPdfWatermarkStyle = (
  watermark: CanonicalPdfWatermark,
  fallbackRotation = 35,
  options: { hasImage?: boolean } = {},
): CanonicalPdfWatermarkStyle => ({
  opacity: clampOpacity(watermark.opacity),
  scale: clampScale(watermark.scale),
  rotation: normalizeRotation(
    watermark.rotate,
    options.hasImage && watermark.rotate == null ? 0 : fallbackRotation,
  ),
});

export const drawCanonicalPdfWatermark = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  watermark: CanonicalPdfWatermark,
  options: {
    x: number;
    y: number;
    width: number;
    height: number;
    textSize: number;
    rotate?: number;
  },
) => {
  if (!watermark.enabled) return;

  const image = watermark.image ?? getCanonicalPdfInlineImage(watermark.imageUrl);
  const style = normalizeCanonicalPdfWatermarkStyle(watermark, options.rotate ?? 35, {
    hasImage: Boolean(image),
  });

  pdf.saveGraphicsState();
  pdf.setGState(
    new GState({ opacity: style.opacity }) as never,
  );
  if (image) {
    const properties = pdf.getImageProperties(image.dataUrl);
    const configuredScale = style.scale / 100;
    const scale = Math.min(
      (options.width * configuredScale) / properties.width,
      (options.height * configuredScale) / properties.height,
    );
    const width = properties.width * scale;
    const height = properties.height * scale;
    const centerX = options.x + options.width / 2;
    const centerY = options.y + options.height / 2;
    const radians = style.rotation * (Math.PI / 180);
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const imageX = centerX - ((cosine * width / 2) - (sine * height / 2));
    const imageY = centerY - height + ((sine * width / 2) + (cosine * height / 2));
    pdf.addImage(
      image.dataUrl,
      image.format,
      imageX,
      imageY,
      width,
      height,
      undefined,
      "FAST",
      style.rotation,
    );
  } else {
    const label = normalizeCanonicalPdfText(watermark.label) || "UNIVERSO";
    pdf.setTextColor(0, 26, 51);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(options.textSize * (style.scale / 100));
    pdf.text(
      label.toUpperCase(),
      options.x + options.width / 2,
      options.y + options.height / 2,
      {
        align: "center",
        baseline: "middle",
        angle: style.rotation,
      },
    );
  }
  pdf.restoreGraphicsState();
};
