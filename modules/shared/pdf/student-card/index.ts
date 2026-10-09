import { jsPDF } from 'jspdf';
import { waitForCarteirinhaAssets } from '../../../gestor/cadastros/modelos-documentos/carteirinha/carteirinha-assets';
import { prepareCardImages } from './assets';
import { drawStudentCard } from './render';

const CARD_WIDTH = 85.6;
const CARD_HEIGHT = 54;
export type StudentCardPdfMode = 'digital' | 'a4';
export interface StudentCardPdfOptions { signal?: AbortSignal }
interface Placement { card: HTMLElement; x: number; y: number; size?: { width: number; height: number } }
interface FoldGuide { x: number; y: number; height: number; width: number; color: [number, number, number] }
interface Page { width: number; height: number; placements: Placement[]; cropMarks?: boolean; guides?: FoldGuide[] }

function cropMarks(pdf: jsPDF, x: number, y: number) {
  const right = x + CARD_WIDTH; const bottom = y + CARD_HEIGHT;
  pdf.setDrawColor(100, 116, 139); pdf.setLineWidth(0.15);
  [
    [x - 4.5, y, x - 1.5, y], [x, y - 4.5, x, y - 1.5],
    [right + 1.5, y, right + 4.5, y], [right, y - 4.5, right, y - 1.5],
    [x - 4.5, bottom, x - 1.5, bottom], [x, bottom + 1.5, x, bottom + 4.5],
    [right + 1.5, bottom, right + 4.5, bottom], [right, bottom + 1.5, right, bottom + 4.5],
  ].forEach(([x1, y1, x2, y2]) => pdf.line(x1, y1, x2, y2));
}

async function compose(pages: Page[], options: StudentCardPdfOptions, title = 'Carteirinha estudantil'): Promise<Blob> {
  const checkCancelled = () => {
    if (options.signal?.aborted) throw new window.DOMException('Preparação da carteirinha cancelada.', 'AbortError');
  };
  checkCancelled();
  if (!pages.length) throw new Error('Nenhuma página de carteirinha foi preparada.');
  const cards = pages.flatMap(page => page.placements.map(item => item.card));
  if (!cards.length || pages.some(page => !page.placements.length)) {
    throw new Error('Nenhuma carteirinha foi preparada em uma das folhas. Selecione os alunos novamente.');
  }
  const assets = await prepareCardImages(cards);
  checkCancelled();
  const first = pages[0];
  const pdf = new jsPDF({ unit: 'mm', format: [first.width, first.height],
    orientation: first.width > first.height ? 'landscape' : 'portrait',
    compress: true, precision: 6, putOnlyUsedFonts: true });
  pdf.setProperties({ title, author: 'Universo Cursos e Consultoria' });
  pages.forEach((page, index) => {
    checkCancelled();
    if (index) pdf.addPage([page.width, page.height], page.width > page.height ? 'landscape' : 'portrait');
    page.placements.forEach(({ card, x, y, size }) => {
      drawStudentCard(pdf, card, x, y, assets, size);
      if (page.cropMarks) cropMarks(pdf, x, y);
    });
    page.guides?.forEach(guide => {
      pdf.saveGraphicsState();
      pdf.setDrawColor(...guide.color); pdf.setLineWidth(guide.width);
      pdf.setLineDashPattern([guide.width * 3, guide.width * 2], 0);
      pdf.line(guide.x, guide.y, guide.x, guide.y + guide.height);
      pdf.restoreGraphicsState();
    });
  });
  // Preserve configured Multiply as a native PDF blend, keeping the original signature bytes.
  const { PDFDocument, PDFDict, PDFName } = await import('pdf-lib');
  const document = await PDFDocument.load(pdf.output('arraybuffer'), { updateMetadata: false });
  const multiply = document.context.register(document.context.obj({ Type: 'ExtGState', BM: 'Multiply' }));
  for (const page of document.getPages()) {
    const resources = page.node.Resources();
    if (!resources) throw new Error('Os recursos vetoriais da carteirinha não foram preparados.');
    let states = resources.lookupMaybe(PDFName.of('ExtGState'), PDFDict);
    if (!states) { states = document.context.obj({}); resources.set(PDFName.of('ExtGState'), states); }
    states.set(PDFName.of('CardMultiply'), multiply);
  }
  const bytes = await document.save();
  checkCancelled();
  return new Blob([new Uint8Array(bytes).buffer], { type: 'application/pdf' });
}

/** The configured vertical badge uses the same vector painter and asset readiness gate. */
export async function buildInternshipBadgePdf(root: HTMLElement, options: StudentCardPdfOptions = {}): Promise<Blob> {
  await waitForCarteirinhaAssets(root, options);
  const cards = [...root.querySelectorAll<HTMLElement>('[data-internship-badge-page]')];
  if (!cards.length || cards.length > 2) throw new Error('A prévia individual do crachá não está disponível.');
  const size = { width: 54, height: 85.6 };
  return compose(cards.map(card => ({ ...size, placements: [{ card, x: 0, y: 0, size }] })), options, 'Crachá de identificação');
}

/** Same compositor and rendered model for CR80 download and its A4 print arrangement. */
export async function buildStudentCardPdf(root: HTMLElement, mode: StudentCardPdfMode = 'digital', options: StudentCardPdfOptions = {}): Promise<Blob> {
  await waitForCarteirinhaAssets(root, options);
  const cards = [...root.querySelectorAll<HTMLElement>('.carteirinha-render-root')];
  if (!cards.length || cards.length > 2) throw new Error('A prévia individual da carteirinha não está disponível.');
  if (mode === 'digital') {
    return compose(cards.map(card => ({ width: CARD_WIDTH, height: CARD_HEIGHT, placements: [{ card, x: 0, y: 0 }] })), options);
  }
  const gap = 8;
  const startX = (210 - cards.length * CARD_WIDTH - (cards.length - 1) * gap) / 2;
  return compose([{ width: 210, height: 297, cropMarks: true,
    placements: cards.map((card, index) => ({ card, x: startX + index * (CARD_WIDTH + gap), y: (297 - CARD_HEIGHT) / 2 })) }], options);
}

/** Consume the existing batch pages and card positions without deciding pagination. */
export async function buildStudentCardSheetPdf(root: HTMLElement, options: StudentCardPdfOptions = {}): Promise<Blob> {
  await waitForCarteirinhaAssets(root, options);
  const pages = [...root.querySelectorAll<HTMLElement>('.print-page')];
  return compose(pages.map(page => {
    const rect = page.getBoundingClientRect();
    if (rect.width <= 0 || Math.abs(rect.width / rect.height - 210 / 297) > 0.01) {
      throw new Error('A folha de carteirinhas não está na geometria A4 configurada.');
    }
    const factor = 210 / rect.width;
    const pageScale = rect.width / Number.parseFloat(window.getComputedStyle(page).width);
    const guides = [...page.querySelectorAll<HTMLElement>('[data-card-fold-guide="true"]')].map(guide => {
      const bounds = guide.getBoundingClientRect();
      const style = window.getComputedStyle(guide);
      const rgb = style.borderRightColor.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      if (!rgb || rgb.length !== 3) throw new Error('A cor da guia de dobra não possui suporte vetorial.');
      return { x: (bounds.right - rect.left) * factor, y: (bounds.top - rect.top) * factor,
        height: bounds.height * factor, width: Number.parseFloat(style.borderRightWidth) * pageScale * factor,
        color: rgb as [number, number, number] };
    });
    return { width: 210, height: 297, guides, placements: [...page.querySelectorAll<HTMLElement>('.carteirinha-render-root')].map(card => {
      const cardRect = card.getBoundingClientRect();
      return { card, x: (cardRect.left - rect.left) * factor, y: (cardRect.top - rect.top) * factor };
    }) };
  }), options);
}
