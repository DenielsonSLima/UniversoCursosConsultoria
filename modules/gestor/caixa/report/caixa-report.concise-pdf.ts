import type { jsPDF } from 'jspdf';
import { drawCanonicalInstitutionalHeader } from '../../secretaria/shared/canonical-institutional-header-pdf';
import { formatCaixaCanonicalCurrency, formatCaixaCurrency } from '../caixa.formatters';
import type { CaixaDetailedReport } from './caixa-report.types';
import { prepareCaixaPdfContext, type CaixaPdfResources } from './caixa-report.vector-pdf.context';
import { COLORS, CONTENT_LEFT, CONTENT_WIDTH, FOOTER_TOP, drawCard, drawFooter, drawPageBackground, drawText, setText } from './caixa-report.vector-pdf.shared';
import { drawBreakdownPanel, drawSummaryPage } from './caixa-report.vector-pdf.summary';

const GAP = 2.5;

function drawOriginsAndPositions(pdf: jsPDF, report: CaixaDetailedReport, y: number) {
  setText(pdf, COLORS.navy, 15, 'black');
  drawText(pdf, 'ORIGENS E POSIÇÕES', CONTENT_LEFT, y);
  setText(pdf, COLORS.slate500, 6.2);
  drawText(pdf, 'Origens operacionais e posições complementares, sem repetir os movimentos individuais.', CONTENT_LEFT, y + 6.5);
  y += 13;
  const half = (CONTENT_WIDTH - GAP) / 2;
  const tableHeight = Math.min(80, FOOTER_TOP - y - 43);
  drawBreakdownPanel(pdf, report.resumo.receitasPorModalidade, {
    x: CONTENT_LEFT, y, width: half, height: tableHeight, eyebrow: 'Origem das entradas',
    title: 'Receitas recebidas por modalidade', tone: 'emerald',
  });
  drawBreakdownPanel(pdf, report.resumo.despesasPorCategoria, {
    x: CONTENT_LEFT + half + GAP, y, width: half, height: tableHeight, eyebrow: 'Destino das saídas',
    title: 'Despesas pagas por categoria', tone: 'rose',
  });
  y += tableHeight + 5;
  const restricted = 'Acesso restrito';
  const assets = report.patrimonio.disponivel ? formatCaixaCanonicalCurrency(report.patrimonio.dados.posicaoFechamento.valorAtivoCusto) : restricted;
  const loans = report.posicaoLiquida.disponivel ? formatCaixaCanonicalCurrency(report.posicaoLiquida.dados.saldoEmprestimosAPagar) : restricted;
  const liquid = report.posicaoLiquida.disponivel ? formatCaixaCanonicalCurrency(report.posicaoLiquida.dados.valorLiquido) : restricted;
  const credit = report.financiamento.disponivel ? formatCaixaCurrency(report.financiamento.dados.creditoLiberadoMatriz) : restricted;
  const obligation = report.financiamento.disponivel ? formatCaixaCurrency(report.financiamento.dados.obrigacaoRateada) : restricted;
  const total = report.posicaoTotal.disponivel === true ? formatCaixaCanonicalCurrency(report.posicaoTotal.dados.valorTotalLiquido)
    : report.posicaoTotal.disponivel === false && report.posicaoTotal.motivo === 'HISTORICO_INSUFICIENTE' ? 'Histórico insuficiente' : restricted;
  const values = [
    ['Patrimônio a custo', assets], ['Empréstimos a pagar', loans], ['Posição líquida', liquid],
    ['Crédito liberado Matriz', credit], ['Obrigação rateada', obligation], ['Posição total no corte', total],
  ];
  const cardWidth = (CONTENT_WIDTH - GAP * 2) / 3;
  values.forEach(([label, value], index) => {
    drawCard(pdf, CONTENT_LEFT + index % 3 * (cardWidth + GAP), y + Math.floor(index / 3) * 18,
      cardWidth, 15.5, label, value, 'Posição canônica no escopo', 'neutral');
  });
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
    if (index === 0) drawSummaryPage(pdf, report, header.contentTop, 'PRESTAÇÃO DE CONTAS · RESUMIDO', 'no relatório completo');
    else drawOriginsAndPositions(pdf, report, header.contentTop);
    drawFooter(pdf, report, index + 1, 2);
  }
  return pdf;
}

export async function buildCaixaConcisePdf(report: CaixaDetailedReport, onProgress?: (current: number, total: number) => void) {
  return (await createCaixaConcisePdfDocument(report, onProgress)).output('blob');
}
