import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const source = await readFile(resolve(
  'modules/gestor/financeiro/outros-creditos/OtherCreditCreateModal.tsx',
), 'utf8');

test('recebimento manual abre como workspace de viewport completo', () => {
  assert.match(
    source,
    /fixed inset-0 z-\[140\][^"']*h-\[100dvh\][^"']*overflow-hidden/,
    'O fluxo manual deve ocupar o viewport e controlar a rolagem internamente.',
  );
  assert.doesNotMatch(
    source,
    /max-w-4xl/,
    'O contêiner de diálogo central não pode limitar a superfície do fluxo manual.',
  );
  assert.match(source, /className="flex-1 overflow-y-auto/);
  assert.match(source, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(source, /event\.key === 'Escape'/);
});
