import type { CalendarioAulasExportacaoPayload, CalendarioAulasPdfDocument } from './types';
import {
  drawWatermark,
  resolvePdfBrandImage,
  type PdfGStateConstructor,
} from './calendarioAulasExportacao.pdf.assets';
import {
  drawCalendarioAulasDocumentHeader,
  drawFooter,
  drawRowChunk,
  drawTableHeader,
  getFooterLayout,
  getPrintableCalendarioAulasDocumento,
  getRowSpacing,
  preparePdfRow,
} from './calendarioAulasExportacao.pdf.layout';

/**
 * Gera somente a composição visual A4 do payload já autorizado e preparado
 * pela RPC. Datas, horários, agrupamentos e ordem nunca são calculados aqui.
 */
export const createCalendarioAulasPdf = async (
  payload: CalendarioAulasExportacaoPayload,
): Promise<CalendarioAulasPdfDocument> => {
  const documento = getPrintableCalendarioAulasDocumento(payload);
  const spacing = getRowSpacing(payload);
  const { jsPDF, GState } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const [logo, watermark] = await Promise.all([
    resolvePdfBrandImage(documento.cabecalhoInstitucional.logoUrl || documento.logoDataUri),
    resolvePdfBrandImage(documento.marcaDaguaUrl || documento.marcaDaguaDataUri),
  ]);
  const footer = getFooterLayout(pdf, payload);
  const pageHeight = pdf.internal.pageSize.getHeight();
  let pageNumber = 1;
  drawWatermark(pdf, GState as PdfGStateConstructor, payload, watermark);
  let y = drawCalendarioAulasDocumentHeader(pdf, payload, logo);

  y = drawTableHeader(pdf, payload, y);
  const tableStartY = y;
  const freshPageHeight = pageHeight - footer.reserve - tableStartY;
  if (freshPageHeight < spacing.paddingY * 2 + spacing.lineHeight) {
    throw new Error('O cabeçalho configurado do calendário não deixa espaço para as aulas.');
  }
  const startNextPage = () => {
    drawFooter(pdf, footer, pageNumber);
    pdf.addPage('a4', 'portrait');
    pageNumber += 1;
    drawWatermark(pdf, GState as PdfGStateConstructor, payload, watermark);
    y = drawTableHeader(pdf, payload, drawCalendarioAulasDocumentHeader(pdf, payload, logo));
  };

  for (const linha of payload.linhas) {
    const { linesByColumn, rowLineCount, moduleLineStart } = preparePdfRow(pdf, payload, linha);
    const rowHeight = spacing.paddingY * 2 + rowLineCount * spacing.lineHeight;
    // O documento misto mantém componente e módulo juntos quando a linha
    // inteira cabe em uma página. Conteúdo excepcionalmente longo continua
    // em chunks vetoriais, sem cortar texto nem perder a ordem recebida.
    if (
      documento.modoExportacao === 'CRONOLOGICO'
      && rowHeight <= freshPageHeight
      && rowHeight > pageHeight - footer.reserve - y
    ) {
      startNextPage();
    }
    let lineOffset = 0;

    while (lineOffset < rowLineCount) {
      const remainingHeight = pageHeight - footer.reserve - y - spacing.paddingY * 2;
      const availableLines = Math.floor(remainingHeight / spacing.lineHeight);

      if (availableLines < 1) {
        startNextPage();
        continue;
      }

      const lineCount = Math.min(rowLineCount - lineOffset, availableLines);
      y = drawRowChunk(pdf, linesByColumn, lineOffset, lineCount, y, moduleLineStart, spacing);
      lineOffset += lineCount;
    }
  }

  drawFooter(pdf, footer, pageNumber);
  return {
    blob: pdf.output('blob'),
    fileName: documento.arquivoNome,
  };
};
