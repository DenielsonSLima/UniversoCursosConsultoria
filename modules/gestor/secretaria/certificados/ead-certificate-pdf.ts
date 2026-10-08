import type { jsPDF } from 'jspdf';
import { resolveCanonicalPdfPhoto } from '../shared/canonical-document-vector-pdf';
import { prepareEadCertificateFonts } from './ead-certificate-pdf-fonts';
import { drawEadPdfTextNode } from './ead-certificate-pdf-text';

const PAGE_SELECTOR = '[data-certificate-pdf-page="true"]';
const ASSET_TIMEOUT = 20_000;
const number = (value: string) => Number.parseFloat(value) || 0;
const color = (value: string) => {
  const parts = value.match(/[\d.]+/g)?.map(Number);
  return parts && parts.length >= 3 ? { rgb: parts.slice(0, 3), alpha: parts[3] ?? 1 } : null;
};
const imageUrl = (value: string) => /^url\(["']?(.*?)["']?\)$/.exec(value)?.[1];

async function waitForCertificate(root: HTMLElement) {
  const started = Date.now();
  while (root.querySelector('[data-render-ready="false"]') || !root.querySelector(PAGE_SELECTOR)) {
    const error = root.querySelector('[data-render-error]')?.getAttribute('data-render-error');
    if (error) throw new Error(error);
    if (Date.now() - started > ASSET_TIMEOUT) throw new Error('O certificado não ficou pronto para gerar o PDF.');
    await new Promise(resolve => window.setTimeout(resolve, 40));
  }
  const error = root.querySelector('[data-render-error]')?.getAttribute('data-render-error');
  if (error) throw new Error(error);
  await document.fonts.ready;
  await Promise.all([...root.querySelectorAll('img')].map(async image => {
    try { await image.decode(); } catch {
      throw new Error('Uma imagem obrigatória do certificado não pôde ser carregada.');
    }
    if (!image.naturalWidth) throw new Error('Uma imagem obrigatória do certificado está indisponível.');
  }));
}

async function resolveImage(source: string) {
  const original = await resolveCanonicalPdfPhoto(source);
  if (original) return original;
  // SVG is converted only as an isolated original asset; document text is never painted on a canvas.
  if (!source.startsWith('data:image/svg+xml')) {
    throw new Error('Não foi possível incorporar uma imagem original do modelo ao PDF.');
  }
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth * 2;
  canvas.height = image.naturalHeight * 2;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível preparar uma imagem do certificado.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL('image/png'), format: 'PNG' as const };
}

type PdfState = new (value: { opacity: number; 'stroke-opacity'?: number }) => unknown;
type PdfContext = {
  pdf: jsPDF; GState: PdfState; origin: ReturnType<HTMLElement['getBoundingClientRect']>; factor: number;
  images: Map<string, Awaited<ReturnType<typeof resolveImage>>>;
  fontAliases: Readonly<Record<string, string>>;
};

function state(context: PdfContext, opacity: number, paint: () => void) {
  context.pdf.saveGraphicsState();
  context.pdf.setGState(new context.GState({ opacity, 'stroke-opacity': opacity }) as never);
  paint();
  context.pdf.restoreGraphicsState();
}

function box(context: PdfContext, rect: ReturnType<HTMLElement['getBoundingClientRect']>) {
  return [(rect.x - context.origin.x) * context.factor, (rect.y - context.origin.y) * context.factor,
    rect.width * context.factor, rect.height * context.factor] as const;
}

function drawBackground(context: PdfContext, node: HTMLElement, style: ReturnType<typeof window.getComputedStyle>, opacity: number) {
  const { pdf, factor } = context;
  const [x, y, width, height] = box(context, node.getBoundingClientRect());
  const fill = color(style.backgroundColor);
  const radius = Math.min(number(style.borderTopLeftRadius) * factor, width / 2, height / 2);
  if (fill && fill.alpha > 0 && width > 0 && height > 0) state(context, opacity * fill.alpha, () => {
    pdf.setFillColor(fill.rgb[0], fill.rgb[1], fill.rgb[2]);
    if (radius) pdf.roundedRect(x, y, width, height, radius, radius, 'F');
    else pdf.rect(x, y, width, height, 'F');
  });
  const source = imageUrl(style.backgroundImage);
  if (style.backgroundImage !== 'none' && !source) {
    throw new Error('O modelo contém um fundo não compatível com a exportação vetorial.');
  }
  if (source) {
    if (style.backgroundSize !== 'cover' || style.backgroundPosition !== '50% 50%') {
      throw new Error('O posicionamento deste fundo precisa de uma geometria vetorial compatível.');
    }
    const asset = context.images.get(source);
    if (!asset) throw new Error('O fundo original do certificado não ficou disponível.');
    const properties = pdf.getImageProperties(asset.dataUrl);
    const scale = Math.max(width / properties.width, height / properties.height);
    const imageWidth = properties.width * scale;
    const imageHeight = properties.height * scale;
    state(context, opacity, () => {
      pdf.rect(x, y, width, height, null); pdf.clip(); pdf.discardPath();
      pdf.addImage(asset.dataUrl, asset.format, x + (width - imageWidth) / 2,
        y + (height - imageHeight) / 2, imageWidth, imageHeight, undefined, 'FAST');
    });
  }
  const borders = [
    [style.borderTopWidth, style.borderTopColor, x, y, x + width, y],
    [style.borderRightWidth, style.borderRightColor, x + width, y, x + width, y + height],
    [style.borderBottomWidth, style.borderBottomColor, x, y + height, x + width, y + height],
    [style.borderLeftWidth, style.borderLeftColor, x, y, x, y + height],
  ] as const;
  const uniformBorder = radius > 0 && number(borders[0][0]) > 0
    && borders.every(border => border[0] === borders[0][0] && border[1] === borders[0][1]);
  if (uniformBorder) {
    const parsed = color(borders[0][1]);
    if (parsed?.alpha) state(context, opacity * parsed.alpha, () => {
      pdf.setDrawColor(parsed.rgb[0], parsed.rgb[1], parsed.rgb[2]);
      pdf.setLineWidth(number(borders[0][0]) * factor);
      pdf.roundedRect(x, y, width, height, radius, radius, 'S');
    });
    return;
  }
  borders.forEach(([stroke, strokeColor, x1, y1, x2, y2]) => {
    const thickness = number(stroke); const parsed = color(strokeColor);
    if (!thickness || !parsed?.alpha) return;
    state(context, opacity * parsed.alpha, () => {
      pdf.setDrawColor(parsed.rgb[0], parsed.rgb[1], parsed.rgb[2]);
      pdf.setLineWidth(thickness * factor); pdf.line(x1, y1, x2, y2);
    });
  });
}

function drawImage(context: PdfContext, image: HTMLImageElement, style: ReturnType<typeof window.getComputedStyle>, opacity: number) {
  const asset = context.images.get(image.currentSrc || image.src);
  if (!asset) throw new Error('Uma imagem do certificado está indisponível.');
  let [x, y, width, height] = box(context, image.getBoundingClientRect());
  const matrix = style.transform === 'none' ? null : new window.DOMMatrixReadOnly(style.transform);
  if (matrix && (Math.abs(matrix.b) > 0.001 || Math.abs(matrix.c) > 0.001)) {
    throw new Error('A rotação desta imagem exige uma geometria vetorial compatível antes da emissão.');
  }
  if (style.objectFit === 'contain') {
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const renderedWidth = image.naturalWidth * scale;
    const renderedHeight = image.naturalHeight * scale;
    x += (width - renderedWidth) / 2; y += (height - renderedHeight) / 2;
    width = renderedWidth; height = renderedHeight;
  }
  state(context, opacity, () => {
    if (style.mixBlendMode === 'multiply') (context.pdf.internal as unknown as { write: (value: string) => void }).write('/EadMultiply gs');
    else if (style.mixBlendMode !== 'normal') throw new Error('A combinação de imagem do modelo ainda não possui suporte vetorial.');
    context.pdf.addImage(asset.dataUrl, asset.format, x, y, width, height, undefined, 'FAST');
  });
}

function paintNode(context: PdfContext, node: Node, inheritedOpacity = 1) {
  if (node.nodeType === Node.TEXT_NODE) {
    drawEadPdfTextNode(context.pdf, node as Text, context.origin, context.factor, inheritedOpacity, { fontAliases: context.fontAliases });
    return;
  }
  if (!(node instanceof HTMLElement)) {
    if (node instanceof window.SVGElement) throw new Error('O modelo contém um desenho que precisa de um recurso vetorial compatível.');
    return;
  }
  const style = window.getComputedStyle(node);
  if (style.display === 'none' || style.visibility === 'hidden') return;
  const opacity = inheritedOpacity * Number(style.opacity);
  if (!opacity) return;
  drawBackground(context, node, style, opacity);
  if (node instanceof HTMLImageElement) { drawImage(context, node, style, opacity); return; }
  const children = [...node.childNodes];
  if (node.hasAttribute('data-certificate-pdf-page')) {
    const stackingOrder = (child: Node) => child instanceof HTMLElement
      ? Number.parseInt(window.getComputedStyle(child).zIndex, 10) || 0 : 0;
    children.sort((left, right) => stackingOrder(left) - stackingOrder(right));
  }
  children.forEach(child => paintNode(context, child, opacity));
}

/**
 * Native PDF from the canonical A4 layout. DOM is measured only for placement:
 * text/table borders remain vectors, original backgrounds remain independent assets.
 * Pages and academic values are consumed from the existing backend snapshot.
 */
export async function buildEadCertificatePdf(root: HTMLElement): Promise<Blob> {
  await waitForCertificate(root);
  const pages = [...root.querySelectorAll<HTMLElement>(PAGE_SELECTOR)];
  const sources = new Set<string>();
  pages.forEach(page => [page, ...page.querySelectorAll<HTMLElement>('*')].forEach(node => {
    if (window.getComputedStyle(node).display === 'none') return;
    const background = imageUrl(window.getComputedStyle(node).backgroundImage);
    if (background) sources.add(background);
    if (node instanceof HTMLImageElement) sources.add(node.currentSrc || node.src);
  }));
  const images = new Map(await Promise.all([...sources].map(async source => [source, await resolveImage(source)] as const)));
  const { jsPDF, GState } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4',
    compress: true, putOnlyUsedFonts: true, precision: 5 });
  const fontAliases = await prepareEadCertificateFonts(pdf, root);
  pdf.setProperties({ title: 'Certificado EAD', subject: 'Certificado acadêmico', author: 'Universo Cursos e Consultoria' });
  pages.forEach((page, index) => {
    if (index) pdf.addPage('a4', 'landscape');
    const origin = page.getBoundingClientRect();
    if (origin.width <= 0 || Math.abs(origin.width / origin.height - 297 / 210) > 0.01) {
      throw new Error('O certificado não está na geometria A4 horizontal do modelo.');
    }
    paintNode({ pdf, GState: GState as unknown as PdfState, origin, factor: 297 / origin.width, images, fontAliases }, page);
  });
  // jsPDF exposes opacity but not PDF blend modes. Preserve the editor's
  // signature Multiply blend as a native ExtGState, without changing any asset.
  const { PDFDocument, PDFDict, PDFName } = await import('pdf-lib');
  const document = await PDFDocument.load(pdf.output('arraybuffer'), { updateMetadata: false });
  const multiply = document.context.register(document.context.obj({ Type: 'ExtGState', BM: 'Multiply' }));
  for (const page of document.getPages()) {
    const resources = page.node.Resources();
    if (!resources) throw new Error('Os recursos vetoriais do certificado não foram preparados.');
    let states = resources.lookupMaybe(PDFName.of('ExtGState'), PDFDict);
    if (!states) {
      states = document.context.obj({});
      resources.set(PDFName.of('ExtGState'), states);
    }
    states.set(PDFName.of('EadMultiply'), multiply);
  }
  return new Blob([new Uint8Array(await document.save()).buffer], { type: 'application/pdf' });
}

