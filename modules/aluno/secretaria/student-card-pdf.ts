import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { waitForQrCodeAssets } from '../../shared/qrcode/qr-code-assets';

const CARD_WIDTH_MM = 85.6;
const CARD_HEIGHT_MM = 54;
const CARD_SELECTOR = '.carteirinha-render-root';
const ASSET_TIMEOUT_MS = 10_000;

const safeFilePart = (value?: string | null) => String(value || 'aluno')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase();

const wait = (milliseconds: number) => new Promise(resolve => window.setTimeout(resolve, milliseconds));

const waitForCardReadiness = async (cards: HTMLElement[]) => {
  await Promise.all(cards.map((card) => waitForQrCodeAssets(card, ASSET_TIMEOUT_MS)));
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
  await Promise.all(images.map(async image => {
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
    if (typeof image.decode === 'function') await image.decode();
  }));
};

export const downloadStudentCardPdf = async (
  containerId: string,
  studentName?: string | null,
) => {
  const container = document.getElementById(containerId);
  if (!container) throw new Error('Prévia da carteirinha não encontrada.');

  const cards = Array.from(container.querySelectorAll<HTMLElement>(CARD_SELECTOR));
  if (cards.length < 2) throw new Error('Frente e verso da carteirinha não foram carregados.');
  await waitForCardReadiness(cards.slice(0, 2));

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [CARD_WIDTH_MM, CARD_HEIGHT_MM],
    compress: true,
  });

  for (const [index, card] of cards.slice(0, 2).entries()) {
    const canvas = await html2canvas(card, {
      scale: 3,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      width: card.offsetWidth,
      height: card.offsetHeight,
      onclone: clonedDocument => {
        const clonedCards = clonedDocument
          .getElementById(containerId)
          ?.querySelectorAll<HTMLElement>(CARD_SELECTOR);
        const clonedCard = clonedCards?.[index];
        if (!clonedCard) return;
        clonedCard.style.transform = 'none';
        clonedCard.style.marginBottom = '0';
        clonedCard.style.boxShadow = 'none';
        clonedCard.style.transition = 'none';
      },
    });

    if (index > 0) pdf.addPage([CARD_WIDTH_MM, CARD_HEIGHT_MM], 'landscape');
    pdf.addImage(
      canvas.toDataURL('image/png'),
      'PNG',
      0,
      0,
      CARD_WIDTH_MM,
      CARD_HEIGHT_MM,
      undefined,
      'FAST',
    );
  }

  pdf.save(`carteirinha-estudantil-${safeFilePart(studentName)}.pdf`);
};
