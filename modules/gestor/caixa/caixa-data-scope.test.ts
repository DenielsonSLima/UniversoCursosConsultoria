import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCaixaStatementRequest,
  caixaQueryKeys,
  type CaixaMonthlyStatement,
} from './caixa.service';
import { getCaixaRealtimeInvalidationScopes } from './caixa.realtime';
import {
  caixaReportQueryKey,
  caixaReportQueryKeys,
} from './report/caixa-report.service';

const statement = (
  escopoTipo: 'GLOBAL' | 'POLO',
  poloId: string | null,
  competencia = '2026-07-01',
) => ({
  meta: { escopoTipo, poloId, competencia },
}) as CaixaMonthlyStatement;

test('separa o cache mensal por polo, consolidado e competência', () => {
  assert.deepEqual(
    caixaQueryKeys.statement('polo-a', '2026-07-01'),
    ['caixa', 'statement', 'polo-a', '2026-07-01'],
  );
  assert.deepEqual(
    caixaQueryKeys.statement('polo-b', '2026-07-01'),
    ['caixa', 'statement', 'polo-b', '2026-07-01'],
  );
  assert.deepEqual(
    caixaQueryKeys.statement('todos', '2026-08-01'),
    ['caixa', 'statement', 'todos', '2026-08-01'],
  );
  assert.deepEqual(
    caixaReportQueryKey('polo-a', '2026-07-01'),
    ['caixa-report', 'monthly', 'polo-a', '2026-07-01'],
  );
});

test('invalida somente o polo afetado e o consolidado', () => {
  assert.deepEqual(
    getCaixaRealtimeInvalidationScopes({ new: { polo_id: 'polo-a' } }),
    ['polo-a', 'todos'],
  );
  assert.deepEqual(
    getCaixaRealtimeInvalidationScopes({ new: { polo_id: null } }),
    ['todos'],
  );
  assert.equal(getCaixaRealtimeInvalidationScopes({ new: {} }), null);
  assert.deepEqual(
    caixaReportQueryKeys.monthlyForPolo('polo-a'),
    ['caixa-report', 'monthly', 'polo-a'],
  );
});

test('rejeita resposta de outro polo, consolidado ou competência', () => {
  assert.doesNotThrow(() => {
    assertCaixaStatementRequest(statement('POLO', 'polo-a'), 'polo-a', '2026-07-01');
    assertCaixaStatementRequest(statement('GLOBAL', null), 'todos', '2026-07-01');
  });

  assert.throws(
    () => assertCaixaStatementRequest(statement('POLO', 'polo-b'), 'polo-a', '2026-07-01'),
    /escopo diferente/,
  );
  assert.throws(
    () => assertCaixaStatementRequest(statement('GLOBAL', null), 'polo-a', '2026-07-01'),
    /escopo diferente/,
  );
  assert.throws(
    () => assertCaixaStatementRequest(statement('POLO', 'polo-a'), 'polo-a', '2026-08-01'),
    /escopo diferente/,
  );
});
