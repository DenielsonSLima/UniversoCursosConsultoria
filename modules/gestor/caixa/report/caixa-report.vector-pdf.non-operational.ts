import type { jsPDF } from 'jspdf';
import {
  formatCaixaCanonicalCurrency,
  formatCaixaCurrency,
} from '../caixa.formatters';
import {
  COLORS,
  CONTENT_LEFT,
  CONTENT_WIDTH,
  drawCard,
  drawText,
  setText,
} from './caixa-report.vector-pdf.shared';
import type { CaixaDetailedReport } from './caixa-report.types';

export const drawNonOperationalPanel = (
  pdf: jsPDF,
  options: {
    x: number;
    y: number;
    height: number;
    eyebrow: string;
    title: string;
    description: string;
    notice: string;
  },
) => {
  pdf.setFillColor(COLORS.white);
  pdf.setDrawColor(COLORS.slate200);
  pdf.roundedRect(options.x, options.y, CONTENT_WIDTH, options.height, 2.5, 2.5, 'FD');
  setText(pdf, COLORS.blue, 6, 'black');
  drawText(pdf, options.eyebrow.toUpperCase(), options.x + 3, options.y + 3);
  setText(pdf, COLORS.navy, 8.5, 'black');
  drawText(pdf, options.title.toUpperCase(), options.x + 3, options.y + 6.7);
  setText(pdf, COLORS.slate500, 5.7);
  drawText(pdf, options.description, options.x + 3, options.y + 11.2, CONTENT_WIDTH - 6, { maxLines: 1 });
  pdf.setDrawColor(COLORS.slate100);
  pdf.line(options.x + 3, options.y + 14.5, options.x + CONTENT_WIDTH - 3, options.y + 14.5);
  pdf.setFillColor('#eff6ff');
  pdf.setDrawColor('#dbeafe');
  pdf.roundedRect(options.x + 3, options.y + options.height - 10, CONTENT_WIDTH - 6, 7, 1.8, 1.8, 'FD');
  setText(pdf, '#1e3a8a', 5.6, 'bold');
  drawText(pdf, options.notice, options.x + 5, options.y + options.height - 8.2, CONTENT_WIDTH - 10, { maxLines: 1 });
};

export const drawRestrictedNonOperationalPosition = (
  pdf: jsPDF,
  options: { x: number; y: number; label: string },
) => {
  setText(pdf, '#92400e', 7, 'black');
  drawText(pdf, `DADOS DE ${options.label.toUpperCase()} INDISPONÍVEIS`, options.x + 3, options.y + 23);
  setText(pdf, '#92400e', 5.8);
  drawText(
    pdf,
    'Este perfil não possui o escopo complementar necessário. A prestação operacional permanece disponível.',
    options.x + 3,
    options.y + 28,
    CONTENT_WIDTH - 6,
    { maxLines: 2 },
  );
};

export const drawLiquidPositionBand = (
  pdf: jsPDF,
  report: CaixaDetailedReport,
  x: number,
  y: number,
) => {
  const position = report.posicaoLiquida;
  pdf.setFillColor('#eff6ff');
  pdf.setDrawColor('#bfdbfe');
  pdf.roundedRect(x, y, CONTENT_WIDTH, 10, 2.2, 2.2, 'FD');

  if (!position.disponivel) {
    setText(pdf, '#92400e', 6.2, 'black');
    drawText(pdf, 'POSIÇÃO LÍQUIDA INDISPONÍVEL', x + 3, y + 2.2);
    setText(pdf, '#92400e', 5.5);
    drawText(
      pdf,
      'Este perfil precisa dos escopos patrimonial e financeiro para visualizar o valor líquido.',
      x + 3,
      y + 5.6,
      CONTENT_WIDTH - 6,
      { maxLines: 1 },
    );
    return;
  }

  const { dados } = position;
  const isNegative = dados.valorLiquido.startsWith('-');
  setText(pdf, COLORS.blue, 6.1, 'black');
  drawText(pdf, 'VALOR LÍQUIDO (PATRIMÔNIO A CUSTO - EMPRÉSTIMOS A PAGAR)', x + 3, y + 2.1);
  setText(pdf, isNegative ? COLORS.rose700 : COLORS.emerald700, 10.5, 'black');
  drawText(
    pdf,
    formatCaixaCanonicalCurrency(dados.valorLiquido),
    x + CONTENT_WIDTH - 3,
    y + 1.8,
    undefined,
    { align: 'right' },
  );
  setText(pdf, COLORS.slate600, 5.5);
  drawText(
    pdf,
    `Patrimônio a custo: ${formatCaixaCanonicalCurrency(dados.valorPatrimonialCusto)} - Empréstimos a pagar: ${formatCaixaCanonicalCurrency(dados.saldoEmprestimosAPagar)}`,
    x + 3,
    y + 6,
    CONTENT_WIDTH - 6,
    { maxLines: 1 },
  );
};

export const drawNonOperationalPositionsPage = (
  pdf: jsPDF,
  report: CaixaDetailedReport,
  contentTop: number,
) => {
  setText(pdf, COLORS.blue, 6.3, 'black');
  drawText(pdf, 'POSIÇÃO COMPLEMENTAR', CONTENT_LEFT, contentTop);
  setText(pdf, COLORS.navy, 15, 'black');
  drawText(pdf, 'PATRIMÔNIO E FINANCIAMENTO', CONTENT_LEFT, contentTop + 4.5);
  setText(pdf, COLORS.slate500, 6.3);
  drawText(
    pdf,
    'Posições canônicas da competência, exibidas separadamente do fluxo operacional.',
    CONTENT_LEFT,
    contentTop + 11,
  );

  const posicaoLiquidaTop = contentTop + 17;
  drawLiquidPositionBand(pdf, report, CONTENT_LEFT, posicaoLiquidaTop);

  const patrimonioTop = posicaoLiquidaTop + 12;
  const patrimonioHeight = 46;
  drawNonOperationalPanel(pdf, {
    x: CONTENT_LEFT,
    y: patrimonioTop,
    height: patrimonioHeight,
    eyebrow: 'Posição patrimonial',
    title: 'Bens e perdas reconhecidos a custo',
    description: 'Fechamento recalculável da competência selecionada.',
    notice: 'Posição isolada: patrimônio a custo não altera saldo, entradas, saídas ou resultado operacional.',
  });
  if (report.patrimonio.disponivel) {
    const patrimonio = report.patrimonio.dados;
    const patrimonioGap = 2.5;
    const patrimonioCardWidth = (CONTENT_WIDTH - (3 * patrimonioGap) - 6) / 4;
    const patrimonioCards = [
      [
        'Valor ativo a custo',
        formatCaixaCanonicalCurrency(patrimonio.posicaoFechamento.valorAtivoCusto),
        `${patrimonio.posicaoFechamento.registrosAtivos} registro(s) ativo(s)`,
        'neutral',
      ],
      [
        'Unidades ativas',
        String(patrimonio.posicaoFechamento.unidadesAtivas),
        'Disponíveis no fechamento',
        'neutral',
      ],
      [
        'Aquisições',
        formatCaixaCanonicalCurrency(patrimonio.aquisicoesCompetencia.valorCusto),
        `${patrimonio.aquisicoesCompetencia.registros} registro(s) · ${patrimonio.aquisicoesCompetencia.unidades} unidade(s)`,
        'emerald',
      ],
      [
        'Perdas',
        formatCaixaCanonicalCurrency(patrimonio.perdasCompetencia.valorCusto),
        `${patrimonio.perdasCompetencia.movimentos} baixa(s) · ${patrimonio.perdasCompetencia.unidades} unidade(s)`,
        'rose',
      ],
    ] as const;
    patrimonioCards.forEach((card, index) => {
      drawCard(
        pdf,
        CONTENT_LEFT + 3 + (index * (patrimonioCardWidth + patrimonioGap)),
        patrimonioTop + 18,
        patrimonioCardWidth,
        17,
        card[0],
        card[1],
        card[2],
        card[3],
      );
    });
  } else {
    drawRestrictedNonOperationalPosition(pdf, {
      x: CONTENT_LEFT,
      y: patrimonioTop,
      label: 'patrimônio',
    });
  }

  const financiamentoTop = patrimonioTop + patrimonioHeight + 4;
  const financiamentoHeight = 46;
  drawNonOperationalPanel(pdf, {
    x: CONTENT_LEFT,
    y: financiamentoTop,
    height: financiamentoHeight,
    eyebrow: 'Financiamento e rateios',
    title: 'Empréstimos e obrigações do escopo',
    description: 'Crédito, principal e encargos são apresentados fora da receita e despesa operacional.',
    notice: 'Leitura correta: crédito, principal e encargos de empréstimo são financiamento e não compõem o resultado operacional.',
  });
  if (report.financiamento.disponivel) {
    const financiamento = report.financiamento.dados;
    const financiamentoGap = 2;
    const financiamentoCardWidth = (CONTENT_WIDTH - (4 * financiamentoGap) - 6) / 5;
    const financiamentoCards = [
      ['Crédito liberado', formatCaixaCurrency(financiamento.creditoLiberadoMatriz), 'Liberação no escopo', 'neutral'],
      ['Obrigações rateadas', formatCaixaCurrency(financiamento.obrigacaoRateada), 'Compromissos da competência', 'rose'],
      ['Principal rateado', formatCaixaCurrency(financiamento.principalRateado), 'Componente de capital', 'neutral'],
      ['Encargos rateados', formatCaixaCurrency(financiamento.encargosRateados), 'Juros e demais encargos', 'amber'],
      ['Baixado no polo', formatCaixaCurrency(financiamento.pagoRateado), 'Pagamento confirmado', 'emerald'],
    ] as const;
    financiamentoCards.forEach((card, index) => {
      drawCard(
        pdf,
        CONTENT_LEFT + 3 + (index * (financiamentoCardWidth + financiamentoGap)),
        financiamentoTop + 18,
        financiamentoCardWidth,
        17,
        card[0],
        card[1],
        card[2],
        card[3],
      );
    });
  } else {
    drawRestrictedNonOperationalPosition(pdf, {
      x: CONTENT_LEFT,
      y: financiamentoTop,
      label: 'financiamento',
    });
  }
};
