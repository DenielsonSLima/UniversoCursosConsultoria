import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateElectronicSignatureModelAssetUpload,
  verifyElectronicSignatureModelAssetDownload,
} from './assinatura-eletronica.model-asset';
import type { ElectronicSignatureModelAsset } from './assinatura-eletronica.contract';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const pngHeader = (width: number, height: number) => {
  const bytes = new Uint8Array(24);
  bytes.set(PNG_SIGNATURE, 0);
  bytes.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
};

const sha256 = async (bytes: Uint8Array) => {
  const input = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(input).set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  return Array.from(digest, (part) => part.toString(16).padStart(2, '0')).join('');
};

test('pré-validação do upload mantém os limites PNG de 1 MiB, 4096 px e 12 MP', async () => {
  const accepted = new File([pngHeader(4_000, 3_000)], 'marca.png', { type: 'image/png' });
  await assert.doesNotReject(() => validateElectronicSignatureModelAssetUpload(accepted));

  const tooWide = new File([pngHeader(4_097, 1)], 'larga.png', { type: 'image/png' });
  await assert.rejects(
    () => validateElectronicSignatureModelAssetUpload(tooWide),
    /4096 px por lado e 12 megapixels/i,
  );

  const tooManyPixels = new File([pngHeader(4_000, 4_000)], 'grande.png', { type: 'image/png' });
  await assert.rejects(
    () => validateElectronicSignatureModelAssetUpload(tooManyPixels),
    /4096 px por lado e 12 megapixels/i,
  );
});

test('prévia só entrega bytes cujo SHA-256, tamanho e dimensões correspondem ao ativo autorizado', async () => {
  const bytes = pngHeader(120, 80);
  const asset: ElectronicSignatureModelAsset = {
    assetId: '11111111-1111-4111-8111-111111111111',
    signedUrl: 'https://assets.example.test/modelo.png?token=temporario',
    mimeType: 'image/png',
    byteSize: bytes.byteLength,
    width: 120,
    height: 80,
    sha256: await sha256(bytes),
    expiresIn: 300,
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response(bytes, {
    status: 200,
    headers: { 'content-type': 'image/png' },
  }))) as typeof fetch;

  try {
    const verified = await verifyElectronicSignatureModelAssetDownload(asset);
    assert.equal(verified.assetId, asset.assetId);
    assert.match(verified.dataUrl, /^data:image\/png;base64,/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('prévia falha fechada quando bytes da URL assinada não correspondem ao SHA-256', async () => {
  const bytes = pngHeader(120, 80);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response(bytes, {
    status: 200,
    headers: { 'content-type': 'image/png' },
  }))) as typeof fetch;

  try {
    await assert.rejects(
      () => verifyElectronicSignatureModelAssetDownload({
        assetId: '11111111-1111-4111-8111-111111111111',
        signedUrl: 'https://assets.example.test/modelo.png?token=temporario',
        mimeType: 'image/png',
        byteSize: bytes.byteLength,
        width: 120,
        height: 80,
        sha256: '0'.repeat(64),
        expiresIn: 300,
      }),
      /integridade SHA-256/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
