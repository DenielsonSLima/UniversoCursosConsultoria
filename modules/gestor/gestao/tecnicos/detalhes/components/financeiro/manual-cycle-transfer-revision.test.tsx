import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import FinanceiroCicloManualSetupFields from './FinanceiroCicloManualSetupFields';
import { cicloManualTransferSetup } from './ciclo-manual-transfer-setup';
import {
  changeCicloManualEnrollmentMode,
  changeCicloManualRevisionItem,
  cicloManualScheduleFromPreview,
} from './ciclo-manual-due-schedule';
import { revisionFromPreview } from './manual-technical-cycle-confirmation';
import type { CicloFinanceiroTecnicoManualPreview } from './matricula-tecnica-ciclo-manual.types';
import type { TransferEntrySnapshot } from '../../../../../../../supabase/functions/_shared/technical-transfer-schedule';

const preview = (cycle: 1 | 2 = 1): CicloFinanceiroTecnicoManualPreview => ({
  cronogramaEntradaVersao: 3, cronogramaEntradaFingerprint: 'a'.repeat(64),
  cicloNumero: cycle, sourceVencimento: 'INDIVIDUAL', dataOrigem: '2027-01-20',
  primeiroVencimento: '2027-01-20', quantidadeItens: 3, total: '475.00',
  modoMatricula: cycle === 1 ? 'REGISTRO_SEM_BOLETO' : 'BOLETO',
  regraEfetivaFingerprint: 'regra', politicaFingerprint: 'politica', cronogramaFingerprint: 'cronograma',
  termos: {
    descontoPontualidade: '0', jurosAtrasoPercentual: '0', multaAtrasoPercentual: '0', instrucaoBoleto: '',
    aplicacao: {
      matricula: { desconto: false, multaJuros: false },
      mensalidade: { desconto: false, multaJuros: false },
      rematricula: { desconto: false, multaJuros: false },
    },
  },
  itens: ['2027-01-20', '2027-02-14', '2027-05-02'].map((vencimento, index) => ({
    chave: `${cycle}:${index}`, numero: index,
    tipo: index ? 'PARCELA' : cycle === 1 ? 'MATRICULA' : 'REMATRICULA',
    descricao: index ? `Mensalidade ${index}` : 'Taxa', vencimento,
    valor: ['125.00', '200.00', '150.00'][index],
    detalhesBoleto: {
      valorNominal: ['125.00', '200.00', '150.00'][index],
      valorEmDia: ['125.00', '200.00', '150.00'][index],
      desconto: null, juros: null, multa: null, instrucaoBoleto: '', mensagensBoleto: [],
    },
  })),
});

test('cronograma v3 altera somente a parcela escolhida em cada ciclo', () => {
  const secondCycle = preview(2);
  const secondRevision = revisionFromPreview(secondCycle);
  for (const cycle of [1, 2] as const) {
    const canonical = preview(cycle);
    const revision = revisionFromPreview(canonical);
    const changed = changeCicloManualRevisionItem(
      revision, cicloManualScheduleFromPreview(canonical), `${cycle}:1`, 'vencimento', '2027-03-09',
    );
    assert.equal(changed.itens[1].vencimento, '2027-03-09');
    assert.deepEqual(changed.itens[0], revision.itens[0]);
    assert.deepEqual(changed.itens[2], revision.itens[2]);
    assert.equal(revision.itens[1].vencimento, '2027-02-14');
  }
  assert.deepEqual(secondRevision, revisionFromPreview(secondCycle));
});

test('matrícula LOCAL v3 muda sua data sem mover mensalidades individuais', () => {
  const canonical = preview();
  const revision = revisionFromPreview(canonical);
  const changed = changeCicloManualRevisionItem(
    revision, cicloManualScheduleFromPreview(canonical), '1:0', 'vencimento', '2026-10-10',
  );
  assert.equal(changed.itens[0].vencimento, '2026-10-10');
  assert.deepEqual(changed.itens.slice(1), revision.itens.slice(1));
});

test('trocar matrícula boleto/local/omitir preserva ajustes do cronograma v3', () => {
  const canonical = preview();
  const schedule = cicloManualScheduleFromPreview(canonical);
  const adjusted = changeCicloManualRevisionItem(
    revisionFromPreview(canonical), schedule, '1:1', 'valor', '215.75',
  );
  let revision = adjusted;
  for (const mode of ['OMITIR', 'BOLETO', 'REGISTRO_SEM_BOLETO'] as const) {
    revision = changeCicloManualEnrollmentMode(revision, schedule, mode, canonical.dataOrigem);
    assert.equal(revision.modoMatricula, mode);
    assert.equal(revision.emitirMatricula, mode === 'BOLETO');
    assert.deepEqual(revision.itens, adjusted.itens);
  }
});

const snapshot = (): TransferEntrySnapshot => ({
  versao: 3, requestId: '11111111-1111-4111-8111-111111111111',
  cicloInicial: 1, maxCiclos: 2, cronogramaFingerprint: 'a'.repeat(64),
  itens: Array.from({ length: 17 }, (_, index) => ({
    itemId: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
    cicloNumero: index < 5 ? 1 : 2, tipo: 'PARCELA', ordem: index < 5 ? index + 1 : index - 4,
    vencimento: '2027-02-14', valor: '200.00', descontoPontualidade: '0.00',
    jurosAtrasoPercentual: '0.000000', multaAtrasoPercentual: '0.000000',
  })),
});

const renderSetup = (plan: TransferEntrySnapshot) => {
  const setup = cicloManualTransferSetup(plan, 1);
  return renderToStaticMarkup(<FinanceiroCicloManualSetupFields
    cycleNumber={1} {...setup} plannedEntry installments={setup.installments}
    enrollmentMode={setup.enrollmentAvailable ? null : 'OMITIR'} fetching={false}
    canSettleEnrollment openSettlement={false} dateSource="INDIVIDUAL" individualDate="2027-02-14"
    suggestedDate="2027-02-14" onModeChange={() => {}} onOpenSettlementChange={() => {}}
    onDateSourceChange={() => {}} onDateChange={() => {}}
  />);
};

test('C1 com cinco parcelas não altera as doze de C2 e não reinclui matrícula removida', () => {
  const plan = snapshot();
  assert.equal(cicloManualTransferSetup(plan, 1).installments, 5);
  assert.equal(cicloManualTransferSetup(plan, 2).installments, 12);
  const html = renderSetup(plan);
  assert.match(html, /5 mensalidades/);
  assert.match(html, /não inclui matrícula/);
  assert.doesNotMatch(html, /type="radio"|type="date"/);
});

test('matrícula presente permite escolha de modo sem redistribuição de datas v3', () => {
  const plan = snapshot();
  plan.itens.unshift({ ...plan.itens[0], itemId: '22222222-2222-4222-8222-222222222222',
    tipo: 'MATRICULA', ordem: 6 });
  const html = renderSetup(plan);
  assert.equal((html.match(/type="radio"/g) ?? []).length, 3);
  assert.doesNotMatch(html, /type="date"/);
  assert.equal(cicloManualTransferSetup(plan, 1).installments, 5);
});
