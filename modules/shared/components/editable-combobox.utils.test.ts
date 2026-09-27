import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterComboboxOptions,
  mergeComboboxOptions,
  normalizeComboboxSearch,
} from './editable-combobox.utils.ts';

const options = [
  { value: 'NEÓPOLIS/SE', label: 'NEÓPOLIS/SE', keywords: ['2804409'] },
  { value: 'MACEIÓ/AL', label: 'MACEIÓ/AL', keywords: ['2704302'] },
];

test('pesquisa ignorando acentos e caixa', () => {
  assert.equal(normalizeComboboxSearch('  Neópolis '), 'NEOPOLIS');
  assert.deepEqual(filterComboboxOptions(options, 'neop').map((option) => option.value), ['NEÓPOLIS/SE']);
});

test('pesquisa também pelos metadados textuais', () => {
  assert.deepEqual(filterComboboxOptions(options, '2704302').map((option) => option.value), ['MACEIÓ/AL']);
});

test('mescla catálogo remoto e fallback sem repetir sugestões', () => {
  const merged = mergeComboboxOptions(
    [{ value: 'NEÓPOLIS/SE', label: 'NEÓPOLIS/SE', description: 'Remoto' }],
    options,
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0]?.description, 'Remoto');
});
