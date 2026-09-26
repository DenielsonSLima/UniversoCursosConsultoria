import { type jsPDF } from 'jspdf';
import {
  createCanonicalPdfQr,
  drawCanonicalPdfWatermark,
  resolveCanonicalPdfPhoto,
  type CanonicalPdfImage,
} from '../shared/canonical-document-vector-pdf';
import {
  type CanonicalDocumentPdfBuildOptions,
  type CanonicalDocumentPdfResult,
} from '../shared/canonical-document-pdf.types';
import { canonicalAsRecord, canonicalText } from '../shared/canonical-document-render.utils';
import {
  drawCanonicalInstitutionalHeader,
  normalizeCanonicalInstitutionalHeader,
} from '../shared/canonical-institutional-header-pdf';
import { DOCUMENT_TABS, isCertificateDocument } from './historico-emissoes.constants';
import { hasExplicitQrCodeField, isPublicDocumentValidationEnabled } from './document-validation-rendering';
import { snapshotFirst } from './voter-snapshot';
import { repairFichaVoterGrid } from '../../cadastros/ficha-matricula/voter-template-repair';
import {
  adaptPastaTemplateForStudentPhoto,
  hasPastaStudentPhoto,
} from '../../cadastros/ficha-matricula/pasta-template-geometry';
import { type EmissionLog } from './historico-emissoes.types';
import {
  PAGE_WIDTH_MM,
  PAGE_HEIGHT_MM,
  TEMPLATE_HEIGHT_PX,
  PAGE_LEFT_MM,
  PAGE_RIGHT_MM,
  PAGE_BOTTOM_MM,
  BODY_TOP_MM,
  CONTINUATION_BODY_TOP_MM,
  BODY_FONT_SIZE,
  BODY_LINE_HEIGHT,
  type PdfGStateConstructor,
  type TemplateField,
  type VectorPage,
  type VectorDocument,
  type EmissionPdfSource,
  getRegistrationWatermarkGeometry,
  emissionHtmlToVectorText,
  splitExplicitTemplatePages,
  assertNoResidualTemplateTokens,
  pxToMmX,
  pxToMmY,
  assertTextFits,
} from './emission-pdf-core';
import { REGISTRATION_VECTOR_DOCUMENTS, resolveEmissionVectorTemplate } from './emission-registration-snapshot';
import { drawAcademicBulletinBody } from './emission-pdf-bulletin';
import { drawRegistrationGrid } from './emission-pdf-registration-grid';
export { emissionHtmlToVectorText, getRegistrationWatermarkGeometry } from './emission-pdf-core';
export type { EmissionPdfSource } from './emission-pdf-core';
export { resolveRegistrationSnapshotTemplate } from './emission-registration-snapshot';

const getDocumentTitle = (emission: EmissionLog) => (
  emission.documento === 'boletim'
    ? 'Boletim Escolar — Cursos Técnicos'
    : DOCUMENT_TABS.find((tab) => tab.key === emission.documento)?.label || 'Documento'
);

const getConfiguredPages = (source: EmissionPdfSource): VectorPage[] => {
  const { emission, preview } = source;
  const template = canonicalAsRecord(preview.template);
  if (!Object.keys(template).length) {
    throw new Error(`O modelo oficial de ${getDocumentTitle(emission)} não possui geometria vetorial suficiente.`);
  }
  if (isCertificateDocument(emission.documento) || ['carteirinha', 'cracha_estagio'].includes(emission.documento)) {
    throw new Error(
      `${getDocumentTitle(emission)} ainda não possui geometria A4 vetorial canônica para esta exportação. `
      + 'A emissão foi bloqueada sem rasterizar a página.',
    );
  }

  const pageCount = Number(template.pageCount || 1);
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 100) {
    throw new Error('O snapshot do modelo possui uma quantidade de páginas inválida.');
  }
  const absoluteFields = Array.isArray(template.absoluteFields)
    ? template.absoluteFields.filter((field): field is TemplateField => Boolean(field && typeof field === 'object'))
    : [];
  const highestFieldPage = absoluteFields.reduce((highest, field) => Math.max(
    highest,
    Math.floor(Math.max(0, Number(field.y || 0)) / TEMPLATE_HEIGHT_PX),
  ), 0);
  const bodyTemplates = splitExplicitTemplatePages(String(template.textContent || ''));
  const explicitBodies = bodyTemplates.map((bodyTemplate) => {
    const parsedBody = resolveEmissionVectorTemplate(source, bodyTemplate);
    assertNoResidualTemplateTokens(parsedBody, 'O conteúdo do modelo');
    return parsedBody;
  });
  const totalPages = Math.max(pageCount, highestFieldPage + 1, bodyTemplates.length);

  return Array.from({ length: totalPages }, (_, pageIndex) => ({
    bodyTemplate: bodyTemplates[pageIndex] || '',
    body: emissionHtmlToVectorText(explicitBodies[pageIndex] || ''),
    fields: absoluteFields.filter((field) => (
      Math.floor(Math.max(0, Number(field.y || 0)) / TEMPLATE_HEIGHT_PX) === pageIndex
    )),
  }));
};

const getFrozenPresentation = (source: EmissionPdfSource) => {
  const snapshot = canonicalAsRecord(source.emission.dados_emissao);
  return {
    institution: canonicalAsRecord(snapshotFirst(
      snapshot,
      'institutionSnapshot',
      source.preview.polo,
    )),
    watermark: canonicalAsRecord(snapshotFirst(
      snapshot,
      'watermarkSnapshot',
      source.preview.watermark,
    )),
  };
};

const prepareVectorDocument = async (
  source: EmissionPdfSource,
  imageCache: Map<string, Promise<CanonicalPdfImage | null>>,
): Promise<VectorDocument> => {
  const pages = getConfiguredPages(source);
  const { institution: polo, watermark } = getFrozenPresentation(source);
  const template = canonicalAsRecord(source.preview.template);
  const parseTemplate = (value: unknown, escapeValues = true) => (
    resolveEmissionVectorTemplate(source, value, escapeValues)
  );
  const resolveCached = (value: unknown) => {
    const url = String(value || '').trim();
    if (!url) return Promise.resolve(null);
    const cached = imageCache.get(url);
    if (cached) return cached;
    const request = resolveCanonicalPdfPhoto(url);
    imageCache.set(url, request);
    return request;
  };

  const fieldImageEntries = pages.flatMap((page) => page.fields)
    .filter((field) => field.type === 'image')
    .map((field) => {
      const sourceValue = parseTemplate(field.value, false);
      assertNoResidualTemplateTokens(sourceValue, `O campo “${field.id || 'imagem'}”`);
      const url = source.emission.documento === 'pasta_identificacao'
        && field.id === 'student_photo' && !hasPastaStudentPhoto(sourceValue)
        ? '' : sourceValue;
      return [field.id || `${field.x}:${field.y}`, url] as const;
    });
  const [logo, watermarkImage, qr, fieldAssets] = await Promise.all([
    resolveCached(polo.logoUrl || polo.logo_url),
    resolveCached(watermark.watermarkUrl || watermark.watermark_url),
    isPublicDocumentValidationEnabled(source.emission) && hasExplicitQrCodeField(template)
      ? createCanonicalPdfQr(source.emission.codigo)
      : Promise.resolve(null),
    Promise.all(fieldImageEntries.map(async ([key, url]) => [key, await resolveCached(url)] as const)),
  ]);

  const fieldImages = new Map(fieldAssets);
  const renderedPages = source.emission.documento === 'pasta_identificacao'
    && !fieldImages.get('student_photo')
    ? pages.map(page => ({
      ...page,
      fields: adaptPastaTemplateForStudentPhoto({ absoluteFields: page.fields }, null).absoluteFields,
    }))
    : pages;

  return {
    source,
    pages: renderedPages,
    institutionName: canonicalText(polo.nomeFantasia, polo.nome, 'UNIVERSO CURSOS E CONSULTORIA'),
    institutionHeader: normalizeCanonicalInstitutionalHeader(polo),
    title: getDocumentTitle(source.emission),
    logo,
    watermark: watermarkImage,
    watermarkConfig: watermark,
    qr,
    fieldImages,
  };
};

const drawImageContained = (
  pdf: jsPDF,
  image: CanonicalPdfImage,
  x: number,
  y: number,
  width: number,
  height: number,
  alias: string,
) => {
  const properties = pdf.getImageProperties(image.dataUrl);
  const scale = Math.min(width / properties.width, height / properties.height);
  const renderedWidth = properties.width * scale;
  const renderedHeight = properties.height * scale;
  pdf.addImage(
    image.dataUrl,
    image.format,
    x + (width - renderedWidth) / 2,
    y + (height - renderedHeight) / 2,
    renderedWidth,
    renderedHeight,
    alias,
    'FAST',
  );
};

const drawBody = (pdf: jsPDF, body: string, titleVisible: boolean) => {
  if (!body) return;
  const startY = titleVisible ? BODY_TOP_MM : CONTINUATION_BODY_TOP_MM;
  const width = PAGE_WIDTH_MM - PAGE_LEFT_MM - PAGE_RIGHT_MM;
  const height = PAGE_HEIGHT_MM - PAGE_BOTTOM_MM - startY;
  pdf.setFont('times', 'normal');
  pdf.setFontSize(BODY_FONT_SIZE);
  pdf.setTextColor(15, 23, 42);
  const lines = assertTextFits(pdf, body, width, height, BODY_FONT_SIZE, BODY_LINE_HEIGHT, 'O conteúdo do documento');
  pdf.text(lines, PAGE_LEFT_MM, startY, {
    baseline: 'top',
    lineHeightFactor: BODY_LINE_HEIGHT,
  });
};

const drawField = (
  pdf: jsPDF,
  visual: VectorDocument,
  field: TemplateField,
  pageIndex: number,
) => {
  const fieldKey = field.id || `${field.x}:${field.y}`;
  const x = pxToMmX(field.x);
  const y = pxToMmY(Number(field.y || 0) - pageIndex * TEMPLATE_HEIGHT_PX);
  const width = Math.max(1, pxToMmX(field.width || 120));
  const height = Math.max(1, field.height
    ? pxToMmY(field.height)
    : PAGE_HEIGHT_MM - PAGE_BOTTOM_MM - y);
  if (x < 0 || y < 0 || x + width > PAGE_WIDTH_MM + 0.5 || y + height > PAGE_HEIGHT_MM + 0.5) {
    throw new Error(`O campo “${fieldKey}” está fora da geometria A4 canônica do modelo.`);
  }

  const style = canonicalAsRecord(field.style);
  if (canonicalText(style.border)) {
    pdf.setDrawColor(148, 163, 184);
    pdf.setLineWidth(0.2);
    pdf.roundedRect(x, y, width, height, 1.3, 1.3, 'S');
  }

  if (field.type === 'image') {
    const image = visual.fieldImages.get(fieldKey) || null;
    if (image) {
      drawImageContained(pdf, image, x, y, width, height, `secretaria-field-${visual.source.emission.id}-${fieldKey}`);
    } else {
      pdf.setDrawColor(203, 213, 225);
      pdf.rect(x, y, width, height, 'S');
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.2);
      pdf.setTextColor(148, 163, 184);
      pdf.text('IMAGEM INDISPONÍVEL', x + width / 2, y + height / 2, { align: 'center', baseline: 'middle' });
    }
    return;
  }

  if (field.type === 'qrcode') {
    if (!isPublicDocumentValidationEnabled(visual.source.emission)) return;
    if (!visual.qr) throw new Error('O modelo exige QR Code, mas o ativo de validação não foi preparado.');
    const qrSize = Math.min(width, Math.max(1, height - 7));
    drawImageContained(
      pdf,
      visual.qr,
      x + (width - qrSize) / 2,
      y,
      qrSize,
      qrSize,
      `secretaria-qr-${visual.source.emission.id}`,
    );
    pdf.setFont('helvetica', 'bold');
    const codeFontSize = 5.8;
    const codeLineHeight = 1.2;
    const codeY = y + qrSize + 1;
    const codeHeight = Math.max(0, y + height - codeY);
    pdf.setFontSize(codeFontSize);
    pdf.setTextColor(29, 78, 216);
    const codeLines = assertTextFits(
      pdf,
      visual.source.emission.codigo,
      width,
      codeHeight,
      codeFontSize,
      codeLineHeight,
      `O código de validação do campo “${fieldKey}”`,
    );
    pdf.text(codeLines, x + width / 2, codeY, {
      align: 'center',
      baseline: 'top',
      lineHeightFactor: codeLineHeight,
    });
    return;
  }

  if (field.type !== 'text') return;
  const fieldValue = REGISTRATION_VECTOR_DOCUMENTS.has(visual.source.emission.documento)
    && (field.id === 'ficha_documentos' || field.id === 'pasta_documentos')
    ? repairFichaVoterGrid(field.value)
    : field.value;
  const parsed = resolveEmissionVectorTemplate(visual.source, fieldValue);
  assertNoResidualTemplateTokens(parsed, `O campo “${fieldKey}”`);
  if (drawRegistrationGrid(
    pdf, parsed, x, y, width, height, `O campo “${fieldKey}”`,
    REGISTRATION_VECTOR_DOCUMENTS.has(visual.source.emission.documento),
  )) return;
  const text = emissionHtmlToVectorText(parsed);
  if (!text) return;
  const configuredFontSize = Number.parseFloat(String(style.fontSize || '10'));
  const fontSize = Math.min(13, Math.max(5.5, Number.isFinite(configuredFontSize) ? configuredFontSize * 0.75 : 7.5));
  const padding = canonicalText(style.padding) ? 1.5 : 0;
  const textWidth = Math.max(1, width - padding * 2);
  const textHeight = Math.max(1, height - padding * 2);
  pdf.setFont(String(style.fontWeight || '').match(/bold|[7-9]00/) ? 'times' : 'times', String(style.fontWeight || '').match(/bold|[7-9]00/) ? 'bold' : 'normal');
  pdf.setFontSize(fontSize);
  pdf.setTextColor(15, 23, 42);
  const lines = assertTextFits(pdf, text, textWidth, textHeight, fontSize, 1.25, `O campo “${fieldKey}”`);
  const align = style.textAlign === 'center' || style.textAlign === 'right' ? style.textAlign : 'left';
  const textX = align === 'center' ? x + width / 2 : align === 'right' ? x + width - padding : x + padding;
  pdf.text(lines, textX, y + padding, {
    align,
    baseline: 'top',
    lineHeightFactor: 1.25,
  });
};

const drawVectorPage = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  visual: VectorDocument,
  page: VectorPage,
  pageIndex: number,
) => {
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, PAGE_WIDTH_MM, PAGE_HEIGHT_MM, 'F');
  const watermarkRecord = visual.watermarkConfig;
  const watermarkGeometry = getRegistrationWatermarkGeometry(
    watermarkRecord.watermarkScale ?? watermarkRecord.watermark_scale,
  );
  drawCanonicalPdfWatermark(pdf, GState, {
    enabled: Boolean(watermarkRecord.watermarkUrl || watermarkRecord.watermark_url),
    imageUrl: visual.watermark?.dataUrl || null,
    label: canonicalText(watermarkRecord.nome, watermarkRecord.label, visual.institutionName),
    opacity: Number(watermarkRecord.watermarkOpacity ?? watermarkRecord.watermark_opacity ?? 0.1),
  }, {
    x: watermarkGeometry.x,
    y: watermarkGeometry.y,
    width: watermarkGeometry.width,
    height: watermarkGeometry.height,
    textSize: watermarkGeometry.textSize,
    rotate: watermarkRecord.watermarkRotate === false ? 0 : 35,
  });
  drawCanonicalInstitutionalHeader(pdf, visual.institutionHeader, visual.logo, {
    orientation: 'portrait',
    alias: `secretaria-logo-${visual.source.emission.polo_id}`,
  });

  if (pageIndex === 0) {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 26, 51);
    pdf.setFontSize(16);
    const title = visual.title.toUpperCase();
    pdf.text(title, PAGE_WIDTH_MM / 2, 68, {
      align: 'center',
      baseline: 'top',
    });
    pdf.setDrawColor(37, 99, 235);
    pdf.setLineWidth(0.6);
    const underlineWidth = Math.min(
      PAGE_WIDTH_MM - PAGE_LEFT_MM - PAGE_RIGHT_MM,
      pdf.getTextWidth(title),
    );
    pdf.line(
      PAGE_WIDTH_MM / 2 - underlineWidth / 2,
      76,
      PAGE_WIDTH_MM / 2 + underlineWidth / 2,
      76,
    );
  }

  if (visual.source.emission.documento === 'boletim') {
    drawAcademicBulletinBody(pdf, visual, page, pageIndex);
  } else {
    drawBody(pdf, page.body, pageIndex === 0);
  }
  page.fields.forEach((field) => drawField(pdf, visual, field, pageIndex));
};

/**
 * Compositor oficial da Secretaria. Cada item preserva exatamente o número de
 * páginas e as coordenadas recebidas no snapshot; não há captura de DOM,
 * rasterização A4 nem criação de páginas no navegador por overflow.
 */
export const createEmissionDocumentsPdf = async (
  sources: readonly EmissionPdfSource[],
  options: CanonicalDocumentPdfBuildOptions = {},
): Promise<CanonicalDocumentPdfResult> => {
  if (!sources.length) throw new Error('Nenhuma emissão foi selecionada para gerar o PDF.');

  const imageCache = new Map<string, Promise<CanonicalPdfImage | null>>();
  const visuals: VectorDocument[] = [];
  for (let index = 0; index < sources.length; index += 1) {
    visuals.push(await prepareVectorDocument(sources[index], imageCache));
  }

  const { jsPDF, GState } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
    putOnlyUsedFonts: true,
    precision: 4,
  });
  pdf.setProperties({
    title: sources.length > 1 ? `Documentos da Secretaria - lote com ${sources.length}` : getDocumentTitle(sources[0].emission),
    subject: 'Documento institucional oficial emitido pela Secretaria',
    author: 'Universo Cursos e Consultoria',
    creator: 'Universo Cursos e Consultoria',
  });

  let renderedPages = 0;
  visuals.forEach((visual, documentIndex) => {
    visual.pages.forEach((page, pageIndex) => {
      if (renderedPages > 0) pdf.addPage('a4', 'portrait');
      drawVectorPage(
        pdf,
        GState as unknown as PdfGStateConstructor,
        visual,
        page,
        pageIndex,
      );
      renderedPages += 1;
    });
    options.onProgress?.({ current: documentIndex + 1, total: visuals.length });
  });

  const first = sources[0].emission;
  return {
    blob: pdf.output('blob'),
    fileName: sources.length > 1
      ? `${first.documento}-lote-${sources.length}-documentos.pdf`
      : `emissao-${first.documento}-${first.codigo}.pdf`,
  };
};
