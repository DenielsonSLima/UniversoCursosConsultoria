const QR_CODE_ASSET_SELECTOR = '[data-qr-code-asset="true"]';
const QR_CODE_PENDING_SELECTOR = `${QR_CODE_ASSET_SELECTOR}[data-pdf-asset-ready="false"]`;
const QR_CODE_ERROR_SELECTOR = `${QR_CODE_ASSET_SELECTOR}[data-pdf-asset-error]`;

const wait = (milliseconds: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, milliseconds);
});

const waitWithTimeout = async <Value>(
  promise: Promise<Value>,
  timeoutMs: number,
  message: string,
): Promise<Value> => new Promise<Value>((resolve, reject) => {
  const timeout = window.setTimeout(
    () => reject(new Error(message)),
    Math.max(1, timeoutMs),
  );
  promise.then(
    (value) => {
      window.clearTimeout(timeout);
      resolve(value);
    },
    (error) => {
      window.clearTimeout(timeout);
      reject(error);
    },
  );
});

const getQrCodeError = (container: HTMLElement) => (
  container
    .querySelector<HTMLElement>(QR_CODE_ERROR_SELECTOR)
    ?.dataset.pdfAssetError
  || ''
);

const waitForQrCodeImage = async (
  image: HTMLImageElement,
  timeoutMs: number,
) => {
  const deadline = Date.now() + timeoutMs;
  if (!image.complete) {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        window.clearTimeout(timeout);
        image.removeEventListener('load', onLoad);
        image.removeEventListener('error', onError);
        if (error) reject(error);
        else resolve();
      };
      const onLoad = () => finish();
      const onError = () => finish(
        new Error('Não foi possível carregar a imagem local do QR Code.'),
      );
      const timeout = window.setTimeout(
        () => finish(
          new Error('Tempo esgotado ao carregar a imagem local do QR Code.'),
        ),
        Math.max(1, deadline - Date.now()),
      );
      image.addEventListener('load', onLoad, { once: true });
      image.addEventListener('error', onError, { once: true });
    });
  }

  if (image.naturalWidth < 1 || image.naturalHeight < 1) {
    throw new Error('A imagem local do QR Code está vazia.');
  }
  if (typeof image.decode === 'function') {
    await waitWithTimeout(
      image.decode().catch(() => {
        throw new Error('Não foi possível decodificar a imagem local do QR Code.');
      }),
      Math.max(1, deadline - Date.now()),
      'Tempo esgotado ao decodificar a imagem local do QR Code.',
    );
  }
};

/**
 * Aguarda exclusivamente os QRs locais da área de captura. Erros abortam a
 * operação para que nenhum PDF/impressão seja produzido com placeholder.
 */
export const waitForQrCodeAssets = async (
  container: HTMLElement,
  timeoutMs = 15_000,
) => {
  const deadline = Date.now() + timeoutMs;

  while (container.querySelector(QR_CODE_PENDING_SELECTOR)) {
    const error = getQrCodeError(container);
    if (error) throw new Error(`Não foi possível gerar o QR Code: ${error}`);
    if (Date.now() >= deadline) {
      throw new Error('Os QR Codes não ficaram prontos a tempo para gerar o documento.');
    }
    await wait(25);
  }

  const error = getQrCodeError(container);
  if (error) throw new Error(`Não foi possível gerar o QR Code: ${error}`);

  const qrCodeAssets = Array.from(
    container.querySelectorAll<HTMLElement>(QR_CODE_ASSET_SELECTOR),
  );
  await Promise.all(qrCodeAssets.map(async (asset) => {
    if (asset.dataset.pdfAssetReady !== 'true') {
      throw new Error('O QR Code não está pronto para gerar o documento.');
    }
    const image = asset.querySelector<HTMLImageElement>('img');
    if (!image) throw new Error('A imagem do QR Code não foi gerada.');
    await waitForQrCodeImage(image, Math.max(1, deadline - Date.now()));
  }));
};
