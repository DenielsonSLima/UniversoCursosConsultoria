import assert from 'node:assert/strict';
import {
  isDefiniteTransferRejection, isExternalTransferRate, requireExternalTransferPreview, requireExternalTransferResult,
  type ExternalTransferPreview, type ExternalTransferResult, type ExternalTransferScheduleItem,
} from './external-transfer.contract.ts';
import { ExternalTransferAttempt } from './external-transfer-attempt.ts';
import { createExternalTransferClient } from './external-transfer.client.ts';
import {
  applyExternalTransferDefaults, buildExternalTransferInput, changeExternalTransferItemCycle, createExternalTransferDraft,
  externalTransferDraftError, externalTransferFinancialError, externalTransferPlan, moveExternalTransferItem,
  removeExternalTransferItem, updateExternalTransferItem,
} from './external-transfer-draft.ts';
import { formatExternalTransferDecimal, parseExternalTransferDecimal } from './external-transfer-presentation.ts';

declare const Deno: { test: (name: string, fn: () => void | Promise<void>) => void };

const itemId = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const item = (id: number, cicloNumero: 1 | 2, tipo: ExternalTransferScheduleItem['tipo'], ordem: number): ExternalTransferScheduleItem => ({
  itemId: itemId(id), cicloNumero, tipo, ordem, vencimento: cicloNumero === 1 ? '2027-01-20' : '2028-01-20',
  valor: tipo === 'MATRICULA' ? '150.00' : tipo === 'REMATRICULA' ? '100.00' : '200.00',
  descontoPontualidade: tipo === 'PARCELA' ? '10.00' : '0.00',
  jurosAtrasoPercentual: '1.000000', multaAtrasoPercentual: '2.000000',
});
const preview = (): ExternalTransferPreview => ({
  versao: 3, regraFingerprint: 'canonical-rule', quantidadeMaxima: 60, maxCiclos: 2,
  financeiro: { versao: 3, itens: [
    item(1, 1, 'MATRICULA', 1), ...Array.from({ length: 12 }, (_, index) => item(index + 2, 1, 'PARCELA', index + 2)),
    item(14, 2, 'REMATRICULA', 1), ...Array.from({ length: 12 }, (_, index) => item(index + 15, 2, 'PARCELA', index + 2)),
  ] },
  totais: { porCiclo: [
    { cicloNumero: 1, totalNominal: '2550.00', quantidadeParcelas: 12, quantidadeItens: 13 },
    { cicloNumero: 2, totalNominal: '2500.00', quantidadeParcelas: 12, quantidadeItens: 13 },
  ], totalNominal: '5050.00' },
  regra: {
    valorMatricula: '150.00', valorMensalidade: '200.00', valorRematricula: '100.00',
    encargos: { descontoPontualidade: '10.00', jurosAtrasoPercentual: '1.000000', multaAtrasoPercentual: '2.000000' },
    aplicacao: {
      matricula: { desconto: false, multaJuros: false }, mensalidade: { desconto: true, multaJuros: true },
      rematricula: { desconto: false, multaJuros: false },
    },
  }, avisos: [],
});
const draft = () => ({ ...applyExternalTransferDefaults(createExternalTransferDraft('student-a', '2000-01-01'), preview()),
  institution: 'Escola anterior', reason: 'Continuidade',
  credits: {
    discipline: { selected: true, mediaFinal: '0', frequenciaPercent: '', situacao: 'EQUIVALENCIA' as const },
    ignored: { selected: false, mediaFinal: '9', frequenciaPercent: '95', situacao: 'APROVEITADO' as const },
  },
});
const input = () => buildExternalTransferInput(draft(), 'class', preview(), 'request-1');
const result = (requestId = 'request-1'): ExternalTransferResult => ({
  versao: 3, requestId, replayed: false, matriculaId: 'enrollment', transferenciaId: 'transfer',
  financeiro: preview(), cobrancaGerada: false,
});

Deno.test('novo aluno limpa rascunho; recebimento envia escola anterior e cursoOrigem null', () => {
  const changed = createExternalTransferDraft('student-b', '2000-01-02');
  assert.equal(changed.studentId, 'student-b');
  assert.deepEqual(changed.credits, {});
  assert.equal(changed.institution, '');
  assert.equal(changed.items, null);
  assert.equal(externalTransferPlan(changed, 60), null);
  assert.equal(input().cursoOrigem, null);
  assert.deepEqual(input().aproveitamentos, [{ disciplinaId: 'discipline', mediaFinal: 0, frequenciaPercent: null, situacao: 'EQUIVALENCIA' }]);
});

Deno.test('padrão 150 matrícula e 12 parcelas por ciclo; edição C1 preserva C2 e notas', () => {
  const current = draft();
  assert.equal(externalTransferFinancialError(current, 60), null);
  assert.equal(current.items![0].valor, '150.00');
  const cycle2 = current.items!.filter((row) => row.cicloNumero === 2);
  const edited = { ...current, items: current.items!.filter((row) => row.cicloNumero === 2 || row.ordem <= 6) };
  assert.equal(edited.items.filter((row) => row.cicloNumero === 1 && row.tipo === 'PARCELA').length, 5);
  assert.deepEqual(edited.items.filter((row) => row.cicloNumero === 2), cycle2);
  const restored = applyExternalTransferDefaults(edited, preview());
  assert.deepEqual(restored.items, preview().financeiro.itens);
  assert.deepEqual(restored.credits, current.credits);
  assert.equal(restored.institution, current.institution);
});

Deno.test('edição por linha preserva demais cobranças e obriga nova revisão', () => {
  const current = draft();
  const changed = updateExternalTransferItem(current.items!, itemId(2), { valor: '175.00', vencimento: '2027-02-20' });
  assert.equal(changed[1].valor, '175.00');
  assert.deepEqual(changed.filter((row) => row.itemId !== itemId(2)), current.items!.filter((row) => row.itemId !== itemId(2)));
  assert.throws(() => buildExternalTransferInput({ ...current, items: changed }, 'class', preview(), 'request'), /plano mudou/);
  current.credits.discipline.mediaFinal = '11';
  assert.match(externalTransferDraftError(current) || '', /média/);
});

Deno.test('mover preserva ciclo e datas; remoção e troca de ciclo preservam IDs restantes', () => {
  const rows = preview().financeiro.itens;
  const moved = moveExternalTransferItem(rows, itemId(3), -1);
  assert.equal(moved[1].itemId, itemId(3));
  assert.equal(moved[1].cicloNumero, 1);
  assert.equal(moved[1].vencimento, rows[2].vencimento);
  assert.deepEqual(moved.filter((row) => row.cicloNumero === 2), rows.filter((row) => row.cicloNumero === 2));
  assert.equal(moveExternalTransferItem(rows, itemId(1), 1), rows);
  const transferred = changeExternalTransferItemCycle(rows, itemId(3), 2);
  assert.equal(transferred.find((row) => row.itemId === itemId(3))?.cicloNumero, 2);
  assert.equal(transferred.find((row) => row.itemId === itemId(3))?.valor, '200.00');
  assert.equal(changeExternalTransferItemCycle(rows, itemId(1), 2), rows);
  const removed = removeExternalTransferItem(rows, itemId(2));
  assert.equal(removed.some((row) => row.itemId === itemId(2)), false);
  assert.equal(removed[1].ordem, 2);
  assert.deepEqual(removed.filter((row) => row.cicloNumero === 2), rows.filter((row) => row.cicloNumero === 2));
});

Deno.test('parser rejeita cronograma inconsistente e falsa emissão; vazio é acadêmico sem cobrança', () => {
  assert.deepEqual(requireExternalTransferPreview(preview()), preview());
  assert.deepEqual(externalTransferPlan({ ...draft(), items: [] }, 60), { versao: 3, itens: [] });
  for (const patch of [{ valor: '0.00' }, { cicloNumero: 2 }, { jurosAtrasoPercentual: '100.000000' }, { descontoPontualidade: '150.00' }, { ordem: 0 }]) {
    const bad = { ...preview(), financeiro: { versao: 3, itens: [{ ...preview().financeiro.itens[0], ...patch }] } };
    assert.throws(() => requireExternalTransferPreview(bad));
  }
  assert.throws(() => requireExternalTransferPreview({ ...preview(), financeiro: { versao: 3, itens: [item(2, 1, 'PARCELA', 1), item(2, 1, 'PARCELA', 2)] } }));
  assert.throws(() => requireExternalTransferPreview({ ...preview(), maxCiclos: 1 }));
  assert.throws(() => requireExternalTransferPreview({ ...preview(), versao: 2 }));
  assert.throws(() => requireExternalTransferResult(result('different-request'), 'request-1'));
  assert.throws(() => requireExternalTransferResult({ ...result(), cobrancaGerada: true }, 'request-1'));
});

Deno.test('cronograma somente C2 não exige justificativa extra de continuidade', () => {
  const context = preview();
  context.financeiro.itens = context.financeiro.itens.filter((row) => row.cicloNumero === 2);
  context.totais.porCiclo[0] = { cicloNumero: 1, totalNominal: '0.00', quantidadeParcelas: 0, quantidadeItens: 0 };
  context.totais.totalNominal = '2500.00';
  const current = applyExternalTransferDefaults(draft(), context);
  assert.equal('cycle2Reason' in current, false);
  assert.equal(externalTransferFinancialError(current, 60), null);
  assert.deepEqual(buildExternalTransferInput(current, 'class', context, 'request').financeiro, context.financeiro);
});

Deno.test('entrada pt-BR formata 150 e 1.500,25; percentuais mantêm seis casas e limite menor que100', () => {
  assert.equal(parseExternalTransferDecimal('150'), '150.00');
  assert.equal(formatExternalTransferDecimal('150.00'), '150,00');
  assert.equal(parseExternalTransferDecimal('1.500,25'), '1500.25');
  assert.equal(parseExternalTransferDecimal('R$ 1.500,25'), '1500.25');
  assert.equal(parseExternalTransferDecimal('150.00'), '150.00');
  assert.equal(parseExternalTransferDecimal('1,123456', true), '1.123456');
  assert.equal(formatExternalTransferDecimal('1.123456', true), '1,123456');
  assert.equal(parseExternalTransferDecimal('-1'), null);
  assert.equal(parseExternalTransferDecimal('1,1234567', true), null);
  for (const value of ['0.000000', '1.000000', '99.999999']) assert.equal(isExternalTransferRate(value), true);
  for (const value of ['-1', '100.000000', '1.1234567']) assert.equal(isExternalTransferRate(value), false);
});

Deno.test('cliente usa RPCv3 e ajuste específico de C1 sem alterar intenção de C2 nem emitir', async () => {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const client = createExternalTransferClient(async (name, params) => {
    calls.push({ name, params });
    return { data: name.startsWith('preview_') ? preview() : result(), error: null };
  });
  const adjustment = { acao: 'CONFIGURAR_CICLO' as const, cicloNumero: 1 as const, quantidadeParcelas: 5, cobrarTaxa: true, valorTaxa: '150.00' };
  await client.preview('student-a', 'class', preview().financeiro, adjustment);
  await client.receive(input());
  assert.equal(calls[0].name, 'preview_recebimento_transferencia_tecnica_v3_secure');
  assert.deepEqual(calls[0].params.p_ajuste, adjustment);
  assert.deepEqual(calls[0].params.p_financeiro, preview().financeiro);
  assert.equal(calls[1].name, 'receber_transferencia_tecnica_v3_secure');
  assert.equal(calls[1].params.p_curso_origem, null);
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

