import assert from 'node:assert/strict';
import {
  isDefiniteTransferRejection, requireExternalTransferPreview, requireExternalTransferResult,
  type ExternalTransferPreview, type ExternalTransferResult,
} from './external-transfer.contract.ts';
import { ExternalTransferAttempt } from './external-transfer-attempt.ts';
import { createExternalTransferClient } from './external-transfer.client.ts';
import {
  buildExternalTransferInput, createExternalTransferDraft, externalTransferDraftError,
  externalTransferPlan,
} from './external-transfer-draft.ts';

declare const Deno: { test: (name: string, fn: () => void | Promise<void>) => void };

const preview = (): ExternalTransferPreview => ({
  versao: 1, regraFingerprint: 'canonical-rule', quantidadeMaxima: 10,
  financeiro: { cicloNumero: 1, quantidadeParcelas: 6, primeiroVencimento: '2027-01-20', justificativaCiclo2: null },
  regra: {
    valorMatricula: '100.00', valorMensalidade: '200.00', valorRematricula: '100.00',
    encargos: { descontoPontualidade: '10.00', jurosAtrasoPercentual: '1.00', multaAtrasoPercentual: '2.00' },
    aplicacao: {
      matricula: { desconto: false, multaJuros: false },
      mensalidade: { desconto: true, multaJuros: true },
      rematricula: { desconto: false, multaJuros: false },
    },
  }, avisos: [],
});
const draft = () => ({ ...createExternalTransferDraft('student-a', '2000-01-01'),
  institution: 'Instituição de origem', reason: 'Continuidade', installments: '6', firstDueDate: '2027-01-20',
  credits: {
    discipline: { selected: true, mediaFinal: '0', frequenciaPercent: '', situacao: 'EQUIVALENCIA' as const },
    ignored: { selected: false, mediaFinal: '9', frequenciaPercent: '95', situacao: 'APROVEITADO' as const },
  },
});
const input = () => buildExternalTransferInput(draft(), 'class', preview(), 'request-1');
const result = (requestId = 'request-1'): ExternalTransferResult => ({
  versao: 1, requestId, replayed: false, matriculaId: 'enrollment', transferenciaId: 'transfer',
  financeiro: preview(), cobrancaGerada: false,
});

Deno.test('novo aluno começa sem créditos, origem, ciclo ou data financeira anteriores', () => {
  const previous = draft();
  previous.cycle = 2;
  previous.cycle2Reason = 'Continuidade anterior';
  const changed = createExternalTransferDraft('student-b', '2000-01-02');
  assert.equal(changed.studentId, 'student-b');
  assert.deepEqual(changed.credits, {});
  assert.equal(changed.institution, '');
  assert.equal(changed.firstDueDate, '');
  assert.equal(changed.cycle2Reason, '');
  assert.equal(changed.cycle, 1);
  assert.equal(externalTransferPlan(changed, 10), null);
});

Deno.test('plano respeita limite canônico e exige data e justificativa explícita de C2', () => {
  const current = draft();
  assert.equal(externalTransferPlan({ ...current, installments: '11' }, 10), null);
  assert.equal(externalTransferPlan({ ...current, installments: '1.5' }, 10), null);
  assert.equal(externalTransferPlan({ ...current, firstDueDate: '2027-02-30' }, 10), null);
  assert.equal(externalTransferPlan({ ...current, cycle: 2 }, 10), null);
  assert.equal(externalTransferPlan({ ...current, cycle: 2, cycle2Reason: ' Histórico externo ' }, 10)?.justificativaCiclo2, 'Histórico externo');
});

Deno.test('envio usa somente créditos selecionados, preserva zero e rejeita nota inválida', () => {
  assert.deepEqual(input().aproveitamentos, [
    { disciplinaId: 'discipline', mediaFinal: 0, frequenciaPercent: null, situacao: 'EQUIVALENCIA' },
  ]);
  const invalid = draft();
  invalid.credits.discipline.mediaFinal = '11';
  assert.match(externalTransferDraftError(invalid) || '', /média/);
  assert.throws(() => buildExternalTransferInput(invalid, 'class', preview(), 'request'), /média/);
  assert.throws(() => buildExternalTransferInput({ ...draft(), installments: '5' }, 'class', preview(), 'request'), /plano mudou/);
});

Deno.test('parser rejeita plano incompleto, quantidade fora da regra e falsa geração', () => {
  assert.deepEqual(requireExternalTransferPreview(preview()), preview());
  assert.throws(() => requireExternalTransferPreview({ ...preview(), regraFingerprint: '' }));
  assert.throws(() => requireExternalTransferPreview({ ...preview(), quantidadeMaxima: 5 }));
  assert.throws(() => requireExternalTransferPreview({ ...preview(), financeiro: { ...preview().financeiro, cicloNumero: 2 } }));
  assert.throws(() => requireExternalTransferResult(result('different-request'), 'request-1'));
  assert.throws(() => requireExternalTransferResult({ ...result(), cobrancaGerada: true }, 'request-1'));
});

Deno.test('cliente transmite plano e fingerprint na RPC canônica sem emissão', async () => {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const client = createExternalTransferClient(async (name, params) => {
    calls.push({ name, params });
    return { data: name.startsWith('preview_') ? preview() : result(), error: null };
  });
  await client.preview('student-a', 'class', preview().financeiro);
  await client.receive(input());
  assert.equal(calls[0].name, 'preview_recebimento_transferencia_tecnica_secure');
  assert.equal(calls[1].name, 'receber_transferencia_tecnica_planejada_secure');
  assert.equal(calls[1].params.p_request_id, 'request-1');
  assert.equal(calls[1].params.p_expected_regra_fingerprint, 'canonical-rule');
  assert.deepEqual(calls[1].params.p_financeiro, preview().financeiro);
  assert.equal('p_gerar_cobranca_inicial' in calls[1].params, false);
});

Deno.test('trava síncrona evita duplo envio e fechamento enquanto a chamada aguarda', async () => {
  const attempt = new ExternalTransferAttempt();
  let release!: (value: ExternalTransferResult) => void;
  let calls = 0;
  const receive = () => { calls++; return new Promise<ExternalTransferResult>((resolve) => { release = resolve; }); };
  const first = attempt.run(input, receive);
  assert.equal(attempt.canEdit, false);
  assert.equal(attempt.canClose, false);
  assert.equal(await attempt.run(input, receive), null);
  assert.equal(calls, 1);
  release(result());
  assert.deepEqual(await first, result());
  assert.deepEqual(await attempt.run(input, receive), result());
  assert.equal(calls, 1);
});

Deno.test('resposta ambígua preserva a mesma chave e payload até replay confirmado', async () => {
  const attempt = new ExternalTransferAttempt();
  const original = input();
  await assert.rejects(attempt.run(() => original, async () => { throw new TypeError('Failed to fetch'); }));
  original.motivo = 'Edição que não pode alterar a operação';
  assert.equal(attempt.uncertain, true);
  assert.equal(attempt.canClose, false);
  let replayInput;
  await attempt.run(() => { throw new Error('Não deve criar outro pedido'); }, async (value) => {
    replayInput = value;
    return { ...result(), replayed: true };
  });
  assert.equal(replayInput?.requestId, 'request-1');
  assert.equal(replayInput?.motivo, 'Continuidade');
  assert.equal(attempt.canClose, true);
});

Deno.test('rejeição transacional permite corrigir plano, erro de rede não presume rollback', async () => {
  for (const code of ['22023', '42501', 'P0001', '40001']) assert.equal(isDefiniteTransferRejection({ code }), true);
  assert.equal(isDefiniteTransferRejection({ message: 'Network error' }), false);
  const attempt = new ExternalTransferAttempt();
  await assert.rejects(attempt.run(input, async () => { throw { code: '40001', message: 'Regra mudou' }; }));
  assert.equal(attempt.canEdit, true);
  assert.equal(attempt.hasInput, false);
  let nextId;
  await attempt.run(() => ({ ...input(), requestId: 'request-2' }), async (value) => {
    nextId = value.requestId;
    return result(value.requestId);
  });
  assert.equal(nextId, 'request-2');
});

Deno.test('permissão recusada no replay não apaga a incerteza do primeiro commit', async () => {
  const attempt = new ExternalTransferAttempt();
  await assert.rejects(attempt.run(input, async () => { throw new TypeError('Resposta perdida'); }));
  await assert.rejects(attempt.run(() => { throw new Error('Nova intenção proibida'); }, async () => {
    throw { code: '42501', message: 'Permissão mudou após a primeira chamada' };
  }));
  assert.equal(attempt.uncertain, true);
  assert.equal(attempt.hasInput, true);
  assert.equal(attempt.canEdit, false);
});
