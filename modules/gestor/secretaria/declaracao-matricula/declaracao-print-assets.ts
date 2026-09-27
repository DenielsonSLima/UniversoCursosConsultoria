import { waitForQrCodeAssets } from '../../../shared/qrcode/qr-code-assets';

const removeWhiteBackground = (dataUrl: string): Promise<string> => new Promise((resolve) => {
  const img = new window.Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(dataUrl);
      return;
    }
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const whiteness = Math.min(data[i], data[i + 1], data[i + 2]);
      if (whiteness > 200) {
        const alphaFactor = (255 - whiteness) / (255 - 200);
        data[i + 3] = Math.round(data[i + 3] * alphaFactor);
      }
    }
    ctx.putImageData(imgData, 0, 0);
    resolve(canvas.toDataURL('image/png'));
  };
  img.onerror = () => resolve(dataUrl);
  img.src = dataUrl;
});

export const inlineDeclaracaoPrintImages = async (container: HTMLDivElement | null) => {
  if (!container) return () => {};
  const images = Array.from(container.querySelectorAll<HTMLImageElement>('img'));
  const originals = images.map((image) => ({ image, src: image.src }));
  const dataUrlCache = new Map<string, string>();
  const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  await Promise.all(images.map(async (image) => {
    const source = image.currentSrc || image.src;
    if (!source || source.startsWith('data:') || source.startsWith('blob:')) return;
    try {
      let dataUrl = dataUrlCache.get(source);
      if (!dataUrl) {
        const response = await fetch(source, { cache: 'force-cache', mode: 'cors' });
        if (!response.ok) throw new Error(`Falha ao carregar imagem: ${response.status}`);
        dataUrl = await blobToDataUrl(await response.blob());
        dataUrlCache.set(source, dataUrl);
      }
      const computedStyle = window.getComputedStyle(image);
      const parentStyle = image.parentElement ? window.getComputedStyle(image.parentElement) : null;
      const needsMultiply = computedStyle.mixBlendMode === 'multiply'
        || parentStyle?.mixBlendMode === 'multiply'
        || image.style.mixBlendMode === 'multiply'
        || image.parentElement?.style.mixBlendMode === 'multiply'
        || image.alt === 'Assinatura Diretor'
        || image.alt === 'Assinatura'
        || image.src.includes('signature');
      if (needsMultiply) dataUrl = await removeWhiteBackground(dataUrl);
      image.src = dataUrl;
      await image.decode().catch(() => undefined);
    } catch (error) {
      console.warn('[SecretariaDeclaracao] Imagem mantida pela URL original:', source, error);
    }
  }));

  return () => originals.forEach(({ image, src }) => { image.src = src; });
};

export const waitForDeclaracaoPrintAssets = async (container: HTMLDivElement | null) => {
  if (!container) return;
  await waitForQrCodeAssets(container);
  const images = Array.from(container.querySelectorAll<HTMLImageElement>('img'));
  await Promise.all(images.map((image) => {
    if (image.complete && image.naturalWidth > 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    });
  }));
  if (document.fonts?.ready) await document.fonts.ready;
};
