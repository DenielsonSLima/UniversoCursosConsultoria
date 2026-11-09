import logoUrl from './assets/nfse-national-logo.png?url';
import regularUrl from './assets/LiberationSans-Regular.ttf?url';
import boldUrl from './assets/LiberationSans-Bold.ttf?url';
import type { DanfseAssets } from './danfse.types';

let assetsPromise: Promise<DanfseAssets> | undefined;

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(binary);
}

/** Only bundled assets are loaded. The XML cannot supply URLs or font/logo resources. */
export function loadDanfseAssets(): Promise<DanfseAssets> {
  if (!assetsPromise) assetsPromise = Promise.all([logoUrl, regularUrl, boldUrl].map(async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Não foi possível carregar o modelo DANFSe.');
    return new Uint8Array(await response.arrayBuffer());
  })).then(([logo, regular, bold]) => ({ logo, regularFont: base64(regular), boldFont: base64(bold) }))
    .catch(error => { assetsPromise = undefined; throw error; });
  return assetsPromise;
}
