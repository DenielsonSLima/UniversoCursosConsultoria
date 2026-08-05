import {
  assertCaixaReportPagesFit,
  getCaixaReportArtworkScale,
} from './caixa-report.layout';
import { createSelectablePdfBuilder } from '../../../shared/pdf/dom-to-selectable-pdf';

const waitForExportLayout = () => new Promise<void>((resolve) => {
  window.requestAnimationFrame(() => resolve());
});

const createCaixaPdfExportHost = () => {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'fixed';
  host.style.inset = '0 auto auto 0';
  host.style.zIndex = '-2147483648';
  host.style.width = '297mm';
  host.style.height = '210mm';
  host.style.overflow = 'visible';
  host.style.pointerEvents = 'none';
  document.body.appendChild(host);
  return host;
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
  const documentOptions = {
    orientation: 'landscape',
    // O texto continua sendo redesenhado como vetor pelo helper. JPEG é usado somente
    // na camada visual de fundo para não esgotar a memória em relatórios com muitas páginas.
    artworkFormat: 'JPEG',
    artworkQuality: 0.92,
    artworkScale: getCaixaReportArtworkScale(pages.length),
    title: 'Prestação de contas mensal do Caixa',
    subject: 'Posição contábil e movimentos financeiros confirmados',
    onProgress,
  } as const;
  const builder = await createSelectablePdfBuilder(documentOptions);
  const exportHost = createCaixaPdfExportHost();

  try {
    for (let index = 0; index < pages.length; index += 1) {
      const pageClone = pages[index].cloneNode(true) as HTMLElement;
      exportHost.replaceChildren(pageClone);
      await waitForExportLayout();
      onProgress?.(index + 1, pages.length);
      await builder.addPage(pageClone, documentOptions);
    }
    return builder.outputBlob();
  } finally {
    exportHost.remove();
  }
};
