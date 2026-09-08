import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getReceivablesListScope,
  getReceivablesPeriod,
  getReceivablesScopeTotal,
  getUpcomingReceivablesFilters,
  validateReceivablesPeriod,
} from './receivables-period.ts';

test('abre no mês civil de Maceió mesmo quando UTC já virou o mês', () => {
  assert.deepEqual(getReceivablesPeriod(undefined, new Date('2026-10-01T01:30:00Z')), {
    preset: 'CURRENT_MONTH', start: '2026-09-01', end: '2026-09-30',
  });
});

test('mês anterior cobre virada do ano e fevereiro bissexto', () => {
  assert.deepEqual(getReceivablesPeriod('PREVIOUS_MONTH', new Date('2027-01-15T12:00:00Z')), {
    preset: 'PREVIOUS_MONTH', start: '2026-12-01', end: '2026-12-31',
  });
  assert.deepEqual(getReceivablesPeriod('PREVIOUS_MONTH', new Date('2028-03-31T12:00:00Z')), {
    preset: 'PREVIOUS_MONTH', start: '2028-02-01', end: '2028-02-29',
  });
});

test('últimos 30 dias inclui hoje e os 29 dias anteriores', () => {
  assert.deepEqual(getReceivablesPeriod('LAST_30_DAYS', new Date('2026-09-07T23:00:00Z')), {
    preset: 'LAST_30_DAYS', start: '2026-08-09', end: '2026-09-07',
  });
});

test('histórico completo remove ambas as datas; personalizado exige intervalo válido', () => {
  const all = getReceivablesPeriod('ALL');
  assert.deepEqual(all, { preset: 'ALL', start: '', end: '' });
  assert.equal(validateReceivablesPeriod(all), null);
  assert.ok(validateReceivablesPeriod({ ...all, preset: 'CUSTOM' }));
  assert.ok(validateReceivablesPeriod({ preset: 'CUSTOM', start: '2026-09-30', end: '2026-09-01' }));
  assert.ok(validateReceivablesPeriod({ preset: 'CUSTOM', start: '2026-02-30', end: '2026-03-10' }));
  assert.equal(validateReceivablesPeriod({ preset: 'CUSTOM', start: '2026-09-07', end: '2026-09-07' }), null);
});

test('a vencer preserva aluno, polo, turma e fim, e intersecta o início com hoje', () => {
  const filters = { poloId: 'polo-fixture', turmaId: 'turma-fixture', search: 'aluno teste', dueStart: '2026-09-01', dueEnd: '2026-09-30' };
  assert.deepEqual(getUpcomingReceivablesFilters(filters, '2026-09-07'), {
    ...filters, dueStart: '2026-09-07',
  });
  assert.deepEqual(getReceivablesListScope('upcoming', filters, '2026-09-07'), {
    ...filters, dueStart: '2026-09-07', statusScope: 'pending',
  });
  assert.equal(filters.dueStart, '2026-09-01');
  assert.equal(getUpcomingReceivablesFilters({ ...filters, dueStart: '2026-09-20' }, '2026-09-07').dueStart, '2026-09-20');
});

test('a vencer em mês passado mantém interseção vazia; não consulta todo o histórico', () => {
  assert.deepEqual(getUpcomingReceivablesFilters({ dueStart: '2026-08-01', dueEnd: '2026-08-31' }, '2026-09-07'), {
    dueStart: '2026-09-07', dueEnd: '2026-08-31',
  });
});

test('demais situações mantêm integralmente o período selecionado', () => {
  const filters = { dueStart: '2026-09-01', dueEnd: '2026-09-30', search: 'teste', turmaId: 'turma' };
  for (const scope of ['pending', 'received', 'overdue', 'canceled', 'all'] as const) {
    assert.deepEqual(getReceivablesListScope(scope, filters, '2026-09-07'), { ...filters, statusScope: scope });
  }
});

test('total contextual seleciona o agregado canônico de cada situação, inclusive pagamento diferente do nominal', () => {
  const summary = {
    pendingCount: 45, pendingValue: 1200.50, receivedCount: 8, receivedValue: 930.20,
    overdueCount: 17, overdueValue: 480.15, canceledCount: 4, canceledValue: 400,
    allCount: 57, allValue: 2600,
  };
  assert.deepEqual(getReceivablesScopeTotal('received', summary), { count: 8, value: 930.20 });
  assert.deepEqual(getReceivablesScopeTotal('pending', summary), { count: 45, value: 1200.50 });
  assert.deepEqual(getReceivablesScopeTotal('upcoming', summary), { count: 45, value: 1200.50 });
  assert.deepEqual(getReceivablesScopeTotal('overdue', summary), { count: 17, value: 480.15 });
  assert.deepEqual(getReceivablesScopeTotal('canceled', summary), { count: 4, value: 400 });
  assert.deepEqual(getReceivablesScopeTotal('all', summary), { count: 57, value: 2600 });
});
