import assert from 'node:assert/strict';
import test from 'node:test';
import { getDespesaPeriodoLabel, getDespesaSituacaoEfetiva } from './despesa-periodo-apresentacao.ts';

test('atalhos fixam a situação sem converter o filtro do mês em outra aba', () => {
  assert.equal(getDespesaSituacaoEfetiva('mes_atual', 'pagas'), 'pagas');
  assert.equal(getDespesaSituacaoEfetiva('mes_atual', 'vencidas'), 'vencidas');
  assert.equal(getDespesaSituacaoEfetiva('todos', 'em_aberto'), 'em_aberto');
  assert.equal(getDespesaSituacaoEfetiva('em_aberto', 'pagas'), 'em_aberto');
  assert.equal(getDespesaSituacaoEfetiva('vencidos', 'pagas'), 'vencidas');
});

test('rótulo mensal acompanha a data civil de Maceió na virada do mês UTC', () => {
  const stillNovember = new Date('2026-12-01T01:30:00Z');
  assert.equal(getDespesaPeriodoLabel('mes_atual', '', '', stillNovember), 'Vencimentos de novembro de 2026');
  assert.equal(getDespesaPeriodoLabel('mes_atual', '', '', new Date('2026-12-01T03:00:00Z')),
    'Vencimentos de dezembro de 2026');
});

test('atalhos históricos não recebem intervalo mensal automático e preservam datas informadas', () => {
  for (const scope of ['em_aberto', 'vencidos', 'todos'] as const) {
    assert.equal(getDespesaPeriodoLabel(scope), 'Todos os períodos');
    assert.equal(getDespesaPeriodoLabel(scope, '2026-01-01', '2026-11-30'), '01/01/2026 até 30/11/2026');
  }
  assert.equal(getDespesaPeriodoLabel('mes_atual', '2026-11-10', '', new Date('2026-11-16T10:00:00Z')),
    'Vencimentos de novembro de 2026 · Intervalo informado: 10/11/2026 até sem limite final');
});
