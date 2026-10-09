import type { jsPDF } from 'jspdf';
import { cssImageUrl, type CardImage } from './assets';
import { drawCardPdfTextNode } from './text';

const numeric = (value: string) => Number.parseFloat(value) || 0;
const color = (value: string) => {
  const parts = value.match(/[\d.]+/g)?.map(Number);
  return parts && parts.length >= 3 ? { rgb: parts.slice(0, 3), alpha: parts[3] ?? 1 } : null;
};
type Box = [number, number, number, number];
interface Context {
  pdf: jsPDF;
  origin: ReturnType<HTMLElement['getBoundingClientRect']>;
  factor: number;
  cssScale: number;
  x: number;
  y: number;
  images: Map<string, CardImage>;
  svgSources: Map<SVGSVGElement, string>;
}

const box = (context: Context, node: HTMLElement | SVGSVGElement): Box => {
  const rect = node.getBoundingClientRect();
  return [context.x + (rect.left - context.origin.left) * context.factor,
    context.y + (rect.top - context.origin.top) * context.factor,
    rect.width * context.factor, rect.height * context.factor];
};
const cssLength = (context: Context, value: string) => numeric(value) * context.cssScale * context.factor;
const radius = (context: Context, style: ReturnType<typeof window.getComputedStyle>, width: number, height: number) =>
  Math.min(cssLength(context, style.borderTopLeftRadius), width / 2, height / 2);

function path(pdf: jsPDF, bounds: Box, rounding: number, operation: 'F' | 'S' | null) {
  const [x, y, width, height] = bounds;
  if (rounding) pdf.roundedRect(x, y, width, height, rounding, rounding, operation);
  else pdf.rect(x, y, width, height, operation);
}

function state(context: Context, opacity: number, paint: () => void) {
  context.pdf.saveGraphicsState();
  context.pdf.setGState(context.pdf.GState({ opacity, 'stroke-opacity': opacity }));
  paint();
  context.pdf.restoreGraphicsState();
}

function asset(context: Context, source: string, bounds: Box, fit: string, opacity: number, multiply = false) {
  const image = context.images.get(source);
  if (!image) throw new Error('Uma imagem obrigatória da carteirinha não ficou disponível.');
  const [x, y, width, height] = bounds;
  const properties = context.pdf.getImageProperties(image.dataUrl);
  const scale = fit === 'cover' ? Math.max(width / properties.width, height / properties.height)
    : Math.min(width / properties.width, height / properties.height);
  const adjusted = fit === 'contain' || fit === 'cover';
  const drawWidth = adjusted ? properties.width * scale : width;
  const drawHeight = adjusted ? properties.height * scale : height;
  state(context, opacity, () => {
    path(context.pdf, bounds, 0, null); context.pdf.clip(); context.pdf.discardPath();
    if (multiply) (context.pdf.internal as unknown as { write: (value: string) => void }).write('/CardMultiply gs');
    context.pdf.addImage(image.dataUrl, image.format, x + (width - drawWidth) / 2,
      y + (height - drawHeight) / 2, drawWidth, drawHeight, undefined, 'FAST');
  });
}

function decorations(context: Context, node: HTMLElement, style: ReturnType<typeof window.getComputedStyle>, opacity: number) {
  const bounds = box(context, node);
  const [x, y, width, height] = bounds;
  if (width <= 0 || height <= 0) return;
  const rounded = radius(context, style, width, height);
  const fill = color(style.backgroundColor);
  if (fill?.alpha) state(context, opacity * fill.alpha, () => {
    context.pdf.setFillColor(fill.rgb[0], fill.rgb[1], fill.rgb[2]);
    path(context.pdf, bounds, rounded, 'F');
  });
  const background = cssImageUrl(style.backgroundImage);
  if (background) {
    if (style.backgroundPosition !== '50% 50%' || !['cover', 'contain'].includes(style.backgroundSize)) {
      throw new Error('O posicionamento do fundo da carteirinha não possui suporte vetorial.');
    }
    asset(context, background, bounds, style.backgroundSize, opacity);
  } else if (style.backgroundImage !== 'none') {
    throw new Error('O fundo da carteirinha precisa de uma geometria vetorial compatível.');
  }
  const borders = [
    [style.borderTopWidth, style.borderTopColor, style.borderTopStyle, x, y, x + width, y],
    [style.borderRightWidth, style.borderRightColor, style.borderRightStyle, x + width, y, x + width, y + height],
    [style.borderBottomWidth, style.borderBottomColor, style.borderBottomStyle, x, y + height, x + width, y + height],
    [style.borderLeftWidth, style.borderLeftColor, style.borderLeftStyle, x, y, x, y + height],
  ] as const;
  const uniform = rounded > 0 && numeric(borders[0][0]) > 0
    && borders.every(border => border[0] === borders[0][0] && border[1] === borders[0][1] && border[2] === 'solid');
  if (uniform) {
    const stroke = color(borders[0][1]);
    if (stroke?.alpha) state(context, opacity * stroke.alpha, () => {
      context.pdf.setDrawColor(stroke.rgb[0], stroke.rgb[1], stroke.rgb[2]);
      context.pdf.setLineWidth(cssLength(context, borders[0][0]));
      path(context.pdf, bounds, rounded, 'S');
    });
    return;
  }
  borders.forEach(([size, value, styleName, x1, y1, x2, y2]) => {
    const thickness = cssLength(context, size); const stroke = color(value);
    if (!thickness || !stroke?.alpha || styleName === 'none') return;
    if (!['solid', 'dashed', 'dotted'].includes(styleName)) throw new Error('Uma borda da carteirinha possui estilo não suportado.');
    state(context, opacity * stroke.alpha, () => {
      context.pdf.setDrawColor(stroke.rgb[0], stroke.rgb[1], stroke.rgb[2]);
      context.pdf.setLineWidth(thickness);
      context.pdf.setLineDashPattern(styleName === 'solid' ? [] : [thickness * (styleName === 'dashed' ? 3 : 1), thickness * 2], 0);
      context.pdf.line(x1, y1, x2, y2);
    });
  });
}

function paint(context: Context, node: Node, inheritedOpacity = 1, inheritedMultiply = false) {
  if (node.nodeType === window.Node.TEXT_NODE) {
    const virtualOrigin = new window.DOMRect(context.origin.left - context.x / context.factor,
      context.origin.top - context.y / context.factor, context.origin.width, context.origin.height);
    drawCardPdfTextNode(context.pdf, node as Text, virtualOrigin, context.factor, inheritedOpacity, { cssScale: context.cssScale });
    return;
  }
  if (!(node instanceof window.Element)) return;
  const style = window.getComputedStyle(node);
  if (style.display === 'none' || style.visibility === 'hidden' || node.classList.contains('print:hidden')) return;
  const opacity = inheritedOpacity * Number(style.opacity);
  if (!opacity) return;
  if (!['normal', 'multiply'].includes(style.mixBlendMode)) throw new Error('Uma combinação de imagem da carteirinha não possui suporte vetorial.');
  const multiply = inheritedMultiply || style.mixBlendMode === 'multiply';
  const matrix = style.transform === 'none' ? null : new window.DOMMatrixReadOnly(style.transform);
  if (node instanceof window.SVGSVGElement) {
    const source = context.svgSources.get(node);
    if (!source) throw new Error('Um símbolo da carteirinha não ficou disponível.');
    if (matrix && (Math.abs(matrix.b) > 0.001 || Math.abs(matrix.c) > 0.001)) {
      if (Math.abs(matrix.a - matrix.d) > 0.001 || Math.abs(matrix.b + matrix.c) > 0.001) {
        throw new Error('A transformação do símbolo da carteirinha não possui suporte vetorial.');
      }
      const image = context.images.get(source);
      if (!image) throw new Error('Um símbolo da carteirinha não ficou disponível.');
      const [left, top, boundsWidth, boundsHeight] = box(context, node);
      const scale = Math.hypot(matrix.a, matrix.b) * context.cssScale * context.factor;
      const width = node.clientWidth * scale; const height = node.clientHeight * scale;
      const angle = -Math.atan2(matrix.b, matrix.a);
      const cosine = Math.cos(angle); const sine = Math.sin(angle);
      const centerX = left + boundsWidth / 2; const centerY = top + boundsHeight / 2;
      const x = centerX - (cosine * width / 2 - sine * height / 2);
      const y = centerY - height + (sine * width / 2 + cosine * height / 2);
      state(context, opacity, () => context.pdf.addImage(image.dataUrl, image.format,
        x, y, width, height, undefined, 'FAST', angle * 180 / Math.PI));
    } else asset(context, source, box(context, node), 'contain', opacity);
    return;
  }
  if (matrix && (Math.abs(matrix.b) > 0.001 || Math.abs(matrix.c) > 0.001)) {
    throw new Error('Uma rotação da carteirinha exige geometria vetorial compatível.');
  }
  if (!(node instanceof window.HTMLElement)) return;
  context.pdf.saveGraphicsState();
  decorations(context, node, style, opacity);
  if (['hidden', 'clip', 'scroll', 'auto'].includes(style.overflowX) || ['hidden', 'clip', 'scroll', 'auto'].includes(style.overflowY)) {
    const bounds = box(context, node);
    path(context.pdf, bounds, radius(context, style, bounds[2], bounds[3]), null);
    context.pdf.clip(); context.pdf.discardPath();
  }
  if (node instanceof window.HTMLImageElement) {
    if (style.objectPosition !== '50% 50%') throw new Error('O recorte configurado da foto precisa de geometria vetorial compatível.');
    asset(context, node.currentSrc || node.src, box(context, node), style.objectFit, opacity, multiply);
  } else {
    const order = (child: Node) => child instanceof window.Element ? numeric(window.getComputedStyle(child).zIndex) : 0;
    [...node.childNodes].sort((left, right) => order(left) - order(right))
      .forEach(child => paint(context, child, opacity, multiply));
  }
  context.pdf.restoreGraphicsState();
}

export function drawStudentCard(pdf: jsPDF, card: HTMLElement, x: number, y: number,
  assets: Pick<Context, 'images' | 'svgSources'>, size = { width: 85.6, height: 54 }) {
  const origin = card.getBoundingClientRect();
  const logicalWidth = numeric(window.getComputedStyle(card).width);
  if (origin.width <= 0 || logicalWidth <= 0 || Math.abs(origin.width / origin.height - size.width / size.height) > 0.01) {
    throw new Error('A carteirinha não está no tamanho CR80 configurado.');
  }
  paint({ pdf, origin, x, y, factor: size.width / origin.width, cssScale: origin.width / logicalWidth, ...assets }, card);
}
