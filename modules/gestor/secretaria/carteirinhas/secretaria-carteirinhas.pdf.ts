type CarteirinhaLayoutType = 'dobra' | 'espelhado';

type PdfTextRun = {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color?: string;
  fontWeight?: string;
  maxWidth?: number;
  align?: 'left' | 'center' | 'right';
};

const waitForPrintAssets = async (container: HTMLDivElement | null) => {
  if (!container) return;

  const images = Array.from(container.querySelectorAll<HTMLImageElement>('img'));
  await Promise.all(images.map((image) => {
    if (image.complete && image.naturalWidth > 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    });
  }));

  if (document.fonts?.ready) await document.fonts.ready;
};

const removeWhiteBackground = (dataUrl: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      for (let index = 0; index < data.length; index += 4) {
        const whiteness = Math.min(data[index], data[index + 1], data[index + 2]);
        if (whiteness > 200) {
          const alphaFactor = (255 - whiteness) / (255 - 200);
          data[index + 3] = Math.round(data[index + 3] * alphaFactor);
        }
      }
      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
};

const inlinePrintImages = async (container: HTMLDivElement | null) => {
  if (!container) return () => {};

  const images = Array.from(container.querySelectorAll<HTMLImageElement>('img'));
  const originals = images.map((image) => ({ image, src: image.src }));
  const dataUrlCache = new Map<string, string>();

  const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  await Promise.all(images.map(async (image) => {
    const source = image.currentSrc || image.src;
    if (!source || source.startsWith('data:') || source.startsWith('blob:')) return;

    try {
      let dataUrl = dataUrlCache.get(source);
      if (!dataUrl) {
        const response = await fetch(source, { cache: 'force-cache', mode: 'cors' });
        if (!response.ok) throw new Error(`Falha ao carregar imagem: ${response.status}`);
        dataUrl = await blobToDataUrl(await response.blob());
        dataUrlCache.set(source, dataUrl);
      }

      const computedStyle = window.getComputedStyle(image);
      const parentStyle = image.parentElement ? window.getComputedStyle(image.parentElement) : null;
      const needsMultiply = computedStyle.mixBlendMode === 'multiply'
        || parentStyle?.mixBlendMode === 'multiply'
        || image.style.mixBlendMode === 'multiply'
        || image.parentElement?.style.mixBlendMode === 'multiply'
        || image.alt === 'Assinatura Diretor';

      if (needsMultiply) dataUrl = await removeWhiteBackground(dataUrl);

      image.src = dataUrl;
      await image.decode().catch(() => undefined);
    } catch (error) {
      console.warn('[SecretariaCarteirinhas] Imagem mantida pela URL original:', source, error);
    }
  }));

  return () => {
    originals.forEach(({ image, src }) => {
      image.src = src;
    });
  };
};

const parseColorToRgb = (colorStr: string): { r: number; g: number; b: number } | null => {
  if (!colorStr) return null;
  const value = colorStr.trim().toLowerCase();
  const rgbMatch = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/);
  if (rgbMatch) {
    return {
      r: Number.parseInt(rgbMatch[1], 10),
      g: Number.parseInt(rgbMatch[2], 10),
      b: Number.parseInt(rgbMatch[3], 10),
    };
  }

  if (!value.startsWith('#')) return null;
  const hex = value.substring(1);
  if (hex.length === 3) {
    return {
      r: Number.parseInt(hex[0] + hex[0], 16),
      g: Number.parseInt(hex[1] + hex[1], 16),
      b: Number.parseInt(hex[2] + hex[2], 16),
    };
  }
  if (hex.length === 6 || hex.length === 8) {
    return {
      r: Number.parseInt(hex.substring(0, 2), 16),
      g: Number.parseInt(hex.substring(2, 4), 16),
      b: Number.parseInt(hex.substring(4, 6), 16),
    };
  }
  return null;
};

const collectPdfTextRuns = (page: HTMLElement): PdfTextRun[] => {
  const pageRect = page.getBoundingClientRect();
  if (!pageRect.width || !pageRect.height) return [];

  const pxToMmX = 210 / pageRect.width;
  const pxToMmY = 297 / pageRect.height;
  const runs: PdfTextRun[] = [];
  const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    const text = textNode.textContent?.replace(/[^\S\r\n]+/g, ' ').trim();
    const parent = textNode.parentElement;
    if (!text || !parent || parent.closest('.print\\:hidden')) continue;

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

    let align: PdfTextRun['align'] = 'left';
    if (computed.textAlign === 'center') align = 'center';
    if (computed.textAlign === 'right') align = 'right';

    let xCoordinate = rect.left;
    if (align === 'center') xCoordinate = rect.left + rect.width / 2;
    if (align === 'right') xCoordinate = rect.left + rect.width;

    const textTransform = computed.textTransform || computed.getPropertyValue('text-transform');
    let finalText = text;
    if (textTransform === 'uppercase') finalText = finalText.toUpperCase();
    if (textTransform === 'lowercase') finalText = finalText.toLowerCase();
    if (textTransform === 'capitalize') finalText = finalText.replace(/\b\w/g, (character) => character.toUpperCase());

    runs.push({
      text: finalText,
      x: Math.max(0, (xCoordinate - pageRect.left) * pxToMmX),
      y: Math.max(0, (rect.top - pageRect.top) * pxToMmY),
      fontSize: Math.max(2, Number.parseFloat(computed.fontSize) * 0.75),
      color: computed.color,
      fontWeight: computed.fontWeight,
      maxWidth: rect.width * pxToMmX,
      align,
    });
  }

  return runs;
};

const preparePdfClone = (clonedDocument: Document) => {
  clonedDocument.querySelectorAll<HTMLElement>('.print\\:hidden').forEach((element) => {
    element.style.display = 'none';
  });
  clonedDocument.querySelectorAll<HTMLElement>('.print-page').forEach((page) => {
    page.style.margin = '0';
    page.style.boxShadow = 'none';
    page.style.border = 'none';
  });
  clonedDocument.querySelectorAll<HTMLElement>('.carteirinha-render-root').forEach((card) => {
    card.style.fontFamily = 'Arial, Helvetica, sans-serif';
    card.style.fontKerning = 'none';
    card.style.fontVariantLigatures = 'none';
    card.style.textRendering = 'geometricPrecision';
    card.style.setProperty('-webkit-font-smoothing', 'antialiased');
    card.style.transition = 'none';
    card.style.animation = 'none';

    card.querySelectorAll<HTMLElement>('*').forEach((element) => {
      element.style.fontFamily = 'Arial, Helvetica, sans-serif';
      element.style.fontKerning = 'none';
      element.style.fontVariantLigatures = 'none';
      element.style.animation = 'none';
      element.style.transition = 'none';

      const computed = clonedDocument.defaultView?.getComputedStyle(element);
      if (computed && computed.lineHeight === 'normal' && Number.parseFloat(computed.fontSize) > 0) {
        element.style.lineHeight = '1.05';
      }

      const hasTextNode = Array.from(element.childNodes).some((node) => (
        node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim())
      ));
      if (hasTextNode && element.tagName !== 'IMG') element.style.color = 'transparent';
    });
  });
};

export const printCarteirinhas = async (container: HTMLDivElement | null) => {
  await waitForPrintAssets(container);
  window.print();
};

export const downloadCarteirinhasPdf = async (
  container: HTMLDivElement | null,
  layoutType: CarteirinhaLayoutType,
) => {
  const pages = Array.from(container?.querySelectorAll<HTMLElement>('.print-page') || []);
  if (!pages.length) return false;

  let restoreImages = () => {};
  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);
    await waitForPrintAssets(container);
    restoreImages = await inlinePrintImages(container);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    pdf.setLineHeightFactor(1.4);

    const addSelectableTextLayer = (runs: PdfTextRun[]) => {
      runs.forEach((run) => {
        pdf.setFontSize(run.fontSize);
        const isBold = ['bold', '700', '900', 'black'].includes(run.fontWeight || '');
        pdf.setFont('helvetica', isBold ? 'bold' : 'normal');
        const rgb = run.color ? parseColorToRgb(run.color) : null;
        pdf.setTextColor(rgb?.r ?? 30, rgb?.g ?? 41, rgb?.b ?? 59);

        const maxWidth = run.maxWidth || 210;
        const lines = pdf.splitTextToSize(run.text, maxWidth);
        const lineSpacing = run.fontSize * 0.352778 * 1.4;
        lines.forEach((line: string, index: number) => {
          pdf.text(line, run.x, run.y + index * lineSpacing, {
            align: run.align,
            maxWidth: run.maxWidth,
            baseline: 'top',
          });
        });
      });
    };

    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      const rect = page.getBoundingClientRect();
      const textRuns = collectPdfTextRuns(page);
      const canvas = await html2canvas(page, {
        backgroundColor: '#ffffff',
        scale: 3,
        useCORS: true,
        allowTaint: false,
        logging: false,
        imageTimeout: 20000,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        windowWidth: Math.round(rect.width),
        windowHeight: Math.round(rect.height),
        scrollX: 0,
        scrollY: 0,
        onclone: preparePdfClone,
      });
      const dataUrl = canvas.toDataURL('image/png');

      if (index > 0) pdf.addPage('a4', 'portrait');
      pdf.addImage(dataUrl, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
      addSelectableTextLayer(textRuns);
    }

    pdf.save(`carteirinhas-${layoutType}.pdf`);
    return true;
  } catch (error) {
    console.error('[SecretariaCarteirinhas] Erro ao gerar download:', error);
    alert('Não foi possível gerar o PDF. Verifique se todos os arquivos do modelo estão acessíveis.');
    return false;
  } finally {
    restoreImages();
  }
};
