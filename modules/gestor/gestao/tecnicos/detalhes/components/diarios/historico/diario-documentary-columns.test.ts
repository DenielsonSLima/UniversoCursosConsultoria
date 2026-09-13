import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDocumentaryGradeColumns, documentaryGradeCellText, diaryGradeNumberText } from './diario-documentary.presentation.ts';
import type { HistoricalGradeRow } from './diario-historico.types.ts';

const row = (values: Array<[string, string | number | null]>): HistoricalGradeRow[] => [{
  sourceKey: 'synthetic-row',
  grades: values.map(([category, value], index) => ({
    columnOrdinal: index + 1,
    category: { raw: category, value: category },
    value: { raw: value, value },
  })),
}];

test('P repetidas mantêm rótulo literal e colunas distintas por aluno', () => {
  const first = row([['P', '4,4'], ['P', '5,0'], ['TG', '1,2']]);
  const second = row([['TG', '2,0'], ['P', '6,1']]);
  const columns = buildDocumentaryGradeColumns([first, second]);
  assert.deepEqual(columns.map((column) => column.label), ['P', 'P', 'TG']);
  assert.deepEqual(columns.map((column) => column.key), ['P:1', 'P:2', 'TG:1']);
  assert.deepEqual(columns.map((column) => documentaryGradeCellText(first, column)), ['4,4', '5,0', '1,2']);
  assert.deepEqual(columns.slice(0, 2).map((column) => documentaryGradeCellText(second, column)), ['6,1', '—']);
});

test('combinações não sobrescrevem categorias convencionais nem se dividem por inferência', () => {
  const source = row([['P+PP', '8,7'], ['TG/PP', '6,5'], ['TG', '2,0']]);
  const columns = buildDocumentaryGradeColumns([source]);
  assert.deepEqual(columns.map((column) => column.label), ['P+PP', 'TG/PP', 'TG']);
  assert.equal(documentaryGradeCellText(source, columns[0]), '8,7');
  assert.equal(documentaryGradeCellText(source, columns[2]), '2,0');
  assert.equal(documentaryGradeCellText(source, columns[1]), '6,5');
});

test('zero, branco, traço e ausência permanecem distintos sem nota calculada', () => {
  const source = row([['P', 0], ['TI', ''], ['TG', '-'], ['S', null]]);
  const columns = buildDocumentaryGradeColumns([source]);
  assert.deepEqual(columns.map((column) => documentaryGradeCellText(source, column)), ['0', '', '-', '—']);
  assert.equal(documentaryGradeCellText(null, columns[0]), '—');
  assert.deepEqual(buildDocumentaryGradeColumns([]).map((column) => column.label), []);
});

test('células de modelo sem categoria não criam instrumento; valor real sem rótulo permanece visível', () => {
  const source = row([['', ''], ['-', '--'], ['', '7,5']]);
  const columns = buildDocumentaryGradeColumns([source]);
  assert.deepEqual(columns.map((column) => column.label), ['Instrumento 3']);
  assert.equal(documentaryGradeCellText(source, columns[0]), '7,5');
});

test('uma prova ou prova e CQ geram somente as colunas usadas', () => {
  assert.deepEqual(buildDocumentaryGradeColumns([row([['P', '10']])]).map((column) => column.label), ['P']);
  assert.deepEqual(buildDocumentaryGradeColumns([row([['P', '9'], ['CQ', '1']])]).map((column) => column.label), ['P', 'CQ']);
});

test('notas e médias documentais de duas casas não são arredondadas para uma', () => {
  assert.equal(diaryGradeNumberText(9.05), '9,05');
  assert.equal(diaryGradeNumberText(9.13), '9,13');
  assert.equal(diaryGradeNumberText(0), '0,0');
  assert.equal(diaryGradeNumberText(null), '—');
  const source = row([['P', '5,05']]);
  assert.equal(documentaryGradeCellText(source, buildDocumentaryGradeColumns([source])[0]), '5,05');
});
