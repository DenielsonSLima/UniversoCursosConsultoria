import assert from 'node:assert/strict';
import test from 'node:test';
import { isTransferSchedulePlan, isTransferEntrySnapshot, isFeeOnlyTransferSchedule,
  type TransferEntrySnapshot, type TransferScheduleItem } from '../../../../../../../supabase/functions/_shared/technical-transfer-schedule';
import { requireMatriculaTecnicaCicloManual } from './matricula-tecnica-ciclo-manual.parser';
import { requireCicloFinanceiroTecnicoManualPreview } from './matricula-tecnica-ciclo-manual-preview.parser';
import { requireTransferSchedulePreview } from './manual-cycle-transfer-schedule';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const item = (n: number, cycle: 1 | 2 = 1): TransferScheduleItem => ({ itemId: uuid(n),
  cicloNumero: cycle, tipo: 'PARCELA', ordem: n, vencimento: '2027-05-20', valor: '150.00',
  descontoPontualidade: '0.00', jurosAtrasoPercentual: '2.123456', multaAtrasoPercentual: '0' });
const entry = (itens: TransferScheduleItem[]): TransferEntrySnapshot => ({ versao: 3,
  itens, requestId: uuid(99), cicloInicial: itens.length ? Math.min(...itens.map(i => i.cicloNumero)) as 1 | 2 : 1,
  maxCiclos: 2, cronogramaFingerprint: 'a'.repeat(64) });
const state = (snapshot: TransferEntrySnapshot) => ({ habilitado: true, modo: 'MANUAL',
  cicloBaseHistorico: 0, cicloMaximo: 2, proximoCicloNumero: snapshot.cicloInicial,
  primeiroVencimentoSugerido: snapshot.itens[0]?.vencimento ?? '2027-01-20',
  criterioElegibilidade: 'TRANSFERENCIA_PLANEJADA', estado: snapshot.itens.length ? 'ELEGIVEL' : 'BLOQUEADO',
  podeGerar: snapshot.itens.length > 0, bloqueio: snapshot.itens.length ? null
    : { codigo: 'SEM_COBRANCAS_PLANEJADAS', mensagem: 'Nenhuma cobrança no plano.' },
  politica: { revisao: 1, fingerprint: 'b'.repeat(64) }, cicloGerado: null, planoEntrada: snapshot });

test('cronograma explícito aceita ciclos independentes, vazio, limites e precisão canônica', () => {
  for (const itens of [[], [item(1, 2)], [item(1), item(2, 2)],
    Array.from({ length: 60 }, (_, i) => item(i + 1))]) {
    assert.equal(isTransferSchedulePlan(entry(itens)), true);
    assert.equal(isTransferEntrySnapshot(entry(itens)), true);
  }
  assert.equal(isTransferSchedulePlan(entry([item(1, 2)]), 1), false);
  for (const patch of [{ valor: '0.00' }, { valor: '10000000.00' }, { valor: '150,00' },
    { descontoPontualidade: '150.00' }, { jurosAtrasoPercentual: '100' },
    { jurosAtrasoPercentual: '2.1234567' }, { vencimento: '2027-02-30' },
    { tipo: 'REMATRICULA' }, { ordem: 0 }, { ordem: 62 }, { itemId: 'sem-id' }]) {
    assert.equal(isTransferSchedulePlan({ versao: 3, itens: [{ ...item(1), ...patch }] }), false);
  }
  assert.equal(isTransferSchedulePlan(entry([item(1), item(1)])), false);
  assert.equal(isTransferSchedulePlan(entry([item(1), { ...item(2), ordem: 1 }])), false);
});

test('entrada direta C2 dispensa justificativa; vazio continua bloqueado sem histórico fictício', () => {
  for (const snapshot of [entry([]), entry([item(1)]), entry([item(1, 2)])]) {
    const parsed = requireMatriculaTecnicaCicloManual(state(snapshot));
    assert.equal(parsed.cicloBaseHistorico, 0);
    assert.equal(parsed.cicloGerado, null);
    assert.equal(parsed.podeGerar, snapshot.itens.length > 0);
  }
  const original = state(entry([item(1, 2)]));
  for (const patch of [{ requestId: '' }, { cronogramaFingerprint: '' }, { cicloInicial: 1 }]) {
    assert.throws(() => requireMatriculaTecnicaCicloManual({ ...original,
      planoEntrada: { ...original.planoEntrada, ...patch } }));
  }
  assert.throws(() => requireMatriculaTecnicaCicloManual({ ...state(entry([])), podeGerar: true }));
});

test('taxa isolada exige snapshot comprovado e distingue matrícula de rematrícula', () => {
  const fee = { ...item(1), tipo: 'MATRICULA' as const };
  assert.equal(isFeeOnlyTransferSchedule(entry([fee]), 1), true);
  assert.equal(isFeeOnlyTransferSchedule(entry([fee]), 2), false);
  assert.equal(isFeeOnlyTransferSchedule(entry([fee, item(2)]), 1), false);
  assert.equal(isFeeOnlyTransferSchedule({ ...entry([fee]), cronogramaFingerprint: '' }, 1), false);
});

const previewFor = (snapshot: TransferEntrySnapshot) => ({
  cronogramaEntradaVersao: 3, cronogramaEntradaFingerprint: snapshot.cronogramaFingerprint,
  cicloNumero: 1, sourceVencimento: 'INDIVIDUAL', dataOrigem: '2027-05-20',
  primeiroVencimento: '2027-05-20', quantidadeItens: snapshot.itens.length,
  total: '300.00', modoMatricula: 'OMITIR', mensalidadesHabilitadas: true,
  termos: { descontoPontualidade: '0.00', jurosAtrasoPercentual: '0', multaAtrasoPercentual: '0',
    instrucaoBoleto: 'Instrução', aplicacao: { matricula: { desconto: false, multaJuros: false },
      mensalidade: { desconto: false, multaJuros: false }, rematricula: { desconto: false, multaJuros: false } } },
  regraEfetivaFingerprint: 'c'.repeat(64), politicaFingerprint: 'd'.repeat(64), cronogramaFingerprint: 'e'.repeat(64),
  itens: snapshot.itens.map((it, index) => ({ itemId: it.itemId, tipo: it.tipo, numero: index + 1,
    chave: `ciclo-1-parc-${index + 1}`, descricao: 'Mensalidade', valor: it.valor, vencimento: it.vencimento,
    detalhesBoleto: { valorNominal: it.valor, valorEmDia: it.valor, desconto: null, multa: null, juros: null,
      instrucaoBoleto: 'Instrução', mensagensBoleto: ['Mensalidade', 'Turma', 'Instrução'] } })),
});

test('reordenar v3 preserva datas individuais; legado ainda exige datas crescentes', () => {
  const snapshot = entry([item(1), { ...item(2), vencimento: '2027-04-20' }]);
  const source = previewFor(snapshot);
  const preview = requireCicloFinanceiroTecnicoManualPreview(source);
  assert.doesNotThrow(() => requireTransferSchedulePreview(snapshot, preview));
  assert.throws(() => requireCicloFinanceiroTecnicoManualPreview({ ...source,
    cronogramaEntradaVersao: undefined, cronogramaEntradaFingerprint: undefined }));
  for (const patch of [{ cronogramaEntradaFingerprint: undefined },
    { itens: source.itens.map(it => ({ ...it, itemId: undefined })) },
    { itens: source.itens.map(it => ({ ...it, itemId: uuid(1) })) }]) {
    assert.throws(() => requireCicloFinanceiroTecnicoManualPreview({ ...source, ...patch }));
  }
  assert.throws(() => requireTransferSchedulePreview(snapshot, { ...preview, cronogramaEntradaFingerprint: 'b'.repeat(64) }));
  assert.throws(() => requireTransferSchedulePreview(snapshot, { ...preview, itens: [...preview.itens].reverse() }));
  assert.throws(() => requireTransferSchedulePreview(null, preview));
});
