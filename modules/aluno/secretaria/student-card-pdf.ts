import { jsPDF } from 'jspdf';
import { waitForQrCodeAssets } from '../../shared/qrcode/qr-code-assets';

const CARD_WIDTH_MM = 85.6;
const CARD_HEIGHT_MM = 54;
const CARD_SELECTOR = '.carteirinha-render-root';
const ASSET_TIMEOUT_MS = 10_000;
const CSS_PX_TO_PT = 0.75;
const CSS_PX_TO_MM = 25.4 / 96;

type CardPdfTextRun = {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color?: string;
  fontWeight?: string;
  maxWidth: number;
  lineHeight: number;
  align: 'left' | 'center' | 'right';
};

type CardPdfAssetRun = {
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layer: 'background' | 'content' | 'signature';
};

type CardPdfRenderData = {
  assets: CardPdfAssetRun[];
  textRuns: CardPdfTextRun[];
};

const safeFilePart = (value?: string | null) => String(value || 'aluno')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase();

const wait = (milliseconds: number) => new Promise(resolve => window.setTimeout(resolve, milliseconds));

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

const loadImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new window.Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Não foi possível preparar uma imagem da carteirinha.'));
  image.src = source;
});

const fetchAsDataUrl = async (source: string) => {
  if (source.startsWith('data:')) return source;
  const response = await fetch(source, { cache: 'force-cache', mode: 'cors' });
  if (!response.ok) {
    throw new Error(`Não foi possível preparar uma imagem da carteirinha (${response.status}).`);
  }
  return blobToDataUrl(await response.blob());
};

const removeWhiteBackground = async (dataUrl: string) => {
  const source = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = source.naturalWidth || source.width;
  canvas.height = source.naturalHeight || source.height;
  const context = canvas.getContext('2d');
  if (!context || !canvas.width || !canvas.height) return dataUrl;

  context.drawImage(source, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const whiteness = Math.min(pixels[index], pixels[index + 1], pixels[index + 2]);
    if (whiteness <= 200) continue;
    const alphaFactor = (255 - whiteness) / 55;
    pixels[index + 3] = Math.round(pixels[index + 3] * alphaFactor);
  }
  context.putImageData(imageData, 0, 0);
  const transparentSignature = canvas.toDataURL('image/png');
  canvas.width = 0;
  canvas.height = 0;
  return transparentSignature;
};

const rasterizeAsset = async (
  sourceUrl: string,
  width: number,
  height: number,
  objectFit: string,
  removeWhite: boolean,
) => {
  let dataUrl = await fetchAsDataUrl(sourceUrl);
  if (removeWhite) dataUrl = await removeWhiteBackground(dataUrl);
  const source = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(width * 3));
  canvas.height = Math.max(2, Math.round(height * 3));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível preparar os recursos gráficos da carteirinha.');

  const sourceWidth = source.naturalWidth || source.width;
  const sourceHeight = source.naturalHeight || source.height;
  const targetWidth = canvas.width;
  const targetHeight = canvas.height;

  if (objectFit === 'cover' || objectFit === 'contain') {
    const scale = objectFit === 'cover'
      ? Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
      : Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    context.drawImage(
      source,
      (targetWidth - drawWidth) / 2,
      (targetHeight - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
  } else {
    context.drawImage(source, 0, 0, targetWidth, targetHeight);
  }

  const png = canvas.toDataURL('image/png');
  canvas.width = 0;
  canvas.height = 0;
  return png;
};

const svgToDataUrl = (svg: SVGSVGElement) => {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const computed = window.getComputedStyle(svg);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(Math.max(svg.clientWidth, 1)));
  clone.setAttribute('height', String(Math.max(svg.clientHeight, 1)));
  clone.style.color = computed.color;
  clone.style.stroke = computed.stroke;
  return blobToDataUrl(new Blob([new window.XMLSerializer().serializeToString(clone)], {
    type: 'image/svg+xml;charset=utf-8',
  }));
};

const waitForCardReadiness = async (cards: HTMLElement[]) => {
  await Promise.all(cards.map(card => waitForQrCodeAssets(card, ASSET_TIMEOUT_MS)));
  const deadline = Date.now() + ASSET_TIMEOUT_MS;
  while (cards.some(card => card.dataset.renderReady === 'false')) {
    if (Date.now() >= deadline) {
      throw new Error('A carteirinha ainda está carregando os dados institucionais.');
    }
    await wait(100);
  }

  const renderError = cards.map(card => card.dataset.renderError).find(Boolean);
  if (renderError) throw new Error(renderError);
  if (document.fonts?.ready) await document.fonts.ready;

  const images = cards.flatMap(card => Array.from(card.querySelectorAll<HTMLImageElement>('img')));
  await Promise.all(images.map(async (image) => {
    if (!image.complete) {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error(`Tempo esgotado ao carregar ${image.alt || 'uma imagem da carteirinha'}.`)),
          ASSET_TIMEOUT_MS,
        );
        image.addEventListener('load', () => {
          window.clearTimeout(timeout);
          resolve();
        }, { once: true });
        image.addEventListener('error', () => {
          window.clearTimeout(timeout);
          reject(new Error(`Não foi possível carregar ${image.alt || 'uma imagem da carteirinha'}.`));
        }, { once: true });
      });
    }
    if (image.naturalWidth === 0) {
      throw new Error(`Não foi possível carregar ${image.alt || 'uma imagem da carteirinha'}.`);
    }
  }));
};

const parseColorToRgb = (color: string): { r: number; g: number; b: number } | null => {
  const rgb = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgb) {
    return {
      r: Number.parseInt(rgb[1], 10),
      g: Number.parseInt(rgb[2], 10),
      b: Number.parseInt(rgb[3], 10),
    };
  }

  const hex = color.trim().replace(/^#/, '');
  if (hex.length !== 3 && hex.length !== 6) return null;
  const normalized = hex.length === 3
    ? hex.split('').map(character => character + character).join('')
    : hex;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
};

const collectCardTextRuns = (card: HTMLElement): CardPdfTextRun[] => {
  const cardRect = card.getBoundingClientRect();
  if (!cardRect.width || !cardRect.height) return [];

  const pxToMmX = CARD_WIDTH_MM / cardRect.width;
  const pxToMmY = CARD_HEIGHT_MM / cardRect.height;
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  const runs: CardPdfTextRun[] = [];

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    const text = textNode.textContent?.replace(/[^\S\r\n]+/g, ' ').trim();
    const parent = textNode.parentElement;
    if (!text || !parent) continue;

    const computed = window.getComputedStyle(parent);
    if (
      computed.display === 'none'
      || computed.visibility === 'hidden'
      || Number.parseFloat(computed.opacity || '1') === 0
    ) continue;

    const range = document.createRange();
    range.selectNodeContents(textNode);
    const rect = range.getBoundingClientRect();
    range.detach();
    if (!rect.width || !rect.height) continue;

    const align: CardPdfTextRun['align'] = computed.textAlign === 'center'
      ? 'center'
      : computed.textAlign === 'right'
        ? 'right'
        : 'left';
    const x = align === 'center'
      ? rect.left + rect.width / 2
      : align === 'right'
        ? rect.right
        : rect.left;
    const finalText = computed.textTransform === 'uppercase'
      ? text.toUpperCase()
      : computed.textTransform === 'lowercase'
        ? text.toLowerCase()
        : text;
    const parsedLineHeight = Number.parseFloat(computed.lineHeight);
    const fontSizePx = Number.parseFloat(computed.fontSize);

    runs.push({
      text: finalText,
      x: Math.max(0, (x - cardRect.left) * pxToMmX),
      y: Math.max(0, (rect.top - cardRect.top) * pxToMmY),
      fontSize: Math.max(2, fontSizePx * CSS_PX_TO_PT),
      color: computed.color,
      fontWeight: computed.fontWeight,
      maxWidth: Math.max(rect.width * pxToMmX, 1),
      lineHeight: (Number.isFinite(parsedLineHeight) ? parsedLineHeight : fontSizePx * 1.2) * CSS_PX_TO_MM,
      align,
    });
  }

  return runs;
};

const collectCardAssetRuns = async (card: HTMLElement): Promise<CardPdfAssetRun[]> => {
  const cardRect = card.getBoundingClientRect();
  const pxToMmX = CARD_WIDTH_MM / cardRect.width;
  const pxToMmY = CARD_HEIGHT_MM / cardRect.height;
  const imageElements = Array.from(card.querySelectorAll<HTMLImageElement>('img'));
  const svgElements = Array.from(card.querySelectorAll<SVGSVGElement>('svg'));

  const imageRuns = await Promise.all(imageElements.map(async (image): Promise<CardPdfAssetRun | null> => {
    const rect = image.getBoundingClientRect();
    const source = image.currentSrc || image.src;
    if (!source || !rect.width || !rect.height) return null;
    const computed = window.getComputedStyle(image);
    const parentComputed = image.parentElement ? window.getComputedStyle(image.parentElement) : null;
    const isSignature = image.alt === 'Assinatura Diretor';
    const removeWhite = isSignature
      || computed.mixBlendMode === 'multiply'
      || parentComputed?.mixBlendMode === 'multiply';

    return {
      dataUrl: await rasterizeAsset(source, rect.width, rect.height, computed.objectFit, removeWhite),
      x: Math.max(0, (rect.left - cardRect.left) * pxToMmX),
      y: Math.max(0, (rect.top - cardRect.top) * pxToMmY),
      width: rect.width * pxToMmX,
      height: rect.height * pxToMmY,
      layer: image.getAttribute('aria-hidden') === 'true'
        ? 'background'
        : isSignature
          ? 'signature'
          : 'content',
    };
  }));

  const svgRuns = await Promise.all(svgElements.map(async (svg): Promise<CardPdfAssetRun | null> => {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const source = await svgToDataUrl(svg);
    return {
      dataUrl: await rasterizeAsset(source, rect.width, rect.height, 'contain', false),
      x: Math.max(0, (rect.left - cardRect.left) * pxToMmX),
      y: Math.max(0, (rect.top - cardRect.top) * pxToMmY),
      width: rect.width * pxToMmX,
      height: rect.height * pxToMmY,
      layer: 'content',
    };
  }));

  return [...imageRuns, ...svgRuns].filter((run): run is CardPdfAssetRun => Boolean(run));
};

const addAssetRuns = (
  pdf: jsPDF,
  runs: CardPdfAssetRun[],
  layer: CardPdfAssetRun['layer'],
  offsetX = 0,
  offsetY = 0,
) => {
  runs.filter(run => run.layer === layer).forEach((run) => {
    pdf.addImage(
      run.dataUrl,
      'PNG',
      run.x + offsetX,
      run.y + offsetY,
      run.width,
      run.height,
      undefined,
      'FAST',
    );
  });
};

const addTextLayer = (
  pdf: jsPDF,
  runs: CardPdfTextRun[],
  offsetX = 0,
  offsetY = 0,
) => {
  runs.forEach((run) => {
    const rgb = run.color ? parseColorToRgb(run.color) : null;
    const bold = ['bold', '700', '800', '900', 'black'].includes(run.fontWeight || '');
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(run.fontSize);
    pdf.setTextColor(rgb?.r ?? 30, rgb?.g ?? 41, rgb?.b ?? 59);
    const lines = pdf.splitTextToSize(run.text, run.maxWidth);
    lines.forEach((line: string, index: number) => {
      pdf.text(line, run.x + offsetX, run.y + offsetY + index * run.lineHeight, {
        align: run.align,
        maxWidth: run.maxWidth,
        baseline: 'top',
      });
    });
  });
};

const drawCard = (
  pdf: jsPDF,
  card: CardPdfRenderData,
  offsetX = 0,
  offsetY = 0,
) => {
  addAssetRuns(pdf, card.assets, 'background', offsetX, offsetY);
  addAssetRuns(pdf, card.assets, 'content', offsetX, offsetY);
  addTextLayer(pdf, card.textRuns, offsetX, offsetY);
  addAssetRuns(pdf, card.assets, 'signature', offsetX, offsetY);
};

const collectStudentCardRenderData = async (containerId: string) => {
  const container = document.getElementById(containerId);
  if (!container) throw new Error('Prévia da carteirinha não encontrada.');

  const cards = Array.from(container.querySelectorAll<HTMLElement>(CARD_SELECTOR));
  if (cards.length < 2) throw new Error('Frente e verso da carteirinha não foram carregados.');
  const documentCards = cards.slice(0, 2);
  await waitForCardReadiness(documentCards);

  return Promise.all(documentCards.map(async (card): Promise<CardPdfRenderData> => {
    const [assets, textRuns] = await Promise.all([
      collectCardAssetRuns(card),
      Promise.resolve(collectCardTextRuns(card)),
    ]);
    return { assets, textRuns };
  }));
};

const drawCropMarks = (pdf: jsPDF, x: number, y: number) => {
  const markLength = 3;
  const distance = 1.5;
  const right = x + CARD_WIDTH_MM;
  const bottom = y + CARD_HEIGHT_MM;

  pdf.setDrawColor(100, 116, 139);
  pdf.setLineWidth(0.15);
  [
    [x - distance - markLength, y, x - distance, y],
    [x, y - distance - markLength, x, y - distance],
    [right + distance, y, right + distance + markLength, y],
    [right, y - distance - markLength, right, y - distance],
    [x - distance - markLength, bottom, x - distance, bottom],
    [x, bottom + distance, x, bottom + distance + markLength],
    [right + distance, bottom, right + distance + markLength, bottom],
    [right, bottom + distance, right, bottom + distance + markLength],
  ].forEach(([x1, y1, x2, y2]) => pdf.line(x1, y1, x2, y2));
};

export const createStudentCardPrintPdfBlob = async (containerId: string) => {
  const cards = await collectStudentCardRenderData(containerId);
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  // O intervalo deixa as marcas internas de corte visíveis sem afastar as
  // duas faces. O conjunto continua ocupando uma única linha da folha A4.
  const cardGap = 8;
  const groupWidth = (CARD_WIDTH_MM * 2) + cardGap;
  const startX = (pageWidth - groupWidth) / 2;
  const startY = (pageHeight - CARD_HEIGHT_MM) / 2;
  const positions = [startX, startX + CARD_WIDTH_MM + cardGap];

  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');
  cards.forEach((card, index) => {
    drawCard(pdf, card, positions[index], startY);
    drawCropMarks(pdf, positions[index], startY);
  });

  return pdf.output('blob');
};

export const downloadStudentCardPdf = async (
  containerId: string,
  studentName?: string | null,
) => {
  const cards = await collectStudentCardRenderData(containerId);

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [CARD_WIDTH_MM, CARD_HEIGHT_MM],
    compress: true,
  });

  for (const [index, card] of cards.entries()) {
    if (index > 0) pdf.addPage([CARD_WIDTH_MM, CARD_HEIGHT_MM], 'landscape');

    // O PDF não recebe uma captura da carteirinha inteira. Cada recurso
    // gráfico é posicionado separadamente e todo conteúdo textual permanece
    // vetorial, nítido e selecionável.
    drawCard(pdf, card);
  }

  pdf.save(`carteirinha-estudantil-${safeFilePart(studentName)}.pdf`);
};
