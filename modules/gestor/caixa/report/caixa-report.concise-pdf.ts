import type { jsPDF } from 'jspdf';
import { drawCanonicalInstitutionalHeader } from '../../secretaria/shared/canonical-institutional-header-pdf';
import { formatCaixaCanonicalCurrency, formatCaixaCurrency, formatCaixaDate, formatCaixaPercent } from '../caixa.formatters';
import type { CaixaDetailedReport, CaixaReportTotals } from './caixa-report.types';
import { prepareCaixaPdfContext, type CaixaPdfResources } from './caixa-report.vector-pdf.context';
import { COLORS, CONTENT_LEFT, CONTENT_WIDTH, FOOTER_TOP, drawFooter, drawPageBackground, setText } from './caixa-report.vector-pdf.shared';

const GAP = 4;
const PT_PER_MM = 72 / 25.4;
const overflow = () => { throw new Error('O conteúdo agregado não cabe integralmente nas duas páginas do relatório resumido.'); };

/** All text stays visible and readable; overflow never removes data or adds ellipses. */
function text(pdf: jsPDF, value: string, x: number, y: number, width: number,
  options: { size?: number; bold?: boolean; color?: string; maxHeight?: number; align?: 'left' | 'right' } = {}) {
  const size = options.size || 9;
  setText(pdf, options.color || COLORS.slate700, size, options.bold ? 'bold' : 'normal');
  const lines = pdf.splitTextToSize(value, width) as string[];
  const height = lines.length * size / PT_PER_MM * 1.2;
  if (options.maxHeight !== undefined && height > options.maxHeight) overflow();
  pdf.text(lines, options.align === 'right' ? x + width : x, y,
    { baseline: 'top', lineHeightFactor: 1.2, align: options.align || 'left' });
  return height;
}

function metricCards(pdf: jsPDF, values: Array<[string, string]>, y: number, columns: number, height = 21) {
  const width = (CONTENT_WIDTH - GAP * (columns - 1)) / columns;
  values.forEach(([label, value], index) => {
    const x = CONTENT_LEFT + (index % columns) * (width + GAP), top = y + Math.floor(index / columns) * (height + GAP);
    pdf.setFillColor(COLORS.white); pdf.setDrawColor(COLORS.slate200); pdf.roundedRect(x, top, width, height, 2, 2, 'FD');
    text(pdf, label, x + 3, top + 2.5, width - 6, { size: 8.5, maxHeight: 8 });
    text(pdf, value, x + 3, top + 12, width - 6, { size: 11.5, bold: true, color: COLORS.navy, maxHeight: height - 13 });
  });
  return y + Math.ceil(values.length / columns) * (height + GAP);
}

function positionLines(pdf: jsPDF, values: Array<[string, string]>, y: number) {
  const width = (CONTENT_WIDTH - GAP) / 2;
  for (const [index, [label, value]] of values.entries()) {
    const x = CONTENT_LEFT + (index % 2) * (width + GAP), top = y + Math.floor(index / 2) * 9;
    if (top + 9 > FOOTER_TOP - 2) overflow();
    text(pdf, label, x + 2, top + 1.5, width - 57, { size: 8.5, maxHeight: 6 });
    text(pdf, value, x + width - 55, top + 1.5, 53, { size: 8.5, bold: true, align: 'right', maxHeight: 6 });
    pdf.setDrawColor(COLORS.slate200); pdf.line(x, top + 9, x + width, top + 9);
  }
}

function composition(pdf: jsPDF, title: string, totals: CaixaReportTotals, x: number, y: number, width: number) {
  const rows: Array<[string, number]> = [['Base', totals.valorBase], ['Juros', totals.jurosIdentificados],
    ['Multa', totals.multaIdentificada], ['Acréscimos', totals.acrescimoIdentificado],
    ['Descontos', totals.descontoIdentificado], ['Diferença a conferir', totals.diferencaNaoDiscriminada]];
  pdf.setFillColor(COLORS.white); pdf.setDrawColor(COLORS.slate200); pdf.roundedRect(x, y, width, 50, 2, 2, 'FD');
  text(pdf, title, x + 3, y + 3, width - 6, { bold: true, maxHeight: 5 });
  text(pdf, `${totals.quantidade} movimento(s) · ${formatCaixaCurrency(totals.valorFinal)}`, x + 3, y + 9, width - 6, { size: 8.5, maxHeight: 5 });
  const cellWidth = (width - 6) / 2;
  rows.forEach(([label, amount], index) => {
    const left = x + 3 + (index % 2) * cellWidth, top = y + 17 + Math.floor(index / 2) * 10;
    text(pdf, label, left, top, cellWidth - 3, { size: 8.5, maxHeight: 4 });
    text(pdf, formatCaixaCurrency(amount), left, top + 4, cellWidth - 3, { bold: true, maxHeight: 5 });
  });
}

function breakdown(pdf: jsPDF, title: string,
  rows: Array<{ rotulo: string; valor: number; quantidade: number }>, x: number, y: number, width: number, maxHeight: number) {
  text(pdf, title, x, y, width, { size: 11, bold: true, color: COLORS.navy, maxHeight: 6 });
  let cursor = y + 10;
  if (!rows.length) { text(pdf, 'Sem movimentos confirmados.', x, cursor, width, { maxHeight: 5 }); return cursor + 8; }
  for (const row of rows) {
    setText(pdf, COLORS.slate700, 9);
    const labelLines = pdf.splitTextToSize(row.rotulo, width - 47) as string[];
    const rowHeight = Math.max(9, labelLines.length * 9 / PT_PER_MM * 1.2 + 3);
    if (cursor + rowHeight > y + maxHeight) overflow();
    text(pdf, row.rotulo, x + 2, cursor + 1.5, width - 47, { maxHeight: rowHeight - 2 });
    text(pdf, formatCaixaCurrency(row.valor), x + width - 43, cursor + 1.5, 41, { bold: true, align: 'right', maxHeight: rowHeight - 2 });
    cursor += rowHeight;
    pdf.setDrawColor(COLORS.slate200); pdf.line(x, cursor, x + width, cursor);
  }
  return cursor + 4;
}

function drawOverview(pdf: jsPDF, report: CaixaDetailedReport, y: number) {
  const monthly = report.resumo;
  text(pdf, 'PRESTAÇÃO DE CONTAS · RESUMIDO', CONTENT_LEFT, y, CONTENT_WIDTH, { size: 15, bold: true, color: COLORS.navy, maxHeight: 8 });
  y += 12;
  y = metricCards(pdf, [['Entradas recebidas', formatCaixaCurrency(report.totaisRecebimentos.valorFinal)],
    ['Saídas pagas', formatCaixaCurrency(report.totaisDespesas.valorFinal)],
    ['Resultado do mês', formatCaixaCurrency(monthly.resumoCompetencia.resultado)],
    ['Saldo registrado hoje', formatCaixaCurrency(monthly.saldosHoje.registradoTotal)]], y, 4);
  y = metricCards(pdf, [['A receber', formatCaixaCurrency(monthly.compromissos.aReceber)],
    ['Vencido a receber', formatCaixaCurrency(monthly.compromissos.receberVencido)],
    ['A pagar', formatCaixaCurrency(monthly.compromissos.aPagar)],
    ['Vencido a pagar', formatCaixaCurrency(monthly.compromissos.pagarVencido)]], y, 4);
  const half = (CONTENT_WIDTH - GAP) / 2;
  composition(pdf, 'Recebimentos confirmados', report.totaisRecebimentos, CONTENT_LEFT, y, half);
  composition(pdf, 'Despesas pagas', report.totaisDespesas, CONTENT_LEFT + half + GAP, y, half);
  y += 56;
  const evidence = monthly.compromissos.inadimplenciaMensal;
  text(pdf, `Inadimplência do mês: ${formatCaixaPercent(monthly.compromissos.margemInadimplencia)} · corte ${formatCaixaDate(evidence.dataCorte)} · base elegível ${formatCaixaCurrency(evidence.baseElegivel)}.`, CONTENT_LEFT, y, CONTENT_WIDTH, { size: 8.5, maxHeight: 7 });
  y += 9;
  const note = evidence.completo ? 'Fluxo confirmado do período. Saldos representam a posição contábil do sistema.'
    : `${evidence.quantidadeEmConferencia} cobrança(s) em conferência não integram os indicadores mensais.`;
  text(pdf, note, CONTENT_LEFT, y, CONTENT_WIDTH, { size: 8.5, maxHeight: FOOTER_TOP - y - 3 });
}

function drawOriginsAndPositions(pdf: jsPDF, report: CaixaDetailedReport, y: number) {
  text(pdf, 'ORIGENS E POSIÇÕES', CONTENT_LEFT, y, CONTENT_WIDTH, { size: 15, bold: true, color: COLORS.navy, maxHeight: 8 });
  y += 13;
  const half = (CONTENT_WIDTH - GAP) / 2, tableHeight = FOOTER_TOP - y - 34;
  const receiptBottom = breakdown(pdf, 'Receitas recebidas por origem', report.resumo.receitasPorModalidade, CONTENT_LEFT, y, half, tableHeight);
  const expenseBottom = breakdown(pdf, 'Despesas pagas por categoria', report.resumo.despesasPorCategoria, CONTENT_LEFT + half + GAP, y, half, tableHeight);
  y = Math.max(receiptBottom, expenseBottom) + 5;
  const restricted = 'Acesso restrito';
  const assets = report.patrimonio.disponivel ? formatCaixaCanonicalCurrency(report.patrimonio.dados.posicaoFechamento.valorAtivoCusto) : restricted;
  const loans = report.posicaoLiquida.disponivel ? formatCaixaCanonicalCurrency(report.posicaoLiquida.dados.saldoEmprestimosAPagar) : restricted;
  const liquid = report.posicaoLiquida.disponivel ? formatCaixaCanonicalCurrency(report.posicaoLiquida.dados.valorLiquido) : restricted;
  const credit = report.financiamento.disponivel ? formatCaixaCurrency(report.financiamento.dados.creditoLiberadoMatriz) : restricted;
  const obligation = report.financiamento.disponivel ? formatCaixaCurrency(report.financiamento.dados.obrigacaoRateada) : restricted;
  const total = report.posicaoTotal.disponivel === true ? formatCaixaCanonicalCurrency(report.posicaoTotal.dados.valorTotalLiquido)
    : report.posicaoTotal.disponivel === false && report.posicaoTotal.motivo === 'HISTORICO_INSUFICIENTE' ? 'Histórico insuficiente' : restricted;
  positionLines(pdf, [['Patrimônio a custo', assets], ['Empréstimos a pagar', loans], ['Posição líquida', liquid],
    ['Crédito liberado Matriz', credit], ['Obrigação rateada', obligation], ['Posição total no corte', total]], y);
}

export async function createCaixaConcisePdfDocument(report: CaixaDetailedReport,
  onProgress?: (current: number, total: number) => void, resources?: CaixaPdfResources) {
  const { pdf, background, backgroundUsesFallback, institution, canonicalLogo, meta } = await prepareCaixaPdfContext(report, resources);
  for (let index = 0; index < 2; index += 1) {
    if (index) pdf.addPage('a4', 'landscape');
    onProgress?.(index + 1, 2);
    drawPageBackground(pdf, report, background, backgroundUsesFallback);
    const header = drawCanonicalInstitutionalHeader(pdf, institution, canonicalLogo,
      { orientation: 'landscape', alias: 'caixa-institutional-header-logo', meta });
    if (index === 0) drawOverview(pdf, report, header.contentTop);
    else drawOriginsAndPositions(pdf, report, header.contentTop);
    drawFooter(pdf, report, index + 1, 2);
  }
  return pdf;
}

export async function buildCaixaConcisePdf(report: CaixaDetailedReport, onProgress?: (current: number, total: number) => void) {
  return (await createCaixaConcisePdfDocument(report, onProgress)).output('blob');
}
