import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertCaixaPosicaoTotalResumoRequest,
  caixaQueryKeys,
  mapCaixaPosicaoTotalResumo,
} from './caixa.service';
import { formatCaixaCanonicalCurrency } from './caixa.formatters';

const resumoDisponivel = {
  versao: 1,
  competencia: '2026-08-01',
  data_corte: '2026-08-10',
  escopo_tipo: 'POLO',
  polo_id: 'polo-a',
  disponivel: true,
  dados: {
    saldo_caixa_registrado: '-224.40',
    valor_patrimonial_custo: '500.00',
    saldo_emprestimos_a_pagar: '0.00',
    valor_total_liquido: '275.60',
    observacao: 'Posição total registrada no corte.',
  },
};

test('mapeia a posição total canônica sem recompor os valores no cliente', () => {
  const resumo = mapCaixaPosicaoTotalResumo(resumoDisponivel);

  assert.deepEqual(resumo, {
    versao: 1,
    competencia: '2026-08-01',
    dataCorte: '2026-08-10',
    escopoTipo: 'POLO',
    poloId: 'polo-a',
    disponivel: true,
    dados: {
      saldoCaixaRegistrado: '-224.40',
      valorPatrimonialCusto: '500.00',
      saldoEmprestimosAPagar: '0.00',
      valorTotalLiquido: '275.60',
      observacao: 'Posição total registrada no corte.',
    },
  });
  if (!resumo.disponivel) throw new Error('A posição total deveria estar disponível neste fixture.');
  assert.equal(formatCaixaCanonicalCurrency(resumo.dados.valorTotalLiquido), 'R$ 275,60');
  assert.doesNotThrow(() => {
    assertCaixaPosicaoTotalResumoRequest(resumo, 'polo-a', '2026-08-01');
  });
});

test('preserva indisponibilidade por histórico ou escopo sem trocar por zero', () => {
  const historico = mapCaixaPosicaoTotalResumo({
    versao: 1,
    competencia: '2026-07-01',
    data_corte: '2026-07-31',
    escopo_tipo: 'GLOBAL',
    polo_id: null,
    disponivel: false,
    motivo: 'HISTORICO_INSUFICIENTE',
    observacao: 'Não há base histórica.',
  });
  const acesso = mapCaixaPosicaoTotalResumo({
    versao: 1,
    competencia: '2026-07-01',
    data_corte: '2026-07-31',
    escopo_tipo: 'GLOBAL',
    polo_id: null,
    disponivel: false,
    motivo: 'ACESSO_RESTRITO',
    observacao: 'Escopo complementar indisponível.',
  });

  assert.deepEqual(historico, {
    versao: 1,
    competencia: '2026-07-01',
    dataCorte: '2026-07-31',
    escopoTipo: 'GLOBAL',
    poloId: null,
    disponivel: false,
    motivo: 'HISTORICO_INSUFICIENTE',
    observacao: 'Não há base histórica.',
  });
  assert.equal(acesso.disponivel, false);
  if (!acesso.disponivel) assert.equal(acesso.motivo, 'ACESSO_RESTRITO');
});

test('rejeita número JS, data inválida e escopo incompatível', () => {
  assert.throws(
    () => mapCaixaPosicaoTotalResumo({
      ...resumoDisponivel,
      dados: { ...resumoDisponivel.dados, valor_total_liquido: 275.6 },
    }),
    /Contrato inválido da posição total/,
  );
  assert.throws(
    () => mapCaixaPosicaoTotalResumo({
      ...resumoDisponivel,
      data_corte: '10/08/2026',
    }),
    /Contrato inválido da posição total/,
  );

  const resumo = mapCaixaPosicaoTotalResumo(resumoDisponivel);
  assert.throws(
    () => assertCaixaPosicaoTotalResumoRequest(resumo, 'polo-b', '2026-08-01'),
    /escopo diferente/,
  );
});

test('separa a posição total por polo, consolidado e competência', () => {
  assert.deepEqual(
    caixaQueryKeys.posicaoTotal('polo-a', '2026-08-01'),
    ['caixa', 'posicao-total', 'polo-a', '2026-08-01'],
  );
  assert.deepEqual(
    caixaQueryKeys.posicaoTotal('todos', '2026-07-01'),
    ['caixa', 'posicao-total', 'todos', '2026-07-01'],
  );
});

test('Caixa consome somente a RPC e apresenta o valor composto devolvido pelo backend', () => {
  const caixaRoot = join(process.cwd(), 'modules/gestor/caixa');
  const serviceSource = readFileSync(join(caixaRoot, 'caixa.service.ts'), 'utf8');
  const pageSource = readFileSync(join(caixaRoot, 'CaixaPage.tsx'), 'utf8');
  const cardSource = readFileSync(
    join(caixaRoot, 'components/CaixaPosicaoTotalResumoCard.tsx'),
    'utf8',
  );

  assert.match(serviceSource, /rpc\('get_caixa_posicao_total_resumo_secure', \{/);
  assert.match(pageSource, /<CaixaPosicaoTotalResumoCard/);
  assert.match(cardSource, /Caixa no corte \+ patrimônio a custo − empréstimos a pagar/);
  assert.doesNotMatch(cardSource, /saldoCaixaRegistrado\s*[+-]/);
  assert.doesNotMatch(cardSource, /valorPatrimonialCusto\s*[+-]/);
});
