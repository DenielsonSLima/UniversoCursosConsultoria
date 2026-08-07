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
const CARD_WIDTH = 85.6;
const CARD_HEIGHT = 54;
const CARDS_PER_ROW = 2;
const CARDS_PER_SHEET = 10;
const CARD_GAP_X = 3;
const CARD_GAP_Y = 1.5;
const BATCH_TOP = 10;
const BATCH_LEFT = (PAGE_WIDTH - (CARD_WIDTH * CARDS_PER_ROW) - CARD_GAP_X) / 2;

type PdfGStateConstructor = new (parameters: { opacity: number }) => unknown;

interface PreceptorCardData {
  area: string;
  backMessage: string;
  footer: string;
  holderName: string;
  institution: string;
  photoUrl: string | null;
  qrEnabled: boolean;
  qrLabel: string;
  role: string;
  showPhoto: boolean;
  showPolo: boolean;
  subtitle: string;
  title: string;
  validationCode: string;
  validityLabel: string;
  watermark: {
    enabled: boolean;
    imageUrl: string | null;
    label: string | null;
    opacity: number | null;
  };
  source: CarteirinhaPreceptorPreparedDocument;
  qr: CanonicalPdfImage | null;
  photo: CanonicalPdfImage | null;
}

const booleanValue = (...values: unknown[]) => {
  const value = values.find((item) => typeof item === 'boolean' || item === 'true' || item === 'false');
  return value === true || value === 'true';
};

const getRawCard = (source: CarteirinhaPreceptorPreparedDocument) => {
  const payload = source.renderPayload;
  const template = canonicalAsRecord(payload?.template);
  const snapshot = canonicalAsRecord(payload?.snapshot);
  const rendered = payload?.rendered;
  const front = canonicalAsRecord(rendered?.front);
  const back = canonicalAsRecord(rendered?.back);
  const preceptor = canonicalAsRecord(snapshot.preceptor);
  const institutionSnapshot = canonicalAsRecord(snapshot.instituicao);
  const validation = canonicalAsRecord(snapshot.validacao || snapshot.validacao_documento);
  const templateQr = canonicalAsRecord(template.qr);
  const qrEnabled = rendered?.qr
    ? rendered.qr.enabled === true
    : booleanValue(templateQr.habilitado, templateQr.enabled);

  const holderName = canonicalText(
    front.holder_name,
    front.holderName,
    front.nome,
    preceptor.nome,
    source.targetName,
  );
  if (!holderName) throw new Error('A carteirinha não possui o nome canônico do preceptor.');
  if (qrEnabled && !source.validationCode?.trim()) {
    throw new Error('A carteirinha exige código de validação para gerar o QR Code.');
  }

  return {
    area: canonicalText(front.area, front.area_atuacao, preceptor.areaFormacao, preceptor.titulacao),
    backMessage: canonicalText(back.message, back.mensagem, template.mensagemVerso),
    footer: canonicalText(back.footer, back.rodape, template.rodape),
    holderName,
    institution: canonicalText(front.institution, front.instituicao, institutionSnapshot.nome),
    photoUrl: canonicalText(front.photo_url, front.photoUrl, preceptor.fotoUrl) || null,
    qrEnabled,
    qrLabel: canonicalText(rendered?.qr?.label, templateQr.rotulo, 'Validação'),
    role: canonicalText(front.role, front.cargo, 'Preceptor(a)'),
    showPhoto: template.mostrarFoto !== false && front.mostrarFoto !== false,
    showPolo: template.mostrarPolo !== false && front.mostrarPolo !== false,
    subtitle: canonicalText(front.subtitle, front.subtitulo, institutionSnapshot.nome),
    title: canonicalText(front.title, front.titulo, template.tituloFrente, 'PRECEPTOR(A)'),
    validationCode: source.validationCode?.trim() || '',
    validityLabel: canonicalText(
      rendered?.qr?.validityLabel,
      back.validity_label,
      back.validityLabel,
      validation.validadeExibicao,
    ),
    watermark: {
      enabled: rendered?.watermark
        ? rendered.watermark.enabled === true
        : booleanValue(template.marcaDaguaHabilitada, template.marca_dagua_habilitada),
      imageUrl: rendered?.watermark?.imageUrl || null,
      label: canonicalText(rendered?.watermark?.label, institutionSnapshot.nome) || null,
      opacity: rendered?.watermark?.opacity ?? null,
    },
    source,
  };
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
  pdf.addImage(
    image.dataUrl,
    image.format,
    x + (width - imageWidth) / 2,
    y + (height - imageHeight) / 2,
    imageWidth,
    imageHeight,
    undefined,
    'FAST',
  );
};

const drawPhotoPlaceholder = (pdf: jsPDF, x: number, y: number, width: number, height: number) => {
  pdf.setFillColor(226, 232, 240);
  pdf.setDrawColor(255, 255, 255);
  pdf.roundedRect(x, y, width, height, 2, 2, 'FD');
  pdf.setFillColor(148, 163, 184);
  pdf.circle(x + width / 2, y + height * 0.36, Math.min(width, height) * 0.16, 'F');
  pdf.ellipse(x + width / 2, y + height * 0.78, width * 0.28, height * 0.19, 'F');
};

const cardText = (
  pdf: jsPDF,
  value: string,
  x: number,
  y: number,
  width: number,
  options: {
    color: [number, number, number];
    size: number;
    style?: 'normal' | 'bold';
    maxLines?: number;
    align?: 'left' | 'center' | 'right';
    lineHeight?: number;
  },
) => {
  pdf.setFont('helvetica', options.style || 'normal');
  pdf.setTextColor(...options.color);
  pdf.setFontSize(options.size);
  return drawCanonicalPdfText(pdf, value, x, y, {
    maxWidth: width,
    maxLines: options.maxLines ?? 1,
    align: options.align,
    lineHeight: options.lineHeight ?? 1.12,
  });
};

const assertBackMessageFits = (pdf: jsPDF, card: PreceptorCardData) => {
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  const availableWidth = card.qrEnabled ? 48 : CARD_WIDTH - 10;
  const lines = pdf.splitTextToSize(normalizeCanonicalPdfText(card.backMessage), availableWidth) as string[];
  if (lines.length > 7) {
    throw new Error(`A mensagem canônica da carteirinha de ${card.holderName} excede a área física da credencial.`);
  }
};

const drawCardWatermark = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  card: PreceptorCardData,
  x: number,
  y: number,
) => {
  drawCanonicalPdfWatermark(pdf, GState, card.watermark, {
    x: x + 8,
    y: y + 8,
    width: CARD_WIDTH - 16,
    height: CARD_HEIGHT - 16,
    textSize: 10,
    rotate: -35,
  });
};

const drawFront = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  card: PreceptorCardData,
  x: number,
  y: number,
) => {
  pdf.setFillColor(0, 26, 51);
  pdf.setDrawColor(0, 26, 51);
  pdf.roundedRect(x, y, CARD_WIDTH, CARD_HEIGHT, 3, 3, 'FD');
  drawCardWatermark(pdf, GState, card, x, y);

  const textX = x + 5;
  const photoX = x + CARD_WIDTH - 28;
  const textWidth = CARD_WIDTH - 35;
  cardText(pdf, card.subtitle, textX, y + 5, textWidth, {
    color: [165, 243, 252], size: 6.3, style: 'bold', maxLines: 1,
  });
  cardText(pdf, card.title, textX, y + 13, textWidth, {
    color: [255, 255, 255], size: 11.5, style: 'bold', maxLines: 2, lineHeight: 1.08,
  });
  cardText(pdf, card.holderName, textX, y + 37, textWidth, {
    color: [255, 255, 255], size: 8.5, style: 'bold', maxLines: 1,
  });
  const roleAndArea = [card.role, card.area].filter(Boolean).join(' · ');
  if (roleAndArea) {
    cardText(pdf, roleAndArea, textX, y + 42.2, textWidth, {
      color: [165, 243, 252], size: 5.5, style: 'bold', maxLines: 1,
    });
  }
  if (card.showPolo && card.institution) {
    cardText(pdf, card.institution, textX, y + 47.3, textWidth, {
      color: [203, 213, 225], size: 4.8, style: 'bold', maxLines: 1,
    });
  }

  const photoY = y + 4;
  const photoWidth = 23;
  const photoHeight = 46;
  if (card.showPhoto && card.photo) {
    pdf.setFillColor(241, 245, 249);
    pdf.setDrawColor(255, 255, 255);
    pdf.roundedRect(photoX, photoY, photoWidth, photoHeight, 2, 2, 'FD');
    drawContainedImage(pdf, card.photo, photoX + 1, photoY + 1, photoWidth - 2, photoHeight - 2);
  } else {
    drawPhotoPlaceholder(pdf, photoX, photoY, photoWidth, photoHeight);
  }
};

const drawBack = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  card: PreceptorCardData,
  x: number,
  y: number,
) => {
  assertBackMessageFits(pdf, card);
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(x, y, CARD_WIDTH, CARD_HEIGHT, 3, 3, 'FD');
  drawCardWatermark(pdf, GState, card, x, y);

  pdf.setDrawColor(109, 40, 217);
  pdf.setLineWidth(0.8);
  pdf.circle(x + 8, y + 8, 3, 'S');
  pdf.line(x + 6.3, y + 8, x + 7.5, y + 9.3);
  pdf.line(x + 7.5, y + 9.3, x + 10, y + 6.6);

  const textWidth = card.qrEnabled ? 48 : CARD_WIDTH - 10;
  cardText(pdf, card.backMessage, x + 5, y + 14, textWidth, {
    color: [71, 85, 105], size: 6.5, maxLines: 7, lineHeight: 1.35,
  });
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.2);
  pdf.line(x + 5, y + 41, x + CARD_WIDTH - 5, y + 41);
  cardText(pdf, card.footer, x + 5, y + 44, textWidth, {
    color: [100, 116, 139], size: 5.2, style: 'bold', maxLines: 2, lineHeight: 1.18,
  });
  if (card.validityLabel) {
    cardText(pdf, `Validade: ${card.validityLabel}`, x + 5, y + 50, textWidth, {
      color: [109, 40, 217], size: 5.1, style: 'bold', maxLines: 1,
    });
  }

  if (card.qrEnabled) {
    if (!card.qr) throw new Error('A carteirinha exige QR Code, mas o ativo de validação não foi preparado.');
    const qrSize = 16.5;
    const qrX = x + CARD_WIDTH - qrSize - 5;
    const qrY = y + CARD_HEIGHT - qrSize - 5;
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(qrX - 1, qrY - 1, qrSize + 2, qrSize + 7.5, 1, 1, 'FD');
    pdf.addImage(
      card.qr.dataUrl,
      card.qr.format,
      qrX,
      qrY,
      qrSize,
      qrSize,
      `preceptor-qr-${card.source.emissionId}`,
      'FAST',
    );
    cardText(pdf, card.qrLabel, qrX + qrSize / 2, qrY + qrSize + 0.8, qrSize + 1, {
      color: [100, 116, 139], size: 4.2, style: 'bold', maxLines: 1, align: 'center',
    });
    cardText(pdf, card.validationCode, qrX + qrSize / 2, qrY + qrSize + 3.3, qrSize + 1, {
      color: [109, 40, 217], size: 4.3, style: 'bold', maxLines: 1, align: 'center',
    });
  }
};

const drawA4Background = (pdf: jsPDF) => {
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F');
};

const getCardPosition = (slot: number) => ({
  x: BATCH_LEFT + (slot % CARDS_PER_ROW) * (CARD_WIDTH + CARD_GAP_X),
  y: BATCH_TOP + Math.floor(slot / CARDS_PER_ROW) * (CARD_HEIGHT + CARD_GAP_Y),
});

const mirrorDuplexRows = <Item,>(items: readonly (Item | null)[]) => {
  const mirrored: Array<Item | null> = [];
  for (let index = 0; index < items.length; index += CARDS_PER_ROW) {
    mirrored.push(items[index + 1] ?? null, items[index] ?? null);
  }
  return mirrored;
};

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

const drawSingleDocument = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  card: PreceptorCardData,
) => {
  drawA4Background(pdf);
  const x = (PAGE_WIDTH - CARD_WIDTH) / 2;
  const firstY = (PAGE_HEIGHT - (CARD_HEIGHT * 2) - 14) / 2;
  drawFront(pdf, GState, card, x, firstY);
  drawBack(pdf, GState, card, x, firstY + CARD_HEIGHT + 14);
};

const drawBatch = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  cards: readonly PreceptorCardData[],
) => {
  chunkCards(cards, CARDS_PER_SHEET).forEach((sheet, sheetIndex) => {
    if (sheetIndex > 0) pdf.addPage('a4', 'portrait');
    drawA4Background(pdf);
    const fronts = paddedSheet(sheet);
    fronts.forEach((card, slot) => {
      if (!card) return;
      const { x, y } = getCardPosition(slot);
      drawFront(pdf, GState, card, x, y);
    });

    pdf.addPage('a4', 'portrait');
    drawA4Background(pdf);
    mirrorDuplexRows(fronts).forEach((card, slot) => {
      if (!card) return;
      const { x, y } = getCardPosition(slot);
      drawBack(pdf, GState, card, x, y);
    });
  });
};

/**
 * PDF nativo de carteirinhas: CR80 físicas em A4 para lote e frente/verso
 * centralizados para emissão individual. A prévia usa o mesmo Blob final.
 */
export const createCarteirinhasPreceptorPdf = async (
  documents: readonly CarteirinhaPreceptorPreparedDocument[],
  options: CanonicalDocumentPdfBuildOptions = {},
): Promise<CanonicalDocumentPdfResult> => {
  if (!documents.length) throw new Error('Nenhuma carteirinha foi preparada para gerar o PDF.');

  const rawCards = documents.map(getRawCard);
  const cards = await runWithConcurrency(rawCards, 3, async (card) => {
    const [qr, photo] = await Promise.all([
      card.qrEnabled ? createCanonicalPdfQr(card.validationCode) : Promise.resolve(null),
      card.showPhoto ? resolveCanonicalPdfPhoto(card.photoUrl) : Promise.resolve(null),
    ]);
    return { ...card, qr, photo } satisfies PreceptorCardData;
  });
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
    title: documents.length > 1 ? 'Carteirinhas de preceptor - lote' : documents[0].title,
    subject: 'Credencial institucional emitida pela Secretaria',
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
      ? `carteirinhas-preceptor-lote-${documents.length}.pdf`
      : `carteirinha-preceptor-${documents[0].emissionId}.pdf`,
  };
};
