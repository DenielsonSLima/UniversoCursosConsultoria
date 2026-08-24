import { type PDFFont, type PDFPage, rgb } from "pdf-lib";

export const assertFontCanEncode = (font: PDFFont, text: string, label: string) => {
  try {
    font.encodeText(text);
  } catch {
    throw new Error(
      `${label} contém caracteres incompatíveis com a fonte vetorial do carimbo.`,
    );
  }
};

export const resolveFittedTextSize = (
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

export const drawFittedText = (
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

export const STAMP_NAVY = rgb(0.031, 0.157, 0.275);
export const STAMP_BLUE = rgb(0.114, 0.306, 0.847);
export const STAMP_TEXT = rgb(0.059, 0.09, 0.165);
export const STAMP_MUTED = rgb(0.278, 0.333, 0.412);
export const STAMP_RULE = rgb(0.796, 0.835, 0.882);
export const STAMP_WHITE = rgb(1, 1, 1);

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

export const drawRoundedRectangle = (
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

export const drawStampIcon = (
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

export const drawLabeledStampLine = (
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

