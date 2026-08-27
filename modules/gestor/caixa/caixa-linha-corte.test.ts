import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { mapCaixaLinhaCorte } from './caixa-linha-corte.service';

test('mapeia payload completo de linha de corte com inadimplência e histórico', () => {
  const payload = {
    competencia: '2026-08-01',
    polo_id: 'polo-123',
    receitas: {
      realizadas: 5450,
      previstas: 1200,
      totais: 6650,
    },
    inadimplencia: {
      valor_vencido: 850,
      quantidade_titulos: 5,
      taxa_inadimplencia_mes: 12.8,
      tolerancia_inadimplencia: 91.2,
      impacto: 'SEGURO',
      diagnostico: 'Operação segura: receitas recebidas cobrem a linha de corte mesmo com inadimplência.',
    },
    despesas: {
      fixas: 3200,
      variaveis: 700,
      rateadas: 350,
      variaveis_e_rateios: 1050,
      linha_corte_total: 4250,
      percentual_fixas: 75.3,
      percentual_variaveis_rateios: 24.7,
    },
    cobertura: {
      status_operacional: 'LUCRO',
      ponto_equilibrio_atingido: true,
      cobertura_fixa_atingida: true,
      percentual_realizado: 128.2,
      percentual_projetado: 156.5,
      margem_atual: 1200,
      margem_projetada: 2400,
      valor_faltante: 0,
    },
    historico: {
      meses_amostra: 3,
      rotulo_amostra: 'Média dos últimos 3 meses (Mai, Jun, Jul)',
      mes_anterior: {
        rotulo: 'Jul',
        linha_corte: 4100,
        receitas: 5000,
        variacao_percentual: 3.7,
      },
      media_trimestral: {
        linha_corte: 4050,
        receitas: 4900,
        variacao_percentual: 4.9,
      },
    },
  };

  const result = mapCaixaLinhaCorte(payload);

  assert.equal(result.competencia, '2026-08-01');
  assert.equal(result.poloId, 'polo-123');
  assert.equal(result.receitas.realizadas, 5450);
  assert.equal(result.receitas.totais, 6650);
  assert.equal(result.inadimplencia.valorVencido, 850);
  assert.equal(result.inadimplencia.quantidadeTitulos, 5);
  assert.equal(result.inadimplencia.toleranciaInadimplencia, 91.2);
  assert.equal(result.inadimplencia.impacto, 'SEGURO');
  assert.equal(result.despesas.linhaCorteTotal, 4250);
  assert.equal(result.despesas.fixas, 3200);
  assert.equal(result.cobertura.statusOperacional, 'LUCRO');
  assert.equal(result.cobertura.pontoEquilibrioAtingido, true);
  assert.equal(result.cobertura.margemAtual, 1200);
  assert.equal(result.historico.mesesAmostra, 3);
  assert.equal(result.historico.mesAnterior.rotulo, 'Jul');
  assert.equal(result.historico.mesAnterior.linhaCorte, 4100);
  assert.equal(result.historico.mediaTrimestral.linhaCorte, 4050);
});

test('aplica fallback inteligente para polo novo ou sem histórico anterior', () => {
  const payload = {
    competencia: '2026-08-01',
    polo_id: null,
    receitas: {
      realizadas: 0,
      previstas: 0,
      totais: 0,
    },
    inadimplencia: {
      valor_vencido: 0,
      quantidade_titulos: 0,
      taxa_inadimplencia_mes: 0,
      tolerancia_inadimplencia: 0,
      impacto: 'SEGURO',
      diagnostico: '',
    },
    despesas: {
      fixas: 0,
      variaveis: 0,
      rateadas: 0,
      variaveis_e_rateios: 0,
      linha_corte_total: 0,
      percentual_fixas: 0,
      percentual_variaveis_rateios: 0,
    },
    cobertura: {
      status_operacional: 'SEM_MOVIMENTO',
      ponto_equilibrio_atingido: false,
      cobertura_fixa_atingida: false,
      percentual_realizado: 0,
      percentual_projetado: 0,
      margem_atual: 0,
      margem_projetada: 0,
      valor_faltante: 0,
    },
    historico: {
      meses_amostra: 0,
      rotulo_amostra: 'Mês inaugural — sem histórico anterior',
      mes_anterior: {
        rotulo: null,
        linha_corte: 0,
        receitas: 0,
        variacao_percentual: null,
      },
      media_trimestral: {
        linha_corte: 0,
        receitas: 0,
        variacao_percentual: null,
      },
    },
  };

  const result = mapCaixaLinhaCorte(payload);

  assert.equal(result.cobertura.statusOperacional, 'SEM_MOVIMENTO');
  assert.equal(result.inadimplencia.valorVencido, 0);
  assert.equal(result.historico.mesesAmostra, 0);
  assert.equal(result.historico.rotuloAmostra, 'Mês inaugural — sem histórico anterior');
  assert.equal(result.historico.mesAnterior.rotulo, null);
  assert.equal(result.historico.mesAnterior.variacaoPercentual, null);
});

test('mapeia com resiliência payload nulo ou indefinido', () => {
  const result = mapCaixaLinhaCorte(null);

  assert.equal(result.receitas.realizadas, 0);
  assert.equal(result.inadimplencia.valorVencido, 0);
  assert.equal(result.despesas.linhaCorteTotal, 0);
  assert.equal(result.cobertura.statusOperacional, 'SEM_MOVIMENTO');
  assert.equal(result.historico.mesesAmostra, 0);
});

test('CaixaPage monta CaixaLinhaCorteCard preservando a integridade dos demais cards', () => {
  const pageSource = readFileSync(
    join(process.cwd(), 'modules/gestor/caixa/CaixaPage.tsx'),
    'utf8',
  );

  assert.match(pageSource, /<CaixaLinhaCorteCard/);
  assert.match(pageSource, /caixaLinhaCorteQueryOptions/);
  assert.match(pageSource, /<CaixaMetricCard/);
  assert.match(pageSource, /<CaixaReconciliationCard/);
  assert.match(pageSource, /<CaixaFinanciamentoResumoCard/);
  assert.match(pageSource, /<CaixaPatrimonioResumoCard/);
  assert.match(pageSource, /<CaixaPosicaoLiquidaResumoCard/);
  assert.match(pageSource, /<CaixaPosicaoTotalResumoCard/);
});
