import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCivilDate, parseCivilDate } from './gestao-date.utils';

test('preserva a data civil sem deslocamento de fuso horário', () => {
  assert.deepEqual(parseCivilDate('2026-07-27'), {
    year: 2026,
    month: 7,
    day: 27,
  });
  assert.equal(formatCivilDate('2026-07-27'), '27/07/2026');
});

test('aceita timestamp mantendo a parte civil informada', () => {
  assert.equal(
    formatCivilDate('2026-07-27T00:00:00.000Z'),
    '27/07/2026',
  );
});

test('rejeita datas civis inválidas', () => {
  assert.equal(parseCivilDate('2026-02-30'), null);
  assert.equal(formatCivilDate('invalida'), '—');
});
