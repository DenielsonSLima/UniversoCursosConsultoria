import assert from 'node:assert/strict';
import { generateSafeUuid } from './randomUuid.ts';

declare const Deno: {
  test: (name: string, testFunction: () => void) => void;
};

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.test('usa randomUUID nativo quando o navegador retorna UUID válido', () => {
  const expected = '8b63e7f3-367e-4b87-9b63-09001ed0973a';

  assert.equal(generateSafeUuid({ randomUUID: () => expected }), expected);
});

Deno.test('gera UUID v4 com getRandomValues quando randomUUID não está disponível', () => {
  const uuid = generateSafeUuid({
    getRandomValues: (bytes) => {
      bytes.fill(0xab);
      return bytes;
    },
  });

  assert.match(uuid, UUID_V4_RE);
  assert.equal(uuid, 'abababab-abab-4bab-abab-abababababab');
});

Deno.test('mantém o contrato UUID mesmo sem Web Crypto', () => {
  const uuid = generateSafeUuid(null, () => 0.25);

  assert.match(uuid, UUID_V4_RE);
  assert.equal(uuid, '40404040-4040-4040-8040-404040404040');
});

Deno.test('ignora randomUUID inválido e usa o fallback compatível com o backend', () => {
  const uuid = generateSafeUuid({
    randomUUID: () => 'id-1721792071-invalid',
    getRandomValues: (bytes) => {
      bytes.fill(0xcd);
      return bytes;
    },
  });

  assert.match(uuid, UUID_V4_RE);
});
