import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertCaixaPatrimonioResumoRequest,
  caixaQueryKeys,
  mapCaixaPatrimonioResumo,
} from './caixa.service';
import { formatCaixaCanonicalCurrency } from './caixa.formatters';

const resumoCanônico = {
  versao: 1,
  competencia: '2026-08-01',
  escopo_tipo: 'POLO',
  polo_id: 'polo-a',
  posicao_fechamento: {
    registros_ativos: 2,
    unidades_ativas: 3,
    valor_ativo_custo: '99999999999999.99',
  },
  aquisicoes_competencia: {
    registros: 1,
    unidades: 5,
    valor_custo: '4000.00',
  },
  perdas_competencia: {
    movimentos: 1,
    unidades: 2,
    valor_custo: '1600.00',
  },
  observacao: 'Posição a custo, sem efeito no caixa.',
};

test('mapeia o resumo patrimonial preservando os textos monetários exatos', () => {
  const resumo = mapCaixaPatrimonioResumo(resumoCanônico);

  assert.deepEqual(resumo, {
    versao: 1,
    competencia: '2026-08-01',
    escopoTipo: 'POLO',
    poloId: 'polo-a',
    posicaoFechamento: {
      registrosAtivos: 2,
      unidadesAtivas: 3,
      valorAtivoCusto: '99999999999999.99',
    },
    aquisicoesCompetencia: {
      registros: 1,
      unidades: 5,
      valorCusto: '4000.00',
    },
    perdasCompetencia: {
      movimentos: 1,
      unidades: 2,
      valorCusto: '1600.00',
    },
    observacao: 'Posição a custo, sem efeito no caixa.',
  });
  assert.equal(
    formatCaixaCanonicalCurrency(resumo.posicaoFechamento.valorAtivoCusto),
    'R$ 99.999.999.999.999,99',
  );
});

test('rejeita valor monetário numérico ou decimal canônico inválido', () => {
  assert.throws(
    () => mapCaixaPatrimonioResumo({
      ...resumoCanônico,
      posicao_fechamento: {
        ...resumoCanônico.posicao_fechamento,
        valor_ativo_custo: Number('99999999999999.99'),
      },
    }),
    /Contrato inválido do resumo patrimonial/,
  );
  assert.throws(
    () => mapCaixaPatrimonioResumo({
      ...resumoCanônico,
      perdas_competencia: {
        ...resumoCanônico.perdas_competencia,
        valor_custo: '1.234,56',
      },
    }),
    /Contrato inválido do resumo patrimonial/,
  );
});

test('separa o cache patrimonial por polo, consolidado e competência', () => {
  assert.deepEqual(
    caixaQueryKeys.patrimonioResumo('polo-a', '2026-08-01'),
    ['caixa', 'patrimonio-resumo', 'polo-a', '2026-08-01'],
  );
  assert.deepEqual(
    caixaQueryKeys.patrimonioResumo('todos', '2026-09-01'),
    ['caixa', 'patrimonio-resumo', 'todos', '2026-09-01'],
  );
  assert.deepEqual(
    caixaQueryKeys.patrimonioResumosForPolo('polo-b'),
    ['caixa', 'patrimonio-resumo', 'polo-b'],
  );
});

test('rejeita resumo patrimonial de outro polo, consolidado ou competência', () => {
  const poloResumo = mapCaixaPatrimonioResumo(resumoCanônico);
  const globalResumo = mapCaixaPatrimonioResumo({
    ...resumoCanônico,
    escopo_tipo: 'GLOBAL',
    polo_id: null,
  });

  assert.doesNotThrow(() => {
    assertCaixaPatrimonioResumoRequest(poloResumo, 'polo-a', '2026-08-01');
    assertCaixaPatrimonioResumoRequest(globalResumo, 'todos', '2026-08-01');
  });
  assert.throws(
    () => assertCaixaPatrimonioResumoRequest(poloResumo, 'polo-b', '2026-08-01'),
    /escopo diferente/,
  );
  assert.throws(
    () => assertCaixaPatrimonioResumoRequest(globalResumo, 'polo-a', '2026-08-01'),
    /escopo diferente/,
  );
  assert.throws(
    () => assertCaixaPatrimonioResumoRequest(poloResumo, 'polo-a', '2026-09-01'),
    /escopo diferente/,
  );
});

test('mantém a RPC, o card e a invalidação patrimonial isolados no Caixa', () => {
  const caixaRoot = join(process.cwd(), 'modules/gestor/caixa');
  const serviceSource = readFileSync(join(caixaRoot, 'caixa.service.ts'), 'utf8');
  const pageSource = readFileSync(join(caixaRoot, 'CaixaPage.tsx'), 'utf8');
  const realtimeSource = readFileSync(join(caixaRoot, 'useCaixaRealtime.ts'), 'utf8');
  const cardSource = readFileSync(
    join(caixaRoot, 'components/CaixaPatrimonioResumoCard.tsx'),
    'utf8',
  );

  assert.match(serviceSource, /rpc\('get_caixa_patrimonio_resumo_secure', \{/);
  assert.match(serviceSource, /p_polo_id: normalizedPoloId/);
  assert.match(serviceSource, /p_competencia: competencia/);
  assert.match(pageSource, /<CaixaPatrimonioResumoCard/);
  assert.match(realtimeSource, /caixaQueryKeys\.patrimonioResumosForPolo\(scope\)/);
  assert.match(realtimeSource, /caixaReportQueryKeys\.monthlyForPolo\(scope\)/);
  assert.match(realtimeSource, /queryKey: caixaReportQueryKeys\.monthly/);
  assert.match(cardSource, /Valor ativo a custo/);
  assert.match(cardSource, /Patrimônio não altera o caixa disponível nem o resultado operacional/);
});

test('exibe posição total, posição líquida, patrimônio, financiamento e custos após a conciliação do período', () => {
  const pageSource = readFileSync(
    join(process.cwd(), 'modules/gestor/caixa/CaixaPage.tsx'),
    'utf8',
  );
  const resumoOperacionalIndex = pageSource.indexOf('label="Entradas operacionais no mês"');
  const compromissosIndex = pageSource.indexOf("{ label: 'Receitas futuras'");
  const graficoIndex = pageSource.indexOf('Movimentação operacional');
  const conciliacaoIndex = pageSource.indexOf('<CaixaReconciliationCard');
  const posicaoTotalIndex = pageSource.indexOf('<CaixaPosicaoTotalResumoCard');
  const posicaoLiquidaIndex = pageSource.indexOf('<CaixaPosicaoLiquidaResumoCard');
  const patrimonioIndex = pageSource.indexOf('<CaixaPatrimonioResumoCard');
  const financiamentoIndex = pageSource.indexOf('<CaixaFinanciamentoResumoCard');
  const custosIndex = pageSource.indexOf('<CaixaLinhaCorteCard');

  assert.ok(resumoOperacionalIndex >= 0);
  assert.ok(compromissosIndex > resumoOperacionalIndex);
  assert.ok(graficoIndex > compromissosIndex);
  assert.ok(conciliacaoIndex > graficoIndex);
  assert.ok(posicaoTotalIndex > conciliacaoIndex);
  assert.ok(posicaoLiquidaIndex > posicaoTotalIndex);
  assert.ok(patrimonioIndex > posicaoLiquidaIndex);
  assert.ok(financiamentoIndex > patrimonioIndex);
  assert.ok(custosIndex > financiamentoIndex);
});
