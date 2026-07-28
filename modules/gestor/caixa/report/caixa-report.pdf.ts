import { assertCaixaReportPagesFit } from './caixa-report.layout';

const settleWithin = async (promise: Promise<unknown>, timeoutMs = 5_000) => {
  await Promise.race([
    promise.catch(() => undefined),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, timeoutMs);
    }),
  ]);
};

const waitForImages = async (element: HTMLElement) => {
  const images = Array.from(element.querySelectorAll('img'));
  await Promise.all(images.map(async (image) => {
    if (!image.complete) {
      await settleWithin(new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      }));
    }
    if (typeof image.decode === 'function') {
      await settleWithin(image.decode());
    }
  }));
};

const waitForDocumentFonts = async () => {
  if (typeof document === 'undefined' || !document.fonts?.ready) return;
  await settleWithin(document.fonts.ready);
};

export const buildCaixaReportFileName = (
  competencia: string,
  scopeLabel: string,
) => {
  const [year, month] = competencia.split('-');
  const safeScope = scopeLabel
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `prestacao-caixa-${year}-${month}-${safeScope || 'resultado-geral'}.pdf`;
};

export const buildCaixaReportPdf = async (
  element: HTMLElement,
  onProgress?: (current: number, total: number) => void,
) => {
  const [{ jsPDF }, html2canvasModule] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  const html2canvas = html2canvasModule.default;
  const pages = Array.from(element.querySelectorAll<HTMLElement>('.caixa-report-page'));
  if (pages.length === 0) throw new Error('Nenhuma página do relatório foi encontrada.');

  await waitForImages(element);
  await waitForDocumentFonts();
  assertCaixaReportPagesFit(pages);

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    onProgress?.(index + 1, pages.length);
    const canvas = await html2canvas(page, {
      scale: 1.5,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: page.scrollWidth,
      windowHeight: page.scrollHeight,
    });

    const sourceRatio = canvas.width / canvas.height;
    const pageRatio = 297 / 210;
    const imageWidth = sourceRatio >= pageRatio ? 297 : 210 * sourceRatio;
    const imageHeight = sourceRatio >= pageRatio ? 297 / sourceRatio : 210;
    const imageX = (297 - imageWidth) / 2;
    const imageY = (210 - imageHeight) / 2;

    if (index > 0) pdf.addPage('a4', 'landscape');
    pdf.addImage(
      canvas.toDataURL('image/jpeg', 0.94),
      'JPEG',
      imageX,
      imageY,
      imageWidth,
      imageHeight,
      undefined,
      'FAST',
    );
    canvas.width = 1;
    canvas.height = 1;
  }

  return pdf.output('blob');
};
