import type { jsPDF } from 'jspdf';

import {
  drawCanonicalInstitutionalHeader,
  normalizeCanonicalInstitutionalHeader,
} from '../../secretaria/shared/canonical-institutional-header-pdf';
import {
  drawCanonicalPdfWatermark,
  normalizeCanonicalPdfText,
  resolveCanonicalPdfPhoto,
  truncatePdfText,
  type CanonicalPdfImage,
} from '../../secretaria/shared/canonical-document-vector-pdf';
import type {
  EmprestimoFinanceiro,
  EmprestimosExportSnapshot,
} from './emprestimos.types';

const PAGE_WIDTH = 297;
const PAGE_HEIGHT = 210;
const CONTENT_LEFT = 20;
const CONTENT_RIGHT = 277;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;
const FOOTER_Y = 202;
// O cabeçalho institucional oficial ocupa até 65,5 mm em A4 paisagem e o
// rodapé começa em 199 mm. Mantemos uma folga visual de 15 mm antes dele;
// assim nenhuma linha de contrato toca o rodapé, mesmo na primeira página
// que ainda contém o resumo.
const FIRST_PAGE_ROWS = 7;
const CONTINUATION_PAGE_ROWS = 8;

const COLORS = {
  navy: [0, 26, 51] as const,
  indigo: [79, 70, 229] as const,
  slate800: [30, 41, 59] as const,
  slate700: [51, 65, 85] as const,
  slate600: [71, 85, 105] as const,
  slate500: [100, 116, 139] as const,
  slate400: [148, 163, 184] as const,
  slate200: [226, 232, 240] as const,
  slate100: [241, 245, 249] as const,
  slate50: [248, 250, 252] as const,
  emerald: [4, 120, 87] as const,
  amber: [180, 83, 9] as const,
  rose: [190, 24, 93] as const,
} as const;

type PdfGStateConstructor = new (parameters: { opacity: number }) => unknown;
type Rgb = readonly [number, number, number];

type PdfWithInternals = {
  internal: { pages?: string[][] };
};

const asRecord = (value: object | null | undefined): Record<string, unknown> => (
  value && typeof value === 'object' ? value as Record<string, unknown> : {}
);

const readText = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const text = String(source[key] || '').trim();
    if (text) return text;
  }
  return '';
};

const normalizeDate = (value: string | undefined) => {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const formatDate = (value?: string) => {
  const raw = String(value || '').slice(0, 10);
  if (!raw) return '—';
  const date = new Date(`${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
};

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(Number(value || 0));

const formatCanonicalCurrency = (value?: number) => (
  value === undefined ? '—' : formatCurrency(value)
);

const statusLabel = (status: EmprestimoFinanceiro['status']) => ({
  ATIVO: 'Ativo',
  QUITADO: 'Quitado',
  CANCELADO: 'Cancelado',
}[status] || status);

const statusColor = (status: EmprestimoFinanceiro['status']) => (
  status === 'QUITADO' ? COLORS.emerald : status === 'CANCELADO' ? COLORS.rose : COLORS.amber
);

const scopeLabel = (scope: EmprestimosExportSnapshot['statusScope']) => ({
  ATIVOS: 'Ativos',
  FINALIZADOS: 'Finalizados',
  TODOS: 'Todos',
}[scope] || 'Todos');

const formatContaCredito = (item: EmprestimoFinanceiro) => {
  const conta = item.contaCredito;
  if (!conta) return 'Conta não retornada';
  const identity = [conta.banco, conta.titular].filter(Boolean).join(' · ');
  const details = [
    conta.agencia ? `Ag. ${conta.agencia}` : '',
    conta.conta ? `Conta ${conta.conta}` : '',
  ].filter(Boolean).join(' · ');
  return [identity, details].filter(Boolean).join(' — ') || 'Conta não retornada';
};

/**
 * Relatórios de empréstimos são A4 paisagem. A arte retrato nunca é um
 * fallback visual válido aqui: quando não há arte horizontal, a camada
 * canônica usa a marca textual, sem distorcer a imagem vertical.
 */
export const resolveEmprestimosLandscapeWatermark = (polo: Record<string, unknown>) => {
  const rawOpacity = Number(
    polo.landscapeWatermarkOpacity ?? polo.landscape_watermark_opacity ?? 0.04,
  );
  const rawScale = Number(
    polo.landscapeWatermarkScale ?? polo.landscape_watermark_scale ?? 50,
  );
  const rawRotate = polo.landscapeWatermarkRotate
    ?? polo.landscape_watermark_rotate
    ?? true;
  return {
    imageUrl: readText(polo, ['landscapeWatermarkUrl', 'landscape_watermark_url']) || null,
    opacity: Number.isFinite(rawOpacity) ? Math.min(1, Math.max(0, rawOpacity)) : 0.04,
    scale: Number.isFinite(rawScale) ? Math.min(100, Math.max(10, rawScale)) : 50,
    rotate: typeof rawRotate === 'boolean'
      ? rawRotate
      : String(rawRotate).trim().toLowerCase() === 'true',
  };
};

export const resolveEmprestimosLandscapeWatermarkPlacement = (
  imageWidth: number,
  imageHeight: number,
  settings: Pick<ReturnType<typeof resolveEmprestimosLandscapeWatermark>, 'scale' | 'rotate'>,
) => {
  const safeImageWidth = Math.max(1, imageWidth);
  const safeImageHeight = Math.max(1, imageHeight);
  const boxWidth = PAGE_WIDTH * (settings.scale / 100);
  const ratio = Math.min(boxWidth / safeImageWidth, PAGE_HEIGHT / safeImageHeight);
  const width = safeImageWidth * ratio;
  const height = safeImageHeight * ratio;
  const rotation = settings.rotate ? 45 : 0;
  let x = (PAGE_WIDTH - width) / 2;
  let y = (PAGE_HEIGHT - height) / 2;

  if (rotation) {
    const radians = rotation * (Math.PI / 180);
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    x = (PAGE_WIDTH / 2) - ((cosine * width / 2) - (sine * height / 2));
    const translatedPdfY = (PAGE_HEIGHT / 2) - ((sine * width / 2) + (cosine * height / 2));
    y = PAGE_HEIGHT - height - translatedPdfY;
  }

  return { x, y, width, height, rotation };
};

const mergeInstitution = (
  company: Record<string, unknown>,
  polo: Record<string, unknown>,
) => ({
  ...company,
  ...polo,
  nomeFantasia: readText(polo, ['nomeFantasia', 'nome', 'razaoSocial'])
    || readText(company, ['nomeFantasia', 'nome', 'razaoSocial']),
  logoUrl: readText(polo, ['logoUrl', 'logo_url']) || readText(company, ['logoUrl', 'logo_url']),
});

const drawSingleLine = (
  pdf: jsPDF,
  value: string,
  x: number,
  y: number,
  width: number,
  options: { align?: 'left' | 'center' | 'right'; size?: number; color?: Rgb; bold?: boolean } = {},
) => {
  pdf.setFont('helvetica', options.bold ? 'bold' : 'normal');
  pdf.setFontSize(options.size ?? 6.3);
  const color = options.color ?? COLORS.slate700;
  pdf.setTextColor(color[0], color[1], color[2]);
  const [line = ''] = truncatePdfText(
    pdf,
    normalizeCanonicalPdfText(value).replace(/\s+/g, ' ').trim(),
    Math.max(1, width),
    1,
  );
  if (line) pdf.text(line, x, y, { align: options.align ?? 'left', baseline: 'top' });
};

const drawPageBackground = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  watermark: CanonicalPdfImage | null,
  label: string,
  settings: ReturnType<typeof resolveEmprestimosLandscapeWatermark>,
) => {
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F');

  if (watermark) {
    const properties = pdf.getImageProperties(watermark.dataUrl);
    const placement = resolveEmprestimosLandscapeWatermarkPlacement(
      properties.width,
      properties.height,
      settings,
    );
    pdf.saveGraphicsState();
    pdf.setGState(new GState({ opacity: settings.opacity }) as never);
    pdf.addImage(
      watermark.dataUrl,
      watermark.format,
      placement.x,
      placement.y,
      placement.width,
      placement.height,
      'emprestimos-landscape-watermark',
      'FAST',
      placement.rotation,
    );
    pdf.restoreGraphicsState();
    return;
  }

  drawCanonicalPdfWatermark(pdf, GState, {
    enabled: true,
    imageUrl: null,
    label,
    opacity: settings.opacity,
  }, {
    x: 55,
    y: 64,
    width: 188,
    height: 100,
    textSize: 31,
    rotate: 38,
  });
};

const drawSummary = (pdf: jsPDF, snapshot: EmprestimosExportSnapshot, y: number) => {
  const cardWidth = (CONTENT_WIDTH - 5) / 2;
  const cards = [
    ['CONTRATOS LISTADOS', String(snapshot.total)],
    ['SITUAÇÃO SELECIONADA', scopeLabel(snapshot.statusScope)],
  ] as const;

  cards.forEach(([label, value], index) => {
    const x = CONTENT_LEFT + index * (cardWidth + 5);
    pdf.setFillColor(...COLORS.slate50);
    pdf.setDrawColor(...COLORS.slate200);
    pdf.roundedRect(x, y, cardWidth, 14, 2, 2, 'FD');
    drawSingleLine(pdf, label, x + 3, y + 2.8, cardWidth - 6, {
      size: 4.9,
      bold: true,
      color: COLORS.slate500,
    });
    drawSingleLine(pdf, value, x + 3, y + 7.2, cardWidth - 6, {
      size: 8.3,
      bold: true,
      color: COLORS.navy,
    });
  });
};

const tableColumns = [
  { key: 'contract', label: 'CONTRATO / CREDOR', width: 55 },
  { key: 'credit', label: 'CRÉDITO E CONTA DE DESTINO', width: 53 },
  { key: 'debt', label: 'DÍVIDA / PARCELAS', width: 34 },
  { key: 'settlement', label: 'JÁ PAGO / PENDENTE', width: 39 },
  { key: 'next', label: 'PRÓXIMA PARCELA', width: 39 },
  { key: 'status', label: 'SITUAÇÃO', width: 37 },
] as const;

const drawTableHeader = (pdf: jsPDF, y: number) => {
  let x = CONTENT_LEFT;
  pdf.setFillColor(...COLORS.navy);
  pdf.roundedRect(CONTENT_LEFT, y, CONTENT_WIDTH, 8, 1.5, 1.5, 'F');
  tableColumns.forEach((column) => {
    drawSingleLine(pdf, column.label, x + 2.5, y + 2.6, column.width - 5, {
      size: 4.65,
      bold: true,
      color: [255, 255, 255],
    });
    x += column.width;
  });
};

const drawLoanRow = (pdf: jsPDF, item: EmprestimoFinanceiro, y: number, index: number) => {
  const rowHeight = 12.5;
  const next = item.parcelas.find((parcela) => parcela.status === 'PENDENTE' || parcela.status === 'VENCIDO');
  const values = [
    [item.descricao || 'Contrato sem descrição', item.credorNome || 'Credor não informado'],
    [formatCurrency(item.valorLiberado), formatContaCredito(item)],
    [formatCurrency(item.valorTotalDivida), `${item.totalParcelas || item.parcelas.length} parcela(s)`],
    [formatCanonicalCurrency(item.valorPago), formatCanonicalCurrency(item.valorPendente)],
    next ? [`Parcela ${next.numero} · ${formatDate(next.dataVencimento)}`, formatCurrency(next.valorTotal)] : ['Sem parcelas abertas', '—'],
    [statusLabel(item.status), `Liberação: ${formatDate(item.dataLiberacao)}`],
  ] as const;

  const rowColor: Rgb = index % 2 === 0 ? [255, 255, 255] : COLORS.slate50;
  pdf.setFillColor(rowColor[0], rowColor[1], rowColor[2]);
  pdf.setDrawColor(...COLORS.slate200);
  pdf.rect(CONTENT_LEFT, y, CONTENT_WIDTH, rowHeight, 'FD');

  let x = CONTENT_LEFT;
  values.forEach((value, columnIndex) => {
    const column = tableColumns[columnIndex]!;
    const isStatus = column.key === 'status';
    drawSingleLine(pdf, value[0], x + 2.5, y + 2.1, column.width - 5, {
      size: 5.9,
      bold: true,
      color: isStatus ? statusColor(item.status) : COLORS.slate800,
    });
    drawSingleLine(pdf, value[1], x + 2.5, y + 6.8, column.width - 5, {
      size: 4.85,
      color: COLORS.slate500,
    });
    x += column.width;
  });
};

const drawFooter = (
  pdf: jsPDF,
  snapshot: EmprestimosExportSnapshot,
  page: number,
  totalPages: number,
) => {
  pdf.setDrawColor(...COLORS.slate200);
  pdf.line(CONTENT_LEFT, FOOTER_Y - 3, CONTENT_RIGHT, FOOTER_Y - 3);
  drawSingleLine(pdf, `Relatório de empréstimos · ${snapshot.total} registro(s)`, CONTENT_LEFT, FOOTER_Y, 115, {
    size: 5.2,
    color: COLORS.slate500,
  });
  drawSingleLine(pdf, `Página ${page}/${totalPages}`, CONTENT_RIGHT, FOOTER_Y, 42, {
    align: 'right',
    size: 5.2,
    color: COLORS.slate500,
  });
};

/** Paginação visual fixa; dados, filtro, ordenação e total são do snapshot RPC. */
export const buildEmprestimosExportPages = (items: EmprestimoFinanceiro[]) => {
  if (items.length === 0) return [[]] as EmprestimoFinanceiro[][];
  const pages: EmprestimoFinanceiro[][] = [items.slice(0, FIRST_PAGE_ROWS)];
  for (let cursor = FIRST_PAGE_ROWS; cursor < items.length; cursor += CONTINUATION_PAGE_ROWS) {
    pages.push(items.slice(cursor, cursor + CONTINUATION_PAGE_ROWS));
  }
  return pages;
};

const drawEmptyState = (pdf: jsPDF, y: number) => {
  pdf.setFillColor(...COLORS.slate50);
  pdf.setDrawColor(...COLORS.slate200);
  pdf.roundedRect(CONTENT_LEFT, y, CONTENT_WIDTH, 24, 2, 2, 'FD');
  drawSingleLine(pdf, 'Nenhum empréstimo no escopo selecionado.', PAGE_WIDTH / 2, y + 8, 150, {
    align: 'center',
    size: 7,
    bold: true,
    color: COLORS.slate600,
  });
  drawSingleLine(pdf, 'O relatório mantém a consulta canônica emitida pelo backend.', PAGE_WIDTH / 2, y + 13.5, 170, {
    align: 'center',
    size: 5.4,
    color: COLORS.slate500,
  });
};

export interface EmprestimosExportPdfInput {
  snapshot: EmprestimosExportSnapshot;
}

export const EMPRESTIMOS_EXPORT_PDF_PIPELINE = 'native-vector' as const;

const formatFileDate = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

export const getEmprestimosExportPdfFileName = (issuedAt = new Date()) => (
  `relatorio-emprestimos-${formatFileDate(issuedAt)}.pdf`
);

export const createEmprestimosExportPdfDocument = async ({ snapshot }: EmprestimosExportPdfInput) => {
  const { jsPDF: JsPdf, GState } = await import('jspdf');
  const pdf = new JsPdf({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: false,
  });
  const issuedAt = normalizeDate(snapshot.issuedAt);
  const polo = asRecord(snapshot.polo);
  const company = asRecord(snapshot.company);
  const institutionSource = mergeInstitution(company, polo);
  const institution = normalizeCanonicalInstitutionalHeader(institutionSource);
  const landscapeWatermark = resolveEmprestimosLandscapeWatermark(polo);
  const [logo, watermark] = await Promise.all([
    resolveCanonicalPdfPhoto(readText(institutionSource, ['logoUrl', 'logo_url']) || null),
    resolveCanonicalPdfPhoto(landscapeWatermark.imageUrl),
  ]);
  const pages = buildEmprestimosExportPages(snapshot.items);
  const meta = {
    eyebrow: 'Financeiro · gestão de contratos',
    title: 'Relatório de empréstimos',
    label: 'Emitido em',
    value: issuedAt.toLocaleDateString('pt-BR'),
  };

  pdf.setProperties({
    title: 'Relatório de empréstimos',
    subject: 'Contratos de empréstimo por polo',
    author: institution.name,
    creator: 'Universo Cursos e Consultoria',
    keywords: 'financeiro, empréstimos, contratos, parcelas',
  });

  pages.forEach((pageItems, index) => {
    if (index > 0) pdf.addPage('a4', 'landscape');
    drawPageBackground(
      pdf,
      GState as unknown as PdfGStateConstructor,
      watermark,
      institution.name || 'UNIVERSO CURSOS E CONSULTORIA',
      landscapeWatermark,
    );
    const header = drawCanonicalInstitutionalHeader(pdf, institution, logo, {
      orientation: 'landscape',
      alias: 'emprestimos-institutional-header-logo',
      meta,
    });
    let tableY = header.contentTop + 4;
    if (index === 0) {
      drawSummary(pdf, snapshot, tableY);
      tableY += 19;
    } else {
      drawSingleLine(pdf, 'RELAÇÃO DE EMPRÉSTIMOS · CONTINUAÇÃO', CONTENT_LEFT, tableY + 1, 130, {
        size: 6.5,
        bold: true,
        color: COLORS.navy,
      });
      tableY += 8;
    }
    drawTableHeader(pdf, tableY);
    if (pageItems.length === 0) drawEmptyState(pdf, tableY + 11);
    else pageItems.forEach((item, itemIndex) => drawLoanRow(pdf, item, tableY + 8 + itemIndex * 12.5, itemIndex));
    drawFooter(pdf, snapshot, index + 1, pages.length);
  });

  return pdf;
};

export const buildEmprestimosExportPdf = async (input: EmprestimosExportPdfInput) => {
  const pdf = await createEmprestimosExportPdfDocument(input);
  return pdf.output('blob');
};

export const inspectEmprestimosExportPdfOperatorsForTest = (pdf: jsPDF) => {
  const pages = (pdf as unknown as PdfWithInternals).internal.pages ?? [];
  return pages.slice(1).map((operators) => ({
    hasTextOperator: operators.some((operator) => /\b(?:Tj|TJ)\b/.test(operator)),
    imageDrawCount: operators.filter((operator) => /\/I\w+\s+Do\b/.test(operator)).length,
  }));
};
