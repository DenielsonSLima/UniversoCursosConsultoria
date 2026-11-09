import type { jsPDF } from 'jspdf';

export const DANFSE_PAGE = { width: 595, height: 842, left: 8.5, right: 586.77, column: 144.567 };
const INK = 0;
const GRAY = 242;

export interface DanfseCell {
  label: string;
  value?: string;
  span?: number;
  title?: boolean;
  shade?: boolean;
  identification?: boolean;
}

export function createDanfseLayout(pdf: jsPDF) {
  let top = 40;
  const width = DANFSE_PAGE.right - DANFSE_PAGE.left;
  const font = (size: number, bold = false) => {
    pdf.setFont('DanfseSans', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(INK);
  };
  const text = (value: string, x: number, y: number, size = 7, bold = false, align?: 'center') => {
    font(size, bold);
    pdf.text(value || '-', x, y, { align });
  };
  const line = (y?: number, weight = 0.5) => {
    pdf.setDrawColor(INK);
    pdf.setLineWidth(weight);
    pdf.line(DANFSE_PAGE.left, y ?? top + 4.4374, DANFSE_PAGE.right, y ?? top + 4.4374);
    if (y === undefined) top += weight;
  };
  const linesFor = (value: string, available: number, size: number, bold = false) => {
    font(size, bold);
    return pdf.splitTextToSize(value || '-', available) as string[];
  };
  const row = (cells: DanfseCell[], minimumHeight = 19.0742) => {
    const prepared = cells.map(cell => {
      const available = DANFSE_PAGE.column * (cell.span ?? 1) - 7;
      const labelLines = linesFor(cell.label, available, cell.title || cell.identification ? 7 : 6, true);
      const values = cell.title ? [] : linesFor(cell.value || '-', available, 7);
      return { cell, labelLines, values };
    });
    const height = Math.max(minimumHeight, ...prepared.map(({ labelLines, values }) =>
      11.2742 + Math.max(0, labelLines.length - 1) * 6.5 + values.length * 7.8));
    let column = 0;
    for (const { cell, labelLines, values } of prepared) {
      const x = DANFSE_PAGE.left + DANFSE_PAGE.column * column;
      if (cell.shade || cell.title) {
        pdf.setFillColor(GRAY, GRAY, GRAY);
        pdf.rect(x, top + 4.4374, DANFSE_PAGE.column * (cell.span ?? 1), height, 'F');
      }
      labelLines.forEach((value, index) => text(value, x + 3.4, top + (cell.title || cell.identification ? 11.003 : 10.065) + index * 6.5,
        cell.title || cell.identification ? 7 : 6, true));
      values.forEach((value, index) => text(value, x + 3.4, top + (cell.identification ? 18.9394 : 17.7896) + (labelLines.length - 1) * 6.5 + index * 7.8));
      column += cell.span ?? 1;
    }
    top += height;
    if (top > 778) throw new Error('O conteúdo deste XML não cabe no DANFSe de uma página sem cortes.');
    return height;
  };
  const paragraph = (value: string, label?: string, minHeight = 0) => {
    const lines = linesFor(value, width - 6.8, 7);
    if (label) text(label, DANFSE_PAGE.left + 3.4, top + 8.8679, 6, true);
    lines.forEach((part, index) => text(part, DANFSE_PAGE.left + 3.4, top + (label ? 16.5925 : 10.8903) + index * 7.9229));
    top += Math.max(minHeight, (label ? 17.8771 : 13) + (lines.length - 1) * 7.9229);
    if (top > 778) throw new Error('O conteúdo deste XML excede o espaço do DANFSe.');
  };
  const absent = (value: string) => {
    line();
    text(value, DANFSE_PAGE.width / 2, top + 11.0874, 7, false, 'center');
    top += 7.923;
  };
  return { pdf, font, text, line, row, paragraph, absent, linesFor, get top() { return top; }, set top(value: number) { top = value; } };
}

export type DanfseLayout = ReturnType<typeof createDanfseLayout>;
