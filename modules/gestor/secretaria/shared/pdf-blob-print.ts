interface PdfBlobPrintOptions {
  loadTimeoutMs?: number;
  settleMs?: number;
  afterPrintFallbackMs?: number;
  title?: string;
}

interface CancelableWaiter {
  cancel: () => void;
  promise: Promise<void>;
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, milliseconds);
});

const createFrameLoadWaiter = (
  iframe: Pick<
    ReturnType<typeof document.createElement>,
    'addEventListener' | 'removeEventListener'
  >,
  timeoutMs: number,
): CancelableWaiter => {
  let cancel = () => undefined;
  const promise = new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      iframe.removeEventListener('load', onLoad);
      iframe.removeEventListener('error', onError);
      if (error) reject(error);
      else resolve();
    };
    const onLoad = () => finish();
    const onError = () => finish(
      new Error('Não foi possível carregar o PDF agregado para impressão.'),
    );
    const timeout = window.setTimeout(
      () => finish(new Error('Tempo esgotado ao abrir o PDF agregado para impressão.')),
      timeoutMs,
    );
    cancel = () => finish();
    iframe.addEventListener('load', onLoad, { once: true });
    iframe.addEventListener('error', onError, { once: true });
  });
  return { cancel, promise };
};

const createPrintCompletionWaiter = (
  printWindow: Pick<typeof window, 'addEventListener' | 'removeEventListener'>,
  fallbackMs: number,
): CancelableWaiter => {
  let cancel = () => undefined;
  const promise = new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(fallback);
      printWindow.removeEventListener('afterprint', finish);
      resolve();
    };
    const fallback = window.setTimeout(finish, fallbackMs);
    cancel = finish;
    printWindow.addEventListener('afterprint', finish, { once: true });
  });
  return { cancel, promise };
};

export const shouldPrintAggregatedPdf = (totalEmissions: number): boolean =>
  totalEmissions > 1;

export const assertPdfBlobReady = (
  blob: Blob,
  label = 'O PDF',
): void => {
  if (!blob.size) {
    throw new Error(`${label} está vazio e não pode ser entregue.`);
  }
  if (blob.type !== 'application/pdf') {
    throw new Error(`${label} não possui o formato PDF esperado.`);
  }
};

/**
 * Imprime o Blob agregado em um iframe isolado. O URL temporário e o iframe
 * permanecem vivos até o navegador concluir (ou estabilizar) o diálogo.
 */
export const printPdfBlob = async (
  blob: Blob,
  options: PdfBlobPrintOptions = {},
): Promise<void> => {
  assertPdfBlobReady(blob, 'O PDF agregado');

  const {
    loadTimeoutMs = 15_000,
    settleMs = 250,
    afterPrintFallbackMs = 5_000,
    title = 'Lote de documentos emitidos',
  } = options;
  const iframe = document.createElement('iframe');
  const objectUrl = URL.createObjectURL(blob);
  iframe.title = title;
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '1px',
    height: '1px',
    border: '0',
    opacity: '0',
    pointerEvents: 'none',
  });
  const frameWaiter = createFrameLoadWaiter(iframe, loadTimeoutMs);
  let printWaiter: CancelableWaiter | null = null;

  try {
    // Registra a prontidão antes de atribuir a URL para não perder um load
    // imediato de Blob em navegadores que mantêm o PDF em cache.
    iframe.src = objectUrl;
    document.body.appendChild(iframe);
    await frameWaiter.promise;
    await wait(settleMs);
    const printWindow = iframe.contentWindow;
    if (!printWindow) {
      throw new Error('O navegador não disponibilizou a janela do PDF agregado.');
    }

    printWaiter = createPrintCompletionWaiter(printWindow, afterPrintFallbackMs);
    printWindow.focus();
    printWindow.print();
    await printWaiter.promise;
  } finally {
    frameWaiter.cancel();
    printWaiter?.cancel();
    iframe.remove();
    URL.revokeObjectURL(objectUrl);
  }
};
