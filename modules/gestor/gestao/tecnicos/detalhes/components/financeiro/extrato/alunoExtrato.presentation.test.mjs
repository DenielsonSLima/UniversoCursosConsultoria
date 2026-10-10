import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const directory = fileURLToPath(new URL('.', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'aluno-extrato-presentation-'));
after(() => rm(output, { recursive: true, force: true }));
await build({
  stdin: {
    contents: `export * from './alunoExtrato.mapper'; export * from './alunoExtrato.presentation'; export * from './alunoExtrato.settlement-policy';`,
    resolveDir: directory, loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm',
  outfile: join(output, 'contract.mjs'),
});
const { mapAlunoExtratoRecebivel: map, extratoChargePresentation: charge,
  extratoChargeAction: action, extratoPaymentOrigin: origin,
  extratoPaymentMethod: method, canSettleExtratoReceivable: canSettle } = await import(
  pathToFileURL(resolve(output, 'contract.mjs')).href
);

const context = { poloId: 'polo-a', matriculaId: 'matricula-a' };
const capabilities = {
  sourceSystem: 'BANESE', provenanceKind: 'NATIVE_ISSUED',
  canSettle: true, canCancel: true, canEmit: false,
  canOpenExisting: true, canReconcile: true, readOnlyReason: null,
};
const title = {
  id: 'receivable-a', descricao: 'Mensalidade 1/12', valor: '279.90',
  valor_pago: null, data_vencimento: '2026-10-15', status: 'PENDENTE',
  forma_pagamento: 'BOLETO', origem_pagamento: null,
  gateway_provider: 'banese_card', gateway_payment_method: 'BOLETO',
  gateway_status: 'PENDING', gateway_payment_id: 'banese-title-a',
  asaas_status: null, asaas_payment_id: null,
  data_emissao: '2026-10-07', boleto_nosso_numero: '12345678',
  boleto_desconto_configurado: '19.90', boleto_desconto_valido_ate: '2026-10-15',
  boleto_desconto_situacao: 'VIGENTE', destino_cobranca: 'BANESE',
  emissao_gerenciada_turma: true, emissao_ciclo_status: 'EMITIDO',
  operation_capabilities: capabilities,
};

test('issued Banese title remains unpaid, with bank link and stored discount', () => {
  const item = map(title, context);
  assert.equal(item.status, 'PENDENTE');
  assert.equal(item.valorPago, undefined);
  assert.equal(item.dataPagamento, undefined);
  assert.equal(item.valor, 279.9);
  assert.equal(item.boletoDescontoConfigurado, 19.9);
  assert.equal(item.boletoDescontoValidoAte, '2026-10-15');
  assert.equal(item.boletoDescontoSituacao, 'VIGENTE');
  assert.equal(item.asaasStatus, 'PENDING');
  assert.equal(item.asaasPaymentId, 'banese-title-a');
  assert.equal(item.matriculaId, context.matriculaId);
  assert.equal(item.poloId, context.poloId);
  assert.deepEqual(item.operationCapabilities, capabilities);
  assert.deepEqual(charge(item), { label: 'Boleto emitido', detail: 'Banese', tone: 'confirmed' });
  assert.equal(origin(item), 'Banese');
  assert.equal(method(item), 'Boleto/Pix');
  assert.equal(action(item), 'banese');
});

test('payment and composition are displayed only when returned by the backend', () => {
  const item = map({ ...title, status: 'PAGO', valor_pago: '260.00',
    data_pagamento: '2026-10-09', origem_pagamento: 'PRESENCIAL',
    gateway_status: 'CANCELED', composicao_status: 'COMPOSICAO_EXPLICITA',
    desconto_aplicado: '19.90', gateway_settlement_source: 'MANUAL',
    emissao_ciclo_status: 'PENDENTE', forma_pagamento: 'PIX' }, context);
  assert.equal(item.valorPago, 260);
  assert.equal(item.descontoAplicado, 19.9);
  assert.equal(item.dataPagamento, '2026-10-09');
  assert.equal(item.gatewaySettlementSource, 'MANUAL');
  assert.match(origin(item), /^Manual/);
  assert.equal(method(item), 'Pix');
  assert.equal(action(item), null);
  assert.match(charge(item).label, /Cancelado no Banese/);
  assert.equal(charge(item).detail, '');
});

test('manual receipt presents its recorded method independently from the canceled bank title', () => {
  for (const [stored, expected] of [
    ['PIX', 'Pix'], ['DINHEIRO', 'Dinheiro'], ['CARTAO', 'Cartão'],
    ['BOLETO', 'Boleto'], [null, 'Não definido'],
  ]) {
    const item = map({ ...title, status: 'PAGO', origem_pagamento: 'PRESENCIAL',
      forma_pagamento: stored, gateway_status: 'CANCELED' }, context);
    assert.equal(method(item), expected);
  }
});

test('bank settlement keeps the channel supplied by the gateway without inferring Pix', () => {
  const paid = { ...title, status: 'PAGO', gateway_status: 'RECEIVED' };
  assert.equal(method(map({ ...paid, gateway_settlement_channel: 'PIX' }, context)), 'Pix (BolePix)');
  assert.equal(method(map({ ...paid, gateway_settlement_channel: 'BOLETO' }, context)), 'Boleto');
  assert.equal(method(map(paid, context)), 'Boleto/Pix — canal não identificado');
});

test('paid titles never suggest resuming issuance even with stale cycle or gateway metadata', () => {
  for (const gatewayStatus of ['PENDING', 'RECEIVED', null]) {
    const item = map({ ...title, status: 'PAGO', valor_pago: '279.90',
      data_pagamento: '2026-10-09', emissao_ciclo_status: 'PENDENTE',
      gateway_status: gatewayStatus }, context);
    assert.deepEqual(charge(item), { label: 'Pagamento registrado', detail: '', tone: 'confirmed' });
    assert.equal(action(item), null);
  }
});

test('confirmed bank cancellation is displayed before an incomplete cycle notice', () => {
  const item = map({ ...title, gateway_status: 'CANCELED',
    emissao_ciclo_status: 'PENDENTE' }, context);
  assert.deepEqual(charge(item), { label: 'Cancelado no Banese', detail: '', tone: 'neutral' });
  assert.equal(action(item), null);
});

test('no capability, issuance pending, quarantine and cancellation never open a title', () => {
  for (const patch of [
    { operation_capabilities: undefined },
    { operation_capabilities: { ...capabilities, canOpenExisting: false } },
    { emissao_ciclo_status: 'PENDENTE' },
    { gateway_last_error: 'BANESE_IDENTITY_QUARANTINED: mismatch' },
    { status: 'CANCELADO' },
    { gateway_status: 'DELETED' },
    { banese_cancellation: { state: 'PROCESSING', reason: 'TRANCAMENTO_FUTURO',
      movementId: 'movement-a', cutoffDate: '2026-10-09' } },
  ]) assert.equal(action(map({ ...title, ...patch }, context)), null);
  assert.equal(charge(map({ ...title, emissao_ciclo_status: 'PENDENTE' }, context)).label, 'Emissão não concluída');
});

test('local collection, imported Proesc and conflicting provenance stay read only', () => {
  const local = map({ ...title, destino_cobranca: 'LOCAL', origem_pagamento: 'LOCAL',
    gateway_provider: null, gateway_payment_id: null }, context);
  assert.equal(charge(local).label, 'Sem boleto');
  assert.equal(action(local), null);
  const proesc = map({ ...title, origem_pagamento: 'SISTEMA_ANTERIOR',
    operation_capabilities: { ...capabilities, sourceSystem: 'PROESC', provenanceKind: 'PROESC_HISTORY' } }, context);
  assert.equal(origin(proesc), 'Proesc');
  assert.equal(charge(proesc).label, 'Histórico Proesc');
  assert.equal(action(proesc), null);
  const conflict = map({ ...title, operation_capabilities: {
    ...capabilities, sourceSystem: 'CONFLICT', provenanceKind: 'CONFLICT',
  } }, context);
  assert.equal(charge(conflict).label, 'Origem em revisão');
  assert.equal(action(conflict), null);
});

test('legacy Asaas URL remains compatible without naming a Banese title Asaas', () => {
  const legacy = map({ id: 'legacy', descricao: 'Parcela', valor: '100',
    status: 'PENDENTE', data_vencimento: '2026-10-15', origem_pagamento: 'ASAAS',
    asaas_payment_id: 'old-id', asaas_status: 'PENDING',
    asaas_invoice_url: 'https://billing.example/old-id' }, context);
  assert.equal(origin(legacy), 'Asaas');
  assert.equal(charge(legacy).label, 'Cobrança emitida');
  assert.equal(action(legacy), 'external');
  assert.equal(legacy.asaasInvoiceUrl, 'https://billing.example/old-id');
  assert.equal(origin(map({ ...title, asaas_payment_id: 'stale-id' }, context)), 'Banese');
});

test('manual settlement requires operator permission, polo and server capability together', () => {
  const item = map(title, context);
  assert.equal(canSettle(item, true), true);
  assert.equal(canSettle({ ...item, status: 'VENCIDO' }, true), true);
  assert.equal(canSettle(item, false), false);
  assert.equal(canSettle({ ...item, poloId: undefined }, true), false);
  assert.equal(canSettle({ ...item, operationCapabilities: undefined }, true), false);
  assert.equal(canSettle({ ...item, operationCapabilities: { ...capabilities, canSettle: false } }, true), false);
});

test('terminal titles and origin or cancellation restrictions never allow manual settlement', () => {
  for (const patch of [
    ...['PAGO', 'CANCELADO', 'ESTORNADO', 'DEVOLVIDO', 'SUSPENSO'].map(status => ({ status })),
    { operation_capabilities: { ...capabilities, sourceSystem: 'PROESC', provenanceKind: 'PROESC_HISTORY' } },
    { operation_capabilities: { ...capabilities, sourceSystem: 'CONFLICT', provenanceKind: 'CONFLICT' } },
    { gateway_last_error: 'BANESE_IDENTITY_QUARANTINED: mismatch' },
    { banese_cancellation: { state: 'REVIEW_REQUIRED', reason: 'TRANCAMENTO_FUTURO',
      movementId: 'movement-a', cutoffDate: '2026-10-09' } },
  ]) assert.equal(canSettle(map({ ...title, ...patch }, context), true), false);
});
