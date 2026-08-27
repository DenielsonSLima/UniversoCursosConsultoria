import type { jsPDF } from 'jspdf';
import {
  formatCaixaCurrency,
  formatCaixaDate,
  formatCaixaInstallment,
} from '../caixa.formatters';
import {
  COLORS,
  CONTENT_LEFT,
  CONTENT_RIGHT,
  CONTENT_WIDTH,
  FOOTER_TOP,
  buildCaixaAdjustmentLines,
  drawText,
  setText,
  type FontStyle,
  type Tone,
} from './caixa-report.vector-pdf.shared';
import type {
  CaixaDetailedReport,
  CaixaReportExpense,
  CaixaReportReceipt,
  CaixaReportRecurringBreakdown,
  CaixaReportRecurringClass,
  CaixaReportTotals,
} from './caixa-report.types';

export const drawSectionHeading = (
  pdf: jsPDF,
  title: string,
  description: string,
  page: number,
  tone: Tone,
  contentTop: number,
) => {
  setText(pdf, tone === 'emerald' ? COLORS.emerald700 : COLORS.rose700, 14, 'black');
  drawText(pdf, title.toUpperCase(), CONTENT_LEFT, contentTop);
  setText(pdf, COLORS.slate500, 6.5);
  drawText(pdf, description, CONTENT_LEFT, contentTop + 6);
  setText(pdf, COLORS.slate500, 6, 'black');
  drawText(pdf, `PÁGINA DA SEÇÃO ${page}`, CONTENT_RIGHT, contentTop + 5, undefined, { align: 'right' });
  pdf.setDrawColor(COLORS.slate200);
  pdf.line(CONTENT_LEFT, contentTop + 10, CONTENT_RIGHT, contentTop + 10);
};

export const drawMovementTable = (
  pdf: jsPDF,
  rows: Array<CaixaReportReceipt | CaixaReportExpense>,
  totals: CaixaReportTotals,
  showTotals: boolean,
  tone: Tone,
  contentTop: number,
) => {
  const x = CONTENT_LEFT;
  const y = contentTop + 14;
  const widths = [32, 52, 47, 54, 23, 39, 27];
  const headers = ['DATA / PARCELA', 'PESSOA / DESCRIÇÃO', 'CLASSIFICAÇÃO', 'ORIGEM / CONTA', 'BASE', 'AJUSTES', tone === 'emerald' ? 'RECEBIDO' : 'PAGO'];
  const accent = tone === 'emerald' ? COLORS.emerald700 : COLORS.rose700;
  const border = tone === 'emerald' ? COLORS.emerald100 : COLORS.rose100;
  const footerFill = tone === 'emerald' ? COLORS.emerald50 : COLORS.rose50;
  const footerHeight = showTotals ? 17 : 0;
  const availableRowsHeight = FOOTER_TOP - 4 - y - 8 - footerHeight;
  const rowHeight = rows.length === 0
    ? Math.min(45, availableRowsHeight)
    : Math.min(22, availableRowsHeight / rows.length);
  const tableHeight = 8 + (Math.max(rows.length, 1) * rowHeight) + footerHeight;
  pdf.setFillColor(COLORS.white);
  pdf.setDrawColor(border);
  pdf.roundedRect(x, y, CONTENT_WIDTH, tableHeight, 2.5, 2.5, 'FD');
  pdf.setFillColor(accent);
  pdf.roundedRect(x, y, CONTENT_WIDTH, 8, 2.5, 2.5, 'F');
  pdf.rect(x, y + 4, CONTENT_WIDTH, 4, 'F');
  let cursorX = x;
  headers.forEach((header, index) => {
    setText(pdf, COLORS.white, 6.2, 'black');
    const align = index >= 4 && index !== 5 ? 'right' : 'left';
    drawText(pdf, header, align === 'right' ? cursorX + widths[index] - 2 : cursorX + 2, y + 2.2, widths[index] - 4, { align, maxLines: 1 });
    cursorX += widths[index];
  });

  if (rows.length === 0) {
    setText(pdf, COLORS.slate400, 7, 'bold');
    drawText(pdf, tone === 'emerald' ? 'Nenhum recebimento confirmado no período.' : 'Nenhuma despesa paga no período.', x + (CONTENT_WIDTH / 2), y + 27, undefined, { align: 'center' });
  } else {
    rows.forEach((row, rowIndex) => {
      const rowY = y + 8 + (rowIndex * rowHeight);
      if (rowIndex > 0) {
        pdf.setDrawColor(COLORS.slate100);
        pdf.line(x, rowY, x + CONTENT_WIDTH, rowY);
      }
      const receipt = tone === 'emerald' ? row as CaixaReportReceipt : null;
      const expense = tone === 'rose' ? row as CaixaReportExpense : null;
      const columns: Array<{ lines: string[]; color?: string; firstStyle?: FontStyle; align?: 'left' | 'right' }> = [
        { lines: [formatCaixaDate(row.dataPagamento), `Venc.: ${formatCaixaDate(row.dataVencimento)}`, formatCaixaInstallment(row.parcelaNumero, row.totalParcelas, receipt?.tipoLancamento)], firstStyle: 'bold' },
        { lines: [receipt?.pagador || expense?.fornecedor || '-', row.descricao], firstStyle: 'bold' },
        { lines: [receipt?.curso || expense?.categoria || '-', receipt ? `${receipt.modalidade} · ${receipt.turma}` : `${expense?.curso || '-'} · ${expense?.turma || '-'}`], firstStyle: 'bold' },
        { lines: [row.conta, `${row.formaPagamento} · ${row.polo}`], firstStyle: 'semibold' },
        { lines: [formatCaixaCurrency(row.valorBase)], align: 'right', firstStyle: 'bold' },
        { lines: buildCaixaAdjustmentLines(row) },
        { lines: [formatCaixaCurrency(receipt?.valorRecebido ?? expense?.valorPago ?? 0)], color: accent, align: 'right', firstStyle: 'black' },
      ];
      cursorX = x;
      columns.forEach((column, columnIndex) => {
        const fontSize = columnIndex === 5 ? 5.2 : 5.7;
        setText(pdf, COLORS.slate500, fontSize);
        const wrappedLines = column.lines.flatMap((line, sourceIndex) => (
          (pdf.splitTextToSize(line || '-', widths[columnIndex] - 4) as string[]).map((text) => ({
            text,
            style: sourceIndex === 0 ? column.firstStyle : undefined,
          }))
        ));
        const lineStep = Math.min(3.45, (rowHeight - 5.2) / Math.max(1, wrappedLines.length - 1));
        const fittedFontSize = Math.min(fontSize, Math.max(3.8, lineStep / 0.52));
        wrappedLines.forEach(({ text, style }, lineIndex) => {
          setText(pdf, column.color || (style ? COLORS.slate900 : COLORS.slate500), fittedFontSize, style || 'normal');
          const align = column.align || 'left';
          drawText(pdf, text, align === 'right' ? cursorX + widths[columnIndex] - 2 : cursorX + 2, rowY + 2.2 + (lineIndex * lineStep), undefined, { align });
        });
        cursorX += widths[columnIndex];
      });
    });
  }

  if (!showTotals) return;
  const footerY = y + 8 + (Math.max(rows.length, 1) * rowHeight);
  pdf.setFillColor(footerFill);
  pdf.rect(x, footerY, CONTENT_WIDTH, footerHeight, 'F');
  setText(pdf, COLORS.slate700, 6.2, 'black');
  const undiscriminatedLabel = totals.quantidadeNaoDiscriminada > 0
    ? ` · ${totals.quantidadeNaoDiscriminada} COM DIFERENÇA NÃO DISCRIMINADA`
    : '';
  drawText(pdf, `${tone === 'emerald' ? 'TOTAL RECEBIDO' : 'TOTAL PAGO'} · ${totals.quantidade} MOVIMENTO(S)${undiscriminatedLabel}`, x + 2, footerY + 6, 165, { maxLines: 2 });
  drawText(pdf, formatCaixaCurrency(totals.valorBase), x + 207, footerY + 6, undefined, { align: 'right' });
  setText(pdf, COLORS.slate600, 5.5);
  const adjustmentTotals = [
    `Juros ${formatCaixaCurrency(totals.jurosIdentificados)}`,
    `Multa ${formatCaixaCurrency(totals.multaIdentificada)}`,
    `Acrésc. ${formatCaixaCurrency(totals.acrescimoIdentificado)}`,
    `Desc. ${formatCaixaCurrency(totals.descontoIdentificado)}`,
    ...(totals.diferencaNaoDiscriminada !== 0
      ? [`Não discrim. ${formatCaixaCurrency(totals.diferencaNaoDiscriminada)}`]
      : []),
  ];
  adjustmentTotals.forEach((line, index) => {
    drawText(pdf, line, x + 245, footerY + 1.2 + (index * 2.8), undefined, { align: 'right' });
  });
  setText(pdf, accent, 7, 'black');
  drawText(pdf, formatCaixaCurrency(totals.valorFinal), x + CONTENT_WIDTH - 2, footerY + 6, undefined, { align: 'right' });
};

const recurringFields: Array<[string, keyof CaixaReportRecurringBreakdown]> = [
  ['Previsto', 'previstoNoMes'],
  ['Recebido', 'recebidoNoMes'],
  ['Em atraso', 'emAtraso'],
  ['Juros', 'juros'],
  ['Multa', 'multa'],
  ['Acrésc.', 'acrescimo'],
  ['Desconto', 'desconto'],
  ['Não discr.', 'diferencaNaoDiscriminada'],
];

export const drawRecurringTable = (
  pdf: jsPDF,
  report: CaixaDetailedReport,
  rows: CaixaReportRecurringClass[],
  page: number,
  showModalities: boolean,
  showTotals: boolean,
  contentTop: number,
) => {
  setText(pdf, COLORS.blue, 6, 'black');
  drawText(pdf, 'CARTEIRA PARCELADA · EAD NÃO INCLUÍDO', CONTENT_LEFT, contentTop);
  setText(pdf, COLORS.navy, 14, 'black');
  drawText(pdf, 'ACOMPANHAMENTO POR MODALIDADE E TURMA', CONTENT_LEFT, contentTop + 4);
  setText(pdf, COLORS.slate500, 6);
  drawText(pdf, 'Valores previstos, recebidos, vencidos e ajustes confirmados na competência.', CONTENT_LEFT, contentTop + 10);
  setText(pdf, COLORS.slate500, 6, 'black');
  drawText(pdf, `PÁGINA DA SEÇÃO ${page}`, CONTENT_RIGHT, contentTop + 8, undefined, { align: 'right' });

  const tableRows: CaixaReportRecurringBreakdown[] = showModalities
    ? report.analiseRecorrente.modalidades
    : rows;
  const tableY = contentTop + 17;
  const firstWidth = 73;
  const valueWidth = (CONTENT_WIDTH - firstWidth) / recurringFields.length;
  pdf.setFillColor(COLORS.white);
  pdf.setDrawColor(COLORS.slate200);
  pdf.roundedRect(CONTENT_LEFT, tableY, CONTENT_WIDTH, 18 + (Math.max(tableRows.length, 1) * 14) + (showTotals ? 13 : 0), 2.5, 2.5, 'FD');
  pdf.setFillColor('#eff6ff');
  pdf.rect(CONTENT_LEFT, tableY, CONTENT_WIDTH, 11, 'F');
  setText(pdf, COLORS.blue, 5.8, 'black');
  drawText(pdf, showModalities ? 'CONSOLIDADO' : 'DETALHAMENTO', CONTENT_LEFT + 2.5, tableY + 2);
  setText(pdf, COLORS.navy, 7.2, 'black');
  drawText(pdf, showModalities ? 'RESUMO POR MODALIDADE' : 'VALORES POR TURMA', CONTENT_LEFT + 2.5, tableY + 5.7);

  let x = CONTENT_LEFT;
  setText(pdf, COLORS.slate500, 5.2, 'bold');
  drawText(pdf, 'MODALIDADE / TURMA', x + 2, tableY + 13, firstWidth - 4, { maxLines: 1 });
  x += firstWidth;
  recurringFields.forEach(([label]) => {
    drawText(pdf, label.toUpperCase(), x + valueWidth - 1.5, tableY + 13, valueWidth - 2, { align: 'right', maxLines: 1 });
    x += valueWidth;
  });

  if (tableRows.length === 0) {
    setText(pdf, COLORS.slate400, 6, 'bold');
    drawText(pdf, 'Nenhuma carteira parcelada com movimento nesta competência.', CONTENT_LEFT + (CONTENT_WIDTH / 2), tableY + 28, undefined, { align: 'center' });
  }
  tableRows.forEach((item, index) => {
    const rowY = tableY + 18 + (index * 14);
    const label = showModalities
      ? (item as typeof report.analiseRecorrente.modalidades[number]).rotulo
      : (item as CaixaReportRecurringClass).turma;
    const detail = showModalities
      ? `${item.quantidadeCursos} curso(s) · ${item.quantidadeTurmas} turma(s) · ${item.quantidadeAlunos} aluno(s)`
      : `${(item as CaixaReportRecurringClass).modalidade} · ${(item as CaixaReportRecurringClass).curso} · ${item.quantidadeAlunos} aluno(s)`;
    setText(pdf, COLORS.slate700, 6.2, 'bold');
    drawText(pdf, label, CONTENT_LEFT + 2, rowY + 1.5, firstWidth - 4, { maxLines: 1 });
    setText(pdf, COLORS.slate500, 5.2);
    drawText(pdf, detail, CONTENT_LEFT + 2, rowY + 5.5, firstWidth - 4, { maxLines: 2 });
    x = CONTENT_LEFT + firstWidth;
    recurringFields.forEach(([, field]) => {
      setText(pdf, field === 'recebidoNoMes' ? COLORS.emerald700 : field === 'emAtraso' ? COLORS.amber700 : COLORS.slate600, 5.5, 'bold');
      drawText(pdf, formatCaixaCurrency(item[field] as number), x + valueWidth - 1.5, rowY + 4, valueWidth - 2, { align: 'right', maxLines: 1 });
      x += valueWidth;
    });
  });

  if (showTotals) {
    const totalY = tableY + 18 + (Math.max(tableRows.length, 1) * 14);
    pdf.setFillColor('#eff6ff');
    pdf.rect(CONTENT_LEFT, totalY, CONTENT_WIDTH, 13, 'F');
    setText(pdf, '#1e3a8a', 6.2, 'bold');
    drawText(pdf, 'TOTAL DA CARTEIRA', CONTENT_LEFT + 2, totalY + 2.5);
    setText(pdf, COLORS.slate500, 5.2);
    drawText(pdf, 'Valores consolidados da carteira', CONTENT_LEFT + 2, totalY + 6.5);
    x = CONTENT_LEFT + firstWidth;
    recurringFields.forEach(([, field]) => {
      setText(pdf, COLORS.slate700, 5.5, 'bold');
      drawText(pdf, formatCaixaCurrency(report.analiseRecorrente.totais[field] as number), x + valueWidth - 1.5, totalY + 4.5, valueWidth - 2, { align: 'right', maxLines: 1 });
      x += valueWidth;
    });
  }
};
