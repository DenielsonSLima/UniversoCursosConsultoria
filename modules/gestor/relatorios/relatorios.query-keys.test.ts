import assert from 'node:assert/strict';
import test from 'node:test';
import { relatoriosKeys } from './relatorios.query-keys.ts';

test('a chave de matrículas diferencia escopo, filtros e paginação', () => {
  const first = relatoriosKeys.matriculas.list({
    poloId: 'polo-a',
    status: 'ATIVO',
    page: 1,
    pageSize: 25,
  });
  const second = relatoriosKeys.matriculas.list({
    poloId: 'polo-b',
    status: 'ATIVO',
    page: 1,
    pageSize: 25,
  });
  const nextPage = relatoriosKeys.matriculas.list({
    poloId: 'polo-a',
    status: 'ATIVO',
    page: 2,
    pageSize: 25,
  });

  assert.notDeepEqual(first, second);
  assert.notDeepEqual(first, nextPage);
});

test('a chave do diagnóstico diferencia modalidade e situação', () => {
  const technical = relatoriosKeys.censo.readiness({
    poloId: 'polo-a',
    modalidade: 'TECNICO',
    status: 'ATIVO',
  });
  const ead = relatoriosKeys.censo.readiness({
    poloId: 'polo-a',
    modalidade: 'EAD',
    status: 'ATIVO',
  });
  const completed = relatoriosKeys.censo.readiness({
    poloId: 'polo-a',
    modalidade: 'TECNICO',
    status: 'CONCLUIDO',
  });

  assert.notDeepEqual(technical, ead);
  assert.notDeepEqual(technical, completed);
});

test('as chaves financeiras isolam detalhe, fluxo de caixa e inadimplência', () => {
  const filters = {
    poloId: 'polo-a',
    dataInicio: '2026-08-01',
    dataFim: '2026-08-12',
  };
  const detalhe = relatoriosKeys.financeiro.report({
    ...filters,
    tipo: 'ENTRADAS',
  });
  const fluxo = relatoriosKeys.financeiro.fluxo(filters);
  const inadimplencia = relatoriosKeys.financeiro.inadimplencia({
    poloId: 'polo-a',
    dataCorte: '2026-08-12',
    minDiasAtraso: 1,
  });

  assert.notDeepEqual(detalhe, fluxo);
  assert.notDeepEqual(fluxo, inadimplencia);
});
