import type { jsPDF } from 'jspdf';

import {
  drawCanonicalInstitutionalHeader,
  normalizeCanonicalInstitutionalHeader,
} from '../../gestor/secretaria/shared/canonical-institutional-header-pdf.ts';
import {
  drawCanonicalPdfText,
  drawCanonicalPdfWatermark,
  normalizeCanonicalPdfText,
  resolveCanonicalPdfPhoto,
} from '../../gestor/secretaria/shared/canonical-document-vector-pdf.ts';
import type {
  CanonicalDocumentPdfBuildOptions,
  CanonicalDocumentPdfResult,
} from '../../gestor/secretaria/shared/canonical-document-pdf.types.ts';
import type { CanonicalDocumentPreviewItem } from '../../gestor/secretaria/shared/canonical-document-render.types.ts';
import type { ProfessorFinancialReceiptPayload } from './financeiro.types.ts';

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const CONTENT_LEFT = 20;
const CONTENT_RIGHT = 20;
const CONTENT_WIDTH = PAGE_WIDTH - CONTENT_LEFT - CONTENT_RIGHT;

type PdfGStateConstructor = new (parameters: { opacity: number }) => unknown;

export interface ProfessorFinancialReceiptPreviewItem extends CanonicalDocumentPreviewItem {
  receiptPayload: ProfessorFinancialReceiptPayload;
}

interface PreparedReceipt {
  item: ProfessorFinancialReceiptPreviewItem;
  logo: Awaited<ReturnType<typeof resolveCanonicalPdfPhoto>>;
  watermark: Awaited<ReturnType<typeof resolveCanonicalPdfPhoto>>;
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const formatCurrency = (value: number) => currencyFormatter.format(value);

const assertCompatiblePayload = (payload: ProfessorFinancialReceiptPayload) => {
  if (payload.model.key !== 'recibo'
      || payload.model.source !== 'MODELO_RECIBO_PADRAO'
      || payload.model.documentKind !== 'RECIBO_HONORARIOS_PROFESSOR') {
    throw new Error('O servidor retornou um modelo incompatível com o recibo de honorários.');
  }
  if (payload.receipt.statusCode !== 'PAGO') {
    throw new Error('Somente uma baixa financeira confirmada pode gerar este recibo.');
  }
  if (!Number.isFinite(payload.receipt.valuePaid)) {
    throw new Error('O valor efetivamente pago não foi confirmado pelo servidor.');
  }
  if (!Number.isFinite(payload.watermark.opacity)
      || !Number.isFinite(payload.watermark.scale)) {
    throw new Error('A configuração da marca d água está incompleta.');
  }
};

const prepareReceipt = async (
  item: ProfessorFinancialReceiptPreviewItem,
): Promise<PreparedReceipt> => {
  assertCompatiblePayload(item.receiptPayload);
  const [logo, watermark] = await Promise.all([
    resolveCanonicalPdfPhoto(item.receiptPayload.institution.logoUrl),
    resolveCanonicalPdfPhoto(item.receiptPayload.watermark.imageUrl),
  ]);
  if (item.receiptPayload.institution.logoUrl && !logo) {
    throw new Error('Não foi possível resolver a logo configurada para o cabeçalho institucional.');
  }
  if (item.receiptPayload.watermark.imageUrl && !watermark) {
    throw new Error('Não foi possível resolver a imagem configurada para a marca d água.');
  }
  return { item, logo, watermark };
};

const drawWatermark = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  prepared: PreparedReceipt,
) => {
  const { watermark } = prepared.item.receiptPayload;
  const layoutScale = Math.min(100, Math.max(18, watermark.scale)) / 100;
  const width = PAGE_WIDTH * layoutScale;
  const height = PAGE_HEIGHT * layoutScale;
  drawCanonicalPdfWatermark(pdf, GState, {
    enabled: watermark.enabled,
    imageUrl: prepared.watermark?.dataUrl || null,
    label: watermark.label,
    opacity: watermark.opacity,
  }, {
    x: (PAGE_WIDTH - width) / 2,
    y: (PAGE_HEIGHT - height) / 2,
    width,
    height,
    textSize: 25,
    rotate: watermark.rotate ? 45 : 0,
  });
};

const drawField = (
  pdf: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
) => {
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(5.5);
  drawCanonicalPdfText(pdf, label.toUpperCase(), x, y + 2.5, {
    maxWidth: width - 6,
    maxLines: 1,
  });
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(8.2);
  drawCanonicalPdfText(pdf, value, x, y + 6.5, {
    maxWidth: width - 6,
    maxLines: 2,
    lineHeight: 1.12,
  });
};

const drawFieldGrid = (
  pdf: jsPDF,
  payload: ProfessorFinancialReceiptPayload,
  startY: number,
) => {
  const { receipt } = payload;
  const rows = [
    [
      ['Beneficiário', receipt.beneficiaryName],
      ['Categoria', receipt.category],
    ],
    [
      ['Pagamento', receipt.paidAtLabel],
      ['Forma de pagamento', receipt.paymentMethod],
    ],
    [
      ['Vencimento original', receipt.dueDateLabel],
      ['Polo', `${receipt.poloName} · ${receipt.poloLocation}`],
    ],
  ] as const;
  const gap = 5;
  const columnWidth = (CONTENT_WIDTH - gap) / 2;
  const rowHeight = 17;

  rows.forEach((row, index) => {
    const y = startY + index * rowHeight;
    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.2);
    pdf.roundedRect(CONTENT_LEFT, y, CONTENT_WIDTH, rowHeight - 2, 1.8, 1.8, 'FD');
    drawField(pdf, row[0][0], row[0][1], CONTENT_LEFT + 3, y, columnWidth);
    pdf.line(
      CONTENT_LEFT + columnWidth + gap / 2,
      y + 2,
      CONTENT_LEFT + columnWidth + gap / 2,
      y + rowHeight - 4,
    );
    drawField(
      pdf,
      row[1][0],
      row[1][1],
      CONTENT_LEFT + columnWidth + gap,
      y,
      columnWidth,
    );
  });
};

const drawReceiptPage = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  prepared: PreparedReceipt,
) => {
  const payload = prepared.item.receiptPayload;
  const { receipt, institution } = payload;
  drawWatermark(pdf, GState, prepared);
  const header = drawCanonicalInstitutionalHeader(
    pdf,
    normalizeCanonicalInstitutionalHeader(institution as unknown as Record<string, unknown>),
    prepared.logo,
    {
      orientation: 'portrait',
      alias: `professor-receipt-logo-${receipt.id}`,
      meta: {
        eyebrow: 'Financeiro docente',
        title: receipt.title,
        label: 'Situação',
        value: receipt.statusLabel,
      },
    },
  );

  const titleY = header.contentTop + 4;
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 26, 51);
  pdf.setFontSize(14);
  pdf.text(receipt.title.toUpperCase(), PAGE_WIDTH / 2, titleY, {
    align: 'center',
    baseline: 'top',
  });
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(5.9);
  pdf.text(`DOCUMENTO Nº ${receipt.receiptNumber}`, PAGE_WIDTH / 2, titleY + 7, {
    align: 'center',
    baseline: 'top',
  });

  const valueTop = titleY + 17;
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(16, 185, 129);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(CONTENT_LEFT, valueTop, CONTENT_WIDTH, 24, 3, 3, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(5.8);
  pdf.text('VALOR EFETIVAMENTE PAGO', PAGE_WIDTH / 2, valueTop + 4.5, {
    align: 'center',
    baseline: 'top',
  });
  pdf.setTextColor(0, 26, 51);
  pdf.setFontSize(20);
  pdf.text(formatCurrency(receipt.valuePaid), PAGE_WIDTH / 2, valueTop + 9.5, {
    align: 'center',
    baseline: 'top',
  });

  const narrativeTop = valueTop + 31;
  pdf.setFont('times', 'normal');
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(10);
  drawCanonicalPdfText(
    pdf,
    normalizeCanonicalPdfText(receipt.declaration),
    CONTENT_LEFT,
    narrativeTop,
    { maxWidth: CONTENT_WIDTH, maxLines: 4, lineHeight: 1.42 },
  );

  const descriptionTop = narrativeTop + 27;
  pdf.setFillColor(245, 243, 255);
  pdf.setDrawColor(221, 214, 254);
  pdf.roundedRect(CONTENT_LEFT, descriptionTop, CONTENT_WIDTH, 21, 2.5, 2.5, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(109, 40, 217);
  pdf.setFontSize(5.8);
  pdf.text('DESCRIÇÃO', CONTENT_LEFT + 4, descriptionTop + 3.2, { baseline: 'top' });
  pdf.setTextColor(46, 16, 101);
  pdf.setFontSize(8.4);
  drawCanonicalPdfText(pdf, receipt.description, CONTENT_LEFT + 4, descriptionTop + 8, {
    maxWidth: CONTENT_WIDTH - 8,
    maxLines: 2,
    lineHeight: 1.2,
  });

  drawFieldGrid(pdf, payload, descriptionTop + 27);

  const signatureTop = PAGE_HEIGHT - 46;
  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.25);
  pdf.line(PAGE_WIDTH - 98, signatureTop + 18, PAGE_WIDTH - CONTENT_RIGHT, signatureTop + 18);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 26, 51);
  pdf.setFontSize(7.2);
  pdf.text(institution.name, PAGE_WIDTH - 59, signatureTop + 21, {
    align: 'center',
    baseline: 'top',
  });
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(5.3);
  pdf.text('RESPONSÁVEL FINANCEIRO', PAGE_WIDTH - 59, signatureTop + 25.5, {
    align: 'center',
    baseline: 'top',
  });

  const footerY = PAGE_HEIGHT - 10;
  pdf.setDrawColor(226, 232, 240);
  pdf.line(CONTENT_LEFT, footerY - 3, PAGE_WIDTH - CONTENT_RIGHT, footerY - 3);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(5.2);
  pdf.text(receipt.footerNote, CONTENT_LEFT, footerY - 0.2, {
    baseline: 'top',
    maxWidth: CONTENT_WIDTH - 45,
  });
  pdf.text(`Emitido em ${receipt.emittedAtLabel}`, PAGE_WIDTH - CONTENT_RIGHT, footerY, {
    align: 'right',
    baseline: 'top',
  });
};

export const createProfessorFinancialReceiptPdf = async (
  items: readonly ProfessorFinancialReceiptPreviewItem[],
  options: CanonicalDocumentPdfBuildOptions = {},
): Promise<CanonicalDocumentPdfResult> => {
  if (!items.length) throw new Error('Nenhum recibo foi selecionado para visualização.');
  const prepared = await Promise.all(items.map(prepareReceipt));
  const { jsPDF, GState } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
    putOnlyUsedFonts: true,
    precision: 4,
  });
  const first = prepared[0].item.receiptPayload.receipt;
  pdf.setProperties({
    title: first.title,
    subject: 'Comprovante financeiro do professor',
    author: 'Universo Cursos e Consultoria',
    creator: 'Universo Cursos e Consultoria',
  });

  prepared.forEach((entry, index) => {
    if (index > 0) pdf.addPage('a4', 'portrait');
    drawReceiptPage(pdf, GState as unknown as PdfGStateConstructor, entry);
    options.onProgress?.({ current: index + 1, total: prepared.length });
  });

  return {
    blob: pdf.output('blob'),
    fileName: `recibo-honorarios-${first.receiptNumber.toLowerCase()}.pdf`,
  };
};
