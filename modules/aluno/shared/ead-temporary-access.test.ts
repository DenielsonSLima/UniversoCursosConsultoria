import assert from 'node:assert/strict';
import test from 'node:test';
import { hasTemporaryEadAccess, isHomeEnrollmentVisible } from './ead-temporary-access.ts';
const row = (status = 'PENDENTE', modalidade = 'EAD', expiry = Date.now() + 60_000) => ({
  status, acesso_temporario_ate: new Date(expiry).toISOString(), turmas: { cursos: { modalidade } },
});
test('Meus cursos and home include only valid EAD trust grants', () => {
  assert.equal(hasTemporaryEadAccess(row()), true);
  assert.equal(isHomeEnrollmentVisible(row()), true);
  assert.equal(hasTemporaryEadAccess(row('PENDENTE', 'EAD', 1000), 1000), false);
  assert.equal(isHomeEnrollmentVisible(row('PENDENTE', 'EAD', 1)), false);
  assert.equal(hasTemporaryEadAccess(row('CANCELADO')), false);
  assert.equal(hasTemporaryEadAccess(row('PENDENTE', 'TECNICO')), false);
  assert.equal(hasTemporaryEadAccess({ ...row(), acesso_temporario_ate: null }), false);
  assert.equal(isHomeEnrollmentVisible(row('ATIVO')), true);
  assert.equal(isHomeEnrollmentVisible(row('CONCLUIDO')), true);
});
