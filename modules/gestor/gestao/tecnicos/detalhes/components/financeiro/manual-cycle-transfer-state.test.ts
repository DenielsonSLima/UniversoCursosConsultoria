import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import FinanceiroCicloManualStatus from './FinanceiroCicloManualStatus';
import { requireMatriculaTecnicaCicloManual } from './matricula-tecnica-ciclo-manual.parser';

const planned = (cycle: 1 | 2) => ({
  habilitado: true, modo: 'MANUAL', cicloBaseHistorico: 0, cicloMaximo: 2,
  proximoCicloNumero: cycle, primeiroVencimentoSugerido: '2027-01-20',
  criterioElegibilidade: 'TRANSFERENCIA_PLANEJADA', estado: 'ELEGIVEL', podeGerar: true,
  bloqueio: null, politica: { revisao: 1, fingerprint: 'a'.repeat(64) }, cicloGerado: null,
  planoEntrada: { cicloInicial: cycle, quantidadeParcelas: 6, primeiroVencimento: '2027-01-20',
    justificativaCiclo2: cycle === 2 ? 'Continuidade acadêmica recebida de outra instituição' : null,
    requestId: '11111111-1111-4111-8111-111111111111' },
});

test('plano autoriza representar C1/C2 inicial sem criar histórico fictício de C1', () => {
  for (const cycle of [1, 2] as const) {
    const state = requireMatriculaTecnicaCicloManual(planned(cycle));
    assert.equal(state.cicloBaseHistorico, 0);
    assert.equal(state.cicloGerado, null);
    assert.equal(state.proximoCicloNumero, cycle);
  }
});

test('exceção de entrada C2 exige plano completo, justificativa e estado coerente', () => {
  for (const patch of [
    { planoEntrada: undefined }, { planoEntrada: null }, { cicloBaseHistorico: 1 },
    { proximoCicloNumero: 1 }, { primeiroVencimentoSugerido: '2027-01-21' },
    { criterioElegibilidade: 'MANUAL_APOS_EMISSAO' },
    { bloqueio: { codigo: 'BLOQUEADO', mensagem: 'Revisão necessária' } },
  ]) assert.throws(() => requireMatriculaTecnicaCicloManual({ ...planned(2), ...patch }));
  for (const patch of [
    { cicloInicial: 3 }, { cicloInicial: '2' }, { quantidadeParcelas: 0 }, { quantidadeParcelas: 61 },
    { justificativaCiclo2: null }, { justificativaCiclo2: '' }, { requestId: 'sem-auditoria' },
    { primeiroVencimento: '2027-02-30' },
  ]) assert.throws(() => requireMatriculaTecnicaCicloManual({
    ...planned(2), planoEntrada: { ...planned(2).planoEntrada, ...patch },
  }));
});

test('plano C1 permanece informativo após emissão sem reduzir o próximo ciclo', () => {
  const state = planned(1);
  Object.assign(state, { criterioElegibilidade: 'MANUAL_APOS_EMISSAO', proximoCicloNumero: 2,
    cicloGerado: { numero: 1, status: 'EMITIDO_BANESE', quantidadeItens: 7, total: '700.00',
      quantidadeBancaria: 6, quantidadeLocal: 1, emitidosBanese: 6, pendentesEmissao: 0, emRevisao: 0 } });
  const result = requireMatriculaTecnicaCicloManual(state);
  assert.equal(result.proximoCicloNumero, 2);
  assert.equal(result.planoEntrada?.cicloInicial, 1);
});

test('C2 interno exige vínculo de origem completo; histórico protegido continua consultável', () => {
  const continuity = { matriculaOrigemId: '22222222-2222-4222-8222-222222222222',
    cadeiaOrigemIds: ['22222222-2222-4222-8222-222222222222'],
    transferenciaId: '33333333-3333-4333-8333-333333333333',
    cicloOrigem: 1, origemCompleta: true, semHistoricoFinanceiro: false };
  const state = { ...planned(2), planoEntrada: null, criterioElegibilidade: 'TRANSFERENCIA_INTERNA_CANONICA',
    continuidadeFinanceira: continuity };
  assert.equal(requireMatriculaTecnicaCicloManual(state).proximoCicloNumero, 2);
  for (const patch of [{ origemCompleta: false }, { semHistoricoFinanceiro: true },
    { cicloOrigem: null }, { transferenciaId: '' }, { cadeiaOrigemIds: [] },
    { cadeiaOrigemIds: ['inválida'] }, { cadeiaOrigemIds: Array(2).fill(continuity.matriculaOrigemId) }]) {
    assert.throws(() => requireMatriculaTecnicaCicloManual({ ...state,
      continuidadeFinanceira: { ...continuity, ...patch } }));
  }
  const protectedState = { ...state, criterioElegibilidade: 'MANUAL_APOS_EMISSAO',
    estado: 'PROTEGIDO_EXISTENTE', podeGerar: false, proximoCicloNumero: null,
    primeiroVencimentoSugerido: null, politica: null,
    bloqueio: { codigo: 'HISTORICO_FINANCEIRO_EXISTENTE', mensagem: 'Confira as cobranças da origem.' },
    continuidadeFinanceira: { ...continuity, origemCompleta: false } };
  assert.equal(requireMatriculaTecnicaCicloManual(protectedState).podeGerar, false);
});

const partialCycle = (cycle: 1 | 2) => requireMatriculaTecnicaCicloManual({
  ...planned(1), planoEntrada: null, criterioElegibilidade: 'MANUAL_APOS_EMISSAO',
  estado: cycle === 1 ? 'BLOQUEADO' : 'JA_GERADO', podeGerar: false,
  proximoCicloNumero: cycle === 1 ? 2 : null,
  bloqueio: cycle === 1 ? { codigo: 'CICLO_ANTERIOR_EMISSAO_PENDENTE', mensagem: 'Conclua a emissão anterior.' } : null,
  cicloGerado: { numero: cycle, status: 'EMISSAO_PENDENTE', quantidadeItens: 6, total: '600.00',
    emitidosBanese: 5, pendentesEmissao: 1, emRevisao: 0 },
});
const renderPartial = (cycle: 1 | 2, statusAcademico: string) => renderToStaticMarkup(
  React.createElement(FinanceiroCicloManualStatus, {
    cicloManual: partialCycle(cycle), statusAcademico, disabled: false,
    onGenerate: () => {}, onResume: () => {},
  }),
);

test('origem transferida não oferece retomada de C1/C2 parcial, preservando contadores', () => {
  for (const cycle of [1, 2] as const) {
    for (const status of ['TRANSFERIDO', 'CANCELADO', 'TRANCADO', 'CONCLUIDO']) {
      const markup = renderPartial(cycle, status);
      assert.doesNotMatch(markup, /Retomar emissão|Gerar e emitir/);
      assert.match(markup, /situação acadêmica não permite/);
      assert.match(markup, /5\/6 títulos emitidos/);
    }
  }
});

test('aluno ativo ou pendente mantém retomada de ciclo parcial sem liberar ciclo seguinte', () => {
  for (const cycle of [1, 2] as const) {
    for (const status of ['ATIVO', 'PENDENTE']) {
      const markup = renderPartial(cycle, status);
      assert.match(markup, /Retomar emissão/);
      assert.doesNotMatch(markup, / disabled="|Gerar e emitir/);
    }
  }
});

test('bloqueio acadêmico canônico também prevalece se status da linha estiver defasado', () => {
  const state = partialCycle(1);
  state.bloqueio = { codigo: 'STATUS_ACADEMICO', mensagem: 'Confira a situação acadêmica atual.' };
  const markup = renderToStaticMarkup(React.createElement(FinanceiroCicloManualStatus, {
    cicloManual: state, statusAcademico: 'ATIVO', disabled: false,
    onGenerate: () => {}, onResume: () => {},
  }));
  assert.doesNotMatch(markup, /Retomar emissão/);
  assert.match(markup, /Confira a situação acadêmica atual/);
});
