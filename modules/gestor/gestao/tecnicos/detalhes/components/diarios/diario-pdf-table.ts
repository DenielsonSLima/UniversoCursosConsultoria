import { jsPDF } from 'jspdf';

const CONTENT_LEFT = 14;
const CONTENT_RIGHT = 11;
const CONTENT_WIDTH = 297 - CONTENT_LEFT - CONTENT_RIGHT;
const NAVY = '#071a33';
const GRID = '#202735';
const PALE_BLUE = '#eef4fa';
const ROW_ALT = '#f8fafc';

interface TableOptions {
  headers: string[];
  rows: string[][];
  widths: number[];
  startY: number;
  endY?: number;
  fontSize?: number;
  alignments?: Array<'left' | 'center' | 'right'>;
  rowHeight?: number;
  rowHeights?: number[];
}

const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return [7, 26, 51];
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
};

const setTextColor = (pdf: jsPDF, color = NAVY) => {
  pdf.setTextColor(...hexToRgb(color));
};

const setFillColor = (pdf: jsPDF, color: string) => {
  pdf.setFillColor(...hexToRgb(color));
};

export const fitText = (pdf: jsPDF, value: unknown, maxWidth: number) => {
  const text = String(value ?? '—');
  if (pdf.getTextWidth(text) <= maxWidth) return text;
  const ellipsis = '...';
  let shortened = text;
  while (
    shortened.length > 1
    && pdf.getTextWidth(`${shortened}${ellipsis}`) > maxWidth
  ) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened.trimEnd()}${ellipsis}`;
};

const normalizeWidths = (widths: number[]) => {
  const total = widths.reduce((sum, width) => sum + width, 0);
  return widths.map((width) => (width / total) * CONTENT_WIDTH);
};

const drawCellText = (
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  align: 'left' | 'center' | 'right',
) => {
  const padding = 1.2;
  const fitted = fitText(pdf, text, Math.max(1, width - padding * 2));
  const textX = align === 'center'
    ? x + width / 2
    : align === 'right'
      ? x + width - padding
      : x + padding;
  const baseline = y + height / 2 + pdf.getFontSize() * 0.13;
  pdf.text(fitted, textX, baseline, { align, baseline: 'middle' });
};

export const drawTable = (pdf: jsPDF, options: TableOptions) => {
  const {
    headers,
    rows,
    startY,
    endY = 198,
    fontSize = 6.5,
    alignments = [],
    rowHeights,
  } = options;
  const widths = normalizeWidths(options.widths);
  const headerHeight = 8;
  const availableHeight = endY - startY - headerHeight;
  const defaultRowHeight = rows.length ? availableHeight / rows.length : 7;
  const resolvedHeights = rowHeights
    || rows.map(() => options.rowHeight || defaultRowHeight);

  pdf.setLineWidth(0.2);
  pdf.setDrawColor(...hexToRgb(GRID));
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(Math.min(fontSize, 6.5));
  setTextColor(pdf, NAVY);

  let x = CONTENT_LEFT;
  headers.forEach((header, index) => {
    setFillColor(pdf, PALE_BLUE);
    pdf.rect(x, startY, widths[index], headerHeight, 'FD');
    setTextColor(pdf, NAVY);
    drawCellText(
      pdf,
      header.toUpperCase(),
      x,
      startY,
      widths[index],
      headerHeight,
      'center',
    );
    x += widths[index];
  });

  pdf.setFontSize(fontSize);
  let y = startY + headerHeight;
  rows.forEach((row, rowIndex) => {
    const height = resolvedHeights[rowIndex] || defaultRowHeight;
    x = CONTENT_LEFT;
    row.forEach((cell, columnIndex) => {
      setFillColor(pdf, rowIndex % 2 === 0 ? '#ffffff' : ROW_ALT);
      pdf.rect(x, y, widths[columnIndex], height, 'FD');
      pdf.setFont('helvetica', columnIndex === 1 ? 'bold' : 'normal');
      setTextColor(pdf, '#111827');
      drawCellText(
        pdf,
        cell,
        x,
        y,
        widths[columnIndex],
        height,
        alignments[columnIndex] || (columnIndex === 1 ? 'left' : 'center'),
      );
      x += widths[columnIndex];
    });
    y += height;
  });
};
