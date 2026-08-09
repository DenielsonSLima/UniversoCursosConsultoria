/* global ChildNode, CSSStyleDeclaration, DOMRect, HTMLCanvasElement */

/**
 * @deprecated Ponte legada: rasteriza a arte da página antes de acrescentar
 * texto PDF. Não usar em novos fluxos. Texto selecionável sobre screenshot não
 * atende ao contrato vetorial do projeto; consumidores existentes devem migrar
 * para compositores nativos com imagens somente como recursos isolados.
 */

import type { jsPDF } from 'jspdf';

export type PdfPageOrientation = 'portrait' | 'landscape';
export type PdfArtworkFormat = 'PNG' | 'JPEG';
export type PdfTextLayerMode = 'replace-artwork-text' | 'preserve-artwork-text';

export interface SelectablePdfPageOptions {
  orientation?: PdfPageOrientation;
  artworkScale?: number;
  artworkFormat?: PdfArtworkFormat;
  artworkQuality?: number;
  backgroundColor?: string;
  /**
   * `replace-artwork-text` removes compatible text from the captured artwork
   * and redraws it visibly with jsPDF. `preserve-artwork-text` keeps the exact
   * browser rendering in the artwork and adds an invisible PDF text layer for
   * selection, search and copy.
   */
  textLayerMode?: PdfTextLayerMode;
  prepareClone?: (clonedDocument: Document, clonedElement: HTMLElement) => void;
}

export interface SelectablePdfDocumentOptions extends SelectablePdfPageOptions {
  title?: string;
  subject?: string;
  author?: string;
  creator?: string;
  onProgress?: (current: number, total: number) => void;
}

export interface SelectablePdfContinuousOptions extends SelectablePdfDocumentOptions {
  marginTopMm?: number;
  marginRightMm?: number;
  marginBottomMm?: number;
  marginLeftMm?: number;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

interface TextRun {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontStyle: string;
  fontWeight: string;
  color: RgbColor;
  opacity: number;
  textTransform: string;
}

interface TextLayerPlan {
  runs: TextRun[];
  vectorTextNodes: Text[];
}

interface DrawTextOptions {
  scaleX: number;
  scaleY: number;
  offsetXmm?: number;
  offsetYmm?: number;
  clipTopPx?: number;
  clipBottomPx?: number;
  invisible?: boolean;
}

export interface SelectablePdfBuilder {
  readonly pageCount: number;
  addPage: (page: HTMLElement, options?: SelectablePdfPageOptions) => Promise<void>;
  outputBlob: () => Blob;
}

interface LoadedPdfDependencies {
  JsPdf: typeof import('jspdf').jsPDF;
  html2canvas: typeof import('html2canvas').default;
}

const A4 = {
  portrait: { width: 210, height: 297 },
  landscape: { width: 297, height: 210 },
} as const;

const DEFAULT_ARTWORK_SCALE = 2;
const DEFAULT_BACKGROUND_COLOR = '#ffffff';
const ASSET_TIMEOUT_MS = 15_000;
const TEXT_MARKER_LAYOUT_TOLERANCE_PX = 2;

let dependenciesPromise: Promise<LoadedPdfDependencies> | null = null;

const loadPdfDependencies = () => {
  if (!dependenciesPromise) {
    dependenciesPromise = Promise.all([
      import('jspdf'),
      import('html2canvas'),
    ]).then(([jspdfModule, html2canvasModule]) => ({
      JsPdf: jspdfModule.jsPDF,
      html2canvas: html2canvasModule.default,
    }));
  }
  return dependenciesPromise;
};

const waitWithin = <T>(
  promise: Promise<T>,
  errorMessage: string,
  timeoutMs = ASSET_TIMEOUT_MS,
) => new Promise<T>((resolve, reject) => {
  const timeoutId = window.setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  promise.then(
    (value) => {
      window.clearTimeout(timeoutId);
      resolve(value);
    },
    () => {
      window.clearTimeout(timeoutId);
      reject(new Error(errorMessage));
    },
  );
});

const getCssImageUrls = (element: HTMLElement) => {
  const urls = new Set<string>();
  const elements = [element, ...Array.from(element.querySelectorAll<HTMLElement>('*'))];
  const collectUrls = (style: ReturnType<typeof window.getComputedStyle>) => {
    const values = [
      style.backgroundImage,
      style.borderImageSource,
      style.listStyleImage,
      style.maskImage,
      style.webkitMaskImage,
    ];
    values.forEach((value) => {
      for (const match of value.matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^)]*?))\s*\)/gi)) {
        const source = (match[1] ?? match[2] ?? match[3] ?? '').trim();
        if (source) urls.add(new URL(source, document.baseURI).href);
      }
    });
  };

  elements.forEach((current) => {
    collectUrls(window.getComputedStyle(current));
    collectUrls(window.getComputedStyle(current, '::before'));
    collectUrls(window.getComputedStyle(current, '::after'));
  });
  return [...urls];
};

const waitForCssImage = async (source: string) => {
  const image = new Image();
  const sourceUrl = new URL(source, document.baseURI);
  if (sourceUrl.protocol === 'http:' || sourceUrl.protocol === 'https:') {
    if (sourceUrl.origin !== window.location.origin) image.crossOrigin = 'anonymous';
  }
  const loaded = new Promise<void>((resolve, reject) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => reject(new Error()), { once: true });
  });
  image.src = sourceUrl.href;
  await waitWithin(loaded, 'Uma imagem de fundo obrigatória do documento não pôde ser carregada.');
  if (typeof image.decode === 'function') {
    try {
      await waitWithin(
        image.decode(),
        'Uma imagem de fundo obrigatória do documento não pôde ser decodificada.',
      );
    } catch (error) {
      // Safari/WebKit pode rejeitar decode() mesmo depois de concluir a imagem.
      // Dimensões naturais válidas comprovam que o canvas consegue consumi-la.
      if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) throw error;
    }
  }
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    throw new Error('Uma imagem de fundo obrigatória do documento não pôde ser carregada.');
  }
};

const waitForPdfFonts = async (element: HTMLElement) => {
  if (!document.fonts) return;
  await waitWithin(
    document.fonts.ready,
    'As fontes do documento não ficaram prontas para a exportação.',
  );

  const fontRequests = new Set<string>();
  [element, ...Array.from(element.querySelectorAll<HTMLElement>('*'))].forEach((current) => {
    if (!current.textContent?.trim()) return;
    const style = window.getComputedStyle(current);
    fontRequests.add(`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`);
  });
  // `document.fonts.ready` já aguarda as faces efetivamente usadas. Alguns
  // WebViews rejeitam FontFaceSet.load() para pilhas com system-ui, embora o
  // fallback calculado esteja pronto e visível. O aquecimento abaixo é, por
  // isso, deliberadamente best effort.
  await Promise.all([...fontRequests].map(async (font) => {
    try {
      await waitWithin(
        document.fonts.load(font, 'Universo 0123456789'),
        'Uma fonte obrigatória do documento não pôde ser carregada.',
      );
    } catch {
      // A fonte calculada/fallback já foi estabilizada por document.fonts.ready.
    }
  }));
};

export const waitForSelectablePdfAssets = async (element: HTMLElement) => {
  const images = Array.from(element.querySelectorAll<HTMLImageElement>('img'));
  await Promise.all(images.map(async (image) => {
    if (!image.complete) {
      await waitWithin(new Promise<void>((resolve, reject) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => reject(new Error()), { once: true });
      }), 'Uma imagem obrigatória do documento não pôde ser carregada.');
    }
    if (typeof image.decode === 'function') {
      try {
        await waitWithin(
          image.decode(),
          'Uma imagem obrigatória do documento não pôde ser decodificada.',
        );
      } catch (error) {
        // WebKit pode rejeitar decode() para data URLs ou imagens já exibidas.
        if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) throw error;
      }
    }
    if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      throw new Error('Uma imagem obrigatória do documento não pôde ser carregada.');
    }
  }));

  await Promise.all(getCssImageUrls(element).map(waitForCssImage));
  await waitForPdfFonts(element);
};

interface OriginalTextMarker {
  textNode: Text;
  wrapper: HTMLElement;
  beforeRect: DOMRect;
}

const installOriginalTextMarkers = (textNodes: Text[]) => {
  const markers: OriginalTextMarker[] = [];
  textNodes.forEach((textNode, index) => {
    const parent = textNode.parentNode;
    if (!parent) return;
    const beforeRange = textNode.ownerDocument.createRange();
    beforeRange.selectNodeContents(textNode);
    const beforeRect = beforeRange.getBoundingClientRect();
    beforeRange.detach();

    const wrapper = textNode.ownerDocument.createElement('span');
    wrapper.dataset.pdfVectorTextId = `${index}`;
    wrapper.style.setProperty('display', 'contents', 'important');
    parent.insertBefore(wrapper, textNode);
    wrapper.appendChild(textNode);
    markers.push({ textNode, wrapper, beforeRect });
  });

  const shiftedMarker = markers.find(({ textNode, beforeRect }) => {
    const afterRange = textNode.ownerDocument.createRange();
    afterRange.selectNodeContents(textNode);
    const afterRect = afterRange.getBoundingClientRect();
    afterRange.detach();
    return Math.abs(beforeRect.left - afterRect.left) > TEXT_MARKER_LAYOUT_TOLERANCE_PX
      || Math.abs(beforeRect.top - afterRect.top) > TEXT_MARKER_LAYOUT_TOLERANCE_PX
      || Math.abs(beforeRect.width - afterRect.width) > TEXT_MARKER_LAYOUT_TOLERANCE_PX
      || Math.abs(beforeRect.height - afterRect.height) > TEXT_MARKER_LAYOUT_TOLERANCE_PX;
  });

  if (shiftedMarker) {
    markers.reverse().forEach(({ textNode, wrapper }) => wrapper.replaceWith(textNode));
    throw new Error('A preparação da camada de texto alterou o layout do documento.');
  }
  return markers;
};

const hideMarkedCloneText = (clonedElement: HTMLElement) => {
  clonedElement.querySelectorAll<HTMLElement>('[data-pdf-vector-text-id]').forEach((wrapper) => {
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.style.setProperty('display', 'contents', 'important');
    wrapper.style.setProperty('color', 'transparent', 'important');
    wrapper.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
    wrapper.style.setProperty('text-shadow', 'none', 'important');
  });
};

const captureArtwork = async (
  element: HTMLElement,
  dependencies: LoadedPdfDependencies,
  options: SelectablePdfPageOptions,
  vectorTextNodes: Text[],
) => {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    throw new Error('A página do PDF não possui dimensões visíveis.');
  }
  const artworkScale = options.artworkScale ?? DEFAULT_ARTWORK_SCALE;
  if (!Number.isFinite(artworkScale) || artworkScale < 1 || artworkScale > 3) {
    throw new Error('A escala da arte do PDF deve estar entre 1 e 3.');
  }
  if (
    options.artworkQuality !== undefined
    && (!Number.isFinite(options.artworkQuality)
      || options.artworkQuality <= 0
      || options.artworkQuality > 1)
  ) {
    throw new Error('A qualidade JPEG do PDF deve estar entre 0 e 1.');
  }

  const textLayerMode = options.textLayerMode ?? 'replace-artwork-text';
  // In fidelity mode the browser-rendered text remains in the artwork, so no
  // clone marker is needed. Avoiding hundreds of temporary display:contents
  // wrappers is especially important for Safari/WebKit reliability.
  const markers = textLayerMode === 'replace-artwork-text'
    ? installOriginalTextMarkers(vectorTextNodes)
    : [];
  try {
    return await dependencies.html2canvas(element, {
      scale: artworkScale,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: options.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      windowWidth: Math.max(
        document.documentElement.clientWidth,
        window.innerWidth,
        Math.ceil(rect.width),
      ),
      windowHeight: Math.max(
        document.documentElement.clientHeight,
        window.innerHeight,
        Math.ceil(rect.height),
      ),
      onclone: (clonedDocument, clonedElement) => {
        if (textLayerMode === 'replace-artwork-text') {
          hideMarkedCloneText(clonedElement);
        }
        options.prepareClone?.(clonedDocument, clonedElement);
      },
    });
  } finally {
    markers.reverse().forEach(({ textNode, wrapper }) => wrapper.replaceWith(textNode));
  }
};

const parseCssColor = (value: string): RgbColor | null => {
  const match = value.match(
    /^rgba?\(\s*([\d.]+)(?:\s+|\s*,\s*)([\d.]+)(?:\s+|\s*,\s*)([\d.]+)(?:\s*(?:\/|,)\s*([\d.]+%?))?\s*\)$/i,
  );
  if (!match) return null;
  const alphaValue = match[4];
  const alpha = alphaValue
    ? alphaValue.endsWith('%')
      ? Number.parseFloat(alphaValue) / 100
      : Number.parseFloat(alphaValue)
    : 1;
  return {
    r: Math.max(0, Math.min(255, Math.round(Number.parseFloat(match[1])))),
    g: Math.max(0, Math.min(255, Math.round(Number.parseFloat(match[2])))),
    b: Math.max(0, Math.min(255, Math.round(Number.parseFloat(match[3])))),
    alpha: Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1,
  };
};

const intersectRects = (first: DOMRect, second: DOMRect) => {
  const left = Math.max(first.left, second.left);
  const top = Math.max(first.top, second.top);
  const right = Math.min(first.right, second.right);
  const bottom = Math.min(first.bottom, second.bottom);
  return new DOMRect(
    left,
    top,
    Math.max(0, right - left),
    Math.max(0, bottom - top),
  );
};

const getVisibleClipRect = (element: HTMLElement, root: HTMLElement) => {
  let clipRect = root.getBoundingClientRect();
  let current: HTMLElement | null = element;
  while (current && current !== root) {
    const style = window.getComputedStyle(current);
    const clipsX = style.overflowX === 'hidden' || style.overflowX === 'clip';
    const clipsY = style.overflowY === 'hidden' || style.overflowY === 'clip';
    if (clipsX || clipsY) {
      const rect = current.getBoundingClientRect();
      clipRect = new DOMRect(
        clipsX ? Math.max(clipRect.left, rect.left) : clipRect.left,
        clipsY ? Math.max(clipRect.top, rect.top) : clipRect.top,
        clipsX
          ? Math.max(0, Math.min(clipRect.right, rect.right) - Math.max(clipRect.left, rect.left))
          : clipRect.width,
        clipsY
          ? Math.max(0, Math.min(clipRect.bottom, rect.bottom) - Math.max(clipRect.top, rect.top))
          : clipRect.height,
      );
    }
    current = current.parentElement;
  }
  return intersectRects(clipRect, root.getBoundingClientRect());
};

const getCumulativeOpacity = (element: HTMLElement, root: HTMLElement) => {
  let opacity = 1;
  let current: HTMLElement | null = element;
  while (current) {
    const value = Number.parseFloat(window.getComputedStyle(current).opacity);
    if (Number.isFinite(value)) opacity *= value;
    if (current === root) break;
    current = current.parentElement;
  }
  return Math.max(0, Math.min(1, opacity));
};

const isFullyVisuallyClipped = (style: CSSStyleDeclaration) => {
  const normalizedLegacyClip = (style.clip || '').replace(/\s+/g, '').toLowerCase();
  const hasZeroLegacyClip = /^rect\(0(?:px)?,0(?:px)?,0(?:px)?,0(?:px)?\)$/.test(
    normalizedLegacyClip,
  );
  const normalizedClipPath = (style.clipPath || '').replace(/\s+/g, '').toLowerCase();
  const hasFullInsetClip = normalizedClipPath === 'inset(50%)'
    || normalizedClipPath === 'inset(50%50%50%50%)';
  return hasZeroLegacyClip || hasFullInsetClip;
};

const isElementVisible = (element: HTMLElement, root: HTMLElement) => {
  let current: HTMLElement | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    if (
      style.display === 'none'
      || style.visibility === 'hidden'
      || style.visibility === 'collapse'
      || Number.parseFloat(style.opacity) === 0
      // Conteúdo de acessibilidade (`sr-only`) fica em uma caixa 1x1 totalmente
      // recortada e não pertence à arte visível nem à camada textual do PDF.
      || isFullyVisuallyClipped(style)
    ) return false;
    if (current === root) break;
    current = current.parentElement;
  }
  return true;
};

const isInlineLayoutSibling = (node: ChildNode | null) => {
  if (!node) return false;
  if (node.nodeType === Node.TEXT_NODE) return Boolean(node.textContent?.trim());
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const element = node as HTMLElement;
  const display = window.getComputedStyle(element).display;
  return display === 'contents' || display.startsWith('inline');
};

const isSemanticInlineWhitespace = (textNode: Text) => (
  !textNode.data.trim()
  && isInlineLayoutSibling(textNode.previousSibling)
  && isInlineLayoutSibling(textNode.nextSibling)
);

const assertNoClippedText = (root: HTMLElement) => {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = root.ownerDocument.createRange();

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    const parent = textNode.parentElement;
    if (
      !parent
      || !textNode.data
      || (!textNode.data.trim() && !isSemanticInlineWhitespace(textNode))
    ) continue;
    if (parent.closest('script, style, noscript, svg, [data-pdf-raster-text="true"]')) continue;
    if (!isElementVisible(parent, root)) continue;

    range.selectNodeContents(textNode);
    const textRects = Array.from(range.getClientRects());
    let current: HTMLElement | null = parent;
    while (current) {
      const style = window.getComputedStyle(current);
      const clipsX = style.overflowX === 'hidden' || style.overflowX === 'clip';
      const clipsY = style.overflowY === 'hidden' || style.overflowY === 'clip';
      if (clipsX || clipsY) {
        const clipRect = current.getBoundingClientRect();
        const clipped = textRects.some((textRect) => (
          (clipsX && (textRect.left < clipRect.left - 1 || textRect.right > clipRect.right + 1))
          || (clipsY && (textRect.top < clipRect.top - 1 || textRect.bottom > clipRect.bottom + 1))
        ));
        if (clipped) {
          const allowsIntentionalClipping = current.dataset.pdfAllowClippedText === 'true'
            || style.textOverflow === 'ellipsis';
          if (allowsIntentionalClipping) {
            if (current === root) break;
            current = current.parentElement;
            continue;
          }
          range.detach();
          throw new Error('Um campo de texto ultrapassa sua área segura e seria cortado no PDF.');
        }
      }
      if (current === root) break;
      current = current.parentElement;
    }
  }

  range.detach();
};

const rectIsVisible = (rect: DOMRect, clipRect: DOMRect) => (
  rect.width > 0
  && rect.height > 0
  && rect.right > clipRect.left
  && rect.left < clipRect.right
  && rect.bottom > clipRect.top
  && rect.top < clipRect.bottom
);

const hasUnsupportedTextRendering = (element: HTMLElement, root: HTMLElement) => {
  let current: HTMLElement | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    const transform = style.transform;
    if (transform && transform !== 'none') {
      try {
        const matrix = new window.DOMMatrix(transform);
        const onlyTranslation = Math.abs(matrix.a - 1) < 0.001
          && Math.abs(matrix.d - 1) < 0.001
          && Math.abs(matrix.b) < 0.001
          && Math.abs(matrix.c) < 0.001;
        if (!onlyTranslation) return true;
      } catch {
        return true;
      }
    }
    if (
      style.writingMode !== 'horizontal-tb'
      || style.textShadow !== 'none'
      || style.webkitTextStrokeWidth && style.webkitTextStrokeWidth !== '0px'
    ) return true;
    if (current === root) break;
    current = current.parentElement;
  }
  return false;
};

const transformText = (text: string, transform: string) => {
  const normalized = text
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2010\u2011\u2012\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/gi, '"')
    .replace(/\u2022/g, '\u00b7');
  if (transform === 'uppercase') return normalized.toLocaleUpperCase('pt-BR');
  if (transform === 'lowercase') return normalized.toLocaleLowerCase('pt-BR');
  if (transform === 'capitalize') {
    return normalized.replace(/(^|\s)\S/g, (character) => character.toLocaleUpperCase('pt-BR'));
  }
  return normalized;
};

const hasOnlyStandardPdfCharacters = (text: string) => (
  Array.from(text).every((character) => (character.codePointAt(0) ?? 0) <= 0xff)
);

const runsShareLine = (first: TextRun, second: TextRun) => (
  Math.abs(first.y - second.y) <= Math.max(1, Math.min(first.height, second.height) * 0.25)
);

/**
 * PDF extractors commonly discard a text object made only of whitespace. The
 * browser, however, often represents the separator between adjacent inline
 * elements as its own whitespace-only text node. Fold that separator into a
 * neighbouring visible run so copy/search retains the same words and spaces
 * shown in the artwork.
 */
const mergeStandaloneWhitespaceRuns = (runs: TextRun[]) => {
  const merged: TextRun[] = [];
  let pendingWhitespace: TextRun | null = null;

  runs.forEach((run) => {
    if (!run.text.trim()) {
      const previous = merged.at(-1);
      if (previous && runsShareLine(previous, run)) {
        if (!previous.text.endsWith(' ')) previous.text += ' ';
        previous.width = Math.max(previous.width, run.x + run.width - previous.x);
      } else {
        pendingWhitespace = run;
      }
      return;
    }

    if (pendingWhitespace && runsShareLine(pendingWhitespace, run)) {
      const originalRight = run.x + run.width;
      run.text = run.text.startsWith(' ') ? run.text : ` ${run.text}`;
      run.x = Math.min(run.x, pendingWhitespace.x);
      run.width = Math.max(run.width, originalRight - run.x);
    }
    pendingWhitespace = null;
    merged.push(run);
  });

  return merged;
};

const collectTextLayerPlan = (root: HTMLElement): TextLayerPlan => {
  const rootRect = root.getBoundingClientRect();
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const runs: TextRun[] = [];
  const vectorTextNodes: Text[] = [];
  const range = root.ownerDocument.createRange();

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    const parent = textNode.parentElement;
    // Only separators between adjacent inline siblings are relevant. Ignoring
    // indentation between block elements also avoids expensive, empty range
    // measurements in WebKit/Safari.
    if (
      !parent
      || !textNode.data
      || (!textNode.data.trim() && !isSemanticInlineWhitespace(textNode))
    ) continue;
    if (parent.closest('script, style, noscript, svg, [data-pdf-raster-text="true"]')) continue;
    if (!isElementVisible(parent, root)) continue;
    if (hasUnsupportedTextRendering(parent, root)) continue;

    const style = window.getComputedStyle(parent);
    const color = parseCssColor(style.color);
    const fontSize = Number.parseFloat(style.fontSize);
    const opacity = getCumulativeOpacity(parent, root) * (color?.alpha ?? 1);
    if (!color || !Number.isFinite(fontSize) || fontSize <= 0 || opacity <= 0.001) continue;

    const clipRect = getVisibleClipRect(parent, root);
    const firstRunIndex = runs.length;
    let currentRun: TextRun | null = null;
    let sourceOffset = 0;

    for (const character of Array.from(textNode.data)) {
      const nextOffset = sourceOffset + character.length;
      range.setStart(textNode, sourceOffset);
      range.setEnd(textNode, nextOffset);
      sourceOffset = nextOffset;
      const rect = Array.from(range.getClientRects()).find((candidate) => (
        rectIsVisible(candidate, clipRect)
      ));
      if (!rect) continue;

      const normalizedCharacter = /\s/.test(character) ? ' ' : character;
      // Safari reports kerning rectangles that can overlap the previous glyph.
      // Horizontal overlap is therefore not evidence of a new line; the
      // vertical coordinate is the stable cross-browser line boundary.
      const startsNewLine = currentRun !== null
        && Math.abs((rect.top - rootRect.top) - currentRun.y) > Math.max(1, rect.height * 0.25);

      if (startsNewLine) {
        if (currentRun?.text) runs.push(currentRun);
        currentRun = null;
      }

      if (!currentRun) {
        currentRun = {
          text: normalizedCharacter,
          x: rect.left - rootRect.left,
          y: rect.top - rootRect.top,
          width: rect.width,
          height: rect.height,
          fontSize,
          fontFamily: style.fontFamily,
          fontStyle: style.fontStyle,
          fontWeight: style.fontWeight,
          color,
          opacity,
          textTransform: style.textTransform,
        };
        continue;
      }

      if (normalizedCharacter === ' ' && currentRun.text.endsWith(' ')) continue;
      currentRun.text += normalizedCharacter;
      currentRun.width = Math.max(currentRun.width, rect.right - rootRect.left - currentRun.x);
      currentRun.height = Math.max(currentRun.height, rect.height);
    }

    if (currentRun?.text) runs.push(currentRun);
    const plannedRuns = runs.slice(firstRunIndex);
    const renderedText = plannedRuns
      .map((run) => transformText(run.text, run.textTransform))
      .join('');
    if (plannedRuns.length > 0 && hasOnlyStandardPdfCharacters(renderedText)) {
      vectorTextNodes.push(textNode);
    } else if (plannedRuns.length > 0) {
      runs.splice(firstRunIndex);
    }
  }

  range.detach();
  return { runs: mergeStandaloneWhitespaceRuns(runs), vectorTextNodes };
};

const resolvePdfFont = (run: TextRun) => {
  const family = run.fontFamily.toLowerCase();
  const fontName = family.includes('mono') || family.includes('courier')
    ? 'courier'
    : family.includes('serif') && !family.includes('sans-serif')
      ? 'times'
      : 'helvetica';
  const numericWeight = Number.parseInt(run.fontWeight, 10);
  const bold = run.fontWeight === 'bold'
    || run.fontWeight === 'bolder'
    || (Number.isFinite(numericWeight) && numericWeight >= 600);
  const italic = run.fontStyle === 'italic' || run.fontStyle === 'oblique';
  const fontStyle = bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal';
  return { fontName, fontStyle };
};

const mergeAdjacentSemanticRuns = (runs: TextRun[]) => {
  const merged: TextRun[] = [];

  runs.forEach((run) => {
    const previous = merged.at(-1);
    const hasExplicitSeparator = previous?.text.endsWith(' ') || run.text.startsWith(' ');
    const isNearby = previous
      && run.x <= previous.x + previous.width + Math.max(24, run.fontSize * 1.5);

    if (previous && hasExplicitSeparator && isNearby && runsShareLine(previous, run)) {
      const separator = previous.text.endsWith(' ') && run.text.startsWith(' ')
        ? run.text.slice(1)
        : run.text;
      previous.text += separator;
      previous.width = Math.max(previous.width, run.x + run.width - previous.x);
      previous.height = Math.max(previous.height, run.height);
      return;
    }

    merged.push({ ...run });
  });

  return merged;
};

const drawTextRuns = (
  pdf: jsPDF,
  runs: TextRun[],
  options: DrawTextOptions,
) => {
  const offsetXmm = options.offsetXmm ?? 0;
  const offsetYmm = options.offsetYmm ?? 0;
  const clipTopPx = options.clipTopPx ?? 0;
  const clipBottomPx = options.clipBottomPx ?? Number.POSITIVE_INFINITY;

  const drawableRuns = options.invisible ? mergeAdjacentSemanticRuns(runs) : runs;
  drawableRuns.forEach((run) => {
    const runMiddle = run.y + run.height / 2;
    if (runMiddle < clipTopPx || runMiddle >= clipBottomPx) return;
    const text = transformText(run.text, run.textTransform);
    if (!text || (!options.invisible && !text.trim())) return;

    const { fontName, fontStyle } = resolvePdfFont(run);
    const fontSizePt = run.fontSize * options.scaleY * (72 / 25.4);
    if (!Number.isFinite(fontSizePt) || fontSizePt <= 0) return;

    pdf.setFont(fontName, fontStyle);
    pdf.setFontSize(fontSizePt);
    pdf.setTextColor(run.color.r, run.color.g, run.color.b);

    const targetWidthMm = run.width * options.scaleX;
    const naturalWidthMm = pdf.getTextWidth(text);
    const horizontalScale = naturalWidthMm > 0
      ? Math.max(0.5, Math.min(2, targetWidthMm / naturalWidthMm))
      : 1;
    const x = offsetXmm + run.x * options.scaleX;
    const y = offsetYmm + (run.y - clipTopPx) * options.scaleY;
    const opacity = Math.max(0, Math.min(1, run.opacity));

    if (opacity < 0.999) {
      pdf.saveGraphicsState();
      pdf.setGState(pdf.GState({ opacity }));
    }
    pdf.text(text, x, y, {
      baseline: 'top',
      // The invisible layer exists for semantics, not visual alignment. Keeping
      // its natural width prevents PDF readers from collapsing small spaces
      // after aggressive horizontal compression. The visible legacy mode still
      // uses the measured scale to preserve its existing layout contract.
      horizontalScale: options.invisible ? 1 : horizontalScale,
      renderingMode: options.invisible ? 'invisible' : 'fill',
      flags: { noBOM: false, autoencode: true },
    });
    if (opacity < 0.999) pdf.restoreGraphicsState();
  });
};

const addArtworkToPage = (
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  widthMm: number,
  heightMm: number,
  options: SelectablePdfPageOptions,
  xMm = 0,
  yMm = 0,
) => {
  const format = options.artworkFormat ?? 'PNG';
  if (format === 'JPEG') {
    const dataUrl = canvas.toDataURL('image/jpeg', options.artworkQuality ?? 0.98);
    pdf.addImage(dataUrl, 'JPEG', xMm, yMm, widthMm, heightMm, undefined, 'FAST');
    return;
  }
  pdf.addImage(canvas, 'PNG', xMm, yMm, widthMm, heightMm, undefined, 'FAST');
};

const applyDocumentProperties = (pdf: jsPDF, options: SelectablePdfDocumentOptions) => {
  pdf.setProperties({
    title: options.title,
    subject: options.subject,
    author: options.author ?? 'Universo Cursos e Consultoria',
    creator: options.creator ?? 'Universo Cursos e Consultoria',
  });
};

const createPdf = (
  dependencies: LoadedPdfDependencies,
  orientation: PdfPageOrientation,
  options: SelectablePdfDocumentOptions,
) => {
  const pdf = new dependencies.JsPdf({
    orientation,
    unit: 'mm',
    format: 'a4',
    compress: true,
    putOnlyUsedFonts: true,
    precision: 4,
  });
  applyDocumentProperties(pdf, options);
  return pdf;
};

class BrowserSelectablePdfBuilder implements SelectablePdfBuilder {
  private pdf: jsPDF | null = null;

  private addedPages = 0;

  constructor(
    private readonly dependencies: LoadedPdfDependencies,
    private readonly documentOptions: SelectablePdfDocumentOptions,
  ) {}

  get pageCount() {
    return this.addedPages;
  }

  async addPage(page: HTMLElement, pageOptions: SelectablePdfPageOptions = {}) {
    await waitForSelectablePdfAssets(page);
    assertNoClippedText(page);
    const pageRect = page.getBoundingClientRect();
    const orientation = pageOptions.orientation
      ?? this.documentOptions.orientation
      ?? (pageRect.width >= pageRect.height ? 'landscape' : 'portrait');
    const resolvedOptions = { ...this.documentOptions, ...pageOptions, orientation };
    const pageSize = A4[orientation];
    const actualRatio = pageRect.width / pageRect.height;
    const expectedRatio = pageSize.width / pageSize.height;
    if (Math.abs(actualRatio / expectedRatio - 1) > 0.02) {
      throw new Error('A página não possui proporção A4 e seria distorcida na exportação.');
    }
    if (page.scrollWidth > page.clientWidth + 2 || page.scrollHeight > page.clientHeight + 2) {
      throw new Error('A página excede a área segura e teria conteúdo cortado no PDF.');
    }

    if (!this.pdf) {
      this.pdf = createPdf(this.dependencies, orientation, this.documentOptions);
    } else {
      this.pdf.addPage('a4', orientation);
    }

    const textLayerPlan = collectTextLayerPlan(page);
    const artwork = await captureArtwork(
      page,
      this.dependencies,
      resolvedOptions,
      textLayerPlan.vectorTextNodes,
    );
    try {
      addArtworkToPage(
        this.pdf,
        artwork,
        pageSize.width,
        pageSize.height,
        resolvedOptions,
      );
      drawTextRuns(this.pdf, textLayerPlan.runs, {
        scaleX: pageSize.width / pageRect.width,
        scaleY: pageSize.height / pageRect.height,
        clipTopPx: 0,
        clipBottomPx: pageRect.height,
        invisible: resolvedOptions.textLayerMode === 'preserve-artwork-text',
      });
    } finally {
      artwork.width = 1;
      artwork.height = 1;
    }
    this.addedPages += 1;
    // Safari/WebKit may suspend requestAnimationFrame while a heavy document
    // export is running, even with the tab visible. Yield through the timer
    // queue so multi-page reports always continue after the first page.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }

  outputBlob() {
    if (!this.pdf || this.addedPages === 0) {
      throw new Error('Nenhuma página foi adicionada ao PDF.');
    }
    return this.pdf.output('blob');
  }
}

export const createSelectablePdfBuilder = async (
  options: SelectablePdfDocumentOptions = {},
): Promise<SelectablePdfBuilder> => {
  const dependencies = await loadPdfDependencies();
  return new BrowserSelectablePdfBuilder(dependencies, options);
};

export const buildSelectablePdfFromElements = async (
  pages: HTMLElement[],
  options: SelectablePdfDocumentOptions = {},
) => {
  if (pages.length === 0) throw new Error('Nenhuma página foi encontrada para exportação.');
  await waitForSelectablePdfAssets(pages[0].parentElement ?? pages[0]);
  const builder = await createSelectablePdfBuilder(options);

  for (let index = 0; index < pages.length; index += 1) {
    options.onProgress?.(index + 1, pages.length);
    await builder.addPage(pages[index]);
  }

  return builder;
};

export const buildSelectablePdfBlobFromElements = async (
  pages: HTMLElement[],
  options: SelectablePdfDocumentOptions = {},
) => {
  const builder = await buildSelectablePdfFromElements(pages, options);
  return builder.outputBlob();
};

export const buildSelectablePdfBlobFromContainer = async (
  container: HTMLElement,
  pageSelector: string,
  options: SelectablePdfDocumentOptions = {},
) => {
  const pages = Array.from(container.querySelectorAll<HTMLElement>(pageSelector));
  return buildSelectablePdfBlobFromElements(pages.length > 0 ? pages : [container], options);
};

interface ContinuousPageSlice {
  startPx: number;
  endPx: number;
}

const getContinuousPageSlices = (
  contentHeightPx: number,
  maximumSliceHeightPx: number,
  textRuns: TextRun[],
): ContinuousPageSlice[] => {
  const slices: ContinuousPageSlice[] = [];
  let startPx = 0;

  while (startPx < contentHeightPx - 0.01) {
    let endPx = Math.min(contentHeightPx, startPx + maximumSliceHeightPx);
    if (endPx < contentHeightPx) {
      const crossingRuns = textRuns.filter((run) => (
        run.y < endPx
        && run.y + run.height > endPx
      ));
      if (crossingRuns.length > 0) {
        endPx = Math.min(...crossingRuns.map((run) => run.y));
      }
    }

    if (endPx <= startPx + 0.5) {
      throw new Error('Um bloco de texto é maior do que a área útil de uma página do PDF.');
    }
    slices.push({ startPx, endPx });
    startPx = endPx;
  }

  return slices;
};

export const buildSelectablePdfBlobFromContinuousElement = async (
  element: HTMLElement,
  options: SelectablePdfContinuousOptions = {},
) => {
  const dependencies = await loadPdfDependencies();
  await waitForSelectablePdfAssets(element);

  const orientation = options.orientation ?? 'portrait';
  const pageSize = A4[orientation];
  const marginTopMm = options.marginTopMm ?? 10;
  const marginRightMm = options.marginRightMm ?? 10;
  const marginBottomMm = options.marginBottomMm ?? 10;
  const marginLeftMm = options.marginLeftMm ?? 10;
  const contentWidthMm = pageSize.width - marginLeftMm - marginRightMm;
  const contentHeightMm = pageSize.height - marginTopMm - marginBottomMm;
  if (contentWidthMm <= 0 || contentHeightMm <= 0) {
    throw new Error('As margens configuradas não deixam área útil para o PDF.');
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    throw new Error('O conteúdo do PDF não possui dimensões visíveis.');
  }
  assertNoClippedText(element);
  const scaleMmPerPx = contentWidthMm / rect.width;
  const contentPageHeightPx = contentHeightMm / scaleMmPerPx;
  const textLayerPlan = collectTextLayerPlan(element);
  const pageSlices = getContinuousPageSlices(
    rect.height,
    contentPageHeightPx,
    textLayerPlan.runs,
  );
  const totalPages = pageSlices.length;
  const artwork = await captureArtwork(
    element,
    dependencies,
    options,
    textLayerPlan.vectorTextNodes,
  );
  const captureScaleY = artwork.height / rect.height;
  const pdf = createPdf(dependencies, orientation, options);

  try {
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
      const { startPx, endPx } = pageSlices[pageIndex];
      const sliceHeightPx = endPx - startPx;
      const sourceY = Math.round(startPx * captureScaleY);
      const sourceEnd = Math.round(endPx * captureScaleY);
      const sourceHeight = Math.max(1, Math.min(
        artwork.height - sourceY,
        sourceEnd - sourceY,
      ));
      const sliceCanvas = document.createElement('canvas');
      try {
        sliceCanvas.width = artwork.width;
        sliceCanvas.height = sourceHeight;
        const context = sliceCanvas.getContext('2d');
        if (!context) throw new Error('Não foi possível preparar a página do PDF.');
        context.drawImage(
          artwork,
          0,
          sourceY,
          artwork.width,
          sourceHeight,
          0,
          0,
          artwork.width,
          sourceHeight,
        );

        if (pageIndex > 0) pdf.addPage('a4', orientation);
        options.onProgress?.(pageIndex + 1, totalPages);
        addArtworkToPage(
          pdf,
          sliceCanvas,
          contentWidthMm,
          sliceHeightPx * scaleMmPerPx,
          options,
          marginLeftMm,
          marginTopMm,
        );
        drawTextRuns(pdf, textLayerPlan.runs, {
          scaleX: scaleMmPerPx,
          scaleY: scaleMmPerPx,
          offsetXmm: marginLeftMm,
          offsetYmm: marginTopMm,
          clipTopPx: startPx,
          clipBottomPx: endPx,
          invisible: options.textLayerMode === 'preserve-artwork-text',
        });
      } finally {
        sliceCanvas.width = 1;
        sliceCanvas.height = 1;
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }

    return pdf.output('blob');
  } finally {
    artwork.width = 1;
    artwork.height = 1;
  }
};

export const downloadPdfBlob = (blob: Blob, fileName: string) => {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Safari/WebKit may still be reading large multipage PDFs after the click.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
};
