import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const serviceSource = await readFile(
  new URL('./portal-context.service.ts', import.meta.url),
  'utf8',
);

const uuidPatternSource = serviceSource.match(
  /const UUID_PATTERN = \/(\^\[[^\n]+)\/([a-z]+);/u,
);

assert.ok(uuidPatternSource, 'UUID_PATTERN precisa permanecer explícito no normalizador');
const contextIdPattern = new RegExp(uuidPatternSource[1], uuidPatternSource[2]);

test('aceita UUID PostgreSQL legado sem impor variante RFC 4122', () => {
  assert.equal(
    contextIdPattern.test('12345678-1234-1234-1234-1234567890ab'),
    true,
  );
});

test('rejeita contextId malformado ou com caractere não hexadecimal', () => {
  assert.equal(
    contextIdPattern.test('12345678-1234-1234-1234-1234567890'),
    false,
  );
  assert.equal(
    contextIdPattern.test('12345678-1234-1234-z234-1234567890ab'),
    false,
  );
});
