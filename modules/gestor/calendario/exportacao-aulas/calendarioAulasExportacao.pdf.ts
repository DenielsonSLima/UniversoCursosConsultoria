import type { jsPDF } from 'jspdf';

import {
  resolveCanonicalPdfPhoto,
} from '../../secretaria/shared/canonical-document-vector-pdf';
import type {
  CalendarioAulasCabecalhoInstitucional,
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

type PdfGStateConstructor = new (parameters: { opacity: number }) => unknown;

const PAGE_MARGIN_X = 13;
// O cabeçalho segue a mesma área segura de 20 mm da Declaração de Matrícula.
// A tabela conserva sua margem própria, pois é uma grade acadêmica canônica.
const HEADER_MARGIN_X = 20;
const TABLE_TOP = 80;
const LINE_HEIGHT = 4.1;
const CELL_PADDING_X = 2.2;
const CELL_PADDING_Y = 2.3;
const FOOTER_LINE_HEIGHT = 3.2;
const HEADER_LINE_HEIGHT = 3.3;
const TABLE_HEADER_LINE_HEIGHT = 3.1;
const HEADER_LOGO_SIZE = 29;
const HEADER_TOP = 20;
const HEADER_BOTTOM = 55;

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

const isTrustedInstitutionalAssetUrl = (source: string | null) => {
  if (!source) return false;
  try {
    const url = new URL(source);
    return url.protocol === 'https:'
      && url.hostname.endsWith('.supabase.co')
      && url.pathname.startsWith('/storage/v1/object/');
  } catch {
    return false;
  }
};

/**
 * Logo e marca são ativos institucionais isolados, nunca a página inteira.
 * URLs vêm exclusivamente do payload autorizado pela RPC e são submetidas ao
 * mesmo limite/tipo aceitos pelo compositor canônico antes de entrar no PDF.
 */
const resolvePdfBrandImage = async (source: string | null): Promise<PdfInlineImage | null> => {
  const inline = getInlinePdfImage(source);
  if (inline) return inline;
  if (!isTrustedInstitutionalAssetUrl(source)) return null;

  const resolved = await resolveCanonicalPdfPhoto(source);
  return resolved ? { dataUri: resolved.dataUrl, format: resolved.format } : null;
};

const normalizeOpacity = (value: number | null, fallback = 0.1) => {
  const raw = Number(value);
  const normalized = Number.isFinite(raw) ? (raw > 1 ? raw / 100 : raw) : fallback;
  return Math.min(1, Math.max(0, normalized));
};

const normalizeScale = (value: number | null) => {
  const raw = Number(value);
  return Number.isFinite(raw) ? Math.min(100, Math.max(5, raw)) : 50;
};

const fitImage = (
  pdf: jsPDF,
  image: PdfInlineImage,
  maxWidth: number,
  maxHeight: number,
) => {
  const properties = pdf.getImageProperties(image.dataUri);
  const factor = Math.min(maxWidth / properties.width, maxHeight / properties.height);
  return {
    width: properties.width * factor,
    height: properties.height * factor,
  };
};

/**
 * A prévia do editor define a escala da marca pela largura da folha e deixa a
 * camada ser recortada pela própria A4. Repetimos a regra no PDF para que a
 * marca institucional não seja encolhida pelas margens de conteúdo.
 */
const scaleImageToWidth = (
  pdf: jsPDF,
  image: PdfInlineImage,
  width: number,
) => {
  const properties = pdf.getImageProperties(image.dataUri);
  const factor = width / properties.width;
  return {
    width,
    height: properties.height * factor,
  };
};

/**
 * `jsPDF#addImage` gira a partir do canto superior esquerdo. O editor CSS
 * gira pelo centro. Ajustar a origem mantém os dois resultados equivalentes
 * e evita que uma marca rotacionada deslize para um dos cantos da página.
 */
const getCenteredRotatedImageOrigin = (
  pageWidth: number,
  pageHeight: number,
  width: number,
  height: number,
  rotationDegrees: number,
) => {
  if (!rotationDegrees) {
    return { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2 };
  }

  const radians = rotationDegrees * (Math.PI / 180);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const centerX = pageWidth / 2;
  const centerY = pageHeight / 2;

  return {
    x: centerX - (width / 2) * cosine + (height / 2) * sine,
    y: centerY - (width / 2) * sine - (height / 2) * cosine,
  };
};

const formatInstitutionalAddress = (
  cabecalho: CalendarioAulasCabecalhoInstitucional,
) => {
  const street = cabecalho.endereco
    ? `${cabecalho.endereco}${cabecalho.numero ? `, ${cabecalho.numero}` : ''}`
    : '';
  const city = cabecalho.cidade
    ? `${cabecalho.cidade}${cabecalho.estado ? `/${cabecalho.estado}` : ''}`
    : '';
  return [street, cabecalho.bairro, city, cabecalho.cep ? `CEP: ${cabecalho.cep}` : '']
    .filter(Boolean)
    .join(' - ');
};

const drawHeaderDetail = (
  pdf: jsPDF,
  label: string,
  value: string | null,
  x: number,
  y: number,
  width: number,
  maxLines = 2,
) => {
  if (!value) return 0;

  // O DocumentHeader da Declaração é composto em Times: rótulo em negrito e
  // valor regular. O PDF replica essa hierarquia em vez de usar Helvetica.
  pdf.setFont('times', 'bold');
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(6.7);
  const labelText = `${label}: `;
  const labelWidth = pdf.getTextWidth(labelText);
  pdf.setFont('times', 'normal');
  const lines = (pdf.splitTextToSize(
    value,
    Math.max(8, width - labelWidth),
  ) as string[]).slice(0, maxLines);

  pdf.setFont('times', 'bold');
  pdf.text(labelText, x, y);
  pdf.setFont('times', 'normal');
  if (lines[0]) pdf.text(lines[0], x + labelWidth, y);
  if (lines.length > 1) pdf.text(lines.slice(1), x, y + HEADER_LINE_HEIGHT);
  return lines.length;
};

const drawInstitutionalHeader = (
  pdf: jsPDF,
  payload: CalendarioAulasExportacaoPayload,
  logo: PdfInlineImage | null,
) => {
  const documento = requirePrintablePayload(payload);
  const cabecalho = documento.cabecalhoInstitucional;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const logoX = HEADER_MARGIN_X;
  const logoY = HEADER_TOP;
  const contentX = logoX + HEADER_LOGO_SIZE + 5;
  const rightColumnWidth = 58;
  const rightColumnX = pageWidth - HEADER_MARGIN_X - rightColumnWidth;
  const leftColumnWidth = Math.max(34, rightColumnX - contentX - 6);
  const matrizBadgeWidth = 16;
  const companyNameWidth = cabecalho.isMatriz
    ? pageWidth - HEADER_MARGIN_X - contentX - matrizBadgeWidth - 4
    : pageWidth - HEADER_MARGIN_X - contentX;

  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(logoX, logoY, HEADER_LOGO_SIZE, HEADER_LOGO_SIZE, 3, 3, 'FD');
  if (logo) {
    const size = fitImage(pdf, logo, HEADER_LOGO_SIZE - 4, HEADER_LOGO_SIZE - 4);
    pdf.addImage(
      logo.dataUri,
      logo.format,
      logoX + (HEADER_LOGO_SIZE - size.width) / 2,
      logoY + (HEADER_LOGO_SIZE - size.height) / 2,
      size.width,
      size.height,
      'calendario-institutional-logo',
      'FAST',
    );
  } else {
    pdf.setTextColor(0, 26, 51);
    pdf.setFont('times', 'bold');
    pdf.setFontSize(6.2);
    pdf.text('UNIVERSO', logoX + HEADER_LOGO_SIZE / 2, logoY + HEADER_LOGO_SIZE / 2 + 1, {
      align: 'center',
    });
  }

  pdf.setTextColor(0, 26, 51);
  pdf.setFont('times', 'bold');
  pdf.setFontSize(10.5);
  const nameLines = (pdf.splitTextToSize(
    cabecalho.nome.toUpperCase(),
    companyNameWidth,
  ) as string[]).slice(0, 2);
  const firstNameLine = nameLines[0] || cabecalho.nome;
  pdf.text(nameLines.length ? nameLines : cabecalho.nome, contentX, HEADER_TOP + 7);

  if (cabecalho.isMatriz) {
    const badgeX = Math.min(
      contentX + pdf.getTextWidth(firstNameLine) + 3,
      pageWidth - HEADER_MARGIN_X - matrizBadgeWidth,
    );
    if (badgeX > contentX) {
      pdf.setFillColor(248, 250, 252);
      pdf.setDrawColor(203, 213, 225);
      pdf.roundedRect(badgeX, HEADER_TOP + 1.7, matrizBadgeWidth, 4.4, 1.2, 1.2, 'FD');
      pdf.setTextColor(30, 41, 59);
      pdf.setFont('times', 'bold');
      pdf.setFontSize(4.9);
      pdf.text('MATRIZ', badgeX + matrizBadgeWidth / 2, HEADER_TOP + 4.7, { align: 'center' });
    }
  }

  drawHeaderDetail(pdf, 'CNPJ', cabecalho.cnpj, contentX, HEADER_TOP + 15, leftColumnWidth, 1);
  drawHeaderDetail(pdf, 'Contato', cabecalho.contato, contentX, HEADER_TOP + 21, leftColumnWidth, 1);
  const addressLines = drawHeaderDetail(
    pdf,
    'Endereço',
    formatInstitutionalAddress(cabecalho),
    rightColumnX,
    HEADER_TOP + 15,
    rightColumnWidth,
    2,
  );
  drawHeaderDetail(
    pdf,
    'E-mail',
    cabecalho.email,
    rightColumnX,
    HEADER_TOP + 15 + Math.max(1, addressLines) * 3.2 + 1,
    rightColumnWidth,
    1,
  );

  pdf.setDrawColor(218, 226, 237);
  pdf.setLineWidth(0.25);
  pdf.line(HEADER_MARGIN_X, HEADER_BOTTOM, pageWidth - HEADER_MARGIN_X, HEADER_BOTTOM);

  const titleY = HEADER_BOTTOM + 10;
  pdf.setFontSize(12);
  pdf.setTextColor(0, 26, 51);
  pdf.setFont('helvetica', 'bold');
  pdf.text(documento.titulo.toUpperCase(), pageWidth / 2, titleY, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.2);
  pdf.setTextColor(71, 85, 105);
  const subtitleLines = pdf.splitTextToSize(
    documento.subtitulo,
    pageWidth - PAGE_MARGIN_X * 2,
  ) as string[];
  const subtitleY = titleY + 6;
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

  return Math.max(TABLE_TOP, detailsBottomY + 8);
};

const drawWatermark = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  payload: CalendarioAulasExportacaoPayload,
  watermark: PdfInlineImage | null,
) => {
  const documento = requirePrintablePayload(payload);
  if (!documento.exibirMarcaDagua) return;
  if (!watermark) {
    throw new Error('A marca-d’água institucional deste polo não pôde ser preparada para o calendário.');
  }

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const scale = normalizeScale(documento.marcaDaguaEscala);
  const size = scaleImageToWidth(pdf, watermark, pageWidth * (scale / 100));
  const rotation = documento.marcaDaguaRotacionar === false ? 0 : -45;
  const origin = getCenteredRotatedImageOrigin(
    pageWidth,
    pageHeight,
    size.width,
    size.height,
    rotation,
  );

  pdf.saveGraphicsState();
  pdf.setGState(new GState({ opacity: normalizeOpacity(documento.marcaDaguaOpacidade) }) as never);
  pdf.addImage(
    watermark.dataUri,
    watermark.format,
    origin.x,
    origin.y,
    size.width,
    size.height,
    'calendario-marca-dagua',
    'FAST',
    rotation,
  );
  pdf.restoreGraphicsState();
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
      const textY = y + (height - visibleLines.length * LINE_HEIGHT) / 2 + 2.25;
      pdf.text(visibleLines, x + column.width / 2, textY, { align: 'center' });
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
  const [logo, watermark] = await Promise.all([
    resolvePdfBrandImage(documento.cabecalhoInstitucional.logoUrl || documento.logoDataUri),
    resolvePdfBrandImage(documento.marcaDaguaUrl || documento.marcaDaguaDataUri),
  ]);
  const footer = getFooterLayout(pdf, payload);
  const pageHeight = pdf.internal.pageSize.getHeight();
  let pageNumber = 1;
  drawWatermark(pdf, GState as PdfGStateConstructor, payload, watermark);
  let y = drawInstitutionalHeader(pdf, payload, logo);

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
        drawFooter(pdf, footer, pageNumber);
        pdf.addPage('a4', 'portrait');
        pageNumber += 1;
        drawWatermark(pdf, GState as PdfGStateConstructor, payload, watermark);
        y = drawTableHeader(pdf, payload, drawInstitutionalHeader(pdf, payload, logo));
        continue;
      }

      const lineCount = Math.min(rowLineCount - lineOffset, availableLines);
      y = drawRowChunk(pdf, linesByColumn, lineOffset, lineCount, y);
      lineOffset += lineCount;
    }
  }

  drawFooter(pdf, footer, pageNumber);
  return {
    blob: pdf.output('blob'),
    fileName: documento.arquivoNome,
  };
};
