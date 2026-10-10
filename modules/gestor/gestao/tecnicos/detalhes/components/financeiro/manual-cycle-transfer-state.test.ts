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

const conditions = {
  cobrarMatricula: false, valorMatricula: '100.00', valorMensalidade: '250.00',
  cobrarRematricula: false, valorRematricula: '100.00', descontoPontualidade: '20.00',
  jurosAtrasoPercentual: '2.00', multaAtrasoPercentual: '2.00',
  aplicarDescontoMatricula: false, aplicarMultaJurosMatricula: false,
  aplicarDescontoMensalidade: true, aplicarMultaJurosMensalidade: true,
  aplicarDescontoRematricula: false, aplicarMultaJurosRematricula: false,
};

test('plano sem cobranças bloqueia emissão e conserva o ciclo inicial acadêmico', () => {
  for (const cycle of [1, 2] as const) {
    const state = { ...planned(cycle), estado: 'BLOQUEADO', podeGerar: false,
      bloqueio: { codigo: 'SEM_COBRANCAS_PLANEJADAS', mensagem: 'Nenhuma cobrança selecionada.' },
      planoEntrada: { ...planned(cycle).planoEntrada, cobrarMensalidades: false, condicoes: conditions } };
    assert.equal(requireMatriculaTecnicaCicloManual(state).proximoCicloNumero, cycle);
    for (const patch of [
      { cobrarMensalidades: true }, { condicoes: undefined },
      { condicoes: { ...conditions, [cycle === 1 ? 'cobrarMatricula' : 'cobrarRematricula']: true } },
    ]) assert.throws(() => requireMatriculaTecnicaCicloManual({
      ...state, planoEntrada: { ...state.planoEntrada, ...patch },
    }));
    assert.throws(() => requireMatriculaTecnicaCicloManual({ ...state, estado: 'ELEGIVEL',
      podeGerar: true, bloqueio: null }));
    assert.throws(() => requireMatriculaTecnicaCicloManual({ ...state,
      bloqueio: { codigo: 'OUTRO', mensagem: 'Outra condição.' } }));
  }
});

test('taxa isolada e turma de ciclo único conservam elegibilidade sem inventar C2', () => {
  const state = { ...planned(1), cicloMaximo: 1,
    planoEntrada: { ...planned(1).planoEntrada, cobrarMensalidades: false,
      condicoes: { ...conditions, cobrarMatricula: true } } };
  assert.equal(requireMatriculaTecnicaCicloManual(state).podeGerar, true);
  assert.throws(() => requireMatriculaTecnicaCicloManual({ ...planned(2), cicloMaximo: 1 }));
  assert.throws(() => requireMatriculaTecnicaCicloManual({ ...state,
    planoEntrada: { ...state.planoEntrada, cobrarMensalidades: 'false' } }));
});

test('matrícula LOCAL isolada exige plano completo e prova do registro local no ciclo gerado', () => {
  const state = { ...planned(1), criterioElegibilidade: 'MANUAL_APOS_EMISSAO', proximoCicloNumero: 2,
    planoEntrada: { ...planned(1).planoEntrada, cobrarMensalidades: false,
      condicoes: { ...conditions, cobrarMatricula: true, cobrarRematricula: true } },
    matriculaLocal: { id: 'taxa-local', tipo: 'MATRICULA', numero: 0, descricao: 'Matrícula local',
      valor: '100.00', vencimento: '2027-01-20', status: 'PENDENTE', emissaoBanese: 'NAO_APLICAVEL',
      destinoCobranca: 'LOCAL', localSemBoletoComprovado: true },
    cicloGerado: { numero: 1, status: 'EMITIDO_BANESE', quantidadeItens: 1, quantidadeBancaria: 0,
      quantidadeLocal: 1, total: '100.00', emitidosBanese: 0, pendentesEmissao: 0, emRevisao: 0 },
  };
  assert.equal(requireMatriculaTecnicaCicloManual(state).cicloGerado?.emitidosBanese, 0);
  for (const patch of [{ planoEntrada: null }, { matriculaLocal: null },
    { matriculaLocal: { ...state.matriculaLocal, localSemBoletoComprovado: false } }]) {
    assert.throws(() => requireMatriculaTecnicaCicloManual({ ...state, ...patch }));
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
