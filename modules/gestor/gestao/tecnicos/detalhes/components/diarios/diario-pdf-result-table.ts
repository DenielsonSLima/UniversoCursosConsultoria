import type { jsPDF } from 'jspdf';
import { drawTable, fitText } from './diario-pdf-table.ts';
import { CONTENT_LEFT, CONTENT_WIDTH, NAVY, setFillColor, setTextColor } from './diario-pdf-layout.ts';

const GROUP_HEADER_HEIGHT = 5;
const INSTRUMENT_HEADER_HEIGHT = 8;
export const RESULT_TABLE_HEADER_HEIGHT = GROUP_HEADER_HEIGHT + INSTRUMENT_HEADER_HEIGHT;

export interface ResultHeaderCell {
  label: string;
  column: number;
  colSpan: number;
  rowSpan: number;
  row: 0 | 1;
}

export const buildResultHeaderCells = (headers: string[], instrumentCount: number): ResultHeaderCell[] => {
  const frequencyColumn = instrumentCount + 5;
  const cells: ResultHeaderCell[] = headers.flatMap((label, column) => {
    const isInstrument = column >= 2 && column < instrumentCount + 2;
    const isFrequency = column === frequencyColumn || column === frequencyColumn + 1;
    return [{ label, column, colSpan: 1, rowSpan: isInstrument || isFrequency ? 1 : 2,
      row: isInstrument || isFrequency ? 1 as const : 0 as const }];
  });
  if (instrumentCount > 0) cells.push({
    label: 'INSTRUMENTOS AVALIATIVOS', column: 2, colSpan: instrumentCount, rowSpan: 1, row: 0,
  });
  cells.push({ label: 'FREQUÊNCIA', column: frequencyColumn, colSpan: 2, rowSpan: 1, row: 0 });
  return cells;
};

interface GroupedResultTableOptions {
  headers: string[];
  instrumentCount: number;
  rows: string[][];
  widths: number[];
  startY: number;
  fontSize: number;
  rowHeight: number;
}

/** Native table: the lower header holds instruments; the upper cells span their groups. */
export const drawGroupedResultTable = (pdf: jsPDF, options: GroupedResultTableOptions) => {
  const { headers, widths, instrumentCount, startY, fontSize } = options;
  const cells = buildResultHeaderCells(headers, instrumentCount);
  const lowerHeader = cells.filter((cell) => cell.row === 1);
  drawTable(pdf, {
    ...options,
    // Row-spanning cells are left text-free here and drawn once at their full height below.
    headers: headers.map((_, column) => lowerHeader.find((cell) => cell.column === column)?.label || ''),
    startY: startY + GROUP_HEADER_HEIGHT,
  });
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  const normalizedWidths = widths.map((width) => width / totalWidth * CONTENT_WIDTH);
  pdf.setLineWidth(0.2);
  pdf.setDrawColor(32, 39, 53);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(Math.min(fontSize, 6.5));
  setTextColor(pdf, NAVY);
  for (const cell of cells.filter((entry) => entry.row === 0)) {
    const x = CONTENT_LEFT + normalizedWidths.slice(0, cell.column).reduce((sum, width) => sum + width, 0);
    const width = normalizedWidths.slice(cell.column, cell.column + cell.colSpan)
      .reduce((sum, item) => sum + item, 0);
    const height = cell.rowSpan === 2 ? RESULT_TABLE_HEADER_HEIGHT : GROUP_HEADER_HEIGHT;
    setFillColor(pdf, '#eef4fa');
    pdf.rect(x, startY, width, height, 'FD');
    const lines = cell.label.toUpperCase().split('\n')
      .map((line) => fitText(pdf, line, width - 2.4));
    const lineHeight = pdf.getFontSize() * 25.4 / 72 * 1.15;
    const firstLineY = startY + height / 2 + pdf.getFontSize() * 0.13
      - (lines.length - 1) * lineHeight / 2;
    lines.forEach((line, index) => {
      pdf.text(line, x + width / 2, firstLineY + index * lineHeight,
        { align: 'center', baseline: 'middle' });
    });
  }
};
