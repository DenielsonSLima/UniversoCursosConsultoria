import type { jsPDF } from 'jspdf';

import type {
  CalendarioAulasCabecalhosTabela,
  CalendarioAulasExportacaoPayload,
  CalendarioAulasLinha,
  CalendarioAulasPdfDocument,
} from './types';

interface PdfColumn {
  key: keyof CalendarioAulasLinha;
  headerKey: keyof CalendarioAulasCabecalhosTabela;
  width: number;
}

interface PdfInlineImage {
  dataUri: string;
  format: 'PNG' | 'JPEG' | 'WEBP';
}

interface PdfFooterLayout {
  lines: string[];
  reserve: number;
}

type SetPdfOpacity = (opacity: number) => void;

const PAGE_MARGIN_X = 13;
const TABLE_TOP = 64;
const LINE_HEIGHT = 4.1;
const CELL_PADDING_X = 2.2;
const CELL_PADDING_Y = 2.3;
const FOOTER_LINE_HEIGHT = 3.2;
const HEADER_LINE_HEIGHT = 3.3;
const TABLE_HEADER_LINE_HEIGHT = 3.1;
const WATERMARK_WIDTH = 110;
const WATERMARK_HEIGHT = 36;

const COLUMNS: PdfColumn[] = [
  { key: 'componenteCurricular', headerKey: 'componente', width: 58 },
  { key: 'dataExibicao', headerKey: 'data', width: 26 },
  { key: 'horarioExibicao', headerKey: 'horario', width: 31 },
  { key: 'professoresObservacao', headerKey: 'professorObservacao', width: 69 },
];

const requirePrintablePayload = (payload: CalendarioAulasExportacaoPayload) => {
  if (payload.status !== 'PRONTO' || !payload.documento || !payload.linhas.length) {
    throw new Error('O calendário ainda não possui uma grade pronta para exportação.');
  }
  return payload.documento;
};

/**
 * Não há fetch, conversão nem leitura de Storage no browser. A RPC só entrega
 * data URIs já saneadas; referências HTTP são ignoradas e o texto canônico
 * permanece como fallback visual.
 */
const getInlinePdfImage = (dataUri: string | null): PdfInlineImage | null => {
  if (!dataUri) return null;

  const match = /^data:image\/(png|jpe?g|webp);base64,/i.exec(dataUri);
  if (!match) return null;
  const imageType = match[1]?.toLowerCase();
  const format = imageType === 'png'
    ? 'PNG'
    : imageType === 'webp'
      ? 'WEBP'
      : 'JPEG';

  return { dataUri, format };
};

const drawHeader = (
  pdf: jsPDF,
  payload: CalendarioAulasExportacaoPayload,
  logo: PdfInlineImage | null,
) => {
  const documento = requirePrintablePayload(payload);
  const pageWidth = pdf.internal.pageSize.getWidth();
  const institutionX = logo ? PAGE_MARGIN_X + 34 : PAGE_MARGIN_X;

  pdf.setFillColor(0, 26, 51);
  pdf.rect(0, 0, pageWidth, 8, 'F');
  if (logo) {
    pdf.addImage(logo.dataUri, logo.format, PAGE_MARGIN_X, 10.3, 28, 9.8, 'calendario-logo');
  }
  pdf.setTextColor(0, 26, 51);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(logo ? 13.5 : 17);
  pdf.text(documento.instituicao.toUpperCase(), institutionX, 18);
  pdf.setDrawColor(218, 226, 237);
  pdf.line(PAGE_MARGIN_X, 21, pageWidth - PAGE_MARGIN_X, 21);

  pdf.setFontSize(12);
  pdf.text(documento.titulo.toUpperCase(), pageWidth / 2, 30, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.2);
  pdf.setTextColor(71, 85, 105);
  const subtitleLines = pdf.splitTextToSize(
    documento.subtitulo,
    pageWidth - PAGE_MARGIN_X * 2,
  ) as string[];
  const subtitleY = 36;
  pdf.text(subtitleLines, pageWidth / 2, subtitleY, { align: 'center' });
  let detailsBottomY = subtitleY + Math.max(subtitleLines.length, 1) * HEADER_LINE_HEIGHT;

  if (documento.exibirModulo && documento.modulo) {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 26, 51);
    const moduloLines = pdf.splitTextToSize(
      documento.modulo,
      pageWidth - PAGE_MARGIN_X * 2,
    ) as string[];
    detailsBottomY += 1.2;
    pdf.text(moduloLines, pageWidth / 2, detailsBottomY, { align: 'center' });
    detailsBottomY += Math.max(moduloLines.length, 1) * HEADER_LINE_HEIGHT;
  }

  const metadataY = Math.max(48, detailsBottomY + 3);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(7);
  pdf.text(documento.polo, PAGE_MARGIN_X, metadataY);
  if (documento.emitidoEm) {
    pdf.text(documento.emitidoEm, pageWidth - PAGE_MARGIN_X, metadataY, { align: 'right' });
  }

  return Math.max(TABLE_TOP, metadataY + 11);
};

/**
 * A marca só usa a configuração canônica do modelo. Uma imagem é incluída
 * exclusivamente quando a RPC já a entregou como `data:image/...`; nunca há
 * download, conversão ou cálculo de conteúdo no client.
 */
const drawWatermark = (
  pdf: jsPDF,
  payload: CalendarioAulasExportacaoPayload,
  watermark: PdfInlineImage | null,
  setOpacity: SetPdfOpacity,
) => {
  const documento = requirePrintablePayload(payload);
  if (!documento.exibirMarcaDagua) return;

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  setOpacity(documento.marcaDaguaOpacidade ?? 0.1);

  if (watermark) {
    pdf.addImage(
      watermark.dataUri,
      watermark.format,
      (pageWidth - WATERMARK_WIDTH) / 2,
      (pageHeight - WATERMARK_HEIGHT) / 2,
      WATERMARK_WIDTH,
      WATERMARK_HEIGHT,
      'calendario-marca-dagua',
    );
  } else {
    const text = documento.marcaDaguaTexto || documento.instituicao;
    pdf.setTextColor(88, 112, 139);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(27);
    pdf.text(text.toUpperCase(), pageWidth / 2, pageHeight / 2 + 8, {
      align: 'center',
      angle: 35,
    });
  }

  setOpacity(1);
};

const drawTableHeader = (
  pdf: jsPDF,
  payload: CalendarioAulasExportacaoPayload,
  y: number,
) => {
  const documento = requirePrintablePayload(payload);
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

const getFooterLayout = (
  pdf: jsPDF,
  payload: CalendarioAulasExportacaoPayload,
): PdfFooterLayout => {
  const documento = requirePrintablePayload(payload);
  const pageWidth = pdf.internal.pageSize.getWidth();
  const lines = pdf.splitTextToSize(documento.rodape, pageWidth - PAGE_MARGIN_X * 2 - 34) as string[];
  return {
    lines,
    reserve: Math.max(14, lines.length * FOOTER_LINE_HEIGHT + 9),
  };
};

const drawFooter = (
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

const drawRowChunk = (
  pdf: jsPDF,
  linesByColumn: string[][],
  lineOffset: number,
  lineCount: number,
  y: number,
) => {
  const height = CELL_PADDING_Y * 2 + lineCount * LINE_HEIGHT;
  let x = PAGE_MARGIN_X;
  pdf.setDrawColor(203, 213, 225);
  pdf.setFillColor(255, 255, 255);
  pdf.setLineWidth(0.16);
  COLUMNS.forEach((column, index) => {
    pdf.setFillColor(255, 255, 255);
    pdf.rect(x, y, column.width, height, 'FD');
    const visibleLines = linesByColumn[index]?.slice(lineOffset, lineOffset + lineCount) || [];
    if (visibleLines.length) {
      pdf.setFont('helvetica', index === 0 ? 'bold' : 'normal');
      pdf.setFontSize(7.1);
      pdf.setTextColor(index === 0 ? 15 : 51, index === 0 ? 35 : 65, index === 0 ? 56 : 85);
      pdf.text(visibleLines, x + CELL_PADDING_X, y + CELL_PADDING_Y + 2.25);
    }
    x += column.width;
  });
  return y + height;
};

/**
 * Gera somente a composição visual A4 do payload já autorizado e preparado
 * pela RPC. Datas, horários, agrupamentos e ordem nunca são calculados aqui.
 */
export const createCalendarioAulasPdf = async (
  payload: CalendarioAulasExportacaoPayload,
): Promise<CalendarioAulasPdfDocument> => {
  const documento = requirePrintablePayload(payload);
  const { jsPDF, GState } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logo = getInlinePdfImage(documento.logoDataUri);
  const watermark = getInlinePdfImage(documento.marcaDaguaDataUri);
  const setOpacity: SetPdfOpacity = (opacity) => {
    pdf.setGState(new GState({ opacity }));
  };
  const footer = getFooterLayout(pdf, payload);
  const pageHeight = pdf.internal.pageSize.getHeight();
  let pageNumber = 1;
  let y = drawHeader(pdf, payload, logo);

  y = drawTableHeader(pdf, payload, y);

  for (const linha of payload.linhas) {
    const linesByColumn = COLUMNS.map((column) => (
      pdf.splitTextToSize(linha[column.key], column.width - CELL_PADDING_X * 2) as string[]
    ));
    const rowLineCount = Math.max(...linesByColumn.map((lines) => lines.length), 1);
    let lineOffset = 0;

    while (lineOffset < rowLineCount) {
      const remainingHeight = pageHeight - footer.reserve - y - CELL_PADDING_Y * 2;
      const availableLines = Math.floor(remainingHeight / LINE_HEIGHT);

      if (availableLines < 1) {
        drawWatermark(pdf, payload, watermark, setOpacity);
        drawFooter(pdf, footer, pageNumber);
        pdf.addPage('a4', 'portrait');
        pageNumber += 1;
        y = drawTableHeader(pdf, payload, drawHeader(pdf, payload, logo));
        continue;
      }

      const lineCount = Math.min(rowLineCount - lineOffset, availableLines);
      y = drawRowChunk(pdf, linesByColumn, lineOffset, lineCount, y);
      lineOffset += lineCount;
    }
  }

  drawWatermark(pdf, payload, watermark, setOpacity);
  drawFooter(pdf, footer, pageNumber);
  return {
    blob: pdf.output('blob'),
    fileName: documento.arquivoNome,
  };
};
