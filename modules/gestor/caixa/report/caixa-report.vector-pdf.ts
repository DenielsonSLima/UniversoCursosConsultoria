import type { jsPDF } from 'jspdf';
import {
  formatCaixaCompetencia,
  formatCaixaCurrency,
  formatCaixaDate,
  formatCaixaInstallment,
} from '../caixa.formatters';
import { buildCaixaReportPages } from './caixa-report.pagination';
import type {
  CaixaDetailedReport,
  CaixaReportExpense,
  CaixaReportReceipt,
  CaixaReportRecurringBreakdown,
  CaixaReportRecurringClass,
  CaixaReportTotals,
} from './caixa-report.types';

const PAGE_WIDTH = 297;
const PAGE_HEIGHT = 210;
const CONTENT_LEFT = 15;
const CONTENT_RIGHT = 289;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;
const HEADER_BOTTOM = 42;
const FOOTER_TOP = 201;
const FONT_NAME = 'InterUniverso';
type FontStyle = 'normal' | 'medium' | 'semibold' | 'bold' | 'extrabold' | 'black';

const COLORS = {
  navy: '#001a33',
  blue: '#2563eb',
  slate900: '#0f172a',
  slate700: '#334155',
  slate600: '#475569',
  slate500: '#64748b',
  slate400: '#94a3b8',
  slate200: '#e2e8f0',
  slate100: '#f1f5f9',
  emerald700: '#047857',
  emerald100: '#d1fae5',
  emerald50: '#ecfdf5',
  rose700: '#be123c',
  rose100: '#ffe4e6',
  rose50: '#fff1f2',
  amber700: '#b45309',
  amber100: '#fef3c7',
  amber50: '#fffbeb',
  white: '#ffffff',
} as const;

type Tone = 'emerald' | 'rose';
type PdfWithInternals = {
  internal: { pages?: string[][] };
};

export const CAIXA_REPORT_PDF_PIPELINE = 'native-vector' as const;

export const getCaixaResultLabel = (
  status: CaixaDetailedReport['resumo']['resumoCompetencia']['resultadoStatus'],
) => status === 'NEGATIVO'
  ? 'Déficit do mês'
  : status === 'POSITIVO'
    ? 'Superávit do mês'
    : 'Resultado do mês';

export const buildCaixaAdjustmentLines = (row: CaixaReportReceipt | CaixaReportExpense) => [
  `Juros: ${row.juros === null ? 'Não discriminado' : formatCaixaCurrency(row.juros)}`,
  `Multa: ${row.multa === null ? 'Não discriminado' : formatCaixaCurrency(row.multa)}`,
  `Acrésc.: ${row.acrescimo === null ? 'Não discriminado' : formatCaixaCurrency(row.acrescimo)}`,
  `Desconto: ${row.desconto === null ? 'Não discriminado' : formatCaixaCurrency(row.desconto)}`,
  ...(row.diferencaNaoDiscriminada !== 0
    ? [`Não discrim.: ${formatCaixaCurrency(row.diferencaNaoDiscriminada)}`]
    : []),
];

const toBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

const fetchAsDataUrl = async (url: string | null) => {
  if (!url) return null;
  if (url.startsWith('data:image/')) {
    if (url.length > 20 * 1024 * 1024) throw new Error('A arte configurada para o PDF excede o limite permitido.');
    return url;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`A imagem obrigatória do PDF não pôde ser carregada (${response.status}).`);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('A arte configurada para o PDF não é uma imagem válida.');
  if (blob.size > 15 * 1024 * 1024) throw new Error('A arte configurada para o PDF excede o limite de 15 MB.');
  return `data:${blob.type || 'image/png'};base64,${toBase64(await blob.arrayBuffer())}`;
};

const fetchLogoDataUrl = async (url: string | null) => {
  if (url) {
    try {
      return await fetchAsDataUrl(url);
    } catch (error) {
      console.warn('[Caixa PDF] Logo institucional indisponível; usando a marca oficial local.', error);
    }
  }
  return typeof window === 'undefined' ? null : fetchAsDataUrl('/LogoUniverso.png');
};

const registerInterFont = async (
  pdf: jsPDF,
  suppliedFonts?: {
    regular?: ArrayBuffer;
    medium?: ArrayBuffer;
    semiBold?: ArrayBuffer;
    bold?: ArrayBuffer;
    extraBold?: ArrayBuffer;
    black?: ArrayBuffer;
  },
) => {
  let regularBuffer = suppliedFonts?.regular;
  let mediumBuffer = suppliedFonts?.medium;
  let semiBoldBuffer = suppliedFonts?.semiBold;
  let boldBuffer = suppliedFonts?.bold;
  let extraBoldBuffer = suppliedFonts?.extraBold;
  let blackBuffer = suppliedFonts?.black;
  if (!regularBuffer || !mediumBuffer || !semiBoldBuffer || !boldBuffer || !extraBoldBuffer || !blackBuffer) {
    const [regularResponse, mediumResponse, semiBoldResponse, boldResponse, extraBoldResponse, blackResponse] = await Promise.all([
      fetch('/fonts/Inter-Regular.ttf'),
      fetch('/fonts/Inter-Medium.ttf'),
      fetch('/fonts/Inter-SemiBold.ttf'),
      fetch('/fonts/Inter-Bold.ttf'),
      fetch('/fonts/Inter-ExtraBold.ttf'),
      fetch('/fonts/Inter-Black.ttf'),
    ]);
    if (!regularResponse.ok || !mediumResponse.ok || !semiBoldResponse.ok || !boldResponse.ok || !extraBoldResponse.ok || !blackResponse.ok) {
      throw new Error('A fonte Inter do relatório não pôde ser carregada.');
    }
    [regularBuffer, mediumBuffer, semiBoldBuffer, boldBuffer, extraBoldBuffer, blackBuffer] = await Promise.all([
      regularResponse.arrayBuffer(),
      mediumResponse.arrayBuffer(),
      semiBoldResponse.arrayBuffer(),
      boldResponse.arrayBuffer(),
      extraBoldResponse.arrayBuffer(),
      blackResponse.arrayBuffer(),
    ]);
  }
  pdf.addFileToVFS('Inter-Regular.ttf', toBase64(regularBuffer));
  pdf.addFileToVFS('Inter-Medium.ttf', toBase64(mediumBuffer));
  pdf.addFileToVFS('Inter-SemiBold.ttf', toBase64(semiBoldBuffer));
  pdf.addFileToVFS('Inter-Bold.ttf', toBase64(boldBuffer));
  pdf.addFileToVFS('Inter-ExtraBold.ttf', toBase64(extraBoldBuffer));
  pdf.addFileToVFS('Inter-Black.ttf', toBase64(blackBuffer));
  pdf.addFont('Inter-Regular.ttf', FONT_NAME, 'normal');
  pdf.addFont('Inter-Medium.ttf', FONT_NAME, 'medium');
  pdf.addFont('Inter-SemiBold.ttf', FONT_NAME, 'semibold');
  pdf.addFont('Inter-Bold.ttf', FONT_NAME, 'bold');
  pdf.addFont('Inter-ExtraBold.ttf', FONT_NAME, 'extrabold');
  pdf.addFont('Inter-Black.ttf', FONT_NAME, 'black');
  pdf.setFont(FONT_NAME, 'normal');
};

const setText = (
  pdf: jsPDF,
  color: string,
  size: number,
  style: FontStyle = 'normal',
) => {
  pdf.setTextColor(color);
  pdf.setFont(FONT_NAME, style);
  pdf.setFontSize(size);
};

const fitText = (pdf: jsPDF, value: string, width: number, maxLines = 2) => {
  const wrapped = pdf.splitTextToSize(value || '-', width) as string[];
  if (wrapped.length <= maxLines) return wrapped;
  const visible = wrapped.slice(0, maxLines);
  const lastIndex = visible.length - 1;
  let lastLine = visible[lastIndex].replace(/[\s·.,;:!?-]+$/u, '');
  while (lastLine && pdf.getTextWidth(`${lastLine}…`) > width) {
    lastLine = lastLine.slice(0, -1).trimEnd();
  }
  visible[lastIndex] = `${lastLine}…`;
  return visible;
};

const drawText = (
  pdf: jsPDF,
  value: string,
  x: number,
  y: number,
  width?: number,
  options?: {
    align?: 'left' | 'center' | 'right';
    maxLines?: number;
    lineHeight?: number;
    charSpace?: number;
  },
) => {
  const lines = width ? fitText(pdf, value, width, options?.maxLines ?? 2) : [value];
  pdf.text(lines, x, y, {
    align: options?.align ?? 'left',
    baseline: 'top',
    lineHeightFactor: options?.lineHeight ?? 1.15,
    charSpace: options?.charSpace,
  });
  return lines.length;
};

const addContainedImage = (
  pdf: jsPDF,
  dataUrl: string,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  const properties = pdf.getImageProperties(dataUrl);
  const ratio = Math.min(width / properties.width, height / properties.height);
  const imageWidth = properties.width * ratio;
  const imageHeight = properties.height * ratio;
  pdf.addImage(
    dataUrl,
    properties.fileType || 'PNG',
    x + ((width - imageWidth) / 2),
    y + ((height - imageHeight) / 2),
    imageWidth,
    imageHeight,
    undefined,
    'FAST',
  );
};

const drawPageBackground = (
  pdf: jsPDF,
  report: CaixaDetailedReport,
  background: string | null,
  usesFallbackArtwork: boolean,
) => {
  pdf.setFillColor(COLORS.white);
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F');
  if (background) {
    const properties = pdf.getImageProperties(background);
    const configuredScale = Math.min(100, Math.max(
      10,
      usesFallbackArtwork ? 55 : report.institucional.landscape_watermark_scale,
    ));
    const boxWidth = PAGE_WIDTH * (configuredScale / 100);
    const boxHeight = PAGE_HEIGHT;
    const ratio = Math.min(boxWidth / properties.width, boxHeight / properties.height);
    const imageWidth = properties.width * ratio;
    const imageHeight = properties.height * ratio;
    const shouldRotate = usesFallbackArtwork || report.institucional.landscape_watermark_rotate;
    const rotation = shouldRotate ? 45 : 0;
    let imageX = (PAGE_WIDTH - imageWidth) / 2;
    let imageY = (PAGE_HEIGHT - imageHeight) / 2;
    if (rotation) {
      const radians = rotation * (Math.PI / 180);
      const cosine = Math.cos(radians);
      const sine = Math.sin(radians);
      imageX = (PAGE_WIDTH / 2) - ((cosine * imageWidth / 2) - (sine * imageHeight / 2));
      const translatedPdfY = (PAGE_HEIGHT / 2) - ((sine * imageWidth / 2) + (cosine * imageHeight / 2));
      imageY = PAGE_HEIGHT - imageHeight - translatedPdfY;
    }
    const opacity = Math.min(1, Math.max(
      0,
      usesFallbackArtwork ? 0.04 : report.institucional.landscape_watermark_opacity,
    ));
    pdf.saveGraphicsState();
    pdf.setGState(pdf.GState({ opacity }));
    pdf.addImage(
      background,
      properties.fileType || 'PNG',
      imageX,
      imageY,
      imageWidth,
      imageHeight,
      'landscape-watermark',
      'FAST',
      rotation,
    );
    pdf.restoreGraphicsState();
    return;
  }

};

const drawHeader = (
  pdf: jsPDF,
  report: CaixaDetailedReport,
  logo: string | null,
) => {
  pdf.setFillColor(COLORS.white);
  pdf.setDrawColor(COLORS.slate200);
  pdf.roundedRect(CONTENT_LEFT, 8, 26, 26, 3, 3, 'FD');
  if (logo) addContainedImage(pdf, logo, CONTENT_LEFT + 1.5, 9.5, 23, 23);

  const institution = report.institucional;
  setText(pdf, COLORS.navy, 13, 'black');
  const institutionName = institution.nome.toUpperCase();
  drawText(pdf, institutionName, 46, 12.5, 100, { maxLines: 1, charSpace: -0.05 });
  if (institution.is_matriz) {
    const badgeX = Math.min(151, 46 + pdf.getTextWidth(institutionName) + 3);
    pdf.setFillColor(COLORS.slate100);
    pdf.setDrawColor(COLORS.slate200);
    pdf.roundedRect(badgeX, 12, 14, 5, 1.5, 1.5, 'FD');
    setText(pdf, COLORS.navy, 6.5, 'extrabold');
    drawText(pdf, 'MATRIZ', badgeX + 7, 13.1, undefined, { align: 'center' });
  }

  const drawDetail = (label: string, value: string, x: number, y: number) => {
    setText(pdf, COLORS.slate700, 8, 'bold');
    drawText(pdf, label, x, y);
    const labelWidth = pdf.getTextWidth(label);
    setText(pdf, COLORS.slate600, 8, 'medium');
    drawText(pdf, value, x + labelWidth + 1, y);
  };
  drawDetail('CNPJ:', institution.cnpj || 'Não informado', 46, 21.5);
  drawDetail('Contato:', institution.telefone || 'Não informado', 46, 26.5);

  const address = [
    `${institution.endereco || ''}${institution.numero ? `, ${institution.numero}` : ''}`,
    institution.bairro,
    `${institution.cidade || ''}${institution.estado ? `/${institution.estado}` : ''}`,
    institution.cep ? `CEP: ${institution.cep}` : '',
  ].filter(Boolean).join(' - ');
  setText(pdf, COLORS.slate700, 8, 'bold');
  drawText(pdf, 'Endereço:', 123, 21.5);
  const addressX = 123 + pdf.getTextWidth('Endereço:') + 1;
  setText(pdf, COLORS.slate600, 8, 'medium');
  drawText(pdf, address, addressX, 21.5, 199 - addressX, { maxLines: 2 });

  setText(pdf, COLORS.slate400, 6.5, 'black');
  drawText(pdf, 'CAIXA · USO INTERNO', CONTENT_RIGHT, 9, undefined, { align: 'right', charSpace: 0.18 });
  setText(pdf, COLORS.navy, 6.8, 'black');
  drawText(pdf, report.resumo.meta.escopoRotulo.toUpperCase(), CONTENT_RIGHT, 14, 88, {
    align: 'right',
    maxLines: 1,
  });
  setText(pdf, COLORS.slate500, 6.5, 'bold');
  drawText(pdf, formatCaixaCompetencia(report.resumo.meta.competencia), CONTENT_RIGHT, 23, undefined, { align: 'right' });

  pdf.setDrawColor(COLORS.slate200);
  pdf.setLineWidth(0.35);
  pdf.line(CONTENT_LEFT, HEADER_BOTTOM, CONTENT_RIGHT, HEADER_BOTTOM);
};

const drawFooter = (pdf: jsPDF, report: CaixaDetailedReport, pageNumber: number, pageCount: number) => {
  pdf.setDrawColor(COLORS.slate100);
  pdf.setLineWidth(0.25);
  pdf.line(CONTENT_LEFT, FOOTER_TOP, CONTENT_RIGHT, FOOTER_TOP);
  setText(pdf, COLORS.slate500, 5.8, 'bold');
  drawText(pdf, 'CONFIDENCIAL · USO INTERNO', CONTENT_LEFT, 204);
  drawText(
    pdf,
    `GERADO PELO BACKEND EM ${new Date(report.geradoEm).toLocaleString('pt-BR')}`,
    PAGE_WIDTH / 2,
    204,
    undefined,
    { align: 'center' },
  );
  drawText(pdf, `PÁGINA ${pageNumber} DE ${pageCount}`, CONTENT_RIGHT, 204, undefined, { align: 'right' });
};

const drawCard = (
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
  description: string,
  tone: 'neutral' | 'emerald' | 'rose' | 'amber',
) => {
  const palette = {
    neutral: [COLORS.slate100, COLORS.slate200, COLORS.slate900],
    emerald: [COLORS.emerald50, COLORS.emerald100, COLORS.emerald700],
    rose: [COLORS.rose50, COLORS.rose100, COLORS.rose700],
    amber: [COLORS.amber50, COLORS.amber100, COLORS.amber700],
  }[tone];
  pdf.setFillColor(palette[0]);
  pdf.setDrawColor(palette[1]);
  pdf.roundedRect(x, y, width, height, 2.5, 2.5, 'FD');
  setText(pdf, COLORS.slate600, 6.2, 'black');
  drawText(pdf, label.toUpperCase(), x + 2.2, y + 2.2, width - 4.4, { maxLines: 1 });
  setText(pdf, palette[2], 12, 'black');
  drawText(pdf, value, x + 2.2, y + 6.2, width - 4.4, { maxLines: 1 });
  setText(pdf, COLORS.slate500, 5.8);
  drawText(pdf, description, x + 2.2, y + 11.8, width - 4.4, { maxLines: 1 });
};

const drawComposition = (
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
  pdf.roundedRect(x, y, width, 21, 2.5, 2.5, 'FD');
  setText(pdf, accent, 7, 'black');
  drawText(pdf, tone === 'emerald' ? 'COMPOSIÇÃO DOS RECEBIMENTOS' : 'COMPOSIÇÃO DAS DESPESAS', x + 2.5, y + 2.2);
  setText(pdf, accent, 10.5, 'bold');
  drawText(pdf, formatCaixaCurrency(totals.valorFinal), x + width - 2.5, y + 2, undefined, { align: 'right' });
  setText(pdf, COLORS.slate500, 5.5);
  drawText(pdf, tone === 'emerald' ? 'Ajustes identificados e auditados pelo backend' : 'Pagamentos confirmados, sem duplicar lançamentos vinculados', x + 2.5, y + 6.5);
  pdf.setDrawColor(border);
  pdf.line(x + 2.5, y + 9.5, x + width - 2.5, y + 9.5);
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
    setText(pdf, COLORS.slate500, 5.5);
    drawText(pdf, label, columnX, y + 11.3);
    setText(pdf, COLORS.slate700, 6.3, 'bold');
    drawText(pdf, formatCaixaCurrency(value), columnX, y + 14.8, columnWidth - 1, { maxLines: 1 });
  });
};

const drawSummaryPage = (pdf: jsPDF, report: CaixaDetailedReport) => {
  setText(pdf, COLORS.navy, 16, 'black');
  drawText(pdf, 'PRESTAÇÃO DE CONTAS MENSAL', CONTENT_LEFT, 49);
  setText(pdf, COLORS.slate500, 6.5);
  drawText(
    pdf,
    `Posição contábil e movimentos confirmados de ${formatCaixaCompetencia(report.resumo.meta.competencia)}. Os compromissos em aberto refletem a posição apurada na geração do relatório.`,
    CONTENT_LEFT,
    56,
    CONTENT_WIDTH,
    { maxLines: 1 },
  );

  const gap = 2.5;
  const cardWidth = (CONTENT_WIDTH - (3 * gap)) / 4;
  const resultLabel = getCaixaResultLabel(report.resumo.resumoCompetencia.resultadoStatus);
  const cards = [
    ['Saldo contábil registrado', formatCaixaCurrency(report.resumo.saldosHoje.registradoTotal), 'Posição contábil do sistema; não é consulta ao extrato', 'neutral'],
    ['Entradas recebidas', formatCaixaCurrency(report.totaisRecebimentos.valorFinal), `${report.totaisRecebimentos.quantidade} recebimento(s) confirmado(s)`, 'emerald'],
    ['Saídas pagas', formatCaixaCurrency(report.totaisDespesas.valorFinal), `${report.totaisDespesas.quantidade} pagamento(s) confirmado(s)`, 'rose'],
    [resultLabel, formatCaixaCurrency(report.resumo.resumoCompetencia.resultado), 'Entradas menos saídas confirmadas no período', report.resumo.resumoCompetencia.resultado >= 0 ? 'emerald' : 'rose'],
    ['A receber', formatCaixaCurrency(report.resumo.compromissos.aReceber), 'Receitas futuras ainda em aberto', 'neutral'],
    ['Inadimplência', formatCaixaCurrency(report.resumo.compromissos.receberVencido), 'Valor vencido e ainda não recebido', 'amber'],
    ['A pagar', formatCaixaCurrency(report.resumo.compromissos.aPagar), 'Obrigações futuras ainda em aberto', 'neutral'],
    ['Obrigações vencidas', formatCaixaCurrency(report.resumo.compromissos.pagarVencido), 'Valor vencido e ainda não pago', 'rose'],
  ] as const;
  cards.forEach((card, index) => {
    const row = index < 4 ? 0 : 1;
    const column = index % 4;
    drawCard(
      pdf,
      CONTENT_LEFT + (column * (cardWidth + gap)),
      61 + (row * 19),
      cardWidth,
      16.5,
      card[0],
      card[1],
      card[2],
      card[3],
    );
  });

  const half = (CONTENT_WIDTH - gap) / 2;
  drawComposition(pdf, CONTENT_LEFT, 100, half, report.totaisRecebimentos, 'emerald');
  drawComposition(pdf, CONTENT_LEFT + half + gap, 100, half, report.totaisDespesas, 'rose');

  pdf.setFillColor('#eff6ff');
  pdf.setDrawColor('#dbeafe');
  pdf.roundedRect(CONTENT_LEFT, 123.5, CONTENT_WIDTH, 6, 2, 2, 'FD');
  setText(pdf, '#1e3a8a', 5.6, 'bold');
  drawText(pdf, 'Leitura correta: o resultado mensal representa o fluxo de caixa confirmado, não lucro contábil por competência. O saldo Banese é a posição contábil do sistema; a integração atual não consulta o extrato bancário.', CONTENT_LEFT + 3, 125, CONTENT_WIDTH - 6, { maxLines: 1 });

  drawSummaryPanels(pdf, report, 132);
};

const drawSummaryPanels = (pdf: jsPDF, report: CaixaDetailedReport, y: number) => {
  const gap = 2.5;
  const half = (CONTENT_WIDTH - gap) / 2;
  const drawPanel = (x: number, eyebrow: string, title: string) => {
    pdf.setFillColor(COLORS.white);
    pdf.setDrawColor(COLORS.slate200);
    pdf.roundedRect(x, y, half, 62, 2.5, 2.5, 'FD');
    setText(pdf, COLORS.blue, 6, 'black');
    drawText(pdf, eyebrow.toUpperCase(), x + 3, y + 3);
    setText(pdf, COLORS.navy, 7.5, 'black');
    drawText(pdf, title.toUpperCase(), x + 3, y + 7);
    pdf.setDrawColor(COLORS.slate100);
    pdf.line(x + 3, y + 11, x + half - 3, y + 11);
  };
  drawPanel(CONTENT_LEFT, 'Origem das entradas', 'Receitas recebidas por modalidade');
  drawPanel(CONTENT_LEFT + half + gap, 'Acompanhamento mensal', 'Resumo financeiro por curso');

  const modalities = ['EAD', 'ESPECIALIZACAO', 'TECNICO', 'LIVRE'].map((code) => (
    report.resumo.receitasPorModalidade.find((item) => item.codigo === code)
  )).filter(Boolean);
  modalities.forEach((item, index) => {
    if (!item) return;
    const rowY = y + 14 + (index * 10.5);
    setText(pdf, COLORS.slate700, 6.5, 'bold');
    drawText(pdf, item.rotulo, CONTENT_LEFT + 3, rowY, half - 33, { maxLines: 1 });
    setText(pdf, COLORS.slate500, 5.5);
    drawText(pdf, `${item.quantidade} recebimento(s) confirmado(s)`, CONTENT_LEFT + 3, rowY + 4);
    setText(pdf, COLORS.emerald700, 6.7, 'bold');
    drawText(pdf, formatCaixaCurrency(item.valor), CONTENT_LEFT + half - 3, rowY + 1, undefined, { align: 'right' });
  });

  const courseX = CONTENT_LEFT + half + gap;
  if (report.resumoCursos.itens.length === 0) {
    pdf.setFillColor(COLORS.slate100);
    pdf.roundedRect(courseX + 3, y + 15, half - 6, 35, 2, 2, 'F');
    setText(pdf, COLORS.slate500, 6);
    drawText(pdf, 'Nenhum curso parcelado possui previsão, recebimento ou atraso nesta competência.', courseX + (half / 2), y + 30, half - 18, { align: 'center', maxLines: 2 });
    return;
  }
  report.resumoCursos.itens.slice(0, 5).forEach((item, index) => {
    const rowY = y + 14 + (index * 9);
    setText(pdf, COLORS.slate700, 5.8, 'bold');
    drawText(pdf, item.curso, courseX + 3, rowY, half - 53, { maxLines: 1 });
    setText(pdf, COLORS.slate500, 5);
    drawText(pdf, `${item.modalidade} · ${item.quantidadeTurmas} turma(s) · ${item.quantidadeAlunos} aluno(s)`, courseX + 3, rowY + 3.5, half - 53, { maxLines: 1 });
    setText(pdf, COLORS.slate700, 5.5, 'bold');
    drawText(pdf, formatCaixaCurrency(item.previstoNoMes), courseX + half - 35, rowY + 1, undefined, { align: 'right' });
    setText(pdf, COLORS.emerald700, 5.5, 'bold');
    drawText(pdf, formatCaixaCurrency(item.recebidoNoMes), courseX + half - 19, rowY + 1, undefined, { align: 'right' });
    setText(pdf, item.emAtraso > 0 ? COLORS.amber700 : COLORS.slate400, 5.5, 'bold');
    drawText(pdf, formatCaixaCurrency(item.emAtraso), courseX + half - 3, rowY + 1, undefined, { align: 'right' });
  });
};

const drawSectionHeading = (pdf: jsPDF, title: string, description: string, page: number, tone: Tone) => {
  setText(pdf, tone === 'emerald' ? COLORS.emerald700 : COLORS.rose700, 14, 'black');
  drawText(pdf, title.toUpperCase(), CONTENT_LEFT, 49);
  setText(pdf, COLORS.slate500, 6.5);
  drawText(pdf, description, CONTENT_LEFT, 55);
  setText(pdf, COLORS.slate500, 6, 'black');
  drawText(pdf, `PÁGINA DA SEÇÃO ${page}`, CONTENT_RIGHT, 54, undefined, { align: 'right' });
  pdf.setDrawColor(COLORS.slate200);
  pdf.line(CONTENT_LEFT, 59, CONTENT_RIGHT, 59);
};

const drawMovementTable = (
  pdf: jsPDF,
  rows: Array<CaixaReportReceipt | CaixaReportExpense>,
  totals: CaixaReportTotals,
  showTotals: boolean,
  tone: Tone,
) => {
  const x = CONTENT_LEFT;
  const y = 63;
  const widths = [32, 52, 47, 54, 23, 39, 27];
  const headers = ['DATA / PARCELA', 'PESSOA / DESCRIÇÃO', 'CLASSIFICAÇÃO', 'ORIGEM / CONTA', 'BASE', 'AJUSTES', tone === 'emerald' ? 'RECEBIDO' : 'PAGO'];
  const accent = tone === 'emerald' ? COLORS.emerald700 : COLORS.rose700;
  const border = tone === 'emerald' ? COLORS.emerald100 : COLORS.rose100;
  const footerFill = tone === 'emerald' ? COLORS.emerald50 : COLORS.rose50;
  const rowHeight = rows.length === 0 ? 45 : 22;
  const footerHeight = showTotals ? 17 : 0;
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
        const lineStep = Math.min(3.45, 16.8 / Math.max(1, wrappedLines.length - 1));
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

const drawRecurringTable = (
  pdf: jsPDF,
  report: CaixaDetailedReport,
  rows: CaixaReportRecurringClass[],
  page: number,
  showModalities: boolean,
  showTotals: boolean,
) => {
  setText(pdf, COLORS.blue, 6, 'black');
  drawText(pdf, 'CARTEIRA PARCELADA · EAD NÃO INCLUÍDO', CONTENT_LEFT, 48);
  setText(pdf, COLORS.navy, 14, 'black');
  drawText(pdf, 'ACOMPANHAMENTO POR MODALIDADE E TURMA', CONTENT_LEFT, 52);
  setText(pdf, COLORS.slate500, 6);
  drawText(pdf, 'Valores previstos, recebidos, vencidos e ajustes confirmados na competência.', CONTENT_LEFT, 58);
  setText(pdf, COLORS.slate500, 6, 'black');
  drawText(pdf, `PÁGINA DA SEÇÃO ${page}`, CONTENT_RIGHT, 56, undefined, { align: 'right' });

  const tableRows: CaixaReportRecurringBreakdown[] = showModalities
    ? report.analiseRecorrente.modalidades
    : rows;
  const tableY = 65;
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
    drawText(pdf, 'Valores canônicos do backend', CONTENT_LEFT + 2, totalY + 6.5);
    x = CONTENT_LEFT + firstWidth;
    recurringFields.forEach(([, field]) => {
      setText(pdf, COLORS.slate700, 5.5, 'bold');
      drawText(pdf, formatCaixaCurrency(report.analiseRecorrente.totais[field] as number), x + valueWidth - 1.5, totalY + 4.5, valueWidth - 2, { align: 'right', maxLines: 1 });
      x += valueWidth;
    });
  }
};

export const createCaixaReportPdfDocument = async (
  report: CaixaDetailedReport,
  onProgress?: (current: number, total: number) => void,
  testResources?: {
    regularFontBuffer?: ArrayBuffer;
    mediumFontBuffer?: ArrayBuffer;
    semiBoldFontBuffer?: ArrayBuffer;
    boldFontBuffer?: ArrayBuffer;
    extraBoldFontBuffer?: ArrayBuffer;
    blackFontBuffer?: ArrayBuffer;
    logoDataUrl?: string | null;
    backgroundDataUrl?: string | null;
  },
) => {
  const { jsPDF: JsPdf } = await import('jspdf');
  const pdf = new JsPdf({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: false });
  pdf.setProperties({
    title: `Prestação de contas - ${formatCaixaCompetencia(report.resumo.meta.competencia)}`,
    subject: `Relatório do Caixa - ${report.resumo.meta.escopoRotulo}`,
    author: report.institucional.nome,
    creator: 'Universo Cursos e Consultoria',
    keywords: 'caixa, prestação de contas, relatório financeiro',
  });
  await registerInterFont(pdf, {
    regular: testResources?.regularFontBuffer,
    medium: testResources?.mediumFontBuffer,
    semiBold: testResources?.semiBoldFontBuffer,
    bold: testResources?.boldFontBuffer,
    extraBold: testResources?.extraBoldFontBuffer,
    black: testResources?.blackFontBuffer,
  });
  const backgroundUsesFallback = !report.institucional.landscape_watermark_url;
  const fallbackArtworkUrl = typeof window === 'undefined' ? null : '/LogoUniverso.png';
  const [logo, background] = await Promise.all([
    testResources?.logoDataUrl !== undefined
      ? Promise.resolve(testResources.logoDataUrl)
      : fetchLogoDataUrl(report.institucional.logo_url),
    testResources?.backgroundDataUrl !== undefined
      ? Promise.resolve(testResources.backgroundDataUrl)
      : fetchAsDataUrl(report.institucional.landscape_watermark_url || fallbackArtworkUrl),
  ]);
  const pages = buildCaixaReportPages(report.recebimentos, report.despesas, report.analiseRecorrente.turmas);

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    if (pageIndex > 0) pdf.addPage('a4', 'landscape');
    onProgress?.(pageIndex + 1, pages.length);
    if (pageIndex > 0 && pageIndex % 4 === 0) {
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
    }
    drawPageBackground(pdf, report, background, backgroundUsesFallback);
    drawHeader(pdf, report, logo);
    const isLastSectionPage = pageIndex === pages.length - 1 || pages[pageIndex + 1]?.section !== page.section;
    if (page.section === 'RESUMO') drawSummaryPage(pdf, report);
    if (page.section === 'RECEBIMENTOS') {
      drawSectionHeading(pdf, 'Recebimentos confirmados', 'Aluno/pagador, parcela, curso, turma, conta e composição financeira.', page.sectionPage, 'emerald');
      drawMovementTable(pdf, page.rows as CaixaReportReceipt[], report.totaisRecebimentos, isLastSectionPage, 'emerald');
    }
    if (page.section === 'DESPESAS') {
      drawSectionHeading(pdf, 'Despesas pagas', 'Fornecedor, classificação, parcela, conta e composição financeira.', page.sectionPage, 'rose');
      drawMovementTable(pdf, page.rows as CaixaReportExpense[], report.totaisDespesas, isLastSectionPage, 'rose');
    }
    if (page.section === 'CARTEIRA_RECORRENTE') {
      drawRecurringTable(pdf, report, page.rows as CaixaReportRecurringClass[], page.sectionPage, page.sectionPage === 1, isLastSectionPage);
    }
    drawFooter(pdf, report, pageIndex + 1, pages.length);
  }
  return pdf;
};

export const buildCaixaVectorPdf = async (
  report: CaixaDetailedReport,
  onProgress?: (current: number, total: number) => void,
) => {
  const pdf = await createCaixaReportPdfDocument(report, onProgress);
  return pdf.output('blob');
};

export const inspectCaixaPdfOperatorsForTest = (pdf: jsPDF) => {
  const pages = (pdf as unknown as PdfWithInternals).internal.pages ?? [];
  return pages.slice(1).map((operators) => ({
    hasTextOperator: operators.some((operator) => /\b(?:Tj|TJ)\b/.test(operator)),
    imageDrawCount: operators.filter((operator) => /\/I\w+\s+Do\b/.test(operator)).length,
  }));
};
