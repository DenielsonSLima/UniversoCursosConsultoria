import { useCallback, useEffect, useMemo, useState } from 'react';

export type DocumentBackgroundStatus = 'loading' | 'ready' | 'error';

interface ImageCacheEntry {
  status: 'loading' | 'ready';
  promise: Promise<void>;
}

const imageCache = new Map<string, ImageCacheEntry>();

const preloadImage = (url: string) => {
  const cached = imageCache.get(url);
  if (cached) return cached.promise;

  const promise = new Promise<void>((resolve, reject) => {
    const image = new Image();
    let settled = false;

    const resolveOnce = async () => {
      if (settled) return;
      settled = true;
      try {
        if (typeof image.decode === 'function') await image.decode();
      } catch {
        // O evento load já confirma que a imagem é exibível.
      }
      imageCache.set(url, { status: 'ready', promise: Promise.resolve() });
      resolve();
    };

    const rejectOnce = () => {
      if (settled) return;
      settled = true;
      imageCache.delete(url);
      reject(new Error(`Não foi possível carregar a imagem personalizada: ${url}`));
    };

    image.decoding = 'async';
    image.addEventListener('load', resolveOnce, { once: true });
    image.addEventListener('error', rejectOnce, { once: true });
    image.src = url;

    if (image.complete) {
      if (image.naturalWidth > 0) void resolveOnce();
      else rejectOnce();
    }
  });

  imageCache.set(url, { status: 'loading', promise });
  return promise;
};

export const preloadDocumentBackgrounds = async (urls: Array<string | null | undefined>) => {
  const uniqueUrls = Array.from(new Set(urls.filter(Boolean) as string[]));
  await Promise.all(uniqueUrls.map(preloadImage));
};

const areBackgroundsCached = (urls: string[]) => (
  urls.every((url) => imageCache.get(url)?.status === 'ready')
);

export const useDocumentBackgroundReadiness = (
  frontUrl?: string | null,
  backUrl?: string | null,
) => {
  const urls = useMemo(
    () => Array.from(new Set([frontUrl, backUrl].filter(Boolean) as string[])),
    [backUrl, frontUrl],
  );
  const cacheKey = urls.join('\u0001');
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; status: DocumentBackgroundStatus }>(() => ({
    key: cacheKey,
    status: urls.length === 0 || areBackgroundsCached(urls) ? 'ready' : 'loading',
  }));

  const effectiveStatus: DocumentBackgroundStatus = state.key === cacheKey
    ? state.status
    : (urls.length === 0 || areBackgroundsCached(urls) ? 'ready' : 'loading');

  useEffect(() => {
    let active = true;

    if (urls.length === 0 || areBackgroundsCached(urls)) {
      setState({ key: cacheKey, status: 'ready' });
      return () => {
        active = false;
      };
    }

    setState({ key: cacheKey, status: 'loading' });
    preloadDocumentBackgrounds(urls)
      .then(() => {
        if (active) setState({ key: cacheKey, status: 'ready' });
      })
      .catch(() => {
        if (active) setState({ key: cacheKey, status: 'error' });
      });

    return () => {
      active = false;
    };
  }, [attempt, cacheKey, urls]);

  const retry = useCallback(() => {
    urls.forEach((url) => {
      if (imageCache.get(url)?.status !== 'ready') imageCache.delete(url);
    });
    setAttempt((current) => current + 1);
  }, [urls]);

  return {
    status: effectiveStatus,
    retry,
    hasCustomBackgrounds: urls.length > 0,
  };
};
