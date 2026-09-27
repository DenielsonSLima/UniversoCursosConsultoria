import { jsPDF } from 'jspdf';
import { drawCanonicalThermalHeader, normalizeCanonicalInstitutionalHeader } from '../../secretaria/shared/canonical-institutional-header-pdf';
import { normalizeCanonicalPdfText, resolveCanonicalPdfPhoto } from '../../secretaria/shared/canonical-document-vector-pdf';
import type { CanonicalPdfImage } from '../../secretaria/shared/canonical-document-vector-pdf.core';
import type { PdvReceipt } from './pdv-receipt.types';

export interface PdvReceiptAssets { logo: CanonicalPdfImage | null }

export function assertPdvReceipt(receipt: PdvReceipt) {
  const model = receipt.template;
  if (receipt.version !== 1 || !receipt.id || !receipt.number || !receipt.paidAt
    || !receipt.paidAtDisplay || !receipt.totalDisplay || !receipt.payer?.name
    || !receipt.issuer?.name || !Number.isInteger(receipt.totalCents) || receipt.totalCents <= 0) {
    throw new Error('O servidor não retornou um comprovante de pagamento válido.');
  }
  if (!model || ![58, 80].includes(model.widthMm) || model.marginMm < 2 || model.marginMm > 6
    || model.fontSize < 8 || model.fontSize > 12 || !Number.isFinite(model.fontSize)
    || !Number.isFinite(model.marginMm) || typeof model.footer !== 'string') {
    throw new Error('O modelo do comprovante não é compatível com a impressora.');
  }
}

async function resolveAssets(receipt: PdvReceipt): Promise<PdvReceiptAssets> {
  const image = async (source: string | null, required: boolean) => {
    if (!source) return null;
    const absolute = source.startsWith('/') && typeof window !== 'undefined'
      ? new URL(source, window.location.origin).href : source;
    const resolved = await resolveCanonicalPdfPhoto(absolute);
    if (!resolved && required) throw new Error('Não foi possível carregar a marca configurada no comprovante. Tente novamente.');
    return resolved;
  };
  return { logo: await image(receipt.issuer.logoUrl, receipt.template.showLogo) };
}

function drawReceipt(pdf: jsPDF, receipt: PdvReceipt, assets: PdvReceiptAssets) {
  const model = receipt.template;
  const width = model.widthMm;
  const margin = model.marginMm;
  const available = width - margin * 2;
  // Recibos térmicos usam fundo branco por solicitação explícita do operador.
  // A configuração institucional continua preservada para os demais documentos.
  let y = drawCanonicalThermalHeader(pdf,
    normalizeCanonicalInstitutionalHeader(receipt.issuer), assets.logo,
    { margin, fontSize: model.fontSize, showLogo: model.showLogo });
  const text = (value: string, options: { bold?: boolean; center?: boolean; size?: number; gap?: number } = {}) => {
    pdf.setFont('courier', options.bold ? 'bold' : 'normal');
    const size = options.size ?? model.fontSize;
    pdf.setFontSize(size);
    pdf.setTextColor(0, 0, 0);
    const lines = pdf.splitTextToSize(normalizeCanonicalPdfText(value), available) as string[];
    pdf.text(lines, options.center ? width / 2 : margin, y,
      { align: options.center ? 'center' : 'left', baseline: 'top', lineHeightFactor: 1.15 });
    y += lines.length * size * 0.352778 * 1.15 + (options.gap ?? 0.8);
  };
  const divider = () => {
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.15);
    pdf.setLineDashPattern([0.7, 0.5], 0);
    pdf.line(margin, y + 1, width - margin, y + 1);
    pdf.setLineDashPattern([], 0);
    y += 3;
  };
  const pair = (label: string, value: string, emphasized = false) => {
    const size = emphasized ? model.fontSize + 3 : model.fontSize;
    pdf.setFont('courier', emphasized ? 'bold' : 'normal');
    pdf.setFontSize(size);
    const labelSize = emphasized ? model.fontSize : size;
    const valueWidth = available * 0.55;
    const values = pdf.splitTextToSize(normalizeCanonicalPdfText(value), valueWidth) as string[];
    pdf.text(values, width - margin, y, { align: 'right', baseline: 'top', lineHeightFactor: 1.15 });
    pdf.setFontSize(labelSize);
    const labels = pdf.splitTextToSize(label, available * 0.42) as string[];
    pdf.text(labels, margin, y, { baseline: 'top', lineHeightFactor: 1.15 });
    y += Math.max(values.length * size, labels.length * labelSize) * 0.352778 * 1.15 + 1;
  };
  text('COMPROVANTE DE RECEBIMENTO', { bold: true, center: true });
  text(`Nº ${receipt.number}`, { center: true, size: Math.max(7, model.fontSize - 1) });
  divider();
  text('PAGADOR', { bold: true, size: 7 });
  text(receipt.payer.name, { bold: true });
  if (receipt.payer.documentMasked) {
    text(`${receipt.payer.documentLabel || 'Documento'}: ${receipt.payer.documentMasked}`,
      { size: Math.max(7, model.fontSize - 1) });
  }
  if (receipt.payer.enrollmentNumber) {
    text(`Matrícula: ${receipt.payer.enrollmentNumber}`, { size: Math.max(7, model.fontSize - 1) });
  }
  divider();
  text('DESCRIÇÃO', { bold: true, size: 7 });
  text(receipt.description, { gap: 2 });
  pair('Pagamento', receipt.paidAtDisplay);
  pair('Forma', receipt.paymentMethod);
  divider();
  // Valores, numeração, data e documento já vêm formatados pela RPC.
  pair('TOTAL RECEBIDO', receipt.totalDisplay, true);
  y += 1;
  text('PAGAMENTO CONFIRMADO', { bold: true, center: true, size: Math.max(7, model.fontSize - 1) });
  divider();
  if (model.footer) text(model.footer, { center: true, size: Math.max(7, model.fontSize - 1), gap: 2 });
  text('Comprovante de recebimento. Não substitui documento fiscal.', { center: true, size: 7 });
  text(`ID: ${receipt.id}`, { center: true, size: 6.5 });
  return y + margin;
}

/** Um único PDF vetorial reutilizado na prévia, download e impressão. */
export async function createPdvReceiptPdf(receipt: PdvReceipt, suppliedAssets?: PdvReceiptAssets) {
  assertPdvReceipt(receipt);
  const assets = suppliedAssets ?? await resolveAssets(receipt);
  if (receipt.template.showLogo && receipt.issuer.logoUrl && !assets.logo) throw new Error('Logo configurada indisponível.');
  const options = { unit: 'mm' as const, compress: true, putOnlyUsedFonts: true, precision: 4 };
  // Mede apenas a apresentação da página contínua; não calcula dados financeiros.
  const measure = new jsPDF({ ...options, format: [receipt.template.widthMm, 1000] });
  const height = Math.max(receipt.template.widthMm + 1, drawReceipt(measure, receipt, assets));
  if (height > 1000) throw new Error('O conteúdo ultrapassa o comprimento suportado pelo recibo.');
  const pdf = new jsPDF({ ...options, format: [receipt.template.widthMm, height] });
  pdf.setProperties({ title: `Comprovante ${receipt.number}`, author: receipt.issuer.name, creator: 'Universo PDV' });
  drawReceipt(pdf, receipt, assets);
  return { blob: pdf.output('blob'), fileName: `comprovante-${receipt.id}.pdf` };
}
