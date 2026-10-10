import regularUrl from './Inter-400.ttf?url';
import semiboldUrl from './Inter-600.ttf?url';
import boldUrl from './Inter-700.ttf?url';
import blackUrl from './Inter-900.ttf?url';

export const INTER_WEIGHTS = [400, 600, 700, 900] as const;
type Weight = typeof INTER_WEIGHTS[number];
type FontData = { buffer: ArrayBuffer; base64: string };
const urls = { 400: regularUrl, 600: semiboldUrl, 700: boldUrl, 900: blackUrl };
let pendingFonts: Promise<Record<Weight, FontData>> | null = null;

export function invalidateInterFontData(): void {
  pendingFonts = null;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

/** Load the original fonts as assets, without parsing base64 literals as JavaScript. */
export function loadInterFontData(): Promise<Record<Weight, FontData>> {
  if (!pendingFonts) {
    pendingFonts = Promise.all(INTER_WEIGHTS.map(async weight => {
      const response = await fetch(urls[weight]);
      if (!response.ok) throw new Error(`Não foi possível carregar a fonte Inter ${weight}.`);
      const buffer = await response.arrayBuffer();
      if (!buffer.byteLength) throw new Error(`A fonte Inter ${weight} está vazia.`);
      return [weight, { buffer, base64: toBase64(buffer) }] as const;
    })).then(entries => Object.fromEntries(entries) as Record<Weight, FontData>)
      .catch(error => { pendingFonts = null; throw error; });
  }
  return pendingFonts;
}
