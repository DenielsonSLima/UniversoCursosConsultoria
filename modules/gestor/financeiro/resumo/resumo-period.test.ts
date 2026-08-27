import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatResumoRange,
  getResumoMonthRange,
  getResumoOverdueRange,
  getResumoPresetRange,
  getResumoThreeMonthPeriods,
  shiftResumoDateKey,
  validateResumoCustomRange,
} from './resumo-period.ts';

test('usa o dia civil de Maceió quando UTC já avançou para o dia seguinte', () => {
  const reference = new Date('2026-08-27T01:30:00.000Z');

  assert.deepEqual(getResumoPresetRange('TODAY', reference), {
    start: '2026-08-26',
    end: '2026-08-26',
  });
  assert.deepEqual(getResumoOverdueRange(reference), {
    start: '1970-01-01',
    end: '2026-08-25',
  });
});

test('calcula primeiro e último dia do mês, inclusive em ano bissexto', () => {
  assert.deepEqual(getResumoMonthRange('2026-02-14'), {
    start: '2026-02-01',
    end: '2026-02-28',
  });
  assert.deepEqual(getResumoMonthRange('2028-02-14'), {
    start: '2028-02-01',
    end: '2028-02-29',
  });
});

test('desloca datas corretamente na virada de mês e de ano', () => {
  assert.equal(shiftResumoDateKey('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftResumoDateKey('2027-01-01', -1), '2026-12-31');
});

test('define os três meses pelo calendário civil de Maceió', () => {
  const reference = new Date('2026-09-01T01:30:00.000Z');

  assert.deepEqual(getResumoThreeMonthPeriods(reference), [
    { start: '2026-06-01', end: '2026-06-30', mes: '06', ano: 2026, mesNome: 'Junho' },
    { start: '2026-07-01', end: '2026-07-31', mes: '07', ano: 2026, mesNome: 'Julho' },
    { start: '2026-08-01', end: '2026-08-31', mes: '08', ano: 2026, mesNome: 'Agosto' },
  ]);
});

test('valida intervalo personalizado antes de consultar o backend', () => {
  assert.equal(
    validateResumoCustomRange({ start: '', end: '2026-08-26' }),
    'Informe as datas inicial e final.',
  );
  assert.equal(
    validateResumoCustomRange({ start: '2026-08-27', end: '2026-08-26' }),
    'A data inicial não pode ser posterior à data final.',
  );
  assert.equal(validateResumoCustomRange({ start: '2026-08-01', end: '2026-08-26' }), null);
});

test('formata o período aplicado sem depender do fuso do navegador', () => {
  assert.equal(
    formatResumoRange({ start: '2026-08-01', end: '2026-08-26' }),
    '01/08/2026 a 26/08/2026',
  );
  assert.equal(
    formatResumoRange({ start: '2026-08-26', end: '2026-08-26' }),
    '26/08/2026',
  );
});
