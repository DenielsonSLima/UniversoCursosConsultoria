import assert from 'node:assert/strict';
import test from 'node:test';
import {
  requireTechnicalAdmissionPolicy,
  technicalAdmissionUiState,
} from './technicalAdmissionPolicy.ts';

const turmaId = '00000000-0000-0000-0000-000000000001';
const policy = {
  versao: 1,
  turmaId,
  dataReferencia: '2026-10-10',
  dataInicio: '2025-10-10',
  dataLimiteMatriculaDireta: '2026-10-10',
  diasDesdeInicio: 365,
  matriculaDiretaPermitida: true,
  transferenciaObrigatoria: false,
  motivo: 'PERMITIDA',
  mensagem: 'Matrícula direta permitida até 10/10/2026.',
};
const state = (data: unknown, input = {}) => technicalAdmissionUiState({
  required: true,
  phaseAllowed: true,
  pending: false,
  fetching: false,
  error: false,
  policy: requireTechnicalAdmissionPolicy(data, turmaId),
  ...input,
});

test('respeita o limite inclusivo confirmado pelo servidor e apresenta prazo pt-BR', () => {
  const allowed = state(policy);
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.message, 'Matrícula direta até 10/10/2026.');
  const expired = state({ ...policy,
    dataReferencia: '2026-10-11', diasDesdeInicio: 366,
    matriculaDiretaPermitida: false, transferenciaObrigatoria: true,
    motivo: 'PRAZO_EXPIRADO', mensagem: 'O prazo terminou. Receba o aluno por transferência.',
  });
  assert.equal(expired.allowed, false);
  assert.equal(expired.transferRequired, true);
  assert.equal(expired.message, 'O prazo terminou. Receba o aluno por transferência.');
});

test('data inicial ausente e fase indisponível negam nova entrada sem inventar exceção', () => {
  const missing = state({ ...policy, dataInicio: null, dataLimiteMatriculaDireta: null,
    diasDesdeInicio: null, matriculaDiretaPermitida: false,
    motivo: 'DATA_INICIO_AUSENTE', mensagem: 'Configure a data de início para matricular.',
  });
  assert.equal(missing.allowed, false);
  assert.equal(missing.transferRequired, false);
  assert.match(missing.message!, /data de início/);
  assert.equal(state(policy, { phaseAllowed: false }).allowed, false);
});

test('consulta pendente ou falha impede usar autorização antiga; outras modalidades seguem iguais', () => {
  for (const input of [{ pending: true }, { fetching: true }, { error: true }]) {
    assert.equal(state(policy, input).allowed, false);
  }
  assert.equal(state(policy, { error: true }).retryable, true);
  const other = technicalAdmissionUiState({ required: false, phaseAllowed: true,
    pending: true, fetching: false, error: false,
  });
  assert.deepEqual(other, { allowed: true, message: null, transferRequired: false, retryable: false });
});

test('rejeita retorno incoerente ou de outra turma sem aceitar autorização parcial', () => {
  for (const invalid of [
    { ...policy, turmaId: '00000000-0000-0000-0000-000000000002' },
    { ...policy, matriculaDiretaPermitida: false },
    { ...policy, transferenciaObrigatoria: true },
    { ...policy, dataInicio: '2025-02-30' },
    { ...policy, dataLimiteMatriculaDireta: null },
    { ...policy, motivo: 'EXCECAO_MANUAL' },
  ]) assert.throws(() => requireTechnicalAdmissionPolicy(invalid, turmaId), /não confirmou/);
});
