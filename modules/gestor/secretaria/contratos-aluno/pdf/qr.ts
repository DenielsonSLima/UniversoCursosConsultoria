import type { jsPDF } from 'jspdf';
import { parseContratoAlunoClosingLayout } from '../../../../shared/contrato-aluno/closing-layout';
import {
  getContractClosingElementHeight,
  getContractClosingTextLayout,
  type ContractClosingElementId,
} from '../../../../shared/contrato-aluno/closing-positions';
import { normalizeCanonicalPdfText, type CanonicalPdfImage } from '../../shared/canonical-document-vector-pdf';
import type { ContratoAlunoPreparedDocument } from '../types/contratos-aluno.types';
import { PAGE_HEIGHT, PAGE_BOTTOM, type ContractVisualDocument } from './model';

interface QrTextBlock {
  lines: string[];
  y: number;
  size: number;
  bold: boolean;
  color: [number, number, number];
}

/** Mede o texto integral; a posição e a largura continuam pertencendo ao modelo. */
export const getContractQrLayout = (
  pdf: jsPDF,
  visual: ContractVisualDocument,
  validationCode: string,
) => {
  const position = visual.closingPositions.elements.qr;
  const imageSize = position.width - 3;
  const textWidth = position.width - 1;
  const blocks: QrTextBlock[] = [];
  let cursorY = position.y + 1.5 + imageSize + 0.9;
  const addBlock = (value: string, size: number, bold: boolean, color: QrTextBlock['color']) => {
    if (!value) return;
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(normalizeCanonicalPdfText(value), textWidth) as string[];
    blocks.push({ lines, y: cursorY, size, bold, color });
    cursorY += lines.length * size * 0.352778 * 1.15 + 0.35;
  };
  addBlock(visual.qr.label, 5.7, true, [71, 85, 105]);
  addBlock(validationCode, 5.8, true, [29, 78, 216]);
  if (visual.qr.validityLabel) {
    addBlock(`Validade: ${visual.qr.validityLabel}`, 5.4, false, [100, 116, 139]);
  }
  return {
    position, imageSize, blocks,
    height: Math.max(getContractClosingElementHeight('qr', position), cursorY + 1 - position.y),
  };
};

export const assertContractQrFits = (
  pdf: jsPDF,
  visual: ContractVisualDocument,
  document: ContratoAlunoPreparedDocument,
) => {
  if (!visual.qr.enabled) return;
  const { position, height } = getContractQrLayout(pdf, visual, document.validationCode || '');
  if (position.y + height > PAGE_HEIGHT - PAGE_BOTTOM) {
    throw new Error('O código e a validade do QR ultrapassam a área segura. Amplie ou reposicione o QR no modelo do contrato.');
  }
  const footer = parseContratoAlunoClosingLayout(visual.pages.at(-1)?.footer || '');
  const active: ContractClosingElementId[] = footer.parties.slice(0, 2).map((party) => (
    party.label === 'CONTRATADA' ? 'contratada' : 'contratante'
  ));
  footer.witnesses.forEach((_, index) => active.push(index === 0 ? 'testemunha1' : 'testemunha2'));
  const boxes = active.map((id) => {
    const other = visual.closingPositions.elements[id];
    return { ...other, height: getContractClosingElementHeight(id, other) };
  });
  const textLayout = getContractClosingTextLayout(visual.pages.at(-1)?.footer || '', true);
  for (const [text, y, size, lineHeight] of [
    [footer.location, textLayout.locationY, 8, 1.25],
    [footer.fallbackText, textLayout.fallbackY, 8, 1.35],
    [footer.additionalLines.join('\n'), textLayout.additionalY, 7, 1.3],
  ] as const) {
    if (!text) continue;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(size);
    boxes.push({ x: textLayout.x, y, width: textLayout.width,
      height: (pdf.splitTextToSize(normalizeCanonicalPdfText(text), textLayout.width) as string[]).length
        * size * 0.352778 * lineHeight });
  }
  for (const other of boxes) {
    const overlaps = position.x < other.x + other.width && position.x + position.width > other.x
      && position.y < other.y + other.height && position.y + height > other.y;
    if (overlaps) {
      throw new Error('O texto integral do QR sobrepõe outro elemento do encerramento. Amplie ou reposicione o QR no modelo do contrato.');
    }
  }
};

export const drawContractQr = (
  pdf: jsPDF,
  visual: ContractVisualDocument,
  document: ContratoAlunoPreparedDocument,
  qr: CanonicalPdfImage | null,
) => {
  if (!visual.qr.enabled) return;
  if (!qr || !document.validationCode) {
    throw new Error('O contrato exige QR Code, mas a imagem de validação não foi preparada.');
  }
  assertContractQrFits(pdf, visual, document);
  const { position, imageSize, blocks, height } = getContractQrLayout(pdf, visual, document.validationCode);
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(position.x, position.y, position.width, height, 1.5, 1.5, 'FD');
  pdf.addImage(qr.dataUrl, qr.format, position.x + 1.5, position.y + 1.5, imageSize, imageSize,
    `contrato-qr-${document.emissionId}`, 'FAST');
  for (const block of blocks) {
    pdf.setFont('helvetica', block.bold ? 'bold' : 'normal');
    pdf.setFontSize(block.size);
    pdf.setTextColor(...block.color);
    pdf.text(block.lines, position.x + position.width / 2, block.y, {
      align: 'center', baseline: 'top', lineHeightFactor: 1.15,
    });
  }
};
