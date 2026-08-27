import type { jsPDF } from 'jspdf';
import {
  formatCaixaCompetencia,
  formatCaixaCanonicalCurrency,
  formatCaixaCurrency,
  formatCaixaDate,
  formatCaixaPercent,
} from '../caixa.formatters';
import {
  getCaixaReportPosicaoTotal,
  getCaixaReportPosicaoTotalUnavailableMessage,
} from './caixa-report.posicao-total';
import {
  COLORS,
  CONTENT_LEFT,
  CONTENT_WIDTH,
  FOOTER_TOP,
  drawCard,
  drawText,
  getCaixaResultLabel,
  setText,
  type Tone,
} from './caixa-report.vector-pdf.shared';
import type {
  CaixaDetailedReport,
  CaixaReportTotals,
} from './caixa-report.types';
import type { CaixaReportPosicaoTotal } from './caixa-report.posicao-total';

export const drawTotalPositionCard = (
  pdf: jsPDF,
  options: {
    x: number;
    y: number;
    width: number;
    height: number;
    position: CaixaReportPosicaoTotal | null;
  },
) => {
  const { x, y, width, height, position } = options;
  const availablePosition = position?.disponivel === true ? position : null;
  const fill = availablePosition ? COLORS.navy : COLORS.amber50;
  const border = availablePosition ? '#0b365d' : COLORS.amber100;
  const label = availablePosition ? '#bfdbfe' : '#92400e';
  const detail = availablePosition ? '#dbeafe' : '#92400e';

  pdf.setFillColor(fill);
  pdf.setDrawColor(border);
  pdf.roundedRect(x, y, width, height, 2.2, 2.2, 'FD');
  setText(pdf, label, 5.2, 'black');
  drawText(pdf, 'POSIÇÃO TOTAL NO CORTE', x + 2.0, y + 1.8, width - 4.0, { maxLines: 1 });

  if (!availablePosition) {
    setText(pdf, '#92400e', 9.5, 'black');
    drawText(pdf, 'INDISPONÍVEL', x + 2.0, y + 4.9, width - 4.0, { maxLines: 1 });
    setText(pdf, detail, 4.6);
    drawText(
      pdf,
      getCaixaReportPosicaoTotalUnavailableMessage(position),
      x + 2.0,
      y + 9.2,
      width - 4.0,
      { maxLines: 1 },
    );
    return;
  }

  const { dados } = availablePosition;
  const totalIsNegative = dados.valorTotalLiquido.startsWith('-');
  setText(pdf, totalIsNegative ? '#fda4af' : '#a7f3d0', 9.8, 'black');
  drawText(
    pdf,
    formatCaixaCanonicalCurrency(dados.valorTotalLiquido),
    x + 2.0,
    y + 4.9,
    width - 4.0,
    { maxLines: 1 },
  );
  setText(pdf, detail, 4.4);
  drawText(
    pdf,
    `Corte ${formatCaixaDate(availablePosition.dataCorte)} · Caixa: ${formatCaixaCanonicalCurrency(dados.saldoCaixaRegistrado)} · Patr: ${formatCaixaCanonicalCurrency(dados.valorPatrimonialCusto)} · Emp: ${formatCaixaCanonicalCurrency(dados.saldoEmprestimosAPagar)}`,
    x + 2.0,
    y + 9.2,
    width - 4.0,
    { maxLines: 1 },
  );
};

export const drawComposition = (
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  totals: CaixaReportTotals,
  tone: Tone,
) => {
  const accent = tone === 'emerald' ? COLORS.emerald700 : COLORS.rose700;
  const border = tone === 'emerald' ? COLORS.emerald100 : COLORS.rose100;
  pdf.setFillColor(COLORS.white);
  pdf.setDrawColor(border);
  pdf.roundedRect(x, y, width, 20.5, 2.2, 2.2, 'FD');
  setText(pdf, accent, 6.5, 'black');
  drawText(pdf, tone === 'emerald' ? 'COMPOSIÇÃO DOS RECEBIMENTOS' : 'COMPOSIÇÃO DAS DESPESAS', x + 2.5, y + 2.0);
  setText(pdf, accent, 9.8, 'bold');
  drawText(pdf, formatCaixaCurrency(totals.valorFinal), x + width - 2.5, y + 1.8, undefined, { align: 'right' });
  setText(pdf, COLORS.slate500, 5.2);
  drawText(pdf, tone === 'emerald' ? 'Ajustes identificados nos recebimentos confirmados' : 'Pagamentos confirmados, sem duplicar lançamentos vinculados', x + 2.5, y + 6.0);
  pdf.setDrawColor(border);
  pdf.line(x + 2.5, y + 9.0, x + width - 2.5, y + 9.0);
  const values = [
    ['Base', totals.valorBase],
    ['Juros', totals.jurosIdentificados],
    ['Multa', totals.multaIdentificada],
    ['Acréscimo', totals.acrescimoIdentificado],
    ['Desconto', totals.descontoIdentificado],
    ['Não discrim.', totals.diferencaNaoDiscriminada],
  ] as const;
  const columnWidth = (width - 5) / values.length;
  values.forEach(([label, value], index) => {
    const columnX = x + 2.5 + (index * columnWidth);
    setText(pdf, COLORS.slate500, 5.2);
    drawText(pdf, label, columnX, y + 10.8);
    setText(pdf, COLORS.slate700, 6.0, 'bold');
    drawText(pdf, formatCaixaCurrency(value), columnX, y + 14.2, columnWidth - 1, { maxLines: 1 });
  });
};

export const drawSummaryPanels = (pdf: jsPDF, report: CaixaDetailedReport, y: number) => {
  const gap = 2.5;
  const half = (CONTENT_WIDTH - gap) / 2;
  const panelHeight = Math.min(68, FOOTER_TOP - y - 7);
  const modalityStep = Math.min(10.5, (panelHeight - 19) / 4);
  const drawPanel = (x: number, eyebrow: string, title: string) => {
    pdf.setFillColor(COLORS.white);
    pdf.setDrawColor(COLORS.slate200);
    pdf.roundedRect(x, y, half, panelHeight, 2.2, 2.2, 'FD');
    setText(pdf, COLORS.blue, 5.8, 'black');
    drawText(pdf, eyebrow.toUpperCase(), x + 3, y + 2.8);
    setText(pdf, COLORS.navy, 7.2, 'black');
    drawText(pdf, title.toUpperCase(), x + 3, y + 6.5);
    pdf.setDrawColor(COLORS.slate100);
    pdf.line(x + 3, y + 10.5, x + half - 3, y + 10.5);
  };
  drawPanel(CONTENT_LEFT, 'Origem das entradas', 'Receitas recebidas por modalidade');
  drawPanel(CONTENT_LEFT + half + gap, 'Acompanhamento mensal', 'Resumo financeiro por curso');

  const modalities = ['EAD', 'ESPECIALIZACAO', 'TECNICO', 'LIVRE'].map((code) => (
    report.resumo.receitasPorModalidade.find((item) => item.codigo === code)
  )).filter(Boolean);
  modalities.forEach((item, index) => {
    if (!item) return;
    const rowY = y + 13.5 + (index * modalityStep);
    setText(pdf, COLORS.slate700, 6.2, 'bold');
    drawText(pdf, item.rotulo, CONTENT_LEFT + 3, rowY, half - 33, { maxLines: 1 });
    setText(pdf, COLORS.slate500, 5.2);
    drawText(pdf, `${item.quantidade} recebimento(s) confirmado(s)`, CONTENT_LEFT + 3, rowY + 3.8);
    setText(pdf, COLORS.emerald700, 6.4, 'bold');
    drawText(pdf, formatCaixaCurrency(item.valor), CONTENT_LEFT + half - 3, rowY + 1, undefined, { align: 'right' });
  });

  const courseX = CONTENT_LEFT + half + gap;
  if (report.resumoCursos.itens.length === 0) {
    const emptyStateHeight = panelHeight - 18;
    pdf.setFillColor(COLORS.slate100);
    pdf.roundedRect(courseX + 3, y + 14, half - 6, emptyStateHeight, 2, 2, 'F');
    setText(pdf, COLORS.slate500, 5.8);
    drawText(pdf, 'Nenhum curso parcelado possui previsão, recebimento ou atraso nesta competência.', courseX + (half / 2), y + 14 + (emptyStateHeight / 2), half - 18, { align: 'center', maxLines: 2 });
    return;
  }

  const headerY = y + 13.0;
  setText(pdf, COLORS.slate500, 4.8, 'bold');
  drawText(pdf, 'CURSO', courseX + 3, headerY);
  drawText(pdf, 'PREVISTO', courseX + half - 45, headerY, undefined, { align: 'right' });
  drawText(pdf, 'RECEBIDO', courseX + half - 24, headerY, undefined, { align: 'right' });
  drawText(pdf, 'EM ATRASO', courseX + half - 3, headerY, undefined, { align: 'right' });
  pdf.setDrawColor(COLORS.slate100);
  pdf.line(courseX + 3, headerY + 2.5, courseX + half - 3, headerY + 2.5);

  const courseRows = report.resumoCursos.itens.slice(0, 4);
  const courseStep = Math.min(8.8, (panelHeight - 24) / Math.max(courseRows.length, 1));
  courseRows.forEach((item, index) => {
    const rowY = y + 18 + (index * courseStep);
    setText(pdf, COLORS.slate700, 5.6, 'bold');
    drawText(pdf, item.curso, courseX + 3, rowY, half - 52, { maxLines: 1 });
    setText(pdf, COLORS.slate500, 4.6);
    drawText(pdf, `${item.modalidade} · ${item.quantidadeTurmas} turma(s) · ${item.quantidadeAlunos} aluno(s)`, courseX + 3, rowY + 3.0, half - 52, { maxLines: 1 });
    setText(pdf, COLORS.slate700, 5.3, 'bold');
    drawText(pdf, formatCaixaCurrency(item.previstoNoMes), courseX + half - 45, rowY + 0.8, undefined, { align: 'right' });
    setText(pdf, COLORS.emerald700, 5.3, 'bold');
    drawText(pdf, formatCaixaCurrency(item.recebidoNoMes), courseX + half - 24, rowY + 0.8, undefined, { align: 'right' });
    setText(pdf, item.emAtraso > 0 ? COLORS.amber700 : COLORS.slate400, 5.3, 'bold');
    drawText(pdf, formatCaixaCurrency(item.emAtraso), courseX + half - 3, rowY + 0.8, undefined, { align: 'right' });
  });

  if (report.resumoCursos.quantidadeOmitidas > 0) {
    setText(pdf, COLORS.slate400, 4.6, 'bold');
    drawText(pdf, `+ ${report.resumoCursos.quantidadeOmitidas} curso(s) na Seção 4`, courseX + half - 3, y + panelHeight - 2.2, undefined, { align: 'right' });
  }
};

export const drawSummaryPage = (pdf: jsPDF, report: CaixaDetailedReport, contentTop: number) => {
  setText(pdf, COLORS.navy, 15, 'black');
  drawText(pdf, 'PRESTAÇÃO DE CONTAS MENSAL', CONTENT_LEFT, contentTop);
  setText(pdf, COLORS.slate500, 6.2);
  drawText(
    pdf,
    `Posição contábil e movimentos confirmados de ${formatCaixaCompetencia(report.resumo.meta.competencia)}. Os compromissos em aberto refletem a posição apurada na geração do relatório.`,
    CONTENT_LEFT,
    contentTop + 6.5,
    CONTENT_WIDTH,
    { maxLines: 1 },
  );

  const gap4 = 2.5;
  const cardWidth4 = (CONTENT_WIDTH - (3 * gap4)) / 4;
  const resultLabel = getCaixaResultLabel(report.resumo.resumoCompetencia.resultadoStatus);
  const posicaoTotal = getCaixaReportPosicaoTotal(report);

  // Linha 1: Operacional (4 colunas)
  const yRow1 = contentTop + 11.5;
  const heightRow1 = 13.5;
  drawTotalPositionCard(pdf, {
    x: CONTENT_LEFT,
    y: yRow1,
    width: cardWidth4,
    height: heightRow1,
    position: posicaoTotal,
  });

  const row1Cards = [
    {
      column: 1,
      label: 'Entradas recebidas',
      value: formatCaixaCurrency(report.totaisRecebimentos.valorFinal),
      description: `${report.totaisRecebimentos.quantidade} recebimento(s) confirmado(s)`,
      tone: 'emerald' as Tone,
    },
    {
      column: 2,
      label: 'Saídas pagas',
      value: formatCaixaCurrency(report.totaisDespesas.valorFinal),
      description: `${report.totaisDespesas.quantidade} pagamento(s) confirmado(s)`,
      tone: 'rose' as Tone,
    },
    {
      column: 3,
      label: resultLabel,
      value: formatCaixaCurrency(report.resumo.resumoCompetencia.resultado),
      description: 'Entradas menos saídas confirmadas no período',
      tone: (report.resumo.resumoCompetencia.resultado >= 0 ? 'emerald' : 'rose') as Tone,
    },
  ] as const;

  row1Cards.forEach((card) => {
    drawCard(
      pdf,
      CONTENT_LEFT + (card.column * (cardWidth4 + gap4)),
      yRow1,
      cardWidth4,
      heightRow1,
      card.label,
      card.value,
      card.description,
      card.tone,
    );
  });

  // Linha 2: Compromissos & Inadimplência (5 colunas)
  const gap5 = 2.0;
  const cardWidth5 = (CONTENT_WIDTH - (4 * gap5)) / 5;
  const yRow2 = yRow1 + heightRow1 + 2.0;
  const heightRow2 = 13.0;

  const row2Cards = [
    {
      column: 0,
      label: 'Receitas futuras',
      value: formatCaixaCurrency(report.resumo.compromissos.aReceber),
      description: 'Compromisso em aberto hoje',
      tone: 'neutral' as Tone,
    },
    {
      column: 1,
      label: 'Inadimplência',
      value: formatCaixaCurrency(report.resumo.compromissos.receberVencido),
      description: 'Valor vencido ainda não liquidado',
      tone: (report.resumo.compromissos.receberVencido > 0 ? 'amber' : 'neutral') as Tone,
    },
    {
      column: 2,
      label: 'Margem de inadimplência',
      value: formatCaixaPercent(report.resumo.compromissos.margemInadimplencia),
      description: 'Sobre a carteira a receber',
      tone: (report.resumo.compromissos.margemInadimplencia > 0 ? 'amber' : 'neutral') as Tone,
    },
    {
      column: 3,
      label: 'Obrigações futuras',
      value: formatCaixaCurrency(report.resumo.compromissos.aPagar),
      description: 'Compromisso em aberto hoje',
      tone: (report.resumo.compromissos.aPagar > 0 ? 'rose' : 'neutral') as Tone,
    },
    {
      column: 4,
      label: 'Obrigações vencidas',
      value: formatCaixaCurrency(report.resumo.compromissos.pagarVencido),
      description: 'Valor vencido ainda não liquidado',
      tone: (report.resumo.compromissos.pagarVencido > 0 ? 'rose' : 'neutral') as Tone,
    },
  ] as const;

  row2Cards.forEach((card) => {
    drawCard(
      pdf,
      CONTENT_LEFT + (card.column * (cardWidth5 + gap5)),
      yRow2,
      cardWidth5,
      heightRow2,
      card.label,
      card.value,
      card.description,
      card.tone,
    );
  });

  const compositionTop = yRow2 + heightRow2 + 2.5;
  const half = (CONTENT_WIDTH - gap4) / 2;
  drawComposition(pdf, CONTENT_LEFT, compositionTop, half, report.totaisRecebimentos, 'emerald');
  drawComposition(pdf, CONTENT_LEFT + half + gap4, compositionTop, half, report.totaisDespesas, 'rose');

  const noticeTop = compositionTop + 22.5;
  pdf.setFillColor('#eff6ff');
  pdf.setDrawColor('#dbeafe');
  pdf.roundedRect(CONTENT_LEFT, noticeTop, CONTENT_WIDTH, 5.5, 1.8, 1.8, 'FD');
  setText(pdf, '#1e3a8a', 5.3, 'bold');
  drawText(pdf, 'Leitura correta: o resultado mensal representa o fluxo de caixa confirmado, não lucro contábil por competência. O saldo Banese é a posição contábil do sistema; a integração atual não consulta o extrato bancário.', CONTENT_LEFT + 3, noticeTop + 1.4, CONTENT_WIDTH - 6, { maxLines: 1 });

  drawSummaryPanels(pdf, report, noticeTop + 7.5);
};
