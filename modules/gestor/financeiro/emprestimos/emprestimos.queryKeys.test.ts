import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emprestimosFinanciamentoScopes,
  getEmprestimoRateioPoloIds,
  emprestimosQueryKeys,
} from './emprestimos.queryKeys.ts';
import { getEmprestimosRealtimeSubscription } from './emprestimos.realtime.ts';

test('separa a lista de empréstimos pelo polo responsável ativo', () => {
  assert.deepEqual(
    emprestimosQueryKeys.list('matriz-a'),
    ['financeiro', 'emprestimos', 'lista', 'matriz-a'],
  );
  assert.deepEqual(
    emprestimosQueryKeys.list(null),
    ['financeiro', 'emprestimos', 'lista', 'sem-polo'],
  );
});

test('invalida cada polo efetivamente rateado, o responsável e o consolidado', () => {
  assert.deepEqual(
    emprestimosFinanciamentoScopes('matriz-a', {
      rateioPoloIds: ['polo-norte', 'polo-sul', 'polo-norte'],
    }),
    ['polo-norte', 'polo-sul', 'matriz-a', 'todos'],
  );
});

test('em empréstimo próprio, invalida somente o polo responsável e o consolidado', () => {
  assert.deepEqual(
    emprestimosFinanciamentoScopes('polo-norte', { rateioPoloIds: [] }),
    ['polo-norte', 'todos'],
  );
});

test('obtém os polos da parcela canônica na baixa', () => {
  assert.deepEqual(
    getEmprestimoRateioPoloIds({
      rateios: [
        { poloId: 'polo-norte' },
        { poloId: 'polo-sul' },
        { poloId: 'polo-norte' },
      ],
    } as never),
    ['polo-norte', 'polo-sul'],
  );
});

test('a assinatura Realtime só aceita eventos filtráveis do polo responsável', () => {
  assert.deepEqual(
    getEmprestimosRealtimeSubscription('matriz-a'),
    {
      table: 'emprestimos_financeiros',
      filter: 'polo_matriz_id=eq.matriz-a',
    },
  );
});
