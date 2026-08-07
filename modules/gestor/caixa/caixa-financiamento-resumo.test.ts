import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCaixaFinanciamentoResumoRequest,
  caixaQueryKeys,
  mapCaixaFinanciamentoResumo,
} from './caixa.service';

const resumoCanônico = {
  competencia: '2026-08-01',
  credito_liberado_matriz: '12000.00',
  obrigacao_rateada: '8400.00',
  principal_rateado: '7500.00',
  encargos_rateados: '900.00',
  pago_rateado: '2100.00',
  observacao: 'Baixa centralizada na matriz.',
};

test('separa o cache do resumo de financiamento por polo e competência', () => {
  assert.deepEqual(
    caixaQueryKeys.financiamentoResumo('polo-a', '2026-08-01'),
    ['caixa', 'financiamento-resumo', 'polo-a', '2026-08-01'],
  );
  assert.deepEqual(
    caixaQueryKeys.financiamentoResumo('todos', '2026-09-01'),
    ['caixa', 'financiamento-resumo', 'todos', '2026-09-01'],
  );
});

test('mapeia somente o resumo financeiro canônico retornado pela RPC', () => {
  const resumo = mapCaixaFinanciamentoResumo(resumoCanônico);

  assert.deepEqual(resumo, {
    competencia: '2026-08-01',
    creditoLiberadoMatriz: 12000,
    obrigacaoRateada: 8400,
    principalRateado: 7500,
    encargosRateados: 900,
    pagoRateado: 2100,
    observacao: 'Baixa centralizada na matriz.',
  });
  assert.doesNotThrow(() => assertCaixaFinanciamentoResumoRequest(resumo, '2026-08-01'));
  assert.throws(
    () => assertCaixaFinanciamentoResumoRequest(resumo, '2026-09-01'),
    /competência diferente/,
  );
});

test('rejeita resposta de financiamento incompleta antes de exibir valores', () => {
  const incompleto = { ...resumoCanônico } as Record<string, unknown>;
  delete incompleto.encargos_rateados;

  assert.throws(
    () => mapCaixaFinanciamentoResumo(incompleto),
    /Contrato inválido do resumo de financiamento/,
  );
});
