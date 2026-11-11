import { jsPDF, GState } from 'jspdf';
import { drawCanonicalInstitutionalHeader } from '../../../secretaria/shared/canonical-institutional-header-pdf';
import { drawCanonicalPdfWatermark, normalizeCanonicalPdfText, truncatePdfText } from '../../../secretaria/shared/canonical-document-vector-pdf.core';
import type { NfseDocument } from '../../types/nfse.types';
import { assertNfseIssuedExportReport, formatNfseIssuedReportAmount, type NfseIssuedExportAssets, type NfseIssuedExportReport } from './nfse-issued-export.types';

const LEFT = 20, WIDTH = 170, BOTTOM = 274, ROW_HEIGHT = 12.5;
const columns = [
  { x: LEFT, width: 25, label: 'NFS-e / EMISSÃO' },
  { x: LEFT + 25, width: 67, label: 'TOMADOR / TURMA' },
  { x: LEFT + 92, width: 44, label: 'MODELO / ORIGEM' },
  { x: LEFT + 136, width: 34, label: 'VALOR / SITUAÇÃO' },
] as const;
const dateLabel = (value?: string) => value ? value.split('-').reverse().join('/') : '';
const environmentLabel = (report: NfseIssuedExportReport) => report.scope.environment === 'PRODUCAO' ? 'Produção' : 'Homologação';
const localDate = (value?: string | null) => {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Não informada';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Maceio' }).format(new Date(value));
};
const periodLabel = (report: NfseIssuedExportReport) => {
  const { dateFrom, dateTo } = report.filters;
  if (dateFrom && dateTo) return `${dateLabel(dateFrom)} a ${dateLabel(dateTo)}`;
  if (dateFrom) return `A partir de ${dateLabel(dateFrom)}`;
  if (dateTo) return `Até ${dateLabel(dateTo)}`;
  return `Mês de referência: ${report.scope.month.slice(5)}/${report.scope.month.slice(0, 4)}`;
};
const originLabel = (origin?: string | null) => origin === 'ALUNO' ? 'Aluno' : origin === 'SERVICO' ? 'Serviço' : 'Não informada';
const statusLabels: Record<string, string> = {
  CANCELLATION_PENDING: 'Cancelamento em consulta', CANCELLATION_REJECTED: 'Cancelamento rejeitado',
  AWAITING_ANALYSIS: 'Em análise fiscal',
};
const statusLabel = (row: NfseDocument) => statusLabels[row.state || ''] || 'Emitida';

export const NFSE_ISSUED_EXPORT_PDF_PIPELINE = 'native-vector' as const;

/** One vector PDF Blob is the source of preview, download and print. */
export function createNfseIssuedExportPdf(report: NfseIssuedExportReport, assets: NfseIssuedExportAssets): { blob: Blob; fileName: string } {
  assertNfseIssuedExportReport(report);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true, putOnlyUsedFonts: true });
  pdf.setProperties({ title: 'NFS-e emitidas - Modelo interno', subject: 'Relatório interno de NFS-e emitidas no período',
    author: assets.institution.name, creator: 'Portal Universo' });

  const line = (value: string, x: number, y: number, maxWidth: number,
    options: { size?: number; bold?: boolean; secondary?: boolean; right?: boolean; center?: boolean; exact?: boolean; white?: boolean } = {}) => {
    pdf.setFont('helvetica', options.bold ? 'bold' : 'normal');
    const preferred = options.size ?? 7.6;
    pdf.setFontSize(preferred);
    const text = normalizeCanonicalPdfText(value).replace(/\s+/g, ' ').trim();
    if (options.exact && pdf.getTextWidth(text) > maxWidth) {
      pdf.setFontSize(Math.max(6, preferred * maxWidth / pdf.getTextWidth(text)));
      if (pdf.getTextWidth(text) > maxWidth + 0.05) throw new Error('Um valor do relatório é extenso demais para o modelo interno.');
    }
    const output = options.exact ? text : truncatePdfText(pdf, text, maxWidth, 1)[0] || '';
    pdf.setTextColor(...(options.white ? [255, 255, 255] : options.secondary ? [100, 116, 139] : [24, 51, 75]) as [number, number, number]);
    pdf.text(output, x, y, { baseline: 'top', align: options.right ? 'right' : options.center ? 'center' : 'left' });
  };

  const drawSummary = (y: number) => {
    const cards = [
      { x: LEFT, width: 69, label: 'PERÍODO DE EMISSÃO', value: periodLabel(report), size: 8.4 },
      { x: LEFT + 73, width: 63, label: 'TOTAL EMITIDO NO PERÍODO', value: formatNfseIssuedReportAmount(report.totalAmount), size: 12 },
      { x: LEFT + 140, width: 30, label: 'NOTAS EMITIDAS', value: String(report.totalItems), size: 12 },
    ];
    for (const card of cards) {
      pdf.setFillColor(248, 250, 252); pdf.setDrawColor(226, 232, 240); pdf.setLineWidth(0.2);
      pdf.roundedRect(card.x, y, card.width, 19, 1.5, 1.5, 'FD');
      line(card.label, card.x + 3, y + 3, card.width - 6, { size: 5.9, bold: true, secondary: true });
      line(card.value, card.x + 3, y + 8, card.width - 6, { size: card.size, bold: true, exact: true });
    }
    return y + 23;
  };

  const drawFilters = (y: number) => {
    const filters = report.filters;
    const description = [
      filters.search?.trim() ? `Busca: ${filters.search.trim()}` : '',
      filters.courseType ? `Tipo de curso: ${filters.courseType}` : '',
      filters.origin ? `Origem: ${originLabel(filters.origin)}` : '',
    ].filter(Boolean).join(' · ');
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.9);
    const filterLines = description ? pdf.splitTextToSize(normalizeCanonicalPdfText(description), WIDTH) as string[] : [];
    if (filterLines.length > 12) throw new Error('Os filtros são extensos demais para o relatório. Reduza o texto da busca.');
    for (const text of filterLines) { line(text, LEFT, y, WIDTH, { size: 6.9, secondary: true }); y += 3.7; }
    line('Somente notas emitidas ativas. Relatório interno, não substitui o documento fiscal.', LEFT, y, WIDTH, { size: 6.7, secondary: true });
    if (report.totalAmount === null) {
      y += 3.7;
      line('Total não informado pela consulta. Valores desconhecidos não foram considerados como zero.', LEFT, y, WIDTH, { size: 6.7, secondary: true });
    }
    return y + 7;
  };

  let pageCount = 0;
  const newPage = () => {
    const first = pageCount++ === 0;
    if (!first) pdf.addPage('a4', 'portrait');
    if (assets.watermark) drawCanonicalPdfWatermark(pdf,
      GState as unknown as new (parameters: { opacity: number }) => unknown,
      assets.watermark, { x: 0, y: 0, width: 210, height: 297, textSize: 24 });
    const layout = drawCanonicalInstitutionalHeader(pdf, assets.institution, assets.logo, {
      orientation: 'portrait', alias: 'nfse-issued-institutional-logo',
      meta: { eyebrow: 'Emissor NFS-e', title: 'Notas fiscais emitidas', label: 'Modelo interno', value: environmentLabel(report) },
    });
    let y = layout.contentTop + 4;
    if (first) y = drawFilters(drawSummary(y));
    else {
      line(`${periodLabel(report)} · Continuação`, LEFT, y, WIDTH, { size: 7.2, secondary: true });
      y += 8;
    }
    pdf.setFillColor(24, 51, 75); pdf.rect(LEFT, y, WIDTH, 8, 'F');
    columns.forEach(column => line(column.label, column.x + 2.5, y + 2.5, column.width - 5,
      { size: 5.8, bold: true, white: true }));
    return y + 8;
  };

  const drawRow = (row: NfseDocument, index: number, y: number) => {
    pdf.setFillColor(...(index % 2 ? [248, 250, 252] : [255, 255, 255]) as [number, number, number]);
    pdf.rect(LEFT, y, WIDTH, ROW_HEIGHT, 'F');
    const context = [row.classLabel, row.courseTypeLabel].filter(Boolean).join(' · ') || 'Turma não informada';
    const values = [
      [row.number || 'Não informado', localDate(row.emittedAt)],
      [row.studentName || 'Tomador não informado', context],
      [row.modelLabel || 'Modelo não informado', originLabel(row.origin)],
      [formatNfseIssuedReportAmount(row.amount), statusLabel(row)],
    ];
    columns.forEach((column, i) => {
      const right = i === columns.length - 1;
      const x = right ? column.x + column.width - 2.5 : column.x + 2.5;
      line(values[i][0], x, y + 2.2, column.width - 5, { size: 7.4, bold: true, right, exact: i === 0 || right });
      line(values[i][1], x, y + 7, column.width - 5, { size: 6.5, secondary: true, right });
    });
    pdf.setDrawColor(226, 232, 240); pdf.setLineWidth(0.15);
    pdf.line(LEFT, y + ROW_HEIGHT, LEFT + WIDTH, y + ROW_HEIGHT);
  };

  let y = newPage();
  if (report.rows.length === 0) {
    line('Nenhuma nota emitida neste período.', 105, y + 11, WIDTH - 12, { size: 9, bold: true, center: true });
    // Center the empty message without changing table or summary semantics.
    pdf.setTextColor(100, 116, 139); pdf.setFontSize(7.3); pdf.setFont('helvetica', 'normal');
    pdf.text('A consulta não retornou notas para os filtros selecionados.', 105, y + 20, { align: 'center', baseline: 'top' });
  }
  report.rows.forEach((row, index) => {
    if (y + ROW_HEIGHT > BOTTOM) y = newPage();
    drawRow(row, index, y); y += ROW_HEIGHT;
  });
  for (let page = 1; page <= pageCount; page++) {
    pdf.setPage(page); pdf.setDrawColor(226, 232, 240); pdf.setLineWidth(0.2); pdf.line(LEFT, 281, LEFT + WIDTH, 281);
    line(`Modelo interno · ${environmentLabel(report)} · Gerado em ${localDate(report.generatedAt)}`, LEFT, 284, 132, { size: 6.2, secondary: true });
    line(`Página ${page} de ${pageCount}`, LEFT + WIDTH, 284, 35, { size: 6.2, secondary: true, right: true });
  }
  const from = report.filters.dateFrom || 'inicio', to = report.filters.dateTo || 'fim';
  return { blob: pdf.output('blob'), fileName: `nfse-emitidas-${from}-a-${to}-interno.pdf` };
}
