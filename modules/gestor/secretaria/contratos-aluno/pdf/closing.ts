import type { jsPDF } from 'jspdf';
import {
  parseContratoAlunoClosingLayout,
  type ContratoAlunoClosingParty,
} from '../../../../shared/contrato-aluno/closing-layout';
import {
  getContractClosingElementHeight,
  getContractClosingTextLayout,
  type ContractClosingElementId,
  type ContractClosingPosition,
  type ContractClosingPositions,
} from '../../../../shared/contrato-aluno/closing-positions';
import { drawCanonicalPdfText, type CanonicalPdfImage } from '../../shared/canonical-document-vector-pdf';
import type { ContratoAlunoPreparedDocument } from '../types/contratos-aluno.types';
import { PAGE_WIDTH, PAGE_LEFT, PAGE_RIGHT, CLOSING_TOP, type ContractVisualDocument } from './model';

const getClosingTextFlow = (footer: string, hasQr: boolean) => {
  const layout = parseContratoAlunoClosingLayout(footer);
  return { layout, ...getContractClosingTextLayout(footer, hasQr) };
};

const getSignatureId = (party: ContratoAlunoClosingParty): ContractClosingElementId => (
  party.label === 'CONTRATADA' ? 'contratada' : 'contratante'
);

export const getClosingHeight = (
  pdf: jsPDF,
  footer: string,
  hasQr: boolean,
  positions: ContractClosingPositions,
) => {
  const { layout, width, additionalY, fallbackY } = getClosingTextFlow(footer, hasQr);
  const active: ContractClosingElementId[] = layout.parties.slice(0, 2).map(getSignatureId);
  layout.witnesses.forEach((_, index) => active.push(index === 0 ? 'testemunha1' : 'testemunha2'));
  if (hasQr) active.push('qr');
  let textHeight = layout.location ? 11 : 4;
  if (layout.fallbackText || layout.additionalLines.length) {
    const fallback = Boolean(layout.fallbackText);
    const text = layout.fallbackText || layout.additionalLines.join('\n');
    const size = fallback ? 8 : 7;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, width) as string[];
    textHeight = (fallback ? fallbackY : additionalY) - CLOSING_TOP
      + Math.max(lines.length, 1) * size * 0.352778 * (fallback ? 1.35 : 1.3);
  }
  return Math.max(textHeight, ...active.map((id) => positions.elements[id].y
    + getContractClosingElementHeight(id, positions.elements[id]) - CLOSING_TOP));
};

const drawSignature = (
  pdf: jsPDF,
  party: ContratoAlunoClosingParty,
  position: ContractClosingPosition,
  witness = false,
) => {
  const { x, y, width } = position;
  const lineY = y + 5;
  if (party.value) {
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(71, 85, 105);
    pdf.setFontSize(witness ? 6.8 : 7.2);
    drawCanonicalPdfText(pdf, party.value, x + width / 2, y + 1, {
      align: 'center', maxWidth: width - 2, maxLines: 1,
    });
  }
  if (witness) pdf.setDrawColor(100, 116, 139);
  else pdf.setDrawColor(71, 85, 105);
  pdf.setLineWidth(witness ? 0.2 : 0.25);
  pdf.line(x, lineY, x + width, lineY);
  pdf.setFont('helvetica', 'bold');
  if (witness) pdf.setTextColor(148, 163, 184);
  else pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(witness ? 5.5 : 6.2);
  drawCanonicalPdfText(pdf, party.label, x + width / 2, y + (witness ? 7.8 : 8.2), {
    align: 'center', maxWidth: width, maxLines: 1,
  });
};

export const drawContractClosing = (
  pdf: jsPDF,
  footer: string,
  hasQr: boolean,
  positions: ContractClosingPositions,
) => {
  const { layout, x, width, additionalY, fallbackY, locationY } = getClosingTextFlow(footer, hasQr);
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.2);
  pdf.line(PAGE_LEFT, CLOSING_TOP, PAGE_WIDTH - PAGE_RIGHT, CLOSING_TOP);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 116, 139);
  if (layout.fallbackText) {
    pdf.setFontSize(8);
    drawCanonicalPdfText(pdf, layout.fallbackText, x, fallbackY, {
      maxWidth: width, maxLines: 10, lineHeight: 1.35,
    });
    return;
  }
  if (layout.location) {
    pdf.setTextColor(71, 85, 105);
    pdf.setFontSize(8);
    drawCanonicalPdfText(pdf, layout.location, x, locationY, {
      maxWidth: width, maxLines: 2, lineHeight: 1.25,
    });
  }
  layout.parties.slice(0, 2).forEach((party) => {
    drawSignature(pdf, party, positions.elements[getSignatureId(party)]);
  });
  layout.witnesses.forEach((witness, index) => {
    drawSignature(pdf, witness, positions.elements[index === 0 ? 'testemunha1' : 'testemunha2'], true);
  });
  if (layout.additionalLines.length) {
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(7);
    drawCanonicalPdfText(pdf, layout.additionalLines.join('\n'), x, additionalY, {
      maxWidth: width, maxLines: 4, lineHeight: 1.3,
    });
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
  const position = visual.closingPositions.elements.qr;
  const size = position.width - 3;
  const qrX = position.x + 1.5;
  const qrY = position.y + 1.5;
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(position.x, position.y, position.width,
    getContractClosingElementHeight('qr', position), 1.5, 1.5, 'FD');
  pdf.addImage(qr.dataUrl, qr.format, qrX, qrY, size, size,
    `contrato-qr-${document.emissionId}`, 'FAST');
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(5.7);
  drawCanonicalPdfText(pdf, visual.qr.label, qrX + size / 2, qrY + size + 0.9, {
    align: 'center', maxWidth: size + 2, maxLines: 1,
  });
  pdf.setTextColor(29, 78, 216);
  pdf.setFontSize(5.8);
  drawCanonicalPdfText(pdf, document.validationCode, qrX + size / 2, qrY + size + 3.4, {
    align: 'center', maxWidth: size + 2, maxLines: 1,
  });
  if (visual.qr.validityLabel) {
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(5.4);
    drawCanonicalPdfText(pdf, `Validade: ${visual.qr.validityLabel}`, qrX + size / 2, qrY + size + 5.8, {
      align: 'center', maxWidth: size + 2, maxLines: 1,
    });
  }
};
