import type { jsPDF } from 'jspdf';

import { polosService, type Polo } from '../../../configuracoes/polos/polos.service';
import {
  drawCanonicalInstitutionalHeader,
  normalizeCanonicalInstitutionalHeader,
} from '../../../secretaria/shared/canonical-institutional-header-pdf';
import {
  drawCanonicalPdfText,
  drawCanonicalPdfWatermark,
  getCanonicalPdfInlineImage,
  normalizeCanonicalPdfText,
  resolveCanonicalPdfPhoto,
} from '../../../secretaria/shared/canonical-document-vector-pdf';
import type {
  CanonicalDocumentPdfBuildOptions,
  CanonicalDocumentPdfResult,
} from '../../../secretaria/shared/canonical-document-pdf.types';
import type { CanonicalDocumentPreviewItem } from '../../../secretaria/shared/canonical-document-render.types';
import { formatCpfCnpj, type ReciboData } from '../../../cadastros/modelos-documentos/recibo/ReciboDespesaPreview';

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const CONTENT_LEFT = 20;
const CONTENT_RIGHT = 20;
const CONTENT_WIDTH = PAGE_WIDTH - CONTENT_LEFT - CONTENT_RIGHT;

type PdfGStateConstructor = new (parameters: { opacity: number }) => unknown;

export interface DespesaReciboPreviewItem extends CanonicalDocumentPreviewItem {
  recibo: ReciboData;
  poloSnapshot?: Polo;
}

interface PreparedReceipt {
  item: DespesaReciboPreviewItem;
  polo: Polo;
  logoDataUrl: string | null;
  watermarkDataUrl: string | null;
}

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(Number.isFinite(value) ? value : 0);

const formatDate = (value?: string) => {
  const normalized = String(value || '').slice(0, 10);
  if (!normalized) return 'Não informada';
  const date = new Date(`${normalized}T12:00:00`);
  return Number.isNaN(date.getTime()) ? 'Não informada' : date.toLocaleDateString('pt-BR');
};

const normalizeStatus = (status?: string) => String(status || 'PENDENTE').trim().toUpperCase();

const statusLabel = (status?: string) => ({
  PAGO: 'Pago',
  PENDENTE: 'Pendente',
  VENCIDO: 'Vencido',
  CANCELADO: 'Cancelado',
}[normalizeStatus(status)] || 'Não informado');

const isPaid = (receipt: ReciboData) => normalizeStatus(receipt.status) === 'PAGO';

const documentTitle = (receipt: ReciboData) => (
  isPaid(receipt) ? 'Recibo de pagamento' : 'Comprovante de lançamento'
);

const installmentLabel = (receipt: ReciboData) => {
  const total = Math.max(1, Number(receipt.totalParcelas || 1));
  const current = Math.min(total, Math.max(1, Number(receipt.parcelaNumero || 1)));
  return total > 1 ? `${current}/${total}` : 'Única (1/1)';
};

const makeFallbackPolo = (receipt: ReciboData): Polo => ({
  id: receipt.poloId,
  nome: receipt.poloNome || receipt.empresaNome || 'Universo Cursos e Consultoria',
  nomeFantasia: receipt.poloNome || receipt.empresaNome || 'Universo Cursos e Consultoria',
  cnpj: receipt.empresaCnpj || '',
  cidade: '',
  estado: '',
  uf: '',
  status: 'ativo',
  logoUrl: receipt.logoUrl || '',
});

const resolveReceiptPolo = async (receipt: ReciboData) => {
  if (!receipt.poloId) return makeFallbackPolo(receipt);
  const polo = await polosService.getById(receipt.poloId);
  if (!polo) throw new Error('Não foi possível localizar os dados institucionais do polo deste lançamento.');
  return polo;
};

const clampWatermarkScale = (value: number | undefined) => {
  const raw = Number(value);
  return Math.min(1, Math.max(0.18, Number.isFinite(raw) ? raw / 100 : 0.5));
};

const drawReceiptWatermark = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  polo: Polo,
  imageDataUrl: string | null,
) => {
  const scale = clampWatermarkScale(polo.watermark_scale);
  const width = PAGE_WIDTH * scale;
  const height = PAGE_HEIGHT * scale;
  drawCanonicalPdfWatermark(pdf, GState, {
    enabled: true,
    imageUrl: imageDataUrl,
    label: polo.nome || 'UNIVERSO CURSOS E CONSULTORIA',
    opacity: polo.watermark_opacity ?? 0.06,
  }, {
    x: (PAGE_WIDTH - width) / 2,
    y: (PAGE_HEIGHT - height) / 2,
    width,
    height,
    textSize: 25,
    rotate: polo.watermark_rotate === false ? 0 : 45,
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
  drawCanonicalPdfText(pdf, label.toUpperCase(), x, y + 2.4, {
    maxWidth: width - 5,
    maxLines: 1,
  });
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(8.4);
  drawCanonicalPdfText(pdf, value, x, y + 6.4, {
    maxWidth: width - 5,
    maxLines: 2,
    lineHeight: 1.12,
  });
};

const drawReceiptDetails = (pdf: jsPDF, receipt: ReciboData, startY: number) => {
  const amountPaid = receipt.valorPago ?? receipt.valor;
  const paymentValue = isPaid(receipt)
    ? formatCurrency(amountPaid)
    : 'Ainda não baixada';
  const paymentDate = isPaid(receipt)
    ? formatDate(receipt.dataPagamento)
    : 'Ainda não baixada';
  const paymentMethod = isPaid(receipt)
    ? receipt.formaPagamento || 'Não informada'
    : 'Ainda não baixada';
  const supplierDocument = formatCpfCnpj(receipt.fornecedorDocumento) || 'Não informado';
  const rows = [
    [
      ['Fornecedor / credor', receipt.fornecedorNome || 'Não informado'],
      ['CPF/CNPJ', supplierDocument],
    ],
    [
      ['Categoria', receipt.categoriaNome || 'Não informada'],
      ['Data de lançamento', formatDate(receipt.dataLancamento)],
    ],
    [
      ['Data de vencimento', formatDate(receipt.dataVencimento)],
      ['Valor previsto', formatCurrency(receipt.valor)],
    ],
    [
      ['Valor pago', paymentValue],
      ['Conta de saída', receipt.contaBancariaNome || 'Não informada'],
    ],
    [
      ['Pagamento', `${paymentDate} · ${paymentMethod} · ${statusLabel(receipt.status)}`],
      ['Parcela', installmentLabel(receipt)],
    ],
  ] as const;
  const gap = 5;
  const columnWidth = (CONTENT_WIDTH - gap) / 2;
  const rowHeight = 16;

  rows.forEach((row, rowIndex) => {
    const y = startY + rowIndex * rowHeight;
    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.2);
    pdf.roundedRect(CONTENT_LEFT, y, CONTENT_WIDTH, rowHeight - 2, 1.8, 1.8, 'FD');
    drawField(pdf, row[0][0], row[0][1], CONTENT_LEFT + 3, y, columnWidth);
    pdf.setDrawColor(226, 232, 240);
    pdf.line(CONTENT_LEFT + columnWidth + (gap / 2), y + 2, CONTENT_LEFT + columnWidth + (gap / 2), y + rowHeight - 4);
    drawField(pdf, row[1][0], row[1][1], CONTENT_LEFT + columnWidth + gap, y, columnWidth);
  });
};

const drawReceiptPage = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  prepared: PreparedReceipt,
  emittedAt: Date,
) => {
  const { item, polo, logoDataUrl, watermarkDataUrl } = prepared;
  const receipt = item.recibo;
  const paid = isPaid(receipt);
  const title = documentTitle(receipt);
  const paidValue = receipt.valorPago ?? receipt.valor;
  const supplierDocument = formatCpfCnpj(receipt.fornecedorDocumento);

  drawReceiptWatermark(pdf, GState, polo, watermarkDataUrl);
  const header = drawCanonicalInstitutionalHeader(
    pdf,
    normalizeCanonicalInstitutionalHeader(polo as unknown as Record<string, unknown>),
    getCanonicalPdfInlineImage(logoDataUrl),
    {
      orientation: 'portrait',
      alias: 'recibo-despesa-logo',
      meta: {
        eyebrow: 'Financeiro · contas a pagar',
        title,
        label: 'Situação',
        value: statusLabel(receipt.status),
      },
    },
  );

  const titleY = header.contentTop + 4;
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 26, 51);
  pdf.setFontSize(14);
  pdf.text(title.toUpperCase(), PAGE_WIDTH / 2, titleY, { align: 'center', baseline: 'top' });
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(5.9);
  pdf.text(`DOCUMENTO Nº ${(receipt.reciboNumero || item.emissionId.slice(0, 8)).toUpperCase()}`, PAGE_WIDTH / 2, titleY + 6.8, {
    align: 'center',
    baseline: 'top',
  });

  const valueTop = titleY + 16;
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(paid ? 16 : 190, paid ? 185 : 24, paid ? 129 : 93);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(CONTENT_LEFT, valueTop, CONTENT_WIDTH, 23, 3, 3, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(5.8);
  pdf.text(paid ? 'VALOR PAGO' : 'VALOR PREVISTO', PAGE_WIDTH / 2, valueTop + 4.3, {
    align: 'center',
    baseline: 'top',
  });
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 26, 51);
  pdf.setFontSize(20);
  pdf.text(formatCurrency(paid ? paidValue : receipt.valor), PAGE_WIDTH / 2, valueTop + 9.2, {
    align: 'center',
    baseline: 'top',
  });

  const narrative = paid
    ? `Declaramos que foi efetuado o pagamento de ${formatCurrency(paidValue)} ao fornecedor ${receipt.fornecedorNome || 'não informado'}${supplierDocument ? `, CPF/CNPJ ${supplierDocument}` : ''}, referente a ${receipt.descricao || 'despesa sem descrição'}.`
    : `Este documento registra a despesa ${receipt.descricao || 'sem descrição'}, no valor previsto de ${formatCurrency(receipt.valor)}, ainda pendente de baixa financeira.`;
  const narrativeTop = valueTop + 30;
  pdf.setFont('times', 'normal');
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(10.2);
  drawCanonicalPdfText(pdf, normalizeCanonicalPdfText(narrative), CONTENT_LEFT, narrativeTop, {
    maxWidth: CONTENT_WIDTH,
    maxLines: 4,
    lineHeight: 1.42,
  });

  const detailTop = narrativeTop + 29;
  drawReceiptDetails(pdf, receipt, detailTop);

  const observation = String(receipt.observacao || '').trim();
  if (observation) {
    const observationTop = detailTop + 82;
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(5.8);
    pdf.text('OBSERVAÇÃO', CONTENT_LEFT, observationTop, { baseline: 'top' });
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(51, 65, 85);
    pdf.setFontSize(7.6);
    drawCanonicalPdfText(pdf, observation, CONTENT_LEFT, observationTop + 4.4, {
      maxWidth: CONTENT_WIDTH,
      maxLines: 3,
      lineHeight: 1.2,
    });
  }

  const cityState = [polo.cidade, polo.estado || polo.uf].filter(Boolean).join('/');
  const signatureTop = PAGE_HEIGHT - 42;
  pdf.setFont('times', 'normal');
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(8.8);
  pdf.text(`${cityState || 'Japoatã/SE'}, ${emittedAt.toLocaleDateString('pt-BR')}.`, CONTENT_LEFT, signatureTop, {
    baseline: 'top',
  });
  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.25);
  pdf.line(PAGE_WIDTH - 98, signatureTop + 18, PAGE_WIDTH - CONTENT_RIGHT, signatureTop + 18);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 26, 51);
  pdf.setFontSize(7.2);
  pdf.text(polo.nome || 'Universo Cursos e Consultoria', PAGE_WIDTH - 59, signatureTop + 21, {
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
  pdf.text(`Emitido eletronicamente em ${emittedAt.toLocaleString('pt-BR')}`, CONTENT_LEFT, footerY, { baseline: 'top' });
  pdf.text(`ID ${item.emissionId.slice(0, 8).toUpperCase()}`, PAGE_WIDTH - CONTENT_RIGHT, footerY, {
    align: 'right',
    baseline: 'top',
  });
};

/**
 * Compositor vetorial do recibo de despesa. A prévia, o download e a
 * impressão recebem o mesmo Blob gerado aqui pelo visualizador canônico.
 */
export const createDespesaReciboPdf = async (
  items: readonly DespesaReciboPreviewItem[],
  options: CanonicalDocumentPdfBuildOptions = {},
): Promise<CanonicalDocumentPdfResult> => {
  if (!items.length) throw new Error('Nenhuma despesa foi selecionada para gerar o recibo.');

  const prepared = await Promise.all(items.map(async (item) => {
    const polo = item.poloSnapshot || await resolveReceiptPolo(item.recibo);
    const [logo, watermark] = await Promise.all([
      resolveCanonicalPdfPhoto(polo.logoUrl),
      resolveCanonicalPdfPhoto(polo.watermark_url),
    ]);
    return {
      item,
      polo,
      logoDataUrl: logo?.dataUrl || null,
      watermarkDataUrl: watermark?.dataUrl || null,
    } satisfies PreparedReceipt;
  }));

  const { jsPDF, GState } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
    putOnlyUsedFonts: true,
    precision: 4,
  });
  const first = prepared[0].item;
  pdf.setProperties({
    title: documentTitle(first.recibo),
    subject: 'Comprovante financeiro de despesa',
    author: 'Universo Cursos e Consultoria',
    creator: 'Universo Cursos e Consultoria',
  });

  const emittedAt = new Date();
  prepared.forEach((entry, index) => {
    if (index > 0) pdf.addPage('a4', 'portrait');
    drawReceiptPage(pdf, GState as unknown as PdfGStateConstructor, entry, emittedAt);
    options.onProgress?.({ current: index + 1, total: prepared.length });
  });

  const identifier = (first.recibo.lancamentoId || first.emissionId).slice(0, 8).toLowerCase();
  return {
    blob: pdf.output('blob'),
    fileName: `${isPaid(first.recibo) ? 'recibo-pagamento' : 'comprovante-lancamento'}-${identifier}.pdf`,
  };
};
