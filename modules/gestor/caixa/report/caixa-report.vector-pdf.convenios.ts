import type { jsPDF } from 'jspdf';
import type { CaixaConvenioResumoItem } from '../caixa-convenios.service';
import { formatCaixaCurrency } from '../caixa.formatters';
import type { CaixaDetailedReport } from './caixa-report.types';
import {
  COLORS,
  CONTENT_LEFT,
  CONTENT_WIDTH,
  drawCard,
  drawText,
  setText,
} from './caixa-report.vector-pdf.shared';

export const drawConveniosPage = (
  pdf: jsPDF,
  report: CaixaDetailedReport,
  rows: CaixaConvenioResumoItem[],
  sectionPage: number,
  contentTop: number,
) => {
  setText(pdf, '#7c3aed', 6.3, 'black');
  drawText(pdf, 'RECURSOS VINCULADOS', CONTENT_LEFT, contentTop);
  setText(pdf, COLORS.navy, 15, 'black');
  drawText(pdf, 'CONVÊNIOS', CONTENT_LEFT, contentTop + 4.5);
  setText(pdf, COLORS.slate500, 6.3);
  drawText(
    pdf,
    'Ciclo de fechamento manual; baixas posteriores aparecem no Caixa do mês do pagamento e não são somadas novamente.',
    CONTENT_LEFT,
    contentTop + 11,
  );
  setText(pdf, COLORS.slate500, 5.5, 'bold');
  drawText(pdf, `PÁGINA DA SEÇÃO ${sectionPage}`, CONTENT_LEFT + CONTENT_WIDTH, contentTop, undefined, { align: 'right' });

  if (!report.convenios.disponivel) {
    pdf.setFillColor(COLORS.amber50);
    pdf.setDrawColor(COLORS.amber100);
    pdf.roundedRect(CONTENT_LEFT, contentTop + 19, CONTENT_WIDTH, 28, 2.5, 2.5, 'FD');
    setText(pdf, COLORS.amber700, 8, 'black');
    drawText(pdf, 'POSIÇÃO DE CONVÊNIOS INDISPONÍVEL', CONTENT_LEFT + 4, contentTop + 25);
    setText(pdf, COLORS.amber700, 6);
    drawText(pdf, 'Este perfil não possui o escopo necessário para consultar os recursos vinculados.', CONTENT_LEFT + 4, contentTop + 32);
    return;
  }

  const resumo = report.convenios.dados;
  const cardGap = 2.5;
  const cardWidth = (CONTENT_WIDTH - (4 * cardGap)) / 5;
  const cards = [
    ['Saldo inicial', formatCaixaCurrency(resumo.saldoInicial), 'Carregado do fechamento', 'neutral'],
    ['Créditos recebidos', formatCaixaCurrency(resumo.creditosRecebidos), 'Entradas vinculadas', 'emerald'],
    ['Despesas pagas', formatCaixaCurrency(resumo.despesasPagas), 'Saídas efetivadas', 'rose'],
    ['Saldo disponível', formatCaixaCurrency(resumo.saldoDisponivel), 'Sem compromissos abertos', 'neutral'],
    ['Saldo projetado', formatCaixaCurrency(resumo.saldoProjetado), 'Após compromissos abertos', 'amber'],
  ] as const;
  cards.forEach((card, index) => drawCard(
    pdf,
    CONTENT_LEFT + (index * (cardWidth + cardGap)),
    contentTop + 17,
    cardWidth,
    18,
    card[0],
    card[1],
    card[2],
    card[3],
  ));

  const tableTop = contentTop + 41;
  const widths = [56, 30, 34, 34, 34, 34, 42];
  const headers = ['Convênio', 'Status', 'Saldo inicial', 'Créditos', 'Pagas', 'Em aberto', 'Projetado'];
  pdf.setFillColor('#f5f3ff');
  pdf.setDrawColor('#ddd6fe');
  pdf.roundedRect(CONTENT_LEFT, tableTop, CONTENT_WIDTH, 9, 2, 2, 'FD');
  let x = CONTENT_LEFT;
  headers.forEach((header, index) => {
    setText(pdf, '#5b21b6', 5.3, 'black');
    drawText(pdf, header.toUpperCase(), x + 2, tableTop + 3, widths[index] - 4, { maxLines: 1 });
    x += widths[index];
  });

  if (rows.length === 0) {
    setText(pdf, COLORS.slate500, 7, 'bold');
    drawText(pdf, 'Nenhum convênio encontrado nesta competência.', CONTENT_LEFT + 3, tableTop + 18);
    return;
  }

  rows.forEach((row, rowIndex) => {
    const y = tableTop + 9 + (rowIndex * 15);
    if (rowIndex % 2 === 1) {
      pdf.setFillColor('#fafafa');
      pdf.rect(CONTENT_LEFT, y, CONTENT_WIDTH, 15, 'F');
    }
    pdf.setDrawColor(COLORS.slate100);
    pdf.line(CONTENT_LEFT, y + 15, CONTENT_LEFT + CONTENT_WIDTH, y + 15);
    const values = [
      row.nome,
      row.status === 'ABERTO' ? 'Em aberto' : 'Finalizado',
      formatCaixaCurrency(row.saldoInicial),
      formatCaixaCurrency(row.creditosRecebidos),
      formatCaixaCurrency(row.despesasPagas),
      formatCaixaCurrency(row.comprometidoAberto),
      formatCaixaCurrency(row.saldoProjetado),
    ];
    let cellX = CONTENT_LEFT;
    values.forEach((value, index) => {
      setText(pdf, index === 6 ? '#5b21b6' : COLORS.slate700, 5.7, index === 0 || index === 6 ? 'bold' : 'normal');
      drawText(pdf, value, cellX + 2, y + 4.5, widths[index] - 4, { maxLines: index === 0 ? 2 : 1 });
      cellX += widths[index];
    });
  });
};
