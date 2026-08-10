import type { jsPDF } from 'jspdf';

import type { CanonicalDocumentPdfResult } from '../../gestor/secretaria/shared/canonical-document-pdf.types';
import {
  drawCanonicalPdfWatermark,
  normalizeCanonicalPdfText,
  resolveCanonicalPdfPhoto,
} from '../../gestor/secretaria/shared/canonical-document-vector-pdf';
import type {
  PlanoCursoAula,
  PlanoCursoDocumentoPayload,
  PlanoCursoDocumentoPagina,
} from './plano-curso.types';

type PdfGStateConstructor = new (parameters: { opacity: number }) => unknown;

const PAGE_MARGIN_X = 16;
const HEADER_TOP = 13;
const HEADER_BOTTOM = 49;
const CONTENT_BOTTOM = 267;
const FOOTER_Y = 284;
const TEXT_LINE_HEIGHT = 4.2;

const requireCanonicalPages = (documento: PlanoCursoDocumentoPayload) => {
  if (!documento.paginas.length || documento.paginas[0]?.tipo !== 'IDENTIFICACAO') {
    throw new Error('O backend não preparou a página de identificação do Plano de Curso.');
  }
  if (documento.paginas.length !== documento.totalPaginas) {
    throw new Error('A paginação canônica do Plano de Curso está inconsistente.');
  }
};

const assertFitsPage = (bottom: number, context: string, contentBottom = CONTENT_BOTTOM) => {
  if (bottom > contentBottom) {
    throw new Error(`O conteúdo canônico de ${context} não cabe na página preparada pelo backend.`);
  }
};

const fitImage = (pdf: jsPDF, dataUrl: string, maxWidth: number, maxHeight: number) => {
  const properties = pdf.getImageProperties(dataUrl);
  const scale = Math.min(maxWidth / properties.width, maxHeight / properties.height);
  return { width: properties.width * scale, height: properties.height * scale };
};

const drawHeader = (
  pdf: jsPDF,
  documento: PlanoCursoDocumentoPayload,
  logo: Awaited<ReturnType<typeof resolveCanonicalPdfPhoto>>,
) => {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const logoWidth = 26;
  const contentX = logo ? PAGE_MARGIN_X + logoWidth + 5 : PAGE_MARGIN_X;

  if (logo) {
    const size = fitImage(pdf, logo.dataUrl, logoWidth, 23);
    pdf.addImage(
      logo.dataUrl,
      logo.format,
      PAGE_MARGIN_X + (logoWidth - size.width) / 2,
      HEADER_TOP + (23 - size.height) / 2,
      size.width,
      size.height,
      'plano-curso-logo',
      'FAST',
    );
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10.5);
  pdf.setTextColor(0, 26, 51);
  const institutionLines = pdf.splitTextToSize(
    normalizeCanonicalPdfText(documento.cabecalho.instituicao),
    pageWidth - contentX - PAGE_MARGIN_X,
  ) as string[];
  pdf.text(institutionLines.slice(0, 2), contentX, HEADER_TOP + 3.5, { baseline: 'top' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.2);
  pdf.setTextColor(71, 85, 105);
  const institutionDetails = [
    documento.instituicao.cnpj ? `CNPJ: ${documento.instituicao.cnpj}` : '',
    documento.instituicao.endereco,
    [documento.instituicao.cidade, documento.instituicao.uf].filter(Boolean).join('/'),
  ].filter(Boolean).join(' · ');
  const detailLines = pdf.splitTextToSize(
    normalizeCanonicalPdfText(institutionDetails),
    pageWidth - contentX - PAGE_MARGIN_X,
  ) as string[];
  pdf.text(detailLines.slice(0, 2), contentX, HEADER_TOP + 15, { baseline: 'top' });

  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.25);
  pdf.line(PAGE_MARGIN_X, HEADER_BOTTOM, pageWidth - PAGE_MARGIN_X, HEADER_BOTTOM);
};

const drawFooter = (
  pdf: jsPDF,
  documento: PlanoCursoDocumentoPayload,
  pagina: PlanoCursoDocumentoPagina,
) => {
  const pageWidth = pdf.internal.pageSize.getWidth();
  pdf.setDrawColor(226, 232, 240);
  pdf.line(PAGE_MARGIN_X, FOOTER_Y - 5, pageWidth - PAGE_MARGIN_X, FOOTER_Y - 5);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(100, 116, 139);
  pdf.text(normalizeCanonicalPdfText(documento.cabecalho.titulo), PAGE_MARGIN_X, FOOTER_Y);
  pdf.text(
    `Página ${pagina.numero} de ${documento.totalPaginas}`,
    pageWidth - PAGE_MARGIN_X,
    FOOTER_Y,
    { align: 'right' },
  );
};

const drawLabelValue = (
  pdf: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
) => {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text(label.toUpperCase(), x, y);
  pdf.setFontSize(8.2);
  pdf.setTextColor(15, 23, 42);
  const lines = (pdf.splitTextToSize(normalizeCanonicalPdfText(value), width) as string[]).slice(0, 2);
  pdf.text(lines, x, y + 4.3);
  return y + 4.3 + Math.max(1, lines.length) * TEXT_LINE_HEIGHT;
};

const drawSection = (
  pdf: jsPDF,
  title: string,
  values: string[],
  y: number,
  contentBottom: number,
) => {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const width = pageWidth - PAGE_MARGIN_X * 2;
  pdf.setFillColor(241, 245, 249);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(PAGE_MARGIN_X, y, width, 7, 1.5, 1.5, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(0, 26, 51);
  pdf.text(title.toUpperCase(), PAGE_MARGIN_X + 3, y + 4.6);
  let cursor = y + 10.5;

  values.forEach((value) => {
    const lines = pdf.splitTextToSize(
      `• ${normalizeCanonicalPdfText(value)}`,
      width - 7,
    ) as string[];
    assertFitsPage(cursor + Math.max(1, lines.length) * TEXT_LINE_HEIGHT, title, contentBottom);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(30, 41, 59);
    pdf.text(lines, PAGE_MARGIN_X + 3, cursor, { baseline: 'top' });
    cursor += Math.max(1, lines.length) * TEXT_LINE_HEIGHT + 1.2;
  });
  return cursor + 1.5;
};

const drawIdentificationPage = (
  pdf: jsPDF,
  documento: PlanoCursoDocumentoPayload,
  pagina: PlanoCursoDocumentoPagina,
  contentBottom: number,
) => {
  const pageWidth = pdf.internal.pageSize.getWidth();
  let y = HEADER_BOTTOM + 8;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.setTextColor(0, 26, 51);
  pdf.text(normalizeCanonicalPdfText(documento.cabecalho.titulo), pageWidth / 2, y, { align: 'center' });
  y += 6;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.2);
  pdf.setTextColor(71, 85, 105);
  pdf.text(normalizeCanonicalPdfText(documento.cabecalho.subtitulo), pageWidth / 2, y, { align: 'center' });
  y += 9;

  const columnGap = 8;
  const columnWidth = (pageWidth - PAGE_MARGIN_X * 2 - columnGap) / 2;
  const leftBottom = [
    [documento.rotulos.curso, documento.componente.cursoNome],
    [documento.rotulos.componenteCurricular, documento.componente.disciplinaNome],
    [documento.rotulos.docente, documento.docente.nome],
  ].reduce((cursor, [label, value]) => (
    drawLabelValue(pdf, label, value, PAGE_MARGIN_X, cursor + 1.5, columnWidth)
  ), y);
  const rightBottom = [
    [documento.rotulos.turma, `${documento.componente.turmaNome} · ${documento.componente.turmaCodigo}`],
    [documento.rotulos.diasAulas, documento.diasAulas.join(' · ')],
  ].reduce((cursor, [label, value]) => (
    drawLabelValue(pdf, label, value, PAGE_MARGIN_X + columnWidth + columnGap, cursor + 1.5, columnWidth)
  ), y);
  y = Math.max(leftBottom, rightBottom) + 4;

  y = drawSection(pdf, documento.rotulos.objetivos, documento.objetivos, y, contentBottom);
  y = drawSection(pdf, documento.rotulos.criteriosAvaliacao, documento.criteriosAvaliacao, y, contentBottom);
  y = drawSection(pdf, documento.rotulos.insumosRecursos, documento.insumosRecursos, y, contentBottom);
  if (pagina.encontros.length > 0) {
    y = drawContentHeading(pdf, documento, y + 1, contentBottom);
    drawMeetingBlocks(pdf, pagina.encontros, y, contentBottom);
  }
  assertFitsPage(y, 'identificação', contentBottom);
};

const getMeetingHeading = (aula: PlanoCursoAula) => {
  const horario = aula.horaInicio && aula.horaFim
    ? `${aula.horaInicio}–${aula.horaFim}`
    : aula.horaInicio || aula.horaFim || '';
  return [aula.dataExibicao, horario, aula.sessao].filter(Boolean).join(' · ');
};

const drawContentHeading = (
  pdf: jsPDF,
  documento: PlanoCursoDocumentoPayload,
  initialY: number,
  contentBottom: number,
) => {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const width = pageWidth - PAGE_MARGIN_X * 2;
  let y = initialY;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(0, 26, 51);
  pdf.text(normalizeCanonicalPdfText(documento.rotulos.conteudoProgramatico).toUpperCase(), pageWidth / 2, y, { align: 'center' });
  y += 5;
  if (documento.instrucoesConteudo) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    const instructionLines = pdf.splitTextToSize(
      normalizeCanonicalPdfText(documento.instrucoesConteudo),
      width,
    ) as string[];
    pdf.text(instructionLines, pageWidth / 2, y, { align: 'center', baseline: 'top' });
    y += instructionLines.length * 3.2 + 4;
  } else {
    y += 3;
  }
  assertFitsPage(y, documento.rotulos.conteudoProgramatico, contentBottom);
  return y;
};

const drawMeetingBlocks = (
  pdf: jsPDF,
  encontros: PlanoCursoAula[],
  y: number,
  contentBottom: number,
) => {
  if (encontros.length === 0) return;
  const width = pdf.internal.pageSize.getWidth() - PAGE_MARGIN_X * 2;
  const availableHeight = contentBottom - y;
  // A quantidade e a composição das páginas continuam vindo do backend. O
  // teto abaixo é apenas visual: um único encontro não vira um painel que
  // ocupa a folha inteira; conteúdo que ultrapassa o bloco falha explicitamente.
  const blockHeight = Math.min(24, availableHeight / encontros.length);
  if (blockHeight < 16) {
    throw new Error('Os encontros canônicos não cabem na página preparada pelo backend.');
  }

  encontros.forEach((aula, index) => {
    const blockY = y + index * blockHeight;
    const blockBottom = blockY + blockHeight - 2;
    assertFitsPage(blockY + blockHeight, `encontro de ${aula.dataExibicao}`, contentBottom);
    pdf.setDrawColor(203, 213, 225);
    pdf.setFillColor(index % 2 === 0 ? 248 : 255, index % 2 === 0 ? 250 : 255, index % 2 === 0 ? 252 : 255);
    pdf.roundedRect(PAGE_MARGIN_X, blockY, width, blockHeight - 2, 1.5, 1.5, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.2);
    pdf.setTextColor(79, 70, 229);
    pdf.text(getMeetingHeading(aula).toUpperCase(), PAGE_MARGIN_X + 3, blockY + 4.4);

    pdf.setFontSize(8);
    pdf.setTextColor(15, 23, 42);
    const titleLines = (pdf.splitTextToSize(
      normalizeCanonicalPdfText(aula.titulo),
      width - 6,
    ) as string[]).slice(0, 2);
    pdf.text(titleLines, PAGE_MARGIN_X + 3, blockY + 8.5, { baseline: 'top' });
    const contentY = blockY + 8.5 + Math.max(1, titleLines.length) * 3.8 + 1;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(51, 65, 85);
    const contentLines = pdf.splitTextToSize(
      normalizeCanonicalPdfText(aula.conteudo),
      width - 6,
    ) as string[];
    if (contentY + contentLines.length * 3.65 > blockBottom) {
      throw new Error(`O conteúdo canônico do encontro de ${aula.dataExibicao} não cabe na página preparada pelo backend.`);
    }
    pdf.text(contentLines, PAGE_MARGIN_X + 3, contentY, { baseline: 'top', lineHeightFactor: 1.15 });
  });
};

const drawContentPage = (
  pdf: jsPDF,
  documento: PlanoCursoDocumentoPayload,
  pagina: PlanoCursoDocumentoPagina,
  contentBottom: number,
) => {
  const y = drawContentHeading(pdf, documento, HEADER_BOTTOM + 8, contentBottom);
  drawMeetingBlocks(pdf, pagina.encontros, y, contentBottom);
};

const drawLastPageSignature = (
  pdf: jsPDF,
  documento: PlanoCursoDocumentoPayload,
  signature: Awaited<ReturnType<typeof resolveCanonicalPdfPhoto>>,
) => {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;
  const localDateY = 247;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(51, 65, 85);
  pdf.text(
    `${normalizeCanonicalPdfText(documento.rotulos.dataLocal)}: ${normalizeCanonicalPdfText(documento.localData.texto)}`,
    PAGE_MARGIN_X,
    localDateY,
    { align: 'left' },
  );

  if (!documento.docente.assinatura.exibir) return;
  if (signature) {
    const size = fitImage(pdf, signature.dataUrl, 45, 11);
    pdf.addImage(
      signature.dataUrl,
      signature.format,
      centerX - size.width / 2,
      249,
      size.width,
      size.height,
      'plano-curso-assinatura',
      'FAST',
    );
  }
  pdf.setDrawColor(100, 116, 139);
  pdf.setLineWidth(0.25);
  pdf.line(centerX - 42, 263, centerX + 42, 263);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.2);
  pdf.setTextColor(15, 23, 42);
  pdf.text(normalizeCanonicalPdfText(documento.docente.nome), centerX, 267, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text(normalizeCanonicalPdfText(documento.rotulos.assinaturaDocente).toUpperCase(), centerX, 271, { align: 'center' });
};

export const createPlanoCursoPdf = async (
  documento: PlanoCursoDocumentoPayload,
): Promise<CanonicalDocumentPdfResult> => {
  requireCanonicalPages(documento);
  const { jsPDF, GState } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const [logo, signature, watermark] = await Promise.all([
    resolveCanonicalPdfPhoto(documento.cabecalho.logoUrl ?? documento.cabecalho.logoDataUri),
    documento.docente.assinatura.exibir
      ? resolveCanonicalPdfPhoto(documento.docente.assinatura.url)
      : Promise.resolve(null),
    documento.marcaDagua.exibir
      ? resolveCanonicalPdfPhoto(documento.marcaDagua.url ?? documento.marcaDagua.dataUri)
      : Promise.resolve(null),
  ]);

  documento.paginas.forEach((pagina, index) => {
    const isLastPage = index === documento.paginas.length - 1;
    const contentBottom = isLastPage ? 241 : CONTENT_BOTTOM;
    if (index > 0) pdf.addPage('a4', 'portrait');
    drawCanonicalPdfWatermark(
      pdf,
      GState as PdfGStateConstructor,
      {
        enabled: documento.marcaDagua.exibir,
        imageUrl: watermark?.dataUrl || null,
        label: documento.marcaDagua.texto,
        opacity: documento.marcaDagua.opacidade,
      },
      {
        x: PAGE_MARGIN_X,
        y: HEADER_BOTTOM,
        width: pdf.internal.pageSize.getWidth() - PAGE_MARGIN_X * 2,
        height: CONTENT_BOTTOM - HEADER_BOTTOM,
        textSize: documento.marcaDagua.escala,
        rotate: documento.marcaDagua.rotacionar ? 35 : 0,
      },
    );
    drawHeader(pdf, documento, logo);
    if (pagina.tipo === 'IDENTIFICACAO') drawIdentificationPage(pdf, documento, pagina, contentBottom);
    else drawContentPage(pdf, documento, pagina, contentBottom);
    if (isLastPage) drawLastPageSignature(pdf, documento, signature);
    drawFooter(pdf, documento, pagina);
  });

  return { blob: pdf.output('blob'), fileName: documento.arquivoNome };
};
