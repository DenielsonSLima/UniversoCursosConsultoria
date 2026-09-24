import assert from 'node:assert/strict';
import test from 'node:test';
import { reverseSettlementWithLocalGuard } from './financeiro.local-enrollment-reversal.ts';

const id = '11111111-1111-4111-8111-111111111111';
const settlementId = '22222222-2222-4222-8222-222222222222';
const localResult = {
  handled: true, success: true, replayed: false,
  settlementId,
  receivable: { id, status: 'PENDENTE', manual_settlement_id: settlementId },
  asaasRecreated: false, baneseRecreated: false,
  gatewayRecreated: false, gatewayProvider: null,
};

const dependencies = (data: unknown, error: unknown = null) => {
  const calls: Array<{ kind: string; input: unknown }> = [];
  return {
    calls,
    reverseLocal: async (input: unknown) => {
      calls.push({ kind: 'local', input });
      return { data, error };
    },
    reverseLegacy: async (...input: unknown[]) => {
      calls.push({ kind: 'legacy', input });
      return { success: true, receivable: { id, status: 'PENDENTE' } };
    },
  };
};

test('estorno local usa a baixa capturada e nunca solicita reemissão bancária', async () => {
  const deps = dependencies(localResult);
  const result = await reverseSettlementWithLocalGuard(id, {
    expectedSettlementId: settlementId, reason: 'Correção da baixa', recreateAsaas: true,
  }, deps);
  assert.equal(result.gatewayRecreated, false);
  assert.deepEqual(deps.calls, [{ kind: 'local', input: {
    p_receivable_id: id, p_expected_settlement_id: settlementId, p_reason: 'Correção da baixa',
  } }]);
});

test('somente negativa explícita de pertencimento segue o fluxo legado', async () => {
  const deps = dependencies({ handled: false });
  await reverseSettlementWithLocalGuard(id, { expectedSettlementId: settlementId, recreateAsaas: false }, deps);
  assert.deepEqual(deps.calls.map((call) => call.kind), ['local', 'legacy']);
  assert.deepEqual(deps.calls[1].input, [id, { recreateAsaas: false, reason: undefined }]);
});

test('erro de autorização, conflito ou rede não tenta estorno legado', async () => {
  for (const error of [new Error('Conflito de baixa'), { message: 'Acesso negado', code: '42501' }]) {
    const deps = dependencies(null, error);
    await assert.rejects(() => reverseSettlementWithLocalGuard(id, { expectedSettlementId: settlementId }, deps));
    assert.deepEqual(deps.calls.map((call) => call.kind), ['local']);
  }
});

test('respostas incompletas ou de outra cobrança não permitem fallback', async () => {
  for (const response of [null, [], {}, { handled: 'false' }, { success: true },
    { ...localResult, settlementId: id }, { ...localResult, replayed: undefined },
    { ...localResult, receivable: { ...localResult.receivable, manual_settlement_id: id } },
    { ...localResult, receivable: { id: settlementId, status: 'PENDENTE' } },
    { ...localResult, receivable: { id, status: 'PAGO' } },
    { ...localResult, gatewayRecreated: true }, { ...localResult, gatewayProvider: 'banese_card' }]) {
    const deps = dependencies(response);
    await assert.rejects(() => reverseSettlementWithLocalGuard(id, { expectedSettlementId: settlementId }, deps));
    assert.deepEqual(deps.calls.map((call) => call.kind), ['local']);
  }
});

test('replay confirmado preserva identidade e não repete a rota bancária', async () => {
  const deps = dependencies({ ...localResult, replayed: true });
  const result = await reverseSettlementWithLocalGuard(id, { expectedSettlementId: settlementId }, deps);
  assert.equal(result.replayed, true);
  assert.equal(deps.calls.length, 1);
});
