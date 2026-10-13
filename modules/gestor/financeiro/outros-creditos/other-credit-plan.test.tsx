import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { filterTransferenciaPickerOptions } from '../transferencias/components/TransferenciaPicker';
import { OtherCreditPlanContent } from './OtherCreditPlanModal';
import { OtherCreditPlanForm } from './OtherCreditPlanForm';
import { OtherCreditPlanPreview } from './OtherCreditPlanPreview';
import {
  initialOtherCreditPlanForm, issueOtherCreditPlanSequentially, otherCreditPlanEmissionState,
  recoverOrCreateOtherCreditPlan, refreshOtherCreditPlanSequentially,
  toOtherCreditPlanInput, validateOtherCreditPlanInput,
} from './other-credit-plan.model';
import { clearOtherCreditPlanAttempt, loadOtherCreditPlanAttempt, resolveOtherCreditPlanCreationFailure, saveOtherCreditPlanAttempt } from './other-credit-plan-attempt';
import type { OtherCreditPlanCreationAttempt } from './other-credit-plan-attempt';
import { isDefinitiveOtherCreditPlanCreationError, OtherCreditPlanRpcError } from './other-credit-plan-error';
import type { OtherCreditPlan, OtherCreditPlanPreview as Preview } from './other-credit-plan.types';
import type { OtherCreditPlanModel } from './useOtherCreditPlan';

const completeForm = () => ({ ...initialOtherCreditPlanForm(), partnerId: 'partner', description: 'Aulas de prática', value: '120,00', quantity: '4', firstDueDate: '2026-10-31' });
const preview: Preview = {
  versao: 1, input: toOtherCreditPlanInput(completeForm()), quantidadeParcelas: 4,
  totalParcelas: 480, totalTaxas: 40, totalNominal: 520, totalComDesconto: 480,
  parcelas: [{ ordem: 1, papel: 'PARCELA', numero: 1, valor: 120, dataVencimento: '2026-10-31', valorComDesconto: 110,
    financialTerms: { nominalAmount: 120, dueDate: '2026-10-31', discount: { type: 'fixed', value: 10, validUntil: '2026-10-26' }, penalty: null, interest: null } }],
};
const plan = (receivables: OtherCreditPlan['receivables']): OtherCreditPlan => ({
  plano: { id: 'plan', polo_id: 'polo', cliente_id: 'partner', descricao: 'Aulas de prática', input: preview.input, preview, created_at: '2026-10-13' }, receivables,
});
const resources = { partners: [], categories: [], activePolo: { nome: 'Unidade de teste' }, partnersLoading: false, partnersError: false, retryPartners() {} };
const baseModel = {
  form: completeForm(), planId: null, busy: false, message: null, preview: null, attempt: null,
  previewPending: false, createPending: false, progress: null,
  changeForm() {}, previewPlan() {}, createPlan() {}, issuePlan() {}, refresh() {}, download() {},
};
const renderContent = (changes = {}) => renderToStaticMarkup(<OtherCreditPlanContent resources={resources as any}
  model={{ ...baseModel, ...changes } as unknown as OtherCreditPlanModel} />);

test('form envia configuração e taxas opcionais sem calcular parcelas ou criar vínculo acadêmico', () => {
  const form = completeForm();
  const input = toOtherCreditPlanInput({ ...form, interest: '1,5', discount: '10,00', discountDays: '5',
    enrollment: { enabled: true, value: '40,00', dueDate: '2026-10-25' } });
  assert.equal(input.valorParcela, 120);
  assert.equal(input.quantidadeParcelas, 4);
  assert.equal(input.jurosMensalPercentual, 1.5);
  assert.equal(input.descontoValor, 10);
  assert.deepEqual(input.matricula, { valor: 40, vencimento: '2026-10-25' });
  assert.equal(input.rematricula, null);
  assert.equal('turmaId' in input, false);
  assert.equal('matriculaId' in input, false);
  assert.equal(validateOtherCreditPlanInput(input, 'polo'), null);
  for (const quantity of [0, 61, 1.5]) assert.match(validateOtherCreditPlanInput({ ...input, quantidadeParcelas: quantity }, 'polo')!, /1 a 60/);
  assert.match(validateOtherCreditPlanInput({ ...input, descontoValor: 120 }, 'polo')!, /desconto/);
});

test('prévia exibe totais e vencimentos canônicos sem reconstruir cronograma', () => {
  const html = renderToStaticMarkup(<OtherCreditPlanPreview preview={preview} />);
  assert.match(html, /R\$\s*520,00/);
  assert.match(html, /R\$\s*480,00/);
  assert.match(html, /31\/10\/2026/);
  assert.match(html, /26\/10\/2026/);
  assert.match(html, /Parcela\s*1\/4/);
});

test('criação exige prévia atual e pedido incerto bloqueia edição mantendo ação de confirmação', () => {
  assert.match(renderContent(), /<button[^>]*disabled=""[^>]*>[\s\S]*?Criar carnê/);
  const ready = renderContent({ preview });
  assert.match(ready, /Criar carnê/);
  assert.doesNotMatch(ready, /<button[^>]*disabled=""/);
  const uncertain = renderContent({ attempt: { requestId: 'same-request' }, message: 'Confirmar pedido' });
  assert.match(uncertain, /<fieldset[^>]*disabled=""/);
  assert.match(uncertain, /Confirmar criação novamente/);
  assert.doesNotMatch(uncertain, /Conferir parcelas/);
});

test('busca encontra CPF completo enquanto opções exibem somente documento mascarado', () => {
  const options = [{ id: 'partner', label: 'Aluna de teste', detail: 'CPF 12*.***.**9-01', keywords: '12345678901' }];
  assert.equal(filterTransferenciaPickerOptions(options, '123.456.789-01')[0].id, 'partner');
  assert.equal(filterTransferenciaPickerOptions(options, '')[0].id, 'partner');
  const html = renderToStaticMarkup(<OtherCreditPlanForm form={completeForm()} onChange={() => {}} disabled={false}
    partners={[{ id: 'partner', nome: 'Aluna de teste', tipo: 'Aluno', cpf_cnpj: '12345678901' }]} categories={[]}
    partnersLoading={false} partnersError={false} retryPartners={() => {}} />);
  assert.match(html, /12\*\.\*{3}\.\*{2}9-01/);
  assert.doesNotMatch(html, /12345678901|<select/);
});

test('pedido sobrevive remontagem na sessão com a mesma chave até confirmação', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) || null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  const attempt: OtherCreditPlanCreationAttempt = { requestId: '12345678-1234-4234-8234-123456789012', poloId: 'polo', form: completeForm(), input: toOtherCreditPlanInput(completeForm()), phase: 'pending' };
  saveOtherCreditPlanAttempt(attempt, storage);
  assert.deepEqual(loadOtherCreditPlanAttempt('polo', storage), { ...JSON.parse(JSON.stringify(attempt)), phase: 'uncertain' });
  assert.equal(loadOtherCreditPlanAttempt('other-polo', storage), null);
  clearOtherCreditPlanAttempt('polo', storage);
  assert.equal(loadOtherCreditPlanAttempt('polo', storage), null);
});

test('classifica resposta SQL explícita e mantém timeout, 5xx e outros códigos como incertos', () => {
  for (const [code, status] of [['22023', 400], ['42501', 403]] as const) {
    const error = new OtherCreditPlanRpcError('Pedido recusado', code, status);
    assert.equal(error.code, code);
    assert.equal(isDefinitiveOtherCreditPlanCreationError(error), true);
  }
  for (const error of [
    new Error('Tempo de resposta excedido'),
    new OtherCreditPlanRpcError('Falha de rede', null, 0),
    new OtherCreditPlanRpcError('Falha no servidor', '22023', 500),
    new OtherCreditPlanRpcError('Falha no servidor', '42501', 503),
    new OtherCreditPlanRpcError('Erro não classificado', '23505', 409),
    Object.assign(new Error('Mensagem sem resposta SQL tipada'), { code: '22023' }),
  ]) assert.equal(isDefinitiveOtherCreditPlanCreationError(error), false);
});

test('armazenamento inválido ou de outro polo não restaura um pedido', () => {
  const attempt: OtherCreditPlanCreationAttempt = { requestId: '12345678-1234-4234-8234-123456789012', poloId: 'polo', form: completeForm(), input: toOtherCreditPlanInput(completeForm()), phase: 'pending' };
  for (const raw of [
    'JSON inválido',
    JSON.stringify({ ...attempt, requestId: 'inválido' }),
    JSON.stringify({ ...attempt, poloId: 'other-polo' }),
    JSON.stringify({ ...attempt, form: { ...attempt.form, value: null } }),
    JSON.stringify({ ...attempt, input: { ...attempt.input, quantidadeParcelas: 61 } }),
  ]) assert.equal(loadOtherCreditPlanAttempt('polo', { getItem: () => raw, setItem() {}, removeItem() {} }), null);
});

test('timeout seguido de 42501 conserva UUID, payload e bloqueio; rejeição inicial libera reconferência', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) || null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  const fresh: OtherCreditPlanCreationAttempt = { requestId: '12345678-1234-4234-8234-123456789012', poloId: 'polo', form: completeForm(), input: toOtherCreditPlanInput(completeForm()), phase: 'pending' };
  saveOtherCreditPlanAttempt(fresh, storage);
  const uncertain = resolveOtherCreditPlanCreationFailure(fresh, new Error('Timeout'), storage)!;
  assert.equal(uncertain.phase, 'uncertain');
  const retried = resolveOtherCreditPlanCreationFailure(uncertain, new OtherCreditPlanRpcError('Permissão revogada', '42501', 403), storage)!;
  assert.equal(retried.requestId, fresh.requestId);
  assert.deepEqual(retried.input, fresh.input);
  assert.equal(retried.phase, 'uncertain');
  assert.equal(loadOtherCreditPlanAttempt('polo', storage)?.requestId, fresh.requestId);
  const html = renderContent({ attempt: retried });
  assert.match(html, /<fieldset[^>]*disabled=""/);
  assert.match(html, /Confirmar criação novamente/);
  saveOtherCreditPlanAttempt(fresh, storage);
  assert.equal(resolveOtherCreditPlanCreationFailure(fresh, new OtherCreditPlanRpcError('Dados recusados', '22023', 400), storage), null);
  assert.equal(loadOtherCreditPlanAttempt('polo', storage), null);
});

test('pedido recuperado de armazenamento continua incerto mesmo após resposta SQL definitiva', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) || null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  const fresh: OtherCreditPlanCreationAttempt = { requestId: '12345678-1234-4234-8234-123456789012', poloId: 'polo', form: completeForm(), input: toOtherCreditPlanInput(completeForm()), phase: 'pending' };
  saveOtherCreditPlanAttempt(fresh, storage);
  const restored = loadOtherCreditPlanAttempt('polo', storage)!;
  const retained = resolveOtherCreditPlanCreationFailure(restored, new OtherCreditPlanRpcError('Pagador indisponível', '22023', 400), storage)!;
  assert.equal(retained.phase, 'uncertain');
  assert.equal(retained.requestId, fresh.requestId);
  assert.equal(loadOtherCreditPlanAttempt('polo', storage)?.requestId, fresh.requestId);
});

test('recuperação por leitura autorizada encontra o pedido incerto sem executar criação', async () => {
  const attempt: OtherCreditPlanCreationAttempt = { requestId: '12345678-1234-4234-8234-123456789012', poloId: 'polo', form: completeForm(), input: preview.input, phase: 'uncertain' };
  const canonical = plan([{ id: 'installment', status: 'PENDENTE' }]);
  canonical.plano.id = attempt.requestId;
  canonical.plano.input = { ...attempt.input, categoriaFinanceiraId: null };
  const reads: string[] = [];
  const recovered = await recoverOrCreateOtherCreditPlan(attempt, async id => { reads.push(id); return canonical; }, async () => {
    assert.fail('Pedido recuperado por consulta não pode exigir escrita.');
  });
  assert.equal(recovered, canonical);
  assert.deepEqual(reads, [attempt.requestId]);
});

test('recuperação recusa ID, polo ou configuração divergente sem criar outro plano', async () => {
  const attempt: OtherCreditPlanCreationAttempt = { requestId: '12345678-1234-4234-8234-123456789012', poloId: 'polo', form: completeForm(), input: preview.input, phase: 'uncertain' };
  for (const override of [
    { id: 'another-plan' }, { polo_id: 'another-polo' },
    { input: { ...attempt.input, valorParcela: 130 } },
  ]) {
    const divergent = plan([]);
    divergent.plano = { ...divergent.plano, id: attempt.requestId, ...override };
    await assert.rejects(recoverOrCreateOtherCreditPlan(attempt, async () => divergent, async () => {
      assert.fail('Divergência exige conferência do mesmo pedido.');
    }), /diverge deste pedido/);
    assert.equal(attempt.phase, 'uncertain');
    assert.equal(attempt.requestId, '12345678-1234-4234-8234-123456789012');
  }
});

test('falha na leitura mantém a mesma chave na confirmação e rejeição posterior permanece incerta', async () => {
  const attempt: OtherCreditPlanCreationAttempt = { requestId: '12345678-1234-4234-8234-123456789012', poloId: 'polo', form: completeForm(), input: preview.input, phase: 'uncertain' };
  const calls: unknown[] = [];
  const error = new OtherCreditPlanRpcError('Permissão revogada', '42501', 403);
  await assert.rejects(recoverOrCreateOtherCreditPlan(attempt, async () => { throw new Error('Falha de rede'); }, async (id, poloId, input) => {
    calls.push([id, poloId, input]);
    throw error;
  }), /Permissão revogada/);
  assert.deepEqual(calls, [[attempt.requestId, attempt.poloId, attempt.input]]);
  assert.equal(resolveOtherCreditPlanCreationFailure(attempt, error)?.requestId, attempt.requestId);
});

test('consulta recupera API_AMBIGUOUS por GET e não consulta pendentes, revisão manual ou emissão em andamento', async () => {
  let current = plan([
    { id: 'ambiguous', status: 'PENDENTE', gateway_provider: 'banese_card', gateway_status: 'CREATING', gateway_submission_status: 'API_AMBIGUOUS', gateway_boleto_nosso_numero: '000001111' },
    { id: 'unissued', status: 'PENDENTE' },
    { id: 'manual', status: 'PENDENTE', gateway_provider: 'banese_card', gateway_submission_status: 'API_REVIEW', gateway_boleto_nosso_numero: '000002222' },
    { id: 'inflight', status: 'PENDENTE', gateway_provider: 'banese_card', gateway_status: 'CREATING', gateway_boleto_nosso_numero: '000003333' },
  ]);
  const calls: string[] = [];
  const progress: number[] = [];
  const result = await refreshOtherCreditPlanSequentially('plan', async () => current, async id => {
    calls.push(id);
    current = plan(current.receivables.map(item => item.id === id
      ? { ...item, gateway_status: 'PENDING', gateway_submission_status: 'API_REGISTERED', gateway_payment_id: 'bank-id' } : item));
  }, state => progress.push(state.done));
  assert.deepEqual(calls, ['ambiguous']);
  assert.deepEqual(progress, [0, 1]);
  assert.equal(otherCreditPlanEmissionState(result.receivables[0]), 'issued');
  assert.equal(otherCreditPlanEmissionState(result.receivables[1]), 'pending');
  assert.equal(otherCreditPlanEmissionState(result.receivables[2]), 'review');
  assert.equal(otherCreditPlanEmissionState(result.receivables[3]), 'review');
});

test('estado CREATING bloqueia emissão e consulta não confirmada interrompe sequência', async () => {
  const inflight = plan([{ id: 'inflight', status: 'PENDENTE', gateway_status: 'CREATING' }]);
  await assert.rejects(issueOtherCreditPlanSequentially('plan', async () => inflight, async () => {
    assert.fail('Uma emissão em andamento não pode disparar outro POST.');
  }, () => {}), /conferência bancária/);
  const ambiguous = plan(['first', 'second'].map(id => ({ id, status: 'PENDENTE', gateway_provider: 'banese_card', gateway_submission_status: 'API_AMBIGUOUS', gateway_boleto_nosso_numero: id })));
  const calls: string[] = [];
  await assert.rejects(refreshOtherCreditPlanSequentially('plan', async () => ambiguous, async id => { calls.push(id); }, () => {}), /ainda não confirmou/);
  assert.deepEqual(calls, ['first']);
});

test('retomada emite sequencialmente só títulos pendentes preservando boleto já confirmado', async () => {
  let current = plan([
    { id: 'already', status: 'PENDENTE', gateway_provider: 'banese_card', gateway_payment_id: 'bank-already' },
    { id: 'next', status: 'PENDENTE' },
    { id: 'last', status: 'PENDENTE' },
  ]);
  const emitted: string[] = [];
  const progress: number[] = [];
  await issueOtherCreditPlanSequentially('plan', async () => current, async id => {
    emitted.push(id);
    current = plan(current.receivables.map(item => item.id === id ? { ...item, gateway_provider: 'banese_card', gateway_payment_id: `bank-${id}` } : item));
  }, state => progress.push(state.done));
  assert.deepEqual(emitted, ['next', 'last']);
  assert.deepEqual(progress, [1, 2, 3]);
});

test('falha interrompe emissão e retorno ambíguo impede reenvio automático', async () => {
  const emitted: string[] = [];
  await assert.rejects(issueOtherCreditPlanSequentially('plan', async () => plan([{ id: 'first', status: 'PENDENTE' }, { id: 'second', status: 'PENDENTE' }]),
    async id => { emitted.push(id); throw new Error('Resposta interrompida'); }, () => {}), /Resposta interrompida/);
  assert.deepEqual(emitted, ['first']);
  const ambiguous = { id: 'unknown', status: 'PENDENTE', gateway_submission_status: 'API_AMBIGUOUS' };
  assert.equal(otherCreditPlanEmissionState(ambiguous), 'review');
  await assert.rejects(issueOtherCreditPlanSequentially('plan', async () => plan([ambiguous]), async () => { assert.fail('Não deve reenviar.'); }, () => {}), /conferência bancária/);
});
