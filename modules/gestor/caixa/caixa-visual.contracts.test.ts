import assert from 'node:assert/strict';
import test from 'node:test';
import { mapCaixaVisualizacoes } from './caixa-visual.contracts';

const payload = {
  versao: 1,
  janela_meses: 6,
  movimentacao: {
    view_box: '0 0 100 100',
    dominio_minimo: '-10.00',
    dominio_maximo: '100.00',
    base_y: 90.91,
    resultado_pontos: '50,45',
    inadimplencia_pontos: '50,60',
    meses: [{
      competencia: '2026-09-01', rotulo: 'Set/2026', x: 50, base_y: 90.91,
      entrada_x: 44.5, saida_x: 50.5, entrada_y: 0, saida_y: 72.73, largura: 5,
      entradas_valor: '100.00', saidas_valor: '20.00', resultado_valor: '80.00',
      inadimplencia_valor: '34.00', entradas_altura: 90.91, saidas_altura: 18.18,
      resultado_y: 18.18, inadimplencia_y: 60,
    }],
  },
  composicao: {
    receitas: { total: '100.00', itens: [{
      codigo: 'TECNICO', rotulo: 'Cursos técnicos', valor: '100.00', quantidade: 2,
      percentual: 100, inicio_percentual: 0, comprimento_percentual: 100,
      offset_percentual: 0, gap_percentual: 0,
    }] },
    despesas: { total: '0.00', itens: [] },
  },
  saldos_por_conta: { total_positivo: '150.00', itens: [{
    id: 'conta-1', banco: 'BANESE', conta: '123', titular: 'Universo', natureza: 'BANCARIA',
    valor: '150.00', percentual: 100, inicio_percentual: 0, comprimento_percentual: 100,
    offset_percentual: 0, gap_percentual: 0,
  }] },
};

test('mapeia geometria canônica sem recompor valores ou percentuais', () => {
  const visual = mapCaixaVisualizacoes(payload);
  assert.equal(visual.movimentacao.meses[0].entradaY, 0);
  assert.equal(visual.movimentacao.resultadoPontos, '50,45');
  assert.equal(visual.composicao.receitas.itens[0].comprimentoPercentual, 100);
  assert.equal(visual.saldosPorConta.itens[0].valor, '150.00');
});

test('rejeita payload sem geometria obrigatória', () => {
  const invalid = structuredClone(payload);
  Reflect.deleteProperty(invalid.movimentacao.meses[0], 'entrada_y');
  assert.throws(
    () => mapCaixaVisualizacoes(invalid),
    /Contrato inválido das visualizações canônicas/,
  );
});

test('não converte ausência ou texto vazio em coordenada zero', () => {
  for (const invalidValue of [null, '']) {
    const invalid = structuredClone(payload);
    invalid.movimentacao.meses[0].entrada_y = invalidValue as never;
    assert.throws(
      () => mapCaixaVisualizacoes(invalid),
      /Contrato inválido das visualizações canônicas/,
    );
  }
});
