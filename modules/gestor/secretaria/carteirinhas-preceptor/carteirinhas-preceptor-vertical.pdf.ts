import type { jsPDF } from 'jspdf';

import {
  canonicalAsRecord,
  canonicalText,
} from '../shared/canonical-document-render.utils';
import {
  createCanonicalPdfQr,
  drawCanonicalPdfText,
  drawCanonicalPdfWatermark,
  normalizeCanonicalPdfText,
  resolveCanonicalPdfPhoto,
  runWithConcurrency,
  type CanonicalPdfImage,
} from '../shared/canonical-document-vector-pdf';
import type {
  CanonicalDocumentPdfBuildOptions,
  CanonicalDocumentPdfResult,
} from '../shared/canonical-document-pdf.types';
import type { CarteirinhaPreceptorPreparedDocument } from './types/carteirinhas-preceptor.types';

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const CARD_WIDTH = 54;
const CARD_HEIGHT = 85.6;
const CARDS_PER_ROW = 3;
const CARDS_PER_SHEET = 9;
const CARD_GAP_X = 3;
const CARD_GAP_Y = 4;
const BATCH_LEFT = (PAGE_WIDTH - (CARD_WIDTH * CARDS_PER_ROW) - (CARD_GAP_X * (CARDS_PER_ROW - 1))) / 2;
const BATCH_TOP = (PAGE_HEIGHT - (CARD_HEIGHT * 3) - (CARD_GAP_Y * 2)) / 2;
const VERTICAL_LAYOUT_VERSION = 'CR80_VERTICAL_V1';

type PdfGStateConstructor = new (parameters: { opacity: number }) => unknown;
type VerticalPage = 'frente' | 'verso';
type FieldType = 'foto' | 'image' | 'qrcode' | 'text';

interface VerticalField {
  id: string;
  type: FieldType;
  value: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  page: VerticalPage;
  style: Record<string, unknown>;
}

interface VerticalPreceptorCard {
  background: {
    frente: string | null;
    verso: string | null;
  };
  customDesignHidden: boolean;
  fields: VerticalField[];
  hasVerso: boolean;
  holder: {
    area: string;
    cargo: string;
    emissao: string;
    fotoUrl: string | null;
    nome: string;
    polo: string;
    registro: string;
    validationCode: string;
    validade: string;
  };
  primaryColor: string;
  secondaryColor: string;
  showPhoto: boolean;
  qrEnabled: boolean;
  source: CarteirinhaPreceptorPreparedDocument;
  watermark: {
    enabled: boolean;
    imageUrl: string | null;
    label: string | null;
    opacity: number | null;
  };
  assets: {
    backgroundFrente: CanonicalPdfImage | null;
    backgroundVerso: CanonicalPdfImage | null;
    photo: CanonicalPdfImage | null;
    qr: CanonicalPdfImage | null;
    images: Map<string, CanonicalPdfImage | null>;
  };
}

const booleanValue = (...values: unknown[]) => {
  const value = values.find((item) => typeof item === 'boolean' || item === 'true' || item === 'false');
  return value === true || value === 'true';
};

const numberValue = (value: unknown, fallback: number) => {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const optionalText = (...values: unknown[]) => canonicalText(...values) || null;

const isFieldType = (value: unknown): value is FieldType => (
  value === 'foto' || value === 'image' || value === 'qrcode' || value === 'text'
);

const normalizeField = (value: unknown): VerticalField | null => {
  const source = canonicalAsRecord(value);
  if (typeof source.id !== 'string' || !isFieldType(source.type)) return null;
  return {
    id: source.id,
    type: source.type,
    value: typeof source.value === 'string' ? source.value : '',
    x: numberValue(source.x, 0),
    y: numberValue(source.y, 0),
    width: source.width === undefined ? undefined : numberValue(source.width, 30),
    height: source.height === undefined ? undefined : numberValue(source.height, 15),
    page: source.page === 'verso' ? 'verso' : 'frente',
    style: canonicalAsRecord(source.style),
  };
};

export const isPreceptorVerticalLayout = (document: CarteirinhaPreceptorPreparedDocument) => {
  const template = canonicalAsRecord(document.renderPayload?.template);
  return template.layoutVersion === VERTICAL_LAYOUT_VERSION && Array.isArray(template.fields);
};

const getVerticalCard = (source: CarteirinhaPreceptorPreparedDocument): Omit<VerticalPreceptorCard, 'assets'> => {
  const payload = source.renderPayload;
  const template = canonicalAsRecord(payload?.template);
  const snapshot = canonicalAsRecord(payload?.snapshot);
  const rendered = payload?.rendered;
  const preceptor = canonicalAsRecord(snapshot.preceptor);
  const institution = canonicalAsRecord(snapshot.instituicao);
  const validation = canonicalAsRecord(snapshot.validacao || snapshot.validacao_documento);
  const issuance = canonicalAsRecord(snapshot.emissao);
  const renderedFront = canonicalAsRecord(rendered?.front);
  const renderedQr = canonicalAsRecord(rendered?.qr);
  const templateQr = canonicalAsRecord(template.qr);
  const fields = (Array.isArray(template.fields) ? template.fields : [])
    .map(normalizeField)
    .filter((field): field is VerticalField => Boolean(field));

  if (!fields.length) throw new Error('O Crachá de Preceptor não possui campos posicionados no snapshot emitido.');
  const holderName = canonicalText(preceptor.nome, renderedFront.holder_name, source.targetName);
  if (!holderName) throw new Error('O Crachá de Preceptor não possui o nome canônico do professor.');

  const qrEnabled = rendered?.qr
    ? rendered.qr.enabled === true
    : booleanValue(templateQr.habilitado, templateQr.enabled);
  const validationCode = source.validationCode?.trim() || canonicalText(validation.codigo, renderedQr.code);
  if (qrEnabled && !validationCode) {
    throw new Error('O Crachá de Preceptor exige código de validação para gerar o QR Code.');
  }

  const emissao = canonicalText(
    issuance.dataExibicao,
    issuance.data_exibicao,
  );
  if (!emissao) {
    throw new Error('O snapshot do Crachá de Preceptor não contém a data canônica de emissão.');
  }

  return {
    background: {
      frente: optionalText(template.bgFrenteUrl, template.bg_frente_url),
      verso: optionalText(template.bgVersoUrl, template.bg_verso_url),
    },
    customDesignHidden: template.ocultarDesignPadrao === true,
    fields,
    hasVerso: template.hasVerso !== false,
    holder: {
      area: canonicalText(preceptor.areaFormacao, preceptor.titulacao, renderedFront.area),
      cargo: canonicalText(template.cargoPadrao, template.textoFrente, renderedFront.role, renderedFront.cargo, 'PRECEPTOR(A)'),
      emissao,
      fotoUrl: optionalText(preceptor.fotoUrl, renderedFront.photo_url, renderedFront.photoUrl),
      nome: holderName,
      polo: canonicalText(institution.nome, renderedFront.institution, 'Polo emissor'),
      registro: canonicalText(preceptor.registroProfissional, preceptor.numeroRegistro, 'Não informado'),
      validationCode,
      validade: canonicalText(
        validation.validadeExibicao,
        validation.validityLabel,
        rendered?.qr?.validityLabel,
        'Sem vencimento',
      ),
    },
    primaryColor: canonicalText(template.corPrimaria, '#0f172a'),
    secondaryColor: canonicalText(template.corSecundaria, '#10b981'),
    showPhoto: template.mostrarFoto !== false,
    qrEnabled,
    source,
    watermark: {
      enabled: rendered?.watermark
        ? rendered.watermark.enabled === true
        : booleanValue(template.marcaDaguaHabilitada, template.marca_dagua_habilitada),
      imageUrl: optionalText(rendered?.watermark?.imageUrl),
      label: optionalText(rendered?.watermark?.label, institution.nome),
      opacity: typeof rendered?.watermark?.opacity === 'number' ? rendered.watermark.opacity : null,
    },
  };
};

const prepareVerticalCard = async (source: CarteirinhaPreceptorPreparedDocument): Promise<VerticalPreceptorCard> => {
  const card = getVerticalCard(source);
  const imageFields = card.fields.filter((field) => field.type === 'image' && field.value.trim());
  const [backgroundFrente, backgroundVerso, photo, qr, ...fieldImages] = await Promise.all([
    card.background.frente ? resolveCanonicalPdfPhoto(card.background.frente) : Promise.resolve(null),
    card.hasVerso && card.background.verso ? resolveCanonicalPdfPhoto(card.background.verso) : Promise.resolve(null),
    card.showPhoto ? resolveCanonicalPdfPhoto(card.holder.fotoUrl) : Promise.resolve(null),
    card.qrEnabled ? createCanonicalPdfQr(card.holder.validationCode) : Promise.resolve(null),
    ...imageFields.map((field) => resolveCanonicalPdfPhoto(field.value)),
  ]);

  if (card.background.frente && !backgroundFrente) {
    throw new Error('Não foi possível carregar o fundo da frente do Crachá de Preceptor emitido.');
  }
  if (card.hasVerso && card.background.verso && !backgroundVerso) {
    throw new Error('Não foi possível carregar o fundo do verso do Crachá de Preceptor emitido.');
  }
  if (card.qrEnabled && !qr) {
    throw new Error('O QR Code do Crachá de Preceptor não pôde ser preparado.');
  }

  const images = new Map<string, CanonicalPdfImage | null>();
  imageFields.forEach((field, index) => images.set(field.id, fieldImages[index] || null));
  return { ...card, assets: { backgroundFrente, backgroundVerso, photo, qr, images } };
};

const parsePdfColor = (value: unknown, fallback: [number, number, number]): [number, number, number] => {
  const normalized = String(value || '').trim().replace(/^#/, '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((part) => `${part}${part}`).join('')
    : normalized;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return fallback;
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ];
};

const drawContainedImage = (
  pdf: jsPDF,
  image: CanonicalPdfImage,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  const properties = pdf.getImageProperties(image.dataUrl);
  const scale = Math.min(width / properties.width, height / properties.height);
  const imageWidth = properties.width * scale;
  const imageHeight = properties.height * scale;
  pdf.addImage(image.dataUrl, image.format, x + (width - imageWidth) / 2, y + (height - imageHeight) / 2, imageWidth, imageHeight, undefined, 'FAST');
};

const drawPhotoPlaceholder = (pdf: jsPDF, x: number, y: number, width: number, height: number) => {
  pdf.setFillColor(241, 245, 249);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(x, y, width, height, 2, 2, 'FD');
  pdf.setFillColor(203, 213, 225);
  pdf.circle(x + width / 2, y + height * 0.35, Math.min(width, height) * 0.15, 'F');
  pdf.ellipse(x + width / 2, y + height * 0.75, width * 0.28, height * 0.18, 'F');
};

const replaceToken = (value: string, holder: VerticalPreceptorCard['holder']) => normalizeCanonicalPdfText(value)
  .replace(/\{\{PRECEPTOR_NOME\}\}/g, holder.nome)
  .replace(/\{\{PRECEPTOR_CARGO\}\}/g, holder.cargo)
  .replace(/\{\{PRECEPTOR_AREA\}\}/g, holder.area)
  .replace(/\{\{PRECEPTOR_REGISTRO\}\}/g, holder.registro)
  .replace(/\{\{POLO_NOME\}\}/g, holder.polo)
  .replace(/\{\{DATA_HOJE\}\}/g, holder.emissao)
  .replace(/\{\{DATA_VALIDADE\}\}/g, holder.validade)
  .replace(/\{\{VALIDACAO_CODIGO\}\}/g, holder.validationCode);

const drawDefaultDesign = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  card: VerticalPreceptorCard,
  page: VerticalPage,
  x: number,
  y: number,
) => {
  const hasCustomBackground = page === 'frente'
    ? Boolean(card.assets.backgroundFrente)
    : Boolean(card.assets.backgroundVerso);
  if (card.customDesignHidden && hasCustomBackground) return;
  if (page === 'frente') {
    const [r, g, b] = parsePdfColor(card.primaryColor, [15, 23, 42]);
    pdf.setFillColor(r, g, b);
    pdf.rect(x, y, CARD_WIDTH, 11, 'F');
    const [secondaryR, secondaryG, secondaryB] = parsePdfColor(card.secondaryColor, [16, 185, 129]);
    pdf.setFillColor(secondaryR, secondaryG, secondaryB);
    pdf.rect(x, y + 11, CARD_WIDTH, 1.2, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(5.1);
    pdf.setTextColor(255, 255, 255);
    pdf.text('UNIVERSO', x + CARD_WIDTH / 2, y + 5, { align: 'center', baseline: 'middle' });
    pdf.setFontSize(3.6);
    pdf.text('CURSOS E CONSULTORIA', x + CARD_WIDTH / 2, y + 8.1, { align: 'center', baseline: 'middle' });
  } else {
    pdf.setFillColor(15, 23, 42);
    pdf.rect(x, y, CARD_WIDTH, 6, 'F');
  }
  drawCanonicalPdfWatermark(pdf, GState, card.watermark, {
    x: x + 6,
    y: y + 14,
    width: CARD_WIDTH - 12,
    height: CARD_HEIGHT - 22,
    textSize: 9,
    rotate: -35,
  });
};

const drawBackground = (
  pdf: jsPDF,
  image: CanonicalPdfImage | null,
  x: number,
  y: number,
) => {
  if (!image) return;
  pdf.addImage(image.dataUrl, image.format, x, y, CARD_WIDTH, CARD_HEIGHT, undefined, 'FAST');
};

const drawTextField = (
  pdf: jsPDF,
  field: VerticalField,
  card: VerticalPreceptorCard,
  x: number,
  y: number,
) => {
  const style = field.style;
  const sizePx = numberValue(style.fontSize, 8);
  const fontSize = Math.max(3, sizePx * 0.75);
  const fontStyle = style.fontWeight === 'bold'
    ? style.fontStyle === 'italic' ? 'bolditalic' : 'bold'
    : style.fontStyle === 'italic' ? 'italic' : 'normal';
  const alignment = style.textAlign === 'center' || style.textAlign === 'right' ? style.textAlign : 'left';
  const width = Math.max(2, (field.width ?? 92.6) / 100 * CARD_WIDTH);
  const lineHeight = numberValue(style.lineHeight, 1.18);
  const [r, g, b] = parsePdfColor(style.color, [30, 41, 59]);
  pdf.setFont('helvetica', fontStyle as 'normal' | 'bold' | 'italic' | 'bolditalic');
  pdf.setTextColor(r, g, b);
  pdf.setFontSize(fontSize);
  const textX = x + (field.x / 100 * CARD_WIDTH);
  const anchorX = alignment === 'center' ? textX + width / 2 : alignment === 'right' ? textX + width : textX;
  drawCanonicalPdfText(pdf, replaceToken(field.value, card.holder), anchorX, y + (field.y / 100 * CARD_HEIGHT), {
    align: alignment,
    maxWidth: width,
    maxLines: 7,
    lineHeight,
  });
};

const drawQrField = (pdf: jsPDF, field: VerticalField, card: VerticalPreceptorCard, x: number, y: number) => {
  if (!card.qrEnabled || !card.assets.qr) return;
  const width = Math.max(8, (field.width ?? 22) / 100 * CARD_WIDTH);
  const configuredHeight = Math.max(width + 4, (field.height ?? 14) / 100 * CARD_HEIGHT);
  const fieldX = x + (field.x / 100 * CARD_WIDTH);
  const fieldY = y + (field.y / 100 * CARD_HEIGHT);
  const qrSize = Math.min(width - 1.6, configuredHeight - 5);
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(fieldX, fieldY, width, configuredHeight, 1.2, 1.2, 'FD');
  pdf.addImage(card.assets.qr.dataUrl, card.assets.qr.format, fieldX + (width - qrSize) / 2, fieldY + 0.8, qrSize, qrSize, `preceptor-vertical-qr-${card.source.emissionId}`, 'FAST');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(3);
  pdf.setTextColor(100, 116, 139);
  pdf.text('CÓD. VALIDAÇÃO', fieldX + width / 2, fieldY + qrSize + 1.7, { align: 'center', baseline: 'middle' });
  pdf.setFontSize(3.25);
  pdf.setTextColor(37, 99, 235);
  pdf.text(card.holder.validationCode, fieldX + width / 2, fieldY + configuredHeight - 1.1, { align: 'center', baseline: 'middle' });
};

const drawField = (
  pdf: jsPDF,
  field: VerticalField,
  card: VerticalPreceptorCard,
  x: number,
  y: number,
) => {
  const fieldX = x + (field.x / 100 * CARD_WIDTH);
  const fieldY = y + (field.y / 100 * CARD_HEIGHT);
  const width = Math.max(2, (field.width ?? (field.type === 'text' ? 92.6 : 30)) / 100 * CARD_WIDTH);
  const height = Math.max(2, (field.height ?? 15) / 100 * CARD_HEIGHT);

  if (field.type === 'text') {
    drawTextField(pdf, field, card, x, y);
    return;
  }
  if (field.type === 'qrcode') {
    drawQrField(pdf, field, card, x, y);
    return;
  }
  if (field.type === 'foto') {
    if (!card.showPhoto) return;
    if (card.assets.photo) {
      pdf.setFillColor(248, 250, 252);
      pdf.setDrawColor(226, 232, 240);
      pdf.roundedRect(fieldX, fieldY, width, height, 2, 2, 'FD');
      drawContainedImage(pdf, card.assets.photo, fieldX + 0.8, fieldY + 0.8, width - 1.6, height - 1.6);
    } else {
      drawPhotoPlaceholder(pdf, fieldX, fieldY, width, height);
    }
    return;
  }

  const image = card.assets.images.get(field.id);
  if (image) drawContainedImage(pdf, image, fieldX, fieldY, width, height);
};

const drawVerticalCard = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  card: VerticalPreceptorCard,
  page: VerticalPage,
  x: number,
  y: number,
) => {
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(x, y, CARD_WIDTH, CARD_HEIGHT, 2.5, 2.5, 'FD');
  drawBackground(pdf, page === 'frente' ? card.assets.backgroundFrente : card.assets.backgroundVerso, x, y);
  drawDefaultDesign(pdf, GState, card, page, x, y);
  card.fields
    .filter((field) => field.page === page)
    .sort((first, second) => numberValue(first.style.zIndex, 15) - numberValue(second.style.zIndex, 15))
    .forEach((field) => drawField(pdf, field, card, x, y));
};

const drawA4Background = (pdf: jsPDF) => {
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F');
};

const getCardPosition = (slot: number) => ({
  x: BATCH_LEFT + (slot % CARDS_PER_ROW) * (CARD_WIDTH + CARD_GAP_X),
  y: BATCH_TOP + Math.floor(slot / CARDS_PER_ROW) * (CARD_HEIGHT + CARD_GAP_Y),
});

const chunkCards = <Item,>(cards: readonly Item[], size: number) => {
  const chunks: Item[][] = [];
  for (let index = 0; index < cards.length; index += size) chunks.push(cards.slice(index, index + size));
  return chunks;
};

const paddedSheet = <Item,>(cards: readonly Item[]) => {
  const result: Array<Item | null> = [...cards];
  while (result.length < CARDS_PER_SHEET) result.push(null);
  return result;
};

const mirrorDuplexRows = <Item,>(items: readonly (Item | null)[]) => {
  const mirrored: Array<Item | null> = [];
  for (let index = 0; index < items.length; index += CARDS_PER_ROW) {
    mirrored.push(...items.slice(index, index + CARDS_PER_ROW).reverse());
  }
  return mirrored;
};

const drawSingleDocument = (pdf: jsPDF, GState: PdfGStateConstructor, card: VerticalPreceptorCard) => {
  drawA4Background(pdf);
  const x = (PAGE_WIDTH - CARD_WIDTH) / 2;
  const totalHeight = card.hasVerso ? (CARD_HEIGHT * 2) + 15 : CARD_HEIGHT;
  const firstY = (PAGE_HEIGHT - totalHeight) / 2;
  drawVerticalCard(pdf, GState, card, 'frente', x, firstY);
  if (card.hasVerso) drawVerticalCard(pdf, GState, card, 'verso', x, firstY + CARD_HEIGHT + 15);
};

const drawBatch = (pdf: jsPDF, GState: PdfGStateConstructor, cards: readonly VerticalPreceptorCard[]) => {
  chunkCards(cards, CARDS_PER_SHEET).forEach((sheet, sheetIndex) => {
    if (sheetIndex > 0) pdf.addPage('a4', 'portrait');
    drawA4Background(pdf);
    const fronts = paddedSheet(sheet);
    fronts.forEach((card, slot) => {
      if (!card) return;
      const position = getCardPosition(slot);
      drawVerticalCard(pdf, GState, card, 'frente', position.x, position.y);
    });
    if (!fronts.some((card) => card?.hasVerso)) return;
    pdf.addPage('a4', 'portrait');
    drawA4Background(pdf);
    mirrorDuplexRows(fronts).forEach((card, slot) => {
      if (!card || !card.hasVerso) return;
      const position = getCardPosition(slot);
      drawVerticalCard(pdf, GState, card, 'verso', position.x, position.y);
    });
  });
};

/** PDF CR80 vertical nativo. Fundo/foto/QR são ativos isolados; textos seguem vetoriais e selecionáveis. */
export const createCarteirinhasPreceptorVerticalPdf = async (
  documents: readonly CarteirinhaPreceptorPreparedDocument[],
  options: CanonicalDocumentPdfBuildOptions = {},
): Promise<CanonicalDocumentPdfResult> => {
  if (!documents.length) throw new Error('Nenhum Crachá de Preceptor foi preparado para gerar o PDF.');
  if (!documents.every(isPreceptorVerticalLayout)) {
    throw new Error('O lote mistura snapshots de layout vertical e histórico; gere cada formato separadamente.');
  }

  const cards = await runWithConcurrency(documents, 3, prepareVerticalCard);
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
    title: documents.length > 1 ? 'Crachás de Preceptor - lote' : documents[0].title,
    subject: 'Crachá institucional emitido pela Secretaria',
    author: 'Universo Cursos e Consultoria',
    creator: 'Universo Cursos e Consultoria',
  });
  const gState = GState as unknown as PdfGStateConstructor;

  if (cards.length === 1) {
    drawSingleDocument(pdf, gState, cards[0]);
    options.onProgress?.({ current: 1, total: 1 });
  } else {
    drawBatch(pdf, gState, cards);
    cards.forEach((_, index) => options.onProgress?.({ current: index + 1, total: cards.length }));
  }

  return {
    blob: pdf.output('blob'),
    fileName: documents.length > 1
      ? `crachas-preceptor-lote-${documents.length}.pdf`
      : `cracha-preceptor-${documents[0].emissionId}.pdf`,
  };
};
