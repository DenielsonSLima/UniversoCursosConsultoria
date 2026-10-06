import type { jsPDF } from 'jspdf';
import { resolveInstitutionalHeader } from '../../components/institutional-header.model';
import { drawCanonicalInstitutionalHeader } from '../../secretaria/shared/canonical-institutional-header-pdf';
import type { PdfInlineImage } from './calendarioAulasExportacao.pdf.assets';
import type {
  CalendarioAulasCabecalhosTabela,
  CalendarioAulasExportacaoPayload,
  CalendarioAulasLinha,
} from './types';

interface PdfColumn {
  key: 'componenteCurricular' | 'dataExibicao' | 'horarioExibicao' | 'professoresObservacao';
  headerKey: keyof CalendarioAulasCabecalhosTabela;
  width: number;
}

interface PdfFooterLayout {
  lines: string[];
  reserve: number;
}

export const PAGE_MARGIN_X = 13;
export const LINE_HEIGHT = 4.1;
export const CELL_PADDING_X = 2.2;
export const CELL_PADDING_Y = 2.3;
export const getRowSpacing = (payload: CalendarioAulasExportacaoPayload) => (
  payload.documento?.modoExportacao === 'CRONOLOGICO'
    ? { lineHeight: 3.25, paddingY: 1.4 }
    : { lineHeight: LINE_HEIGHT, paddingY: CELL_PADDING_Y }
);
const TABLE_TOP = 80;
const FOOTER_LINE_HEIGHT = 3.2;
const HEADER_LINE_HEIGHT = 3.3;
const TABLE_HEADER_LINE_HEIGHT = 3.1;

export const COLUMNS: PdfColumn[] = [
  { key: 'componenteCurricular', headerKey: 'componente', width: 58 },
  { key: 'dataExibicao', headerKey: 'data', width: 26 },
  { key: 'horarioExibicao', headerKey: 'horario', width: 31 },
  { key: 'professoresObservacao', headerKey: 'professorObservacao', width: 69 },
];

export const getPrintableCalendarioAulasDocumento = (payload: CalendarioAulasExportacaoPayload) => {
  if (payload.status !== 'PRONTO' || !payload.documento || !payload.linhas.length) {
    throw new Error('O calendário ainda não possui uma grade pronta para exportação.');
  }
  if (payload.documento.modoExportacao === 'CRONOLOGICO' && !payload.documento.alcance?.trim()) {
    throw new Error('O calendário cronológico não informou o alcance das aulas.');
  }
  return payload.documento;
};


/** O cabeçalho institucional usa o compositor comum, como o editor do modelo. */
export const drawCalendarioAulasDocumentHeader = (
  pdf: jsPDF,
  payload: CalendarioAulasExportacaoPayload,
  logo: PdfInlineImage | null,
) => {
  const documento = getPrintableCalendarioAulasDocumento(payload);
  const institution = resolveInstitutionalHeader({
    overrides: { ...documento.cabecalhoInstitucional, poloNome: documento.polo },
  });
  const header = drawCanonicalInstitutionalHeader(
    pdf,
    institution,
    logo ? { dataUrl: logo.dataUri, format: logo.format } : null,
    { orientation: 'portrait', alias: 'calendario-institutional-logo' },
  );
  const pageWidth = pdf.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PAGE_MARGIN_X * 2;
  const titleY = header.bottom + 10;
  pdf.setFontSize(12);
  pdf.setTextColor(0, 26, 51);
  pdf.setFont('helvetica', 'bold');
  const titleLines = pdf.splitTextToSize(documento.titulo.toUpperCase(), contentWidth) as string[];
  pdf.text(titleLines, pageWidth / 2, titleY, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.2);
  pdf.setTextColor(71, 85, 105);
  const subtitleLines = pdf.splitTextToSize(documento.subtitulo, contentWidth) as string[];
  const subtitleY = titleY + Math.max(titleLines.length, 1) * HEADER_LINE_HEIGHT + 2.7;
  pdf.text(subtitleLines, pageWidth / 2, subtitleY, { align: 'center' });
  let detailsBottomY = subtitleY + Math.max(subtitleLines.length, 1) * HEADER_LINE_HEIGHT;

  if (documento.modoExportacao === 'CRONOLOGICO' && documento.alcance) {
    const alcanceLines = pdf.splitTextToSize(documento.alcance, contentWidth) as string[];
    detailsBottomY += 1.2;
    pdf.text(alcanceLines, pageWidth / 2, detailsBottomY, { align: 'center' });
    detailsBottomY += Math.max(alcanceLines.length, 1) * HEADER_LINE_HEIGHT;
  }

  if (documento.exibirModulo && documento.modulo) {
    const cronologico = documento.modoExportacao === 'CRONOLOGICO';
    pdf.setFont('helvetica', cronologico ? 'normal' : 'bold');
    pdf.setFontSize(cronologico ? 7.2 : 8.2);
    pdf.setTextColor(0, 26, 51);
    const modulos = cronologico
      ? documento.modulosSelecionados?.map((modulo) => modulo.moduloNome)
        || documento.modulo.split('•').map((modulo) => modulo.trim()).filter(Boolean)
      : [documento.modulo];
    detailsBottomY += cronologico ? 0.8 : 1.2;
    for (const modulo of modulos) {
      const moduloLines = pdf.splitTextToSize(modulo, contentWidth) as string[];
      pdf.text(moduloLines, pageWidth / 2, detailsBottomY, { align: 'center' });
      detailsBottomY += Math.max(moduloLines.length, 1) * (cronologico ? 3 : HEADER_LINE_HEIGHT);
    }
  }
  return Math.max(TABLE_TOP, detailsBottomY + (documento.modoExportacao === 'CRONOLOGICO' ? 4 : 8));
};

/**
 * O modo por módulo conserva a célula antiga. No novo modo cronológico,
 * exibirModulo governa tanto o resumo quanto a identificação de cada aula.
 * A RPC fornece o rótulo; o compositor não deriva módulo de nome ou ordem.
 */
export const preparePdfRow = (
  pdf: jsPDF,
  payload: CalendarioAulasExportacaoPayload,
  linha: CalendarioAulasLinha,
) => {
  const documento = getPrintableCalendarioAulasDocumento(payload);
  const linesByColumn = COLUMNS.map((column, index) => {
    pdf.setFont('helvetica', index === 0 ? 'bold' : 'normal');
    pdf.setFontSize(7.1);
    return pdf.splitTextToSize(
      linha[column.key],
      column.width - CELL_PADDING_X * 2,
    ) as string[];
  });
  let moduleLineStart: number | null = null;
  if (documento.modoExportacao === 'CRONOLOGICO' && documento.exibirModulo) {
    if (!linha.moduloRotulo?.trim()) {
      throw new Error('Uma aula do calendário cronológico não informou seu módulo.');
    }
    moduleLineStart = linesByColumn[0].length;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.4);
    const moduleLines = pdf.splitTextToSize(
      linha.moduloRotulo,
      COLUMNS[0].width - CELL_PADDING_X * 2,
    ) as string[];
    linesByColumn[0].push(...moduleLines);
  }
  return {
    linesByColumn,
    moduleLineStart,
    rowLineCount: Math.max(...linesByColumn.map((lines) => lines.length), 1),
  };
};

export const drawTableHeader = (
  pdf: jsPDF,
  payload: CalendarioAulasExportacaoPayload,
  y: number,
) => {
  const documento = getPrintableCalendarioAulasDocumento(payload);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.7);
  const labelsByColumn = COLUMNS.map((column) => (
    pdf.splitTextToSize(
      documento.cabecalhosTabela[column.headerKey],
      column.width - CELL_PADDING_X * 2,
    ) as string[]
  ));
  const headerLineCount = Math.max(...labelsByColumn.map((lines) => lines.length), 1);
  const headerHeight = Math.max(
    8.4,
    CELL_PADDING_Y * 2 + headerLineCount * TABLE_HEADER_LINE_HEIGHT,
  );
  let x = PAGE_MARGIN_X;
  pdf.setFillColor(241, 245, 249);
  pdf.setDrawColor(148, 163, 184);
  pdf.setLineWidth(0.2);
  COLUMNS.forEach((column, index) => {
    // jsPDF compartilha o estado de preenchimento com o texto em algumas
    // saídas; reafirmar o fundo em cada célula evita colunas escurecidas.
    pdf.setFillColor(241, 245, 249);
    pdf.rect(x, y, column.width, headerHeight, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(6.7);
    const labelLines = labelsByColumn[index] || [];
    const labelY = y + (headerHeight - labelLines.length * TABLE_HEADER_LINE_HEIGHT) / 2 + 2.2;
    pdf.text(
      labelLines,
      x + column.width / 2,
      labelY,
      { align: 'center' },
    );
    x += column.width;
  });
  return y + headerHeight;
};

export const getFooterLayout = (
  pdf: jsPDF,
  payload: CalendarioAulasExportacaoPayload,
): PdfFooterLayout => {
  const documento = getPrintableCalendarioAulasDocumento(payload);
  const pageWidth = pdf.internal.pageSize.getWidth();
  const lines = pdf.splitTextToSize(documento.rodape, pageWidth - PAGE_MARGIN_X * 2 - 34) as string[];
  return {
    lines,
    reserve: Math.max(14, lines.length * FOOTER_LINE_HEIGHT + 9),
  };
};

export const drawFooter = (
  pdf: jsPDF,
  footer: PdfFooterLayout,
  pageNumber: number,
) => {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const footerTop = pageHeight - footer.reserve;
  pdf.setDrawColor(218, 226, 237);
  pdf.line(PAGE_MARGIN_X, footerTop, pageWidth - PAGE_MARGIN_X, footerTop);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(6.5);
  pdf.text(footer.lines, PAGE_MARGIN_X, footerTop + 4.4);
  pdf.text(`Página ${pageNumber}`, pageWidth - PAGE_MARGIN_X, pageHeight - 5, { align: 'right' });
};

export const drawRowChunk = (
  pdf: jsPDF,
  linesByColumn: string[][],
  lineOffset: number,
  lineCount: number,
  y: number,
  moduleLineStart: number | null = null,
  spacing = { lineHeight: LINE_HEIGHT, paddingY: CELL_PADDING_Y },
) => {
  const height = spacing.paddingY * 2 + lineCount * spacing.lineHeight;
  let x = PAGE_MARGIN_X;
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.16);
  COLUMNS.forEach((column, index) => {
    // As linhas ficam transparentes para a marca institucional continuar
    // visível atrás da grade, tal como no modelo de declaração. Só o rótulo
    // da tabela recebe fundo claro para preservar sua hierarquia visual.
    pdf.rect(x, y, column.width, height, 'S');
    const visibleLines = linesByColumn[index]?.slice(lineOffset, lineOffset + lineCount) || [];
    if (visibleLines.length) {
      pdf.setFont('helvetica', index === 0 ? 'bold' : 'normal');
      pdf.setFontSize(7.1);
      pdf.setTextColor(index === 0 ? 15 : 51, index === 0 ? 35 : 65, index === 0 ? 56 : 85);
      // A grade é lida como um quadro acadêmico: cada informação ocupa o
      // centro da sua célula, inclusive quando uma linha precisa continuar
      // em outra página. Não há alinhamento lateral desigual entre colunas.
      const textY = y + (height - visibleLines.length * spacing.lineHeight) / 2 + 2.25;
      if (index === 0 && moduleLineStart !== null) {
        visibleLines.forEach((line, visibleIndex) => {
          const isModule = lineOffset + visibleIndex >= moduleLineStart;
          pdf.setFont('helvetica', isModule ? 'normal' : 'bold');
          pdf.setFontSize(isModule ? 6.4 : 7.1);
          pdf.setTextColor(isModule ? 100 : 15, isModule ? 116 : 35, isModule ? 139 : 56);
          pdf.text(line, x + column.width / 2, textY + visibleIndex * spacing.lineHeight, { align: 'center' });
        });
      } else {
        pdf.text(visibleLines, x + column.width / 2, textY, { align: 'center' });
      }
    }
    x += column.width;
  });
  return y + height;
};
