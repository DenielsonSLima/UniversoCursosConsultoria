import assert from 'node:assert/strict';
import test from 'node:test';
import { paginateReportItems } from './report-pagination';

test('mantém uma folha vazia para o estado sem registros', () => {
  assert.deepEqual(paginateReportItems([], 10, 20), [[]]);
});

test('usa capacidades diferentes na primeira folha e nas continuações', () => {
  const pages = paginateReportItems(Array.from({ length: 42 }, (_, index) => index + 1), 10, 16);

  assert.deepEqual(pages.map((page) => page.length), [10, 16, 16]);
  assert.equal(pages.flat().length, 42);
  assert.deepEqual(pages.flat(), Array.from({ length: 42 }, (_, index) => index + 1));
});

test('normaliza capacidades inválidas sem entrar em loop', () => {
  assert.deepEqual(paginateReportItems([1, 2, 3], 0, -5), [[1], [2], [3]]);
});
