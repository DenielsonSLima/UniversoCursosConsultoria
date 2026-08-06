import {
  assertCaixaReportPagesFit,
  getCaixaReportArtworkPreset,
} from './caixa-report.layout';
import { createSelectablePdfBuilder } from '../../../shared/pdf/dom-to-selectable-pdf';

export const CAIXA_REPORT_TEXT_LAYER_MODE = 'preserve-artwork-text' as const;

const stagePageForSafariCapture = (page: HTMLElement) => {
  const parent = page.parentNode;
  if (!parent) throw new Error('A página do relatório não está vinculada à prévia.');

  const placeholder = document.createComment('caixa-report-capture-position');
  const rect = page.getBoundingClientRect();
  const stage = document.createElement('div');
  stage.dataset.caixaReportCaptureStage = 'true';
  Object.assign(stage.style, {
    background: '#ffffff',
    height: `${Math.ceil(rect.height)}px`,
    left: '0',
    overflow: 'hidden',
    pointerEvents: 'none',
    position: 'fixed',
    top: '0',
    width: `${Math.ceil(rect.width)}px`,
    zIndex: '2147483647',
  });
  parent.insertBefore(placeholder, page);
  document.body.appendChild(stage);
  stage.appendChild(page);

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    try {
      if (placeholder.parentNode) placeholder.parentNode.replaceChild(page, placeholder);
      else if (parent.isConnected) parent.appendChild(page);
      else page.remove();
    } finally {
      placeholder.remove();
      stage.remove();
    }
  };

  return restore;
};

const waitForSafariPaint = () => new Promise<void>(
  (resolve) => window.setTimeout(resolve, 50),
);

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

export const getCaixaReportPdfErrorMessage = (error: unknown) => {
  const detail = error instanceof Error ? error.message : '';
  if (/imagem|decodificada/i.test(detail)) {
    return 'A logo ou a marca d’água não pôde ser carregada para o PDF. Reabra a prévia e tente novamente.';
  }
  if (/fonte/i.test(detail)) {
    return 'As fontes do relatório não terminaram de carregar. Reabra a prévia e tente novamente.';
  }
  if (/excede|ultrapassa|proporção A4|layout/i.test(detail)) {
    return 'Um conteúdo do relatório ultrapassou a área segura da página. Revise a prévia antes de baixar.';
  }
  if (/canvas|memory|memória|allocation|out of memory/i.test(detail)) {
    return 'O navegador ficou sem memória para concluir o PDF. Feche outras abas e tente novamente.';
  }
  return 'Não foi possível gerar o PDF. Reabra a prévia e tente novamente.';
};

export const buildCaixaReportPdf = async (
  element: HTMLElement,
  onProgress?: (current: number, total: number) => void,
) => {
  const pages = Array.from(element.querySelectorAll<HTMLElement>('.caixa-report-page'));
  if (pages.length === 0) throw new Error('Nenhuma página do relatório foi encontrada.');

  assertCaixaReportPagesFit(pages);
  const artworkPreset = getCaixaReportArtworkPreset(pages.length);
  const documentOptions = {
    orientation: 'landscape',
    // A arte visível preserva exatamente a prévia (incluindo Inter, logo e marca-d'água).
    // Uma segunda camada invisível mantém seleção, busca e cópia no PDF.
    ...artworkPreset,
    textLayerMode: CAIXA_REPORT_TEXT_LAYER_MODE,
    title: 'Prestação de contas mensal do Caixa',
    subject: 'Posição contábil e movimentos financeiros confirmados',
    onProgress,
  } as const;
  const builder = await createSelectablePdfBuilder(documentOptions);
  for (let index = 0; index < pages.length; index += 1) {
    onProgress?.(index + 1, pages.length);
    // WebKit applies the scroll offset of the preview to html2canvas' internal
    // clone. Stage the original page at the viewport origin so all four sheets
    // keep the exact same header, logo and configured background.
    const restorePage = stagePageForSafariCapture(pages[index]);
    try {
      await waitForSafariPaint();
      await builder.addPage(pages[index], documentOptions);
    } finally {
      restorePage();
    }
  }
  return builder.outputBlob();
};
