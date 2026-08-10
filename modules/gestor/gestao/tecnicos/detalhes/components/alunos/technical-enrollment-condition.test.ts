import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTechnicalEnrollmentOverride,
  createTechnicalEnrollmentConditionDraft,
  hasTechnicalEnrollmentOverride,
  validateTechnicalEnrollmentCondition,
} from './technical-enrollment-condition';
import type { MatriculaTecnicaRegra } from '../financeiro/matricula-tecnica-financeiro.types';

const regra = {
  revisao: 2,
  fingerprint: 'turma-fingerprint',
  primeiroVencimentoSugerido: '2026-08-30',
  valorMatricula: '150.00',
  valorMensalidade: '279.90',
  valorRematricula: '150.00',
  mensalidadesPorCiclo: 12,
  diaVencimento: 30,
  identidade: {
    turmaRevisao: 2,
    turmaFingerprint: 'turma-fingerprint',
    overrideRevisao: null,
    overrideFingerprint: null,
    efetivaFingerprint: 'efetiva-fingerprint',
  },
  cobranca: {
    matricula: { habilitada: true, valor: '150.00' },
    mensalidade: { habilitada: true, quantidade: 12, valor: '279.90' },
    rematricula: { habilitada: true, valor: '150.00' },
  },
  vencimento: { diaBase: 30, primeiroVencimentoSugerido: '2026-08-30' },
  encargos: {
    descontoPontualidade: '19.90',
    jurosAtrasoPercentual: '1.00',
    multaAtrasoPercentual: '2.00',
  },
  aplicacao: {
    matricula: { desconto: false, multaJuros: false },
    mensalidade: { desconto: true, multaJuros: true },
    rematricula: { desconto: false, multaJuros: false },
  },
  boleto: { instrucao: 'Não receber após 60 dias.' },
  cronogramaCiclo: [],
  continuidade: {
    recorrente: false,
    proximoCiclo: 'APOS_REMATRICULA',
    mensalidadesPorCiclo: 12,
    maxCiclos: 2,
    encerraAposCiclo: 2,
  },
  curso: { totalCiclos: 2, totalMensalidades: 24, totalNominal: '7017.60' },
} satisfies MatriculaTecnicaRegra;

test('condição igual à turma não cria override', () => {
  const draft = createTechnicalEnrollmentConditionDraft(regra);
  assert.equal(hasTechnicalEnrollmentOverride(buildTechnicalEnrollmentOverride(regra, draft)), false);
});

test('bolsa parcial altera somente mensalidade e mantém os demais campos herdados', () => {
  const draft = { ...createTechnicalEnrollmentConditionDraft(regra), valorMensalidade: 199.9 };
  const override = buildTechnicalEnrollmentOverride(regra, draft);
  assert.equal(override.valorMensalidade, '199.9');
  assert.equal(override.qtdMensalidades, null);
  assert.equal(override.jurosAtrasoPercentual, null);
  assert.equal(override.multaAtrasoPercentual, null);
});

test('condição individual bloqueia mensalidade zero e desconto que zera a parcela', () => {
  const draft = createTechnicalEnrollmentConditionDraft(regra);
  assert.match(validateTechnicalEnrollmentCondition({ ...draft, valorMensalidade: 0 }) || '', /maior que zero/i);
  assert.match(validateTechnicalEnrollmentCondition({ ...draft, descontoPontualidade: 279.9 }) || '', /menor que a mensalidade/i);
  assert.match(validateTechnicalEnrollmentCondition({ ...draft, valorMensalidade: 300 }, regra) || '', /reduzir valores/i);
});
