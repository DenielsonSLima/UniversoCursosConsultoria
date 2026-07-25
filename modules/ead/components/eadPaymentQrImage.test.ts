import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEadPaymentQrImageSource } from './eadPaymentQrImage';

const pngPayload = `iVBORw0KGgo${'a'.repeat(128)}`;

test('preserva a data URL oficial do QR Code sem duplicar o prefixo', () => {
  const source = `data:image/png;base64,${pngPayload}`;
  assert.equal(normalizeEadPaymentQrImageSource(source), source);
});

test('adiciona o prefixo apenas quando o gateway envia base64 puro', () => {
  assert.equal(
    normalizeEadPaymentQrImageSource(pngPayload),
    `data:image/png;base64,${pngPayload}`,
  );
});

test('rejeita imagem inválida em vez de montar um src quebrado', () => {
  assert.equal(normalizeEadPaymentQrImageSource('data:image/png;base64,erro'), null);
  assert.equal(normalizeEadPaymentQrImageSource('https://exemplo.com/qr.png'), null);
});
