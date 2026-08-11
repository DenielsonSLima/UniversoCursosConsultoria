import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isRelatoriosFinanceiroRealtimeSource,
  isRelatoriosRealtimeSource,
} from './relatorios.realtime.ts';

test('aceita somente eventos que alteram os relatórios acadêmicos', () => {
  assert.equal(isRelatoriosRealtimeSource('matriculas'), true);
  assert.equal(isRelatoriosRealtimeSource('turmas'), true);
  assert.equal(isRelatoriosRealtimeSource('parceiros'), true);
  assert.equal(isRelatoriosRealtimeSource('cursos'), true);
  assert.equal(isRelatoriosRealtimeSource('polos'), true);
  assert.equal(isRelatoriosRealtimeSource('turmas_disciplinas'), false);
  assert.equal(isRelatoriosRealtimeSource('contas_receber'), false);
  assert.equal(isRelatoriosRealtimeSource(undefined), false);
});

test('aceita somente eventos que alteram os relatórios financeiros separados', () => {
  assert.equal(isRelatoriosFinanceiroRealtimeSource('contas_receber'), true);
  assert.equal(isRelatoriosFinanceiroRealtimeSource('contas_pagar'), true);
  assert.equal(isRelatoriosFinanceiroRealtimeSource('despesas_lancamentos'), true);
  assert.equal(isRelatoriosFinanceiroRealtimeSource('despesas_lancamentos_rateios'), true);
  assert.equal(isRelatoriosFinanceiroRealtimeSource('transferencias_contas'), true);
  assert.equal(isRelatoriosFinanceiroRealtimeSource('contas_bancarias'), true);
  assert.equal(isRelatoriosFinanceiroRealtimeSource('emprestimos_financeiros'), true);
  assert.equal(isRelatoriosFinanceiroRealtimeSource('emprestimo_parcela_rateios'), true);
  assert.equal(isRelatoriosFinanceiroRealtimeSource('matriculas'), false);
  assert.equal(isRelatoriosFinanceiroRealtimeSource(undefined), false);
});
