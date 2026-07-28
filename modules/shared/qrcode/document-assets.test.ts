import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  assertDocumentAssetContract,
  extractCssBackgroundImageUrls,
  waitForDocumentAssets,
} from './document-assets.ts';
import { waitForQrCodeAssets } from './qr-code-assets.ts';

interface FakeContainerOptions {
  renderError?: string;
  requireQr?: boolean;
  hasQr?: boolean;
  images?: any[];
}

const fakeContainer = ({
  renderError,
  requireQr = false,
  hasQr = false,
  images = [],
}: FakeContainerOptions = {}) => {
  const requirement = {
    querySelector: (selector: string) => (
      selector === '[data-qr-code-asset="true"]' && hasQr ? {} : null
    ),
  };
  return {
    querySelector: (selector: string) => {
      if (selector === '[data-render-error]' && renderError) {
        return { dataset: { renderError } };
      }
      return null;
    },
    querySelectorAll: (selector: string) => {
      if (selector === '[data-requires-qr-code="true"]') {
        return requireQr ? [requirement] : [];
      }
      if (selector === 'img') return images;
      return [];
    },
  } as unknown as HTMLElement;
};

const installBrowserStubs = () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousRaf = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      setTimeout,
      clearTimeout,
      getComputedStyle: () => ({ backgroundImage: 'none' }),
    },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { fonts: { ready: Promise.resolve() } },
  });
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: (timestamp: number) => void) => setTimeout(() => callback(Date.now()), 0),
  });

  return () => {
    const restore = (name: 'window' | 'document' | 'requestAnimationFrame', descriptor?: PropertyDescriptor) => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    };
    restore('window', previousWindow);
    restore('document', previousDocument);
    restore('requestAnimationFrame', previousRaf);
  };
};

test('extrai todas as imagens de fundo relevantes do CSS', () => {
  assert.deepEqual(
    extractCssBackgroundImageUrls(
      'linear-gradient(#fff,#000), url("https://cdn.example.com/frente.png"), url(data:image/png;base64,AAAA)',
    ),
    ['https://cdn.example.com/frente.png', 'data:image/png;base64,AAAA'],
  );
});

test('readiness falha quando um componente relata erro', () => {
  assert.throws(
    () => assertDocumentAssetContract(fakeContainer({ renderError: 'assinatura ausente' })),
    /assinatura ausente/i,
  );
});

test('readiness falha quando o modelo exige QR e nenhum asset foi renderizado', () => {
  assert.throws(
    () => assertDocumentAssetContract(fakeContainer({ requireQr: true })),
    /nenhuma imagem de validação foi renderizada/i,
  );
});

test('orquestração conclui somente com contratos e assets válidos', async () => {
  const restore = installBrowserStubs();
  try {
    await waitForDocumentAssets(fakeContainer({ requireQr: true, hasQr: true }), 500);
  } finally {
    restore();
  }
});

test('imagem vazia bloqueia a orquestração', async () => {
  const restore = installBrowserStubs();
  try {
    await assert.rejects(
      () => waitForDocumentAssets(fakeContainer({
        images: [{
          complete: true,
          naturalWidth: 0,
          naturalHeight: 0,
          alt: 'assinatura',
        }],
      }), 500),
      /vazia ou corrompida/i,
    );
  } finally {
    restore();
  }
});

test('decodificação de QR que não termina respeita o timeout', async () => {
  const restore = installBrowserStubs();
  const image = {
    complete: true,
    naturalWidth: 320,
    naturalHeight: 320,
    decode: () => new Promise<void>(() => undefined),
  };
  const qrAsset = {
    dataset: { pdfAssetReady: 'true' },
    querySelector: (selector: string) => selector === 'img' ? image : null,
  };
  const container = {
    querySelector: () => null,
    querySelectorAll: (selector: string) => (
      selector === '[data-qr-code-asset="true"]' ? [qrAsset] : []
    ),
  } as unknown as HTMLElement;

  try {
    await assert.rejects(
      () => waitForQrCodeAssets(container, 20),
      /tempo esgotado ao decodificar/i,
    );
  } finally {
    restore();
  }
});

test('impressão do visualizador aguarda todos os assets e bloqueia reentrância', async () => {
  const source = await readFile(
    new URL(
      '../../gestor/secretaria/shared/SecretariaIssuedDocumentModal.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(source, /await waitForDocumentAssets\(printContentRef\.current\)/);
  assert.match(source, /\|\| isPrinting/);
  assert.match(source, /isReissuing=\{isPrinting\}/);
  assert.doesNotMatch(source, /waitForQrCodeAssets/);
});
