export interface CardImage {
  dataUrl: string;
  format: 'PNG' | 'JPEG' | 'WEBP';
}

const TIMEOUT_MS = 20_000;
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const sourceCache = new Map<string, Promise<CardImage>>();

const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('Não foi possível ler uma imagem da carteirinha.'));
  reader.readAsDataURL(blob);
});

async function resolveSource(source: string): Promise<CardImage> {
  let value = source;
  if (!value.startsWith('data:')) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(source, { cache: 'force-cache', mode: 'cors', signal: controller.signal });
      if (!response.ok) throw new Error('Não foi possível carregar uma imagem da carteirinha.');
      const blob = await response.blob();
      if (!blob.type.startsWith('image/') || blob.size > MAX_IMAGE_BYTES) {
        throw new Error('Uma imagem da carteirinha possui formato ou tamanho incompatível.');
      }
      value = await dataUrl(blob);
    } finally { window.clearTimeout(timer); }
  }
  const format = /^data:image\/(png|jpe?g|webp);base64,/i.exec(value)?.[1]?.toLowerCase();
  if (format) return { dataUrl: value, format: format === 'png' ? 'PNG' : format === 'webp' ? 'WEBP' : 'JPEG' };
  if (!value.startsWith('data:image/svg+xml')) throw new Error('Uma imagem da carteirinha não possui formato suportado.');
  // Only an isolated SVG asset is converted; card/page/text never enters canvas.
  const image = new window.Image();
  image.src = value;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, image.naturalWidth * 3);
  canvas.height = Math.max(1, image.naturalHeight * 3);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível preparar um símbolo da carteirinha.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL('image/png'), format: 'PNG' };
}

const resolveImage = (source: string) => {
  let pending = sourceCache.get(source);
  if (!pending) {
    pending = resolveSource(source).catch(error => { sourceCache.delete(source); throw error; });
    if (sourceCache.size >= 64) sourceCache.delete(sourceCache.keys().next().value!);
    sourceCache.set(source, pending);
  }
  return pending;
};

export const cssImageUrl = (value: string) => /^url\(["']?(.*?)["']?\)$/.exec(value)?.[1];

export async function prepareCardImages(cards: HTMLElement[]) {
  const sources = new Set<string>();
  const svgSources = new Map<SVGSVGElement, string>();
  cards.forEach(card => [card, ...card.querySelectorAll('*')].forEach(node => {
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    const background = cssImageUrl(style.backgroundImage);
    if (background) sources.add(background);
    if (node instanceof window.HTMLImageElement) sources.add(node.currentSrc || node.src);
    if (node instanceof window.SVGSVGElement) {
      const clone = node.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', String(node.clientWidth || 32));
      clone.setAttribute('height', String(node.clientHeight || 32));
      clone.style.color = style.color;
      clone.style.stroke = style.stroke;
      // Rotation is a PDF transform around the measured center, not baked into the asset.
      clone.style.transform = 'none';
      const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new window.XMLSerializer().serializeToString(clone))}`;
      svgSources.set(node, source);
      sources.add(source);
    }
  }));
  const images = new Map(await Promise.all([...sources].map(async source => [source, await resolveImage(source)] as const)));
  return { images, svgSources };
}
