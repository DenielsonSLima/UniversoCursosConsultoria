import { jsPDF, GState } from 'jspdf';
import { drawCanonicalThermalHeader, normalizeCanonicalInstitutionalHeader } from '../../secretaria/shared/canonical-institutional-header-pdf';
import { drawCanonicalPdfWatermark, normalizeCanonicalPdfText, resolveCanonicalPdfPhoto } from '../../secretaria/shared/canonical-document-vector-pdf';
import type { CanonicalPdfImage } from '../../secretaria/shared/canonical-document-vector-pdf.core';
import type { PdvReceipt } from './pdv-receipt.types';

export interface PdvReceiptAssets { logo: CanonicalPdfImage | null; watermark: CanonicalPdfImage | null }

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
  const [logo, watermark] = await Promise.all([
    image(receipt.issuer.logoUrl, receipt.template.showLogo),
    image(receipt.issuer.watermarkUrl, true),
  ]);
  return { logo, watermark };
}

function drawReceipt(pdf: jsPDF, receipt: PdvReceipt, assets: PdvReceiptAssets, watermark: boolean) {
  const model = receipt.template;
  const width = model.widthMm;
  const margin = model.marginMm;
  const available = width - margin * 2;
  if (watermark && receipt.issuer.watermarkUrl) {
    drawCanonicalPdfWatermark(pdf, GState, {
      enabled: true, imageUrl: receipt.issuer.watermarkUrl, image: assets.watermark,
      label: null, opacity: receipt.issuer.watermarkOpacity,
      scale: receipt.issuer.watermarkScale, rotate: receipt.issuer.watermarkRotate,
    }, { x: margin, y: margin, width: available, height: pdf.internal.pageSize.getHeight() - margin * 2, textSize: 16 });
  }
  let y = drawCanonicalThermalHeader(pdf,
    normalizeCanonicalInstitutionalHeader(receipt.issuer), assets.logo,
    { margin, fontSize: model.fontSize, showLogo: model.showLogo });
  const text = (value: string, options: { bold?: boolean; center?: boolean; size?: number } = {}) => {
    pdf.setFont('helvetica', options.bold ? 'bold' : 'normal');
    const size = options.size ?? model.fontSize;
    pdf.setFontSize(size);
    pdf.setTextColor(0, 0, 0);
    const lines = pdf.splitTextToSize(normalizeCanonicalPdfText(value), available) as string[];
    pdf.text(lines, options.center ? width / 2 : margin, y,
      { align: options.center ? 'center' : 'left', baseline: 'top', lineHeightFactor: 1.3 });
    y += lines.length * size * 0.352778 * 1.3 + 1.5;
  };
  const divider = () => {
    pdf.setDrawColor(0, 0, 0);
    pdf.line(margin, y + 1, width - margin, y + 1);
    y += 4;
  };
  text('COMPROVANTE DE RECEBIMENTO', { bold: true, center: true });
  text(`Nº ${receipt.number}`, { center: true });
  text('PAGAMENTO CONFIRMADO', { bold: true, center: true });
  divider();
  text('VALOR RECEBIDO', { bold: true, center: true });
  // Valores, numeração, data e documento já vêm formatados pela RPC.
  text(receipt.totalDisplay, { bold: true, center: true, size: model.fontSize + 5 });
  divider();
  text(`Pagador: ${receipt.payer.name}`, { bold: true });
  if (receipt.payer.documentMasked) text(`CPF/CNPJ: ${receipt.payer.documentMasked}`);
  text(`Referente a: ${receipt.description}`);
  text(`Pagamento: ${receipt.paidAtDisplay}`);
  text(`Forma: ${receipt.paymentMethod}`);
  divider();
  if (model.footer) text(model.footer, { center: true });
  text('Comprovante de recebimento. Não substitui documento fiscal.', { center: true, size: 7 });
  text(`Identificador: ${receipt.id}`, { center: true, size: 7 });
  return y + margin;
}

/** Um único PDF vetorial reutilizado na prévia, download e impressão. */
export async function createPdvReceiptPdf(receipt: PdvReceipt, suppliedAssets?: PdvReceiptAssets) {
  assertPdvReceipt(receipt);
  const assets = suppliedAssets ?? await resolveAssets(receipt);
  if (receipt.template.showLogo && receipt.issuer.logoUrl && !assets.logo) throw new Error('Logo configurada indisponível.');
  if (receipt.issuer.watermarkUrl && !assets.watermark) throw new Error('Marca d’água configurada indisponível.');
  const options = { unit: 'mm' as const, compress: true, putOnlyUsedFonts: true, precision: 4 };
  // Mede apenas a apresentação da página contínua; não calcula dados financeiros.
  const measure = new jsPDF({ ...options, format: [receipt.template.widthMm, 1000] });
  const height = Math.max(receipt.template.widthMm + 1, drawReceipt(measure, receipt, assets, false));
  if (height > 1000) throw new Error('O conteúdo ultrapassa o comprimento suportado pelo recibo.');
  const pdf = new jsPDF({ ...options, format: [receipt.template.widthMm, height] });
  pdf.setProperties({ title: `Comprovante ${receipt.number}`, author: receipt.issuer.name, creator: 'Universo PDV' });
  drawReceipt(pdf, receipt, assets, true);
  return { blob: pdf.output('blob'), fileName: `comprovante-${receipt.id}.pdf` };
}
