interface PdfBlobPrintOptions {
  loadTimeoutMs?: number;
  settleMs?: number;
  afterPrintFallbackMs?: number;
  requireAfterPrint?: boolean;
  title?: string;
  signal?: AbortSignal;
}

interface CancelableWaiter {
  cancel: () => void;
  promise: Promise<void>;
}

const createSettleWaiter = (milliseconds: number): CancelableWaiter => {
  let cancel = () => undefined;
  const promise = new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    cancel = () => { window.clearTimeout(timeout); resolve(); };
  });
  return { cancel, promise };
};

const preparationAborted = () => new globalThis.DOMException('A preparação da impressão foi cancelada.', 'AbortError');
const createPreparationAbortWaiter = (signal: AbortSignal): CancelableWaiter => {
  let cancel = () => undefined;
  const promise = new Promise<void>((_resolve, reject) => {
    const onAbort = () => reject(preparationAborted());
    signal.addEventListener('abort', onAbort, { once: true });
    cancel = () => signal.removeEventListener('abort', onAbort);
    if (signal.aborted) onAbort();
  });
  return { cancel, promise };
};

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
  requireAfterPrint: boolean,
): CancelableWaiter => {
  let cancel = () => undefined;
  const promise = new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(fallback);
      printWindow.removeEventListener('afterprint', afterPrint);
      if (error) reject(error);
      else resolve();
    };
    const afterPrint = () => finish();
    const fallback = window.setTimeout(() => finish(requireAfterPrint
      ? new Error('Não foi possível confirmar o encerramento do diálogo de impressão.')
      : undefined), fallbackMs);
    cancel = () => finish();
    printWindow.addEventListener('afterprint', afterPrint, { once: true });
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
    requireAfterPrint = false,
    title = 'Lote de documentos emitidos',
    signal,
  } = options;
  if (signal?.aborted) throw preparationAborted();
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
  const abortWaiter = signal ? createPreparationAbortWaiter(signal) : null;
  let settleWaiter: CancelableWaiter | null = null;
  let printWaiter: CancelableWaiter | null = null;
  const waitForPreparation = (promise: Promise<void>) => abortWaiter
    ? Promise.race([promise, abortWaiter.promise]) : promise;

  try {
    // Registra a prontidão antes de atribuir a URL para não perder um load
    // imediato de Blob em navegadores que mantêm o PDF em cache.
    iframe.src = objectUrl;
    document.body.appendChild(iframe);
    await waitForPreparation(frameWaiter.promise);
    settleWaiter = createSettleWaiter(settleMs);
    await waitForPreparation(settleWaiter.promise);
    const printWindow = iframe.contentWindow;
    if (!printWindow) {
      throw new Error('O navegador não disponibilizou a janela do PDF agregado.');
    }

    printWaiter = createPrintCompletionWaiter(printWindow, afterPrintFallbackMs, requireAfterPrint);
    printWindow.focus();
    if (signal?.aborted) throw preparationAborted();
    // After dispatching print, keep the PDF alive until the normal completion.
    abortWaiter?.cancel();
    printWindow.print();
    await printWaiter.promise;
  } finally {
    frameWaiter.cancel();
    settleWaiter?.cancel();
    abortWaiter?.cancel();
    printWaiter?.cancel();
    iframe.remove();
    URL.revokeObjectURL(objectUrl);
  }
};
