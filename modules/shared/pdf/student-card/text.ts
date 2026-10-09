import type { jsPDF } from 'jspdf';

export interface CardPdfTextOptions {
  /** Visual scale applied to the preview; coordinates already include it. */
  cssScale?: number;
  /** CSS family to a font previously embedded with jsPDF.addFont. */
  fontAliases?: Readonly<Record<string, string>>;
}

interface TextRun {
  text: string;
  rect: { left: number; top: number; right: number; height: number };
}

const normalizeFamily = (value: string) => value.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
const coreFamilies: Readonly<Record<string, string>> = {
  serif: 'times', 'times new roman': 'times', times: 'times',
  'sans-serif': 'helvetica', arial: 'helvetica', helvetica: 'helvetica',
  monospace: 'courier', 'courier new': 'courier', courier: 'courier',
};

const resolveFont = (pdf: jsPDF, style: ReturnType<typeof window.getComputedStyle>, node: Text, options: CardPdfTextOptions) => {
  const fonts = pdf.getFontList();
  const loadedFamilies = new Set<string>();
  node.ownerDocument.fonts?.forEach(face => {
    if (face.status === 'loaded') loadedFamilies.add(normalizeFamily(face.family));
  });
  const families = style.fontFamily.split(',').map(normalizeFamily);
  let family = '';
  let weighted = false;
  const requestedWeight = String(Number.parseInt(style.fontWeight, 10) || (/bold/.test(style.fontWeight) ? 700 : 400));
  for (const candidate of families) {
    const weightedAlias = Object.entries(options.fontAliases || {})
      .find(([key]) => normalizeFamily(key) === `${candidate}:${requestedWeight}`)?.[1];
    const alias = weightedAlias || Object.entries(options.fontAliases || {})
      .find(([key]) => normalizeFamily(key) === candidate)?.[1];
    const registered = alias || Object.keys(fonts).find(key => normalizeFamily(key) === candidate);
    if (registered && fonts[registered]) { family = registered; weighted = Boolean(weightedAlias); break; }
    if (coreFamilies[candidate]) { family = coreFamilies[candidate]; break; }
    // An unavailable web font may legitimately fall back to the next CSS family.
    // An active custom font must be embedded, never silently replaced in the PDF.
    if (loadedFamilies.has(candidate)) {
      throw new Error(`A fonte “${candidate}” do cartão precisa ser incorporada ao PDF.`);
    }
  }
  if (!family) throw new Error(`A fonte “${style.fontFamily}” do cartão não possui suporte vetorial.`);
  const bold = /bold|bolder/.test(style.fontWeight) || Number.parseInt(style.fontWeight, 10) >= 600;
  const italic = /italic|oblique/.test(style.fontStyle);
  const variant = weighted ? italic ? 'italic' : 'normal'
    : bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal';
  if (!fonts[family]?.includes(variant)) {
    throw new Error(`A variação ${variant} da fonte “${family}” precisa ser incorporada ao PDF.`);
  }
  return { family, variant };
};

const transformText = (value: string, transform: string) => {
  if (transform === 'uppercase') return value.toLocaleUpperCase('pt-BR');
  if (transform === 'lowercase') return value.toLocaleLowerCase('pt-BR');
  if (transform === 'capitalize') return value.replace(/(^|\s)\S/gu, char => char.toLocaleUpperCase('pt-BR'));
  return value;
};

const collectRuns = (node: Text, style: ReturnType<typeof window.getComputedStyle>): TextRun[] => {
  const range = node.ownerDocument.createRange();
  const runs: TextRun[] = [];
  let current: TextRun | undefined;
  let offset = 0;
  const preserveWhitespace = /pre|break-spaces/.test(style.whiteSpace);
  const segments = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }).segment(node.data), item => item.segment)
    : Array.from(node.data);
  for (const character of segments) {
    range.setStart(node, offset);
    offset += character.length;
    range.setEnd(node, offset);
    const rect = Array.from(range.getClientRects()).find(box => box.width > 0 && box.height > 0);
    if (!rect || (preserveWhitespace && /^[\n\r]+$/.test(character))) continue;
    const text = /\s/u.test(character) ? ' ' : character;
    if (current && (Math.abs(rect.top - current.rect.top) > Math.max(0.5, rect.height * 0.15)
      || (text === ' ') !== current.text.endsWith(' '))) {
      runs.push(current);
      current = undefined;
    }
    if (!current) {
      current = { text, rect: { left: rect.left, top: rect.top, right: rect.right, height: rect.height } };
    } else {
      if (preserveWhitespace || text !== ' ' || !current.text.endsWith(' ')) current.text += text;
      current.rect.right = Math.max(current.rect.right, rect.right);
      current.rect.height = Math.max(current.rect.height, rect.height);
    }
  }
  if (current) runs.push(current);
  range.detach();
  return runs;
};

const parseColor = (value: string) => {
  const match = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
  if (!match) throw new Error(`A cor “${value}” do texto não possui suporte vetorial.`);
  return { rgb: [Number(match[1]), Number(match[2]), Number(match[3])] as const, alpha: Number(match[4] ?? 1) };
};

const baselineRatio = (node: Text, style: ReturnType<typeof window.getComputedStyle>) => {
  // Only font metrics are measured; no pixels or page artwork are painted.
  const context = node.ownerDocument.createElement('canvas').getContext('2d');
  if (!context) throw new Error('Não foi possível medir as fontes do cartão.');
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const metrics = context.measureText('Hg');
  const ascent = metrics.fontBoundingBoxAscent;
  const descent = metrics.fontBoundingBoxDescent;
  if (!Number.isFinite(ascent) || !Number.isFinite(descent) || ascent + descent <= 0) {
    throw new Error('O navegador não forneceu as métricas necessárias para o texto do cartão.');
  }
  return ascent / (ascent + descent);
};

const assertSupportedCharacters = (text: string, coreFont: boolean) => {
  // The PDF standard fonts use WinAnsi, including Portuguese, en/em dashes and curly quotes.
  if (coreFont && Array.from(text).some(char => {
    const point = char.codePointAt(0) || 0;
    return point > 255 && !/[ŒœŠšŸŽžƒˆ˜–—‘’‚“”„†‡•…‰‹›€™]/u.test(char);
  })) throw new Error('Um caractere do cartão exige uma fonte Unicode incorporada ao PDF.');
};

/**
 * Paint a preview text node in DFS painting order as native, selectable PDF text.
 * Range supplies existing line geometry; this does not calculate academic data,
 * reflow content, add pages, capture screenshots or alter the rendered preview.
 */
export const drawCardPdfTextNode = (
  pdf: jsPDF,
  node: Text,
  pageRect: ReturnType<HTMLElement['getBoundingClientRect']>,
  pxToMm: number,
  opacity = 1,
  options: CardPdfTextOptions = {},
): number => {
  const parent = node.parentElement;
  if (!parent || !node.data || opacity <= 0) return 0;
  const style = window.getComputedStyle(parent);
  if (style.visibility !== 'visible' || style.display === 'none') return 0;
  if (style.writingMode !== 'horizontal-tb' || style.direction !== 'ltr') {
    throw new Error('A direção do texto configurado ainda não possui suporte vetorial.');
  }
  const runs = collectRuns(node, style);
  if (!runs.length) return 0;
  const { family, variant } = resolveFont(pdf, style, node, options);
  const color = parseColor(style.color);
  const cssScale = options.cssScale ?? 1;
  const fontSize = Number.parseFloat(style.fontSize) * cssScale * pxToMm * 72 / 25.4;
  const ratio = baselineRatio(node, style);
  const letterSpacing = (Number.parseFloat(style.letterSpacing) || 0) * cssScale * pxToMm;
  pdf.saveGraphicsState();
  pdf.setGState(pdf.GState({ opacity: Math.max(0, Math.min(1, opacity * color.alpha)) }));
  pdf.setFont(family, variant);
  pdf.setFontSize(fontSize);
  pdf.setTextColor(...color.rgb);
  for (const run of runs) {
    const text = transformText(run.text, style.textTransform);
    if (!text) continue;
    const isCoreFont = ['times', 'helvetica', 'courier'].includes(family);
    assertSupportedCharacters(text, isCoreFont);
    const metadata = pdf.getFont().metadata as { characterToGlyph?: (point: number) => number };
    if (!isCoreFont && Array.from(text).some(character => {
      const point = character.codePointAt(0) || 0;
      return !/\s/u.test(character) && metadata.characterToGlyph?.(point) === 0;
    })) throw new Error('Um caractere do cartão não existe na fonte incorporada.');
    const naturalWidth = pdf.getTextWidth(text) + Math.max(0, Array.from(text).length - 1) * letterSpacing;
    const targetWidth = (run.rect.right - run.rect.left) * pxToMm;
    const horizontalScale = naturalWidth > 0 ? targetWidth / naturalWidth : 1;
    if (!Number.isFinite(horizontalScale) || horizontalScale <= 0) {
      throw new Error('Não foi possível preservar a largura do texto configurado no cartão.');
    }
    const x = (run.rect.left - pageRect.left) * pxToMm;
    const y = (run.rect.top - pageRect.top + run.rect.height * ratio) * pxToMm;
    pdf.text(text, x, y, {
      baseline: 'alphabetic', horizontalScale, charSpace: letterSpacing,
      flags: { noBOM: false, autoencode: true },
    });
    const decoration = style.textDecorationLine;
    if (decoration.includes('underline') || decoration.includes('line-through')) {
      pdf.setDrawColor(...color.rgb);
      pdf.setLineWidth(Math.max(0.1, fontSize / 24 * 25.4 / 72));
      const lineY = decoration.includes('line-through') ? y - fontSize * 0.3 * 25.4 / 72 : y + fontSize * 0.1 * 25.4 / 72;
      pdf.line(x, lineY, x + targetWidth, lineY);
    }
  }
  pdf.restoreGraphicsState();
  return runs.length;
};
