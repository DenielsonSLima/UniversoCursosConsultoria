import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertCaixaPosicaoLiquidaResumoRequest,
  caixaQueryKeys,
  mapCaixaPosicaoLiquidaResumo,
} from './caixa.service';
import { formatCaixaCanonicalCurrency } from './caixa.formatters';

const resumoCanonico = {
  versao: 1,
  competencia: '2026-08-01',
  escopo_tipo: 'POLO',
  polo_id: 'polo-a',
  valor_patrimonial_custo: '99999999999999.99',
  saldo_emprestimos_a_pagar: '100000000000000.00',
  valor_liquido: '-0.01',
  observacao: 'Patrimônio a custo menos empréstimos a pagar.',
};

test('mapeia a posição líquida canônica sem subtrair valores no cliente', () => {
  const resumo = mapCaixaPosicaoLiquidaResumo(resumoCanonico);

  assert.deepEqual(resumo, {
    versao: 1,
    competencia: '2026-08-01',
    escopoTipo: 'POLO',
    poloId: 'polo-a',
    valorPatrimonialCusto: '99999999999999.99',
    saldoEmprestimosAPagar: '100000000000000.00',
    valorLiquido: '-0.01',
    observacao: 'Patrimônio a custo menos empréstimos a pagar.',
  });
  assert.equal(formatCaixaCanonicalCurrency(resumo.valorLiquido), 'R$ -0,01');
  assert.doesNotThrow(() => {
    assertCaixaPosicaoLiquidaResumoRequest(resumo, 'polo-a', '2026-08-01');
  });
});

test('rejeita números JS, valores não canônicos e escopo incompatível', () => {
  assert.throws(
    () => mapCaixaPosicaoLiquidaResumo({
      ...resumoCanonico,
      valor_liquido: -0.01,
    }),
    /Contrato inválido da posição líquida/,
  );
  assert.throws(
    () => mapCaixaPosicaoLiquidaResumo({
      ...resumoCanonico,
      saldo_emprestimos_a_pagar: '-1.00',
    }),
    /Contrato inválido da posição líquida/,
  );

  const resumo = mapCaixaPosicaoLiquidaResumo(resumoCanonico);
  assert.throws(
    () => assertCaixaPosicaoLiquidaResumoRequest(resumo, 'polo-b', '2026-08-01'),
    /escopo diferente/,
  );
  assert.throws(
    () => assertCaixaPosicaoLiquidaResumoRequest(resumo, 'polo-a', '2026-09-01'),
    /escopo diferente/,
  );
});

test('separa a posição líquida por polo, consolidado e competência', () => {
  assert.deepEqual(
    caixaQueryKeys.posicaoLiquida('polo-a', '2026-08-01'),
    ['caixa', 'posicao-liquida', 'polo-a', '2026-08-01'],
  );
  assert.deepEqual(
    caixaQueryKeys.posicaoLiquida('todos', '2026-09-01'),
    ['caixa', 'posicao-liquida', 'todos', '2026-09-01'],
  );
});

test('o Caixa exibe somente a posição líquida retornada pela RPC', () => {
  const caixaRoot = join(process.cwd(), 'modules/gestor/caixa');
  const serviceSource = readFileSync(join(caixaRoot, 'caixa.service.ts'), 'utf8');
  const pageSource = readFileSync(join(caixaRoot, 'CaixaPage.tsx'), 'utf8');
  const cardSource = readFileSync(
    join(caixaRoot, 'components/CaixaPosicaoLiquidaResumoCard.tsx'),
    'utf8',
  );

  assert.match(serviceSource, /rpc\('get_caixa_posicao_liquida_resumo_secure', \{/);
  assert.match(pageSource, /<CaixaPosicaoLiquidaResumoCard/);
  assert.match(cardSource, /Patrimônio a custo menos empréstimos a pagar/);
  assert.doesNotMatch(cardSource, /valorPatrimonialCusto\s*-/);
});
