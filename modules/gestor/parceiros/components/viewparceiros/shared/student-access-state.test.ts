import assert from 'node:assert/strict';
import test from 'node:test';
import { TERMS_VERSION } from '../../../../../shared/constants/terms.ts';
import { buildStudentAccessState } from './student-access-state.ts';

const ownPassword = {
  passwordUpdatedAt: '2026-10-10T12:00:00Z',
  temporaryPasswordPending: false,
  temporaryPasswordIssueId: null,
  temporaryPasswordIssueStartedAt: null,
  temporaryPasswordIssuePasswordChangedAt: null,
};
const currentTerms = {
  acceptedTerms: true,
  acceptedTermsAt: '2026-10-10T12:05:00Z',
  acceptedTermsVersion: TERMS_VERSION,
};
const activeAccess = {
  hasContactEmail: true,
  emailConfirmed: true,
  emailValidatedByManager: false,
  emailConfirmationStatus: 'confirmed' as const,
  accessStatus: 'ativo',
  requiresPasswordReset: false,
  credentialEvidence: ownPassword,
  ...currentTerms,
};

test('senha própria comprovada permite recuperação com termos pendentes sem sugerir outra senha', () => {
  const state = buildStudentAccessState({
    ...activeAccess, acceptedTerms: false, acceptedTermsAt: null, acceptedTermsVersion: null,
  });
  assert.equal(state.credentialStatus, 'ready');
  assert.equal(state.termsStatus, 'pending');
  assert.equal(state.actionLabel, 'Enviar recuperação de senha');
  assert.equal(state.redirectPath, '/recuperar-senha');
  assert.equal(state.summary, 'Senha definida — termos de uso pendentes');
  assert.equal(state.showTemporaryPasswordAssistance, false);
  assert.equal(state.canIssueTemporaryPassword, false);
  assert.doesNotMatch(state.actionDescription, /primeira senha|criar|trocar/);
});

test('versão antiga dos termos não invalida a prontidão da credencial', () => {
  const state = buildStudentAccessState({ ...activeAccess, acceptedTermsVersion: '2025-01-01' });
  assert.equal(state.credentialReady, true);
  assert.equal(state.termsStatus, 'pending');
  assert.equal(state.redirectPath, '/recuperar-senha');
  assert.equal(state.showTemporaryPasswordAssistance, false);
});

test('termos sem prova do aceite permanecem desconhecidos e não sugerem senha temporária', () => {
  const state = buildStudentAccessState({ ...activeAccess, acceptedTermsAt: null });
  assert.equal(state.termsStatus, 'unknown');
  assert.equal(state.credentialReady, true);
  assert.equal(state.showTemporaryPasswordAssistance, false);
  assert.notEqual(state.summary, 'Acesso concluído');
});

test('flags de troca e senha temporária desconhecidas nunca equivalem a acesso concluído', () => {
  for (const unknown of [null, undefined]) {
    const resetUnknown = buildStudentAccessState({ ...activeAccess, requiresPasswordReset: unknown });
    const temporaryUnknown = buildStudentAccessState({
      ...activeAccess, credentialEvidence: { ...ownPassword, temporaryPasswordPending: unknown },
    });
    for (const state of [resetUnknown, temporaryUnknown]) {
      assert.equal(state.credentialStatus, 'unknown');
      assert.equal(state.credentialReady, false);
      assert.equal(state.showTemporaryPasswordAssistance, false);
      assert.equal(state.canIssueTemporaryPassword, false);
      assert.notEqual(state.summary, 'Acesso concluído');
    }
  }
});

test('senha própria com flag de troca antiga pede reconciliação sem pedir nova senha', () => {
  const state = buildStudentAccessState({
    ...activeAccess, requiresPasswordReset: true,
    emailConfirmed: false, emailValidatedByManager: true, emailConfirmationStatus: 'pending',
  });
  assert.equal(state.credentialStatus, 'reconciliation_pending');
  assert.equal(state.emailStatus, 'pending');
  assert.equal(state.canConfirmEmail, true);
  assert.equal(state.actionLabel, 'Verificar acesso');
  assert.equal(state.showTemporaryPasswordAssistance, false);
  assert.equal(state.canIssueTemporaryPassword, false);
});

test('flag de troca verdadeira sem prova e com flag temporária desconhecida não libera assistência', () => {
  for (const credentialEvidence of [
    undefined,
    { ...ownPassword, passwordUpdatedAt: null, temporaryPasswordPending: null },
    { ...ownPassword, passwordUpdatedAt: null, temporaryPasswordPending: undefined },
  ]) {
    const state = buildStudentAccessState({ ...activeAccess, requiresPasswordReset: true, credentialEvidence });
    assert.equal(state.credentialStatus, 'unknown');
    assert.equal(state.showTemporaryPasswordAssistance, false);
    assert.equal(state.canIssueTemporaryPassword, false);
  }
});

test('senha temporária ainda pendente exige troca mesmo com timestamp de senha anterior', () => {
  const state = buildStudentAccessState({
    ...activeAccess, requiresPasswordReset: true,
    credentialEvidence: { ...ownPassword, temporaryPasswordPending: true },
  });
  assert.equal(state.credentialStatus, 'password_pending');
  assert.equal(state.passwordLabel, 'Troca de senha pendente');
  assert.equal(state.credentialReady, false);
  assert.equal(state.showTemporaryPasswordAssistance, true);
  assert.equal(state.canIssueTemporaryPassword, true);
});

test('senha própria posterior à temporária não exige nova troca só porque os termos faltam', () => {
  for (const requiresPasswordReset of [false, true]) {
    const state = buildStudentAccessState({
      ...activeAccess, requiresPasswordReset,
      credentialEvidence: {
        ...ownPassword, temporaryPasswordPending: true,
        temporaryPasswordIssuedAt: '2026-10-10T11:00:00Z',
      },
      acceptedTerms: false, acceptedTermsAt: null,
    });
    assert.equal(state.credentialStatus, requiresPasswordReset ? 'reconciliation_pending' : 'ready');
    assert.equal(state.termsStatus, 'pending');
    assert.equal(state.needsPasswordSetup, false);
    assert.equal(state.showTemporaryPasswordAssistance, false);
    assert.equal(state.canIssueTemporaryPassword, false);
    if (!requiresPasswordReset) assert.equal(state.actionLabel, 'Enviar recuperação de senha');
  }
});

test('timestamp anterior, igual ou inválido não comprova troca da senha temporária', () => {
  for (const passwordUpdatedAt of ['2026-10-10T10:00:00Z', '2026-10-10T11:00:00Z', 'invalid']) {
    const state = buildStudentAccessState({
      ...activeAccess, requiresPasswordReset: true,
      credentialEvidence: {
        ...ownPassword, temporaryPasswordPending: true, passwordUpdatedAt,
        temporaryPasswordIssuedAt: '2026-10-10T11:00:00Z',
      },
    });
    assert.equal(state.credentialStatus, 'password_pending');
    assert.equal(state.credentialReady, false);
  }
});

test('cada fence de emissão impede recuperação e nova emissão enquanto a operação está em andamento', () => {
  for (const field of [
    'temporaryPasswordIssueId',
    'temporaryPasswordIssueStartedAt',
    'temporaryPasswordIssuePasswordChangedAt',
  ]) {
    const state = buildStudentAccessState({
      ...activeAccess, credentialEvidence: { ...ownPassword, [field]: 'emission-in-progress' },
    });
    assert.equal(state.credentialStatus, 'issuing');
    assert.equal(state.credentialReady, false);
    assert.equal(state.showTemporaryPasswordAssistance, false);
    assert.equal(state.canIssueTemporaryPassword, false);
  }
});

test('criação de senha pendente é independente da confirmação de e-mail e dos termos', () => {
  const state = buildStudentAccessState({
    ...activeAccess, requiresPasswordReset: true,
    credentialEvidence: { ...ownPassword, passwordUpdatedAt: null },
    emailConfirmed: false, emailValidatedByManager: true, emailConfirmationStatus: 'pending',
    acceptedTerms: false, acceptedTermsAt: null,
  });
  assert.equal(state.credentialStatus, 'password_pending');
  assert.equal(state.emailStatus, 'pending');
  assert.equal(state.termsStatus, 'pending');
  assert.equal(state.canConfirmEmail, true);
  assert.equal(state.actionLabel, 'Reenviar primeiro acesso');
  assert.equal(state.redirectPath, '/login');
});

test('validação administrativa e flag falsa não substituem prova real da senha', () => {
  const state = buildStudentAccessState({
    ...activeAccess, credentialEvidence: { ...ownPassword, passwordUpdatedAt: null },
    emailValidatedByManager: true,
  });
  assert.equal(state.credentialStatus, 'unknown');
  assert.equal(state.credentialReady, false);
  assert.equal(state.canIssueTemporaryPassword, false);
});

test('e-mail validado pelo gestor permanece pendente até confirmação real do login', () => {
  const pending = buildStudentAccessState({
    ...activeAccess, emailConfirmed: false, emailValidatedByManager: true, emailConfirmationStatus: 'pending',
  });
  assert.equal(pending.emailStatus, 'pending');
  assert.equal(pending.canConfirmEmail, true);
  assert.notEqual(pending.summary, 'Acesso concluído');
  assert.equal(pending.credentialReady, true);
  const confirmed = buildStudentAccessState({ ...activeAccess, emailValidatedByManager: true });
  assert.equal(confirmed.emailStatus, 'confirmed');
  assert.equal(confirmed.canConfirmEmail, false);
  assert.equal(confirmed.summary, 'Acesso concluído');
});

test('consulta de e-mail carregando ou desconhecida não declara confirmação concluída', () => {
  const loading = buildStudentAccessState({ ...activeAccess, emailStatusLoading: true });
  const unknown = buildStudentAccessState({
    ...activeAccess, emailConfirmationStatus: 'unknown',
  });
  assert.equal(loading.emailStatus, 'loading');
  assert.equal(unknown.emailStatus, 'unknown');
  for (const state of [loading, unknown]) {
    assert.equal(state.canConfirmEmail, false);
    assert.notEqual(state.summary, 'Acesso concluído');
  }
});

test('cache de confirmação não libera emissão temporária com consulta carregando ou desconhecida', () => {
  for (const emailConfirmationStatus of ['confirmed', 'unknown'] as const) {
    const state = buildStudentAccessState({
      ...activeAccess, requiresPasswordReset: true,
      credentialEvidence: { ...ownPassword, passwordUpdatedAt: null },
      emailStatusLoading: emailConfirmationStatus === 'confirmed', emailConfirmationStatus,
    });
    assert.equal(state.canIssueTemporaryPassword, false);
  }
});

test('aluno sem e-mail com senha pronta usa recuperação pela matrícula sem assistência temporária', () => {
  const state = buildStudentAccessState({ ...activeAccess, hasContactEmail: false, emailConfirmed: false });
  assert.equal(state.emailStatus, 'not_applicable');
  assert.equal(state.actionLabel, 'Gerar link de recuperação');
  assert.equal(state.redirectPath, '/recuperar-senha');
  assert.equal(state.showTemporaryPasswordAssistance, false);
  assert.equal(state.summary, 'Acesso concluído');
});
