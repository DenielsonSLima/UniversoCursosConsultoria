import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPortalFirstAccessPath,
  requiresPortalFirstAccess,
} from './portal-first-access.ts';

test('detecta primeiro acesso pendente para Aluno e Responsável', () => {
  for (const tipo of ['Aluno', 'Responsavel']) {
    assert.equal(requiresPortalFirstAccess({ tipo, acceptedTermsAt: null, requiresPasswordReset: false }), true);
    assert.equal(requiresPortalFirstAccess({ tipo, acceptedTermsAt: '2026-08-21T12:00:00Z', requiresPasswordReset: true }), true);
    assert.equal(requiresPortalFirstAccess({ tipo, acceptedTermsAt: '2026-08-21T12:00:00Z', requiresPasswordReset: false }), false);
  }
  assert.equal(requiresPortalFirstAccess({ tipo: 'Gestor', acceptedTermsAt: null, requiresPasswordReset: true }), false);
});

test('gera rota de primeiro acesso restrita ao perfil e preserva somente deep link compatível', () => {
  const contextId = '5d8609ea-fb4d-4cbc-8d9f-dba28c93bca5';
  const responsavelPath = buildPortalFirstAccessPath('Responsavel', contextId, '/responsavel/assinaturas');
  const responsavelUrl = new URL(responsavelPath, 'https://portal.invalid');
  assert.equal(responsavelUrl.pathname, '/responsavel/primeiro-acesso');
  assert.equal(responsavelUrl.searchParams.get('next'), '/responsavel/assinaturas');
  assert.equal(responsavelUrl.searchParams.get('context'), contextId);

  const rejectedCrossPortal = new URL(
    buildPortalFirstAccessPath('Responsavel', contextId, '/gestor/financeiro'),
    'https://portal.invalid',
  );
  assert.equal(rejectedCrossPortal.searchParams.get('next'), '/responsavel');
});
