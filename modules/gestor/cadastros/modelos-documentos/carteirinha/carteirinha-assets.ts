type AssetWaitOptions = { signal?: AbortSignal; timeoutMs?: number };

const aborted = () => new window.DOMException('Preparação da carteirinha cancelada.', 'AbortError');

const bounded = <T>(task: Promise<T>, options: AssetWaitOptions, label: string): Promise<T> => (
  new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      void task.catch(() => undefined);
      return reject(aborted());
    }
    const finish = (error?: unknown, value?: T) => {
      window.clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve(value as T);
    };
    const onAbort = () => finish(aborted());
    const timer = window.setTimeout(() => finish(new Error(
      `Tempo esgotado ao carregar ${label}. Tente novamente.`,
    )), options.timeoutMs ?? 20_000);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    task.then((value) => finish(undefined, value), (error) => finish(error));
  })
);

const waitForImage = (image: HTMLImageElement, options: AssetWaitOptions) => {
  const label = image.alt || 'o fundo da carteirinha';
  let cleanup = () => {};
  const loaded = new Promise<void>((resolve, reject) => {
    const onLoad = () => image.naturalWidth > 0 ? resolve() : onError();
    const onError = () => reject(new Error(`Não foi possível carregar ${label}. Tente novamente.`));
    cleanup = () => {
      image.removeEventListener('load', onLoad);
      image.removeEventListener('error', onError);
    };
    image.addEventListener('load', onLoad, { once: true });
    image.addEventListener('error', onError, { once: true });
    if (image.complete) image.naturalWidth > 0 ? resolve() : onError();
  });
  return bounded(loaded.then(async () => {
    if (typeof image.decode === 'function') await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error(`A imagem de ${label} está inválida.`);
    }
  }), options, label).finally(cleanup);
};

/** A prontidão inclui os ativos efetivos da página, não apenas a URL do modelo. */
export const waitForCarteirinhaAssets = async (
  container: HTMLElement,
  options: AssetWaitOptions = {},
) => {
  let interval = 0;
  const pending = new Promise<void>((resolve, reject) => {
    const check = () => {
      const failure = container.querySelector<HTMLElement>('[data-render-error], [data-pdf-asset-error]');
      if (failure) return reject(new Error(
        failure.dataset.renderError || failure.dataset.pdfAssetError || 'Um ativo da carteirinha está indisponível.',
      ));
      if (!container.querySelector('[data-render-ready="false"], [data-pdf-asset-ready="false"]')) resolve();
    };
    interval = window.setInterval(check, 25);
    check();
  });
  await bounded(pending, options, 'a assinatura e o QR Code da carteirinha')
    .finally(() => window.clearInterval(interval));
  await Promise.all([
    ...Array.from(container.querySelectorAll<HTMLImageElement>('img')).map((image) => waitForImage(image, options)),
    bounded(document.fonts.ready, options, 'as fontes da carteirinha'),
  ]);
  if (options.signal?.aborted) throw aborted();
};

const backgroundCache = new Map<string, Promise<void>>();

/** Uma solicitação por URL durante o carregamento; falhas nunca ficam em cache. */
export const preloadCarteirinhaBackgrounds = (urls: Array<string | null | undefined>) => Promise.all(
  [...new Set(urls.filter((url): url is string => Boolean(url)))].map((url) => {
    const cached = backgroundCache.get(url);
    if (cached) return cached;
    const image = new window.Image();
    image.decoding = 'async';
    image.src = url;
    const promise = waitForImage(image, {}).catch((error) => {
      backgroundCache.delete(url);
      throw error;
    });
    backgroundCache.set(url, promise);
    return promise;
  }),
);
