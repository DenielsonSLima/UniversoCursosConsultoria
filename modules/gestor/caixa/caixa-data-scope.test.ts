import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertCaixaStatementRequest,
  caixaQueryKeys,
  mapCaixaStatement,
  type CaixaMonthlyStatement,
} from './caixa.service';
import { formatCaixaPercent } from './caixa.formatters';
import {
  getCaixaRealtimeInvalidationScopes,
  getCaixaRealtimeInvalidationTarget,
} from './caixa.realtime';
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
  assert.deepEqual(
    caixaQueryKeys.posicaoLiquida('polo-a', '2026-07-01'),
    ['caixa', 'posicao-liquida', 'polo-a', '2026-07-01'],
  );
  assert.deepEqual(
    caixaQueryKeys.posicaoTotal('polo-a', '2026-07-01'),
    ['caixa', 'posicao-total', 'polo-a', '2026-07-01'],
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

test('roteia eventos de patrimônio sem invalidar os contratos financeiros', () => {
  assert.equal(
    getCaixaRealtimeInvalidationTarget({
      new: { source_table: 'patrimonios', polo_id: 'polo-a' },
    }),
    'PATRIMONIO',
  );
  assert.deepEqual(
    getCaixaRealtimeInvalidationScopes({
      new: { source_table: 'patrimonios', polo_id: 'polo-a' },
    }),
    ['polo-a', 'todos'],
  );
  assert.equal(
    getCaixaRealtimeInvalidationTarget({
      new: { source_table: 'contas_receber', polo_id: 'polo-a' },
    }),
    'FINANCEIRO',
  );
});

test('invalida posições líquida e total para eventos patrimoniais e financeiros', () => {
  const source = readFileSync(
    join(process.cwd(), 'modules/gestor/caixa/useCaixaRealtime.ts'),
    'utf8',
  );
  const matches = source.match(/caixaQueryKeys\.posicoesLiquidasForPolo\(scope\)/g) ?? [];
  const totalMatches = source.match(/caixaQueryKeys\.posicoesTotaisForPolo\(scope\)/g) ?? [];

  assert.equal(matches.length, 2);
  assert.equal(totalMatches.length, 2);
  assert.match(source, /queryKey: caixaQueryKeys\.posicoesLiquidas,/);
  assert.match(source, /queryKey: caixaQueryKeys\.posicoesTotais,/);
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

test('exibe a inadimplência mensal somente com os valores e critérios da RPC', () => {
  const basePayload = {
    versao: 2,
    meta: {
      competencia: '2026-08-01',
      periodo_inicio: '2026-08-01',
      periodo_fim_exclusivo: '2026-09-01',
      gerado_em: '2026-08-27T00:00:00Z',
      escopo_tipo: 'GLOBAL',
      polo_id: null,
      escopo_rotulo: 'Resultado geral',
      fonte_saldo: 'CONTABIL_SISTEMA',
      extrato_bancario_disponivel: false,
    },
    saldos_hoje: {
      registrado_total: 1000,
      bancario_registrado: 1000,
      caixa_local: 0,
      compartilhado_total: 0,
      posicao_compartilhada_escopo: 0,
      nao_atribuido: 0,
    },
    resumo_competencia: {
      entradas_recebidas_brutas: 5000,
      tarifas_bancarias_confirmadas: 0,
      saidas_pagas: 1000,
      resultado: 4000,
      resultado_status: 'POSITIVO',
      quantidade_recebimentos: 10,
      quantidade_pagamentos: 2,
    },
    compromissos: {
      a_receber: 63257.4,
      receber_vencido: 5038.2,
      margem_inadimplencia: 7.96,
      inadimplencia_mensal: {
        periodo_inicio: '2026-08-01', periodo_fim_exclusivo: '2026-09-01',
        data_corte: '2026-08-27', base_elegivel: 10000, quantidade_elegiveis: 40,
        quantidade_em_conferencia: 2, valor_nominal_em_conferencia: 500,
        completo: false, criterio: 'VENCIMENTO_MENSAL_POSICAO_NO_CORTE',
      },
      a_pagar: 0,
      pagar_vencido: 0,
    },
    receitas_por_modalidade: [],
    despesas_por_categoria: [],
    serie_mensal: [],
    contas: [],
  };

  const parsedWithBackendMargin = mapCaixaStatement(basePayload);
  assert.equal(parsedWithBackendMargin.compromissos.margemInadimplencia, 7.96);
  assert.equal(formatCaixaPercent(parsedWithBackendMargin.compromissos.margemInadimplencia), '7,96%');

  assert.equal(parsedWithBackendMargin.compromissos.inadimplenciaMensal.baseElegivel, 10000);
  assert.equal(parsedWithBackendMargin.compromissos.inadimplenciaMensal.quantidadeEmConferencia, 2);
  assert.equal(parsedWithBackendMargin.compromissos.inadimplenciaMensal.completo, false);
  for (const invalidMargin of [undefined, null, NaN]) {
    assert.throws(() => mapCaixaStatement({
      ...basePayload,
      compromissos: { ...basePayload.compromissos, margem_inadimplencia: invalidMargin },
    }), /Contrato inválido/);
  }
  for (const invalidMetadata of [undefined, {
    ...basePayload.compromissos.inadimplencia_mensal, periodo_inicio: '2026-07-01',
  }, { ...basePayload.compromissos.inadimplencia_mensal, quantidade_em_conferencia: null }]) {
    assert.throws(() => mapCaixaStatement({
      ...basePayload,
      compromissos: { ...basePayload.compromissos, inadimplencia_mensal: invalidMetadata },
    }), /Contrato inválido/);
  }
  const noVerifiedBase = mapCaixaStatement({
    ...basePayload,
    compromissos: {
      ...basePayload.compromissos, receber_vencido: 0, margem_inadimplencia: 0,
      inadimplencia_mensal: {
        ...basePayload.compromissos.inadimplencia_mensal, base_elegivel: 0, quantidade_elegiveis: 0,
      },
    },
  });
  assert.equal(noVerifiedBase.compromissos.margemInadimplencia, 0);
  assert.equal(noVerifiedBase.compromissos.inadimplenciaMensal.completo, false);

  const seriesItem = {
    competencia: '2026-08-01', rotulo: 'Ago/2026', entradas: 1000, saidas: 200,
    resultado: 800, resultado_status: 'POSITIVO', entradas_escala_percentual: 40,
    saidas_escala_percentual: 8, inadimplencia: 2500, inadimplencia_escala_percentual: 100,
    inadimplencia_quantidade_em_conferencia: 2, inadimplencia_completo: false,
    resultado_posicao_percentual: 68, inadimplencia_posicao_percentual: 0,
    grafico_zero_posicao_percentual: 100,
  };
  const series = mapCaixaStatement({ ...basePayload, serie_mensal: [seriesItem] }).serieMensal;
  assert.equal(series[0].inadimplencia, 2500);
  assert.equal(series[0].inadimplenciaCompleto, false);
  assert.equal(series[0].resultadoPosicaoPercentual, 68);
  assert.equal(series[0].inadimplenciaPosicaoPercentual, 0);
  assert.equal(series[0].graficoZeroPosicaoPercentual, 100);
  for (const invalid of [
    { ...seriesItem, inadimplencia: undefined },
    { ...seriesItem, inadimplencia_completo: undefined },
    { ...seriesItem, resultado_posicao_percentual: 101 },
    { ...seriesItem, inadimplencia_quantidade_em_conferencia: -1 },
  ]) {
    assert.throws(() => mapCaixaStatement({ ...basePayload, serie_mensal: [invalid] }), /Contrato inválido/);
  }
});
