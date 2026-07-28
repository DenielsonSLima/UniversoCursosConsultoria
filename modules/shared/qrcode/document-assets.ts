import { waitForQrCodeAssets } from './qr-code-assets';

const RENDER_PENDING_SELECTOR = '[data-render-ready="false"]';
const RENDER_ERROR_SELECTOR = '[data-render-error]';
const QR_REQUIRED_SELECTOR = '[data-requires-qr-code="true"]';
const QR_ASSET_SELECTOR = '[data-qr-code-asset="true"]';

const wait = (milliseconds: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, milliseconds);
});

const remainingTime = (deadline: number, label: string) => {
  const remaining = deadline - Date.now();
  if (remaining < 1) {
    throw new Error(`Tempo esgotado ao carregar ${label}.`);
  }
  return remaining;
};

const waitWithDeadline = async <Value>(
  promise: Promise<Value>,
  deadline: number,
  label: string,
): Promise<Value> => {
  const timeoutMs = remainingTime(deadline, label);
  return new Promise<Value>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error(`Tempo esgotado ao carregar ${label}.`)),
      timeoutMs,
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
};

export const extractCssBackgroundImageUrls = (backgroundImage: string): string[] => {
  const urls: string[] = [];
  const pattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(String(backgroundImage || '')))) {
    const url = (match[1] || match[2] || match[3] || '').trim();
    if (url) urls.push(url);
  }
  return urls;
};

export const assertDocumentAssetContract = (container: HTMLElement) => {
  const renderError = container.querySelector<HTMLElement>(RENDER_ERROR_SELECTOR)
    ?.dataset.renderError;
  if (renderError) {
    throw new Error(`Não foi possível concluir o documento: ${renderError}`);
  }

  const qrRequirements = Array.from(
    container.querySelectorAll<HTMLElement>(QR_REQUIRED_SELECTOR),
  );
  const requirementWithoutQr = qrRequirements.find(
    (requirement) => !requirement.querySelector(QR_ASSET_SELECTOR),
  );
  if (requirementWithoutQr) {
    throw new Error(
      'O modelo exige QR Code público, mas nenhuma imagem de validação foi renderizada.',
    );
  }
};

const waitForRenderComponents = async (container: HTMLElement, deadline: number) => {
  while (container.querySelector(RENDER_PENDING_SELECTOR)) {
    assertDocumentAssetContract(container);
    remainingTime(deadline, 'os componentes do documento');
    await wait(25);
  }
  assertDocumentAssetContract(container);
};

const waitForImage = async (image: HTMLImageElement, deadline: number) => {
  if (!image.complete) {
    await waitWithDeadline(
      new Promise<void>((resolve, reject) => {
        const onLoad = () => finish();
        const onError = () => finish(
          new Error(`Não foi possível carregar a imagem "${image.alt || 'sem descrição'}".`),
        );
        const finish = (error?: Error) => {
          image.removeEventListener('load', onLoad);
          image.removeEventListener('error', onError);
          if (error) reject(error);
          else resolve();
        };
        image.addEventListener('load', onLoad, { once: true });
        image.addEventListener('error', onError, { once: true });
      }),
      deadline,
      `a imagem "${image.alt || 'sem descrição'}"`,
    );
  }

  if (image.naturalWidth < 1 || image.naturalHeight < 1) {
    throw new Error(`A imagem "${image.alt || 'sem descrição'}" está vazia ou corrompida.`);
  }
  if (typeof image.decode === 'function') {
    await waitWithDeadline(
      image.decode().catch(() => {
        throw new Error(`Não foi possível decodificar a imagem "${image.alt || 'sem descrição'}".`);
      }),
      deadline,
      `a decodificação da imagem "${image.alt || 'sem descrição'}"`,
    );
  }
};

const loadBackgroundImage = async (url: string, deadline: number) => {
  await waitWithDeadline(
    new Promise<void>((resolve, reject) => {
      const image = new Image();
      if (/^https?:/i.test(url)) image.crossOrigin = 'anonymous';
      image.onload = () => {
        if (image.naturalWidth < 1 || image.naturalHeight < 1) {
          reject(new Error('A imagem de fundo está vazia ou corrompida.'));
          return;
        }
        resolve();
      };
      image.onerror = () => reject(new Error('Não foi possível carregar uma imagem de fundo.'));
      image.src = url;
    }),
    deadline,
    'uma imagem de fundo',
  );
};

const collectBackgroundImageUrls = (container: HTMLElement): string[] => {
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return [];
  const elements = Array.from(container.querySelectorAll<HTMLElement>('*'));
  return [...new Set(elements.flatMap((element) => (
    extractCssBackgroundImageUrls(window.getComputedStyle(element).backgroundImage)
  )))];
};

const waitForFonts = async (deadline: number) => {
  if (typeof document === 'undefined' || !document.fonts?.ready) return;
  await waitWithDeadline(document.fonts.ready, deadline, 'as fontes do documento');
};

const waitForNextPaint = () => new Promise<void>((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
});

/**
 * Barreira fail-closed para impressão e PDF. Todos os componentes assíncronos,
 * QRs, imagens, fundos e fontes precisam estar prontos antes da captura.
 */
export const waitForDocumentAssets = async (
  container: HTMLElement,
  timeoutMs = 20_000,
) => {
  const deadline = Date.now() + timeoutMs;
  await waitForRenderComponents(container, deadline);
  await waitForQrCodeAssets(container, remainingTime(deadline, 'os QR Codes'));

  const images = Array.from(container.querySelectorAll<HTMLImageElement>('img'));
  await Promise.all(images.map((image) => waitForImage(image, deadline)));

  const backgroundUrls = collectBackgroundImageUrls(container);
  await Promise.all(backgroundUrls.map((url) => loadBackgroundImage(url, deadline)));
  await waitForFonts(deadline);
  await waitWithDeadline(waitForNextPaint(), deadline, 'a pintura final do documento');

  assertDocumentAssetContract(container);
  await waitForQrCodeAssets(container, remainingTime(deadline, 'os QR Codes'));
};
