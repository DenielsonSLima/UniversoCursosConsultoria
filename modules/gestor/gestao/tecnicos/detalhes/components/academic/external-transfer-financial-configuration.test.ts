import assert from 'node:assert/strict';
import type { ExternalTransferPreview, ExternalTransferScheduleItem } from './external-transfer.contract.ts';
import {
  buildExternalTransferFinancialAdjustments, clearExternalTransferFinancialConfigurationChanges,
  createExternalTransferFinancialConfigurations, externalTransferFinancialConfigurationError,
  syncExternalTransferFinancialConfigurations, updateExternalTransferFinancialConfiguration,
  type ExternalTransferCycleValues,
} from './external-transfer-financial-configuration.ts';
import { externalTransferScheduleItemError } from './external-transfer-presentation.ts';

declare const Deno: { test: (name: string, fn: () => void | Promise<void>) => void };
const today = '2026-10-10';
const item = (id: number, cycle: 1 | 2, tipo: ExternalTransferScheduleItem['tipo'], ordem: number, vencimento: string): ExternalTransferScheduleItem => ({
  itemId: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`, cicloNumero: cycle, tipo, ordem, vencimento,
  valor: tipo === 'MATRICULA' ? '150.00' : tipo === 'REMATRICULA' ? '100.00' : '200.00',
  descontoPontualidade: tipo === 'PARCELA' ? '10.00' : '0.00',
  jurosAtrasoPercentual: tipo === 'PARCELA' ? '1.000000' : '0.000000', multaAtrasoPercentual: '0.000000',
});
const preview = (): ExternalTransferPreview => ({
  versao: 3, regraFingerprint: 'class-rule', quantidadeMaxima: 60, maxCiclos: 2,
  financeiro: { versao: 3, itens: [
    item(1, 1, 'MATRICULA', 1, '2026-10-13'), item(2, 1, 'PARCELA', 2, '2026-10-30'), item(3, 1, 'PARCELA', 3, '2026-11-30'),
    item(4, 2, 'REMATRICULA', 1, '2027-10-13'), item(5, 2, 'PARCELA', 2, '2027-10-30'), item(6, 2, 'PARCELA', 3, '2027-11-30'),
  ] },
  totais: { porCiclo: [
    { cicloNumero: 1, totalNominal: '550.00', quantidadeParcelas: 2, quantidadeItens: 3 },
    { cicloNumero: 2, totalNominal: '500.00', quantidadeParcelas: 2, quantidadeItens: 3 },
  ], totalNominal: '1050.00' },
  regra: {
    valorMatricula: '150.00', valorMensalidade: '200.00', valorRematricula: '100.00',
    encargos: { descontoPontualidade: '10.00', jurosAtrasoPercentual: '1.000000', multaAtrasoPercentual: '0.000000' },
    aplicacao: { matricula: { desconto: false, multaJuros: false }, mensalidade: { desconto: true, multaJuros: true }, rematricula: { desconto: false, multaJuros: false } },
  }, avisos: [],
});

Deno.test('padrões canônicos aparecem sem patches; matrícula e mensalidades têm datas independentes', () => {
  const context = preview();
  const values = createExternalTransferFinancialConfigurations(context);
  assert.equal(values[1].valorTaxa, '150.00');
  assert.equal(values[1].vencimentoTaxa, '2026-10-13');
  assert.equal(values[1].primeiroVencimento, '2026-10-30');
  assert.equal(values[2].quantidadeParcelas, '2');
  assert.deepEqual(buildExternalTransferFinancialAdjustments(values, context, today), []);
  const changed = updateExternalTransferFinancialConfiguration(values, 1, 'vencimentoTaxa', '2026-10-15');
  assert.deepEqual(buildExternalTransferFinancialAdjustments(changed, context, today), [
    { acao: 'CONFIGURAR_CICLO', cicloNumero: 1, vencimentoTaxa: '2026-10-15' },
  ]);
  assert.equal(changed[1].primeiroVencimento, '2026-10-30');
  assert.equal(changed[2], values[2]);
});

Deno.test('30dias aplicado conserva modo ao voltar e mudar primeira data/quantidade; C2 intacto', () => {
  const context = preview();
  const original = createExternalTransferFinancialConfigurations(context);
  let values = updateExternalTransferFinancialConfiguration(original, 1, 'periodicidade', 'DIAS_CORRIDOS_30');
  assert.deepEqual(buildExternalTransferFinancialAdjustments(values, context, today), [
    { acao: 'CONFIGURAR_CICLO', cicloNumero: 1, primeiroVencimento: '2026-10-30', periodicidade: 'DIAS_CORRIDOS_30' },
  ]);
  values = clearExternalTransferFinancialConfigurationChanges(values, 1);
  values = updateExternalTransferFinancialConfiguration(values, 1, 'primeiroVencimento', '2026-11-05');
  assert.deepEqual(buildExternalTransferFinancialAdjustments(values, context, today), [
    { acao: 'CONFIGURAR_CICLO', cicloNumero: 1, primeiroVencimento: '2026-11-05', periodicidade: 'DIAS_CORRIDOS_30' },
  ]);
  values = clearExternalTransferFinancialConfigurationChanges(values, 1);
  values = updateExternalTransferFinancialConfiguration(values, 1, 'quantidadeParcelas', '5');
  assert.deepEqual(buildExternalTransferFinancialAdjustments(values, context, today), [
    { acao: 'CONFIGURAR_CICLO', cicloNumero: 1, quantidadeParcelas: 5, periodicidade: 'DIAS_CORRIDOS_30' },
  ]);
  assert.deepEqual(values[2], original[2]);
});

Deno.test('desconto mensal maior que matrícula é válido, tem escopo explícito e não altera taxa', () => {
  const context = preview();
  let values = createExternalTransferFinancialConfigurations(context);
  values = updateExternalTransferFinancialConfiguration(values, 1, 'descontoPontualidade', '175.00');
  assert.equal(externalTransferFinancialConfigurationError(values, context, today), null);
  assert.deepEqual(buildExternalTransferFinancialAdjustments(values, context, today), [
    { acao: 'CONFIGURAR_CICLO', cicloNumero: 1, descontoPontualidade: '175.00', alvoEncargos: 'MENSALIDADES' },
  ]);
  values = updateExternalTransferFinancialConfiguration(values, 1, 'jurosAtrasoPercentual', '100.000000');
  assert.match(externalTransferFinancialConfigurationError(values, context, today) || '', /juros.*100/);
});

Deno.test('desligar ciclo/mensalidades preserva valores e permite recebimento acadêmico sem cobrança', () => {
  const context = preview();
  const original = createExternalTransferFinancialConfigurations(context);
  let values = updateExternalTransferFinancialConfiguration(original, 1, 'cobrarMensalidades', false);
  assert.deepEqual(buildExternalTransferFinancialAdjustments(values, context, today), [
    { acao: 'CONFIGURAR_CICLO', cicloNumero: 1, quantidadeParcelas: 0 },
  ]);
  values = updateExternalTransferFinancialConfiguration(values, 1, 'enabled', false);
  values = updateExternalTransferFinancialConfiguration(values, 2, 'enabled', false);
  assert.deepEqual(buildExternalTransferFinancialAdjustments(values, context, today), [
    { acao: 'CONFIGURAR_CICLO', cicloNumero: 1, quantidadeParcelas: 0, cobrarTaxa: false },
    { acao: 'CONFIGURAR_CICLO', cicloNumero: 2, quantidadeParcelas: 0, cobrarTaxa: false },
  ]);
  assert.equal(values[1].valorMensalidade, original[1].valorMensalidade);
  assert.equal(values[2].primeiroVencimento, original[2].primeiroVencimento);
});

Deno.test('sucesso parcial limpa só C1; retry mantém intenção de C2 sem repetir C1', () => {
  const context = preview();
  let values = createExternalTransferFinancialConfigurations(context);
  values = updateExternalTransferFinancialConfiguration(values, 1, 'quantidadeParcelas', '5');
  values = updateExternalTransferFinancialConfiguration(values, 2, 'valorMensalidade', '250.00');
  const pending = values[2];
  values = clearExternalTransferFinancialConfigurationChanges(values, 1);
  assert.equal(values[2], pending);
  assert.deepEqual(buildExternalTransferFinancialAdjustments(values, context, today), [
    { acao: 'CONFIGURAR_CICLO', cicloNumero: 2, valorMensalidade: '250.00' },
  ]);
});

Deno.test('voltar da lista hidrata quantidade/data/valor, guarda modo e patches pendentes', () => {
  const context = preview();
  let values = createExternalTransferFinancialConfigurations(context);
  values = clearExternalTransferFinancialConfigurationChanges(updateExternalTransferFinancialConfiguration(values, 1, 'periodicidade', 'DIAS_CORRIDOS_30'));
  const edited = context.financeiro.itens.filter((item) => item.itemId !== context.financeiro.itens[1].itemId)
    .map((item) => item.itemId === context.financeiro.itens[2].itemId ? { ...item, valor: '225.00', vencimento: '2026-12-05' } : item);
  const synced = syncExternalTransferFinancialConfigurations(values, context, edited);
  assert.equal(synced[1].quantidadeParcelas, '1');
  assert.equal(synced[1].valorMensalidade, '225.00');
  assert.equal(synced[1].primeiroVencimento, '2026-12-05');
  assert.equal(synced[1].periodicidade, 'DIAS_CORRIDOS_30');
  assert.deepEqual(synced[1].changedKeys, []);
  values = updateExternalTransferFinancialConfiguration(values, 1, 'valorMensalidade', '500.00');
  const retry = syncExternalTransferFinancialConfigurations(values, context, edited);
  assert.equal(retry[1].valorMensalidade, '500.00');
  assert.deepEqual(retry[1].changedKeys, ['valorMensalidade']);
  const varied = context.financeiro.itens.map((item, index) => index === 2 ? { ...item, valor: '225.00' } : item);
  assert.equal(syncExternalTransferFinancialConfigurations(synced, context, varied)[1].hasIndividualConditions, true);
});

Deno.test('erros financeiros identificam ciclo/cobrança em vez de depender de botão oculto', () => {
  const context = preview();
  const values = updateExternalTransferFinancialConfiguration(createExternalTransferFinancialConfigurations(context), 1, 'vencimentoTaxa', '');
  assert.match(externalTransferFinancialConfigurationError(values, context, today) || '', /C1.*vencimento da matrícula/);
  assert.throws(() => buildExternalTransferFinancialAdjustments(values, context, today), /matrícula/);
  assert.match(externalTransferScheduleItemError({ ...context.financeiro.itens[0], valor: '0.00' }, today) || '', /valor positivo/);
  assert.match(externalTransferScheduleItemError({ ...context.financeiro.itens[0], vencimento: '2026-10-09' }, today) || '', /data passada/);
});

Deno.test('voltar da lista preserva opções dos grupos desligados sem reativá-los nem criar patches', () => {
  const context = preview();
  const original = createExternalTransferFinancialConfigurations(context);
  let values = updateExternalTransferFinancialConfiguration(original, 1, 'cobrarMensalidades', false);
  values = clearExternalTransferFinancialConfigurationChanges(values, 1);
  const feeOnly = context.financeiro.itens.filter((item) => item.cicloNumero !== 1 || item.tipo === 'MATRICULA');
  const synced = syncExternalTransferFinancialConfigurations(values, context, feeOnly);
  assert.equal(synced[1].cobrarMensalidades, false);
  assert.equal(synced[1].cobrarTaxa, true);
  assert.equal(synced[1].quantidadeParcelas, original[1].quantidadeParcelas);
  assert.equal(synced[1].primeiroVencimento, original[1].primeiroVencimento);
  assert.equal(synced[1].descontoPontualidade, original[1].descontoPontualidade);
  assert.deepEqual(synced[1].changedKeys, []);
  const monthlyOnly = context.financeiro.itens.filter((item) => item.tipo !== 'MATRICULA');
  const withoutFee = syncExternalTransferFinancialConfigurations(original, context, monthlyOnly);
  assert.equal(withoutFee[1].cobrarTaxa, false);
  assert.equal(withoutFee[1].valorTaxa, original[1].valorTaxa);
  assert.equal(withoutFee[1].vencimentoTaxa, original[1].vencimentoTaxa);
  assert.deepEqual(withoutFee[1].changedKeys, []);
});

Deno.test('alternâncias booleanas canceladas preservam cobranças individuais e seleção repetida é idempotente', () => {
  const context = preview();
  const edited = context.financeiro.itens.map((item, index) => index === 2 ? {
    ...item, vencimento: '2026-11-15', valor: '250.00', descontoPontualidade: '20.00',
    jurosAtrasoPercentual: '3.000000', multaAtrasoPercentual: '4.000000',
  } : item);
  const original = syncExternalTransferFinancialConfigurations(createExternalTransferFinancialConfigurations(context), context, edited);
  const flags = ['enabled', 'cobrarMensalidades', 'cobrarTaxa', 'aplicarDesconto', 'aplicarJuros', 'aplicarMulta'] as const;
  assert.equal(original[1].hasIndividualConditions, true);
  for (const flag of flags) {
    const initial = original[1][flag];
    assert.equal(updateExternalTransferFinancialConfiguration(original, 1, flag, initial), original, flag);
    let values = updateExternalTransferFinancialConfiguration(original, 1, flag, !initial);
    assert.deepEqual(values[1].changedKeys, [flag]);
    assert.equal(updateExternalTransferFinancialConfiguration(values, 1, flag, !initial), values, flag);
    values = updateExternalTransferFinancialConfiguration(values, 1, flag, initial);
    assert.deepEqual(values[1].changedKeys, [], flag);
    assert.deepEqual(buildExternalTransferFinancialAdjustments(values, context, today), [], flag);
    assert.equal(values[2], original[2]);
  }
  assert.equal(edited[2].valor, '250.00');
  assert.equal(edited[2].vencimento, '2026-11-15');
});

Deno.test('cancelar alternâncias preserva alterações reais de valor, data e outro ciclo', () => {
  const context = preview();
  let values = createExternalTransferFinancialConfigurations(context);
  values = updateExternalTransferFinancialConfiguration(values, 1, 'valorMensalidade', '225.00');
  values = updateExternalTransferFinancialConfiguration(values, 1, 'vencimentoTaxa', '2026-10-15');
  values = updateExternalTransferFinancialConfiguration(values, 2, 'primeiroVencimento', '2027-11-05');
  const otherCycle = values[2];
  const flags: Array<keyof Pick<ExternalTransferCycleValues, 'enabled' | 'cobrarMensalidades' | 'cobrarTaxa' | 'aplicarDesconto' | 'aplicarJuros' | 'aplicarMulta'>> = [
    'enabled', 'cobrarMensalidades', 'cobrarTaxa', 'aplicarDesconto', 'aplicarJuros', 'aplicarMulta',
  ];
  for (const flag of flags) {
    const initial = values[1][flag];
    values = updateExternalTransferFinancialConfiguration(values, 1, flag, !initial);
    values = updateExternalTransferFinancialConfiguration(values, 1, flag, initial);
  }
  assert.deepEqual(values[1].changedKeys, ['valorMensalidade', 'vencimentoTaxa']);
  assert.equal(values[2], otherCycle);
  assert.deepEqual(buildExternalTransferFinancialAdjustments(values, context, today), [
    { acao: 'CONFIGURAR_CICLO', cicloNumero: 1, valorMensalidade: '225.00', vencimentoTaxa: '2026-10-15' },
    { acao: 'CONFIGURAR_CICLO', cicloNumero: 2, primeiroVencimento: '2027-11-05', periodicidade: 'MENSAL_CALENDARIO' },
  ]);
});

Deno.test('reativar um ciclo depois de aplicar a desativação ainda envia toda a configuração preservada', () => {
  const context = preview();
  const original = createExternalTransferFinancialConfigurations(context);
  let values = updateExternalTransferFinancialConfiguration(original, 1, 'enabled', false);
  assert.deepEqual(buildExternalTransferFinancialAdjustments(values, context, today), [
    { acao: 'CONFIGURAR_CICLO', cicloNumero: 1, quantidadeParcelas: 0, cobrarTaxa: false },
  ]);
  values = clearExternalTransferFinancialConfigurationChanges(values, 1);
  const withoutCycle = context.financeiro.itens.filter((item) => item.cicloNumero !== 1);
  values = syncExternalTransferFinancialConfigurations(values, context, withoutCycle);
  values = updateExternalTransferFinancialConfiguration(values, 1, 'enabled', true);
  assert.deepEqual(values[1].changedKeys, ['enabled']);
  assert.deepEqual(buildExternalTransferFinancialAdjustments(values, context, today), [{
    acao: 'CONFIGURAR_CICLO', cicloNumero: 1, quantidadeParcelas: 2, primeiroVencimento: '2026-10-30',
    periodicidade: 'MENSAL_CALENDARIO', valorMensalidade: '200.00', descontoPontualidade: '10.00',
    jurosAtrasoPercentual: '1.000000', multaAtrasoPercentual: '0.000000', alvoEncargos: 'MENSALIDADES',
    cobrarTaxa: true, valorTaxa: '150.00', vencimentoTaxa: '2026-10-13',
  }]);
  assert.deepEqual(values[2], original[2]);
});
