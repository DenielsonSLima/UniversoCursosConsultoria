import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocalQrCodeDataUrl } from './local-qrcode';
import {
  getLocalQrCodeRequestKey,
  isValidLocalQrCodeDataUrl,
  resolveLocalQrCodeAssetState,
} from './local-qrcode-state';
import {
  createDocumentValidationQrDataUrl,
} from '../document-validation/document-validation.qr';

const pngBytesFromDataUrl = (dataUrl: string) =>
  Uint8Array.from(
    globalThis.atob(dataUrl.split(',', 2)[1] || ''),
    (character) => character.charCodeAt(0),
  );

test('gera um QR PNG local com o tamanho solicitado', async () => {
  const dataUrl = await createLocalQrCodeDataUrl(
    'https://www.universocc.com.br/validador?code=TESTE-123',
    { size: 180 },
  );
  const png = pngBytesFromDataUrl(dataUrl);
  const dimensions = new DataView(
    png.buffer,
    png.byteOffset,
    png.byteLength,
  );

  assert.match(dataUrl, /^data:image\/png;base64,/);
  assert.deepEqual(
    [...png.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
  assert.equal(dimensions.getUint32(16), 180);
  assert.equal(dimensions.getUint32(20), 180);
});

test('recusa conteúdo vazio em vez de produzir um QR inválido', async () => {
  await assert.rejects(
    () => createLocalQrCodeDataUrl(''),
    /conteúdo do QR Code não pode ser vazio/i,
  );
});

test('readiness recusa base64 que não contém uma assinatura PNG real', () => {
  const fakeDataUrl = 'data:image/png;base64,AAAAAAAAAAAAAAAA';
  assert.equal(isValidLocalQrCodeDataUrl(fakeDataUrl), false);
  assert.deepEqual(
    resolveLocalQrCodeAssetState('qr', {
      requestKey: 'qr',
      dataUrl: fakeDataUrl,
      error: '',
      loading: false,
    }),
    {
      requestKey: 'qr',
      dataUrl: '',
      error: 'A geração do QR Code retornou uma imagem inválida.',
      loading: false,
      ready: false,
    },
  );
});

test('recusa código documental vazio antes de montar a URL pública', async () => {
  await assert.rejects(
    () => createDocumentValidationQrDataUrl('   '),
    /código de validação do documento não foi informado/i,
  );
});

test('troca de value invalida imediatamente a imagem e o readiness anteriores', async () => {
  const previousValue = 'https://www.universocc.com.br/validador?code=ANTERIOR';
  const nextValue = 'https://www.universocc.com.br/validador?code=NOVO';
  const previousDataUrl = await createLocalQrCodeDataUrl(previousValue);
  const previousKey = getLocalQrCodeRequestKey(previousValue);
  const nextKey = getLocalQrCodeRequestKey(nextValue);
  const previousState = {
    requestKey: previousKey,
    dataUrl: previousDataUrl,
    error: '',
    loading: false,
  };

  assert.equal(
    resolveLocalQrCodeAssetState(previousKey, previousState).ready,
    true,
  );

  const stateAfterValueChange = resolveLocalQrCodeAssetState(
    nextKey,
    previousState,
  );
  assert.equal(stateAfterValueChange.ready, false);
  assert.equal(stateAfterValueChange.loading, true);
  assert.equal(stateAfterValueChange.dataUrl, '');
});
