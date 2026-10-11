import { TERMS_VERSION } from '../../../../../shared/constants/terms.ts';

export interface StudentCredentialEvidence {
  passwordUpdatedAt?: string | null;
  temporaryPasswordPending?: boolean | null;
  temporaryPasswordIssuedAt?: string | null;
  temporaryPasswordIssueId?: string | null;
  temporaryPasswordIssueStartedAt?: string | null;
  temporaryPasswordIssuePasswordChangedAt?: string | null;
}

interface StudentAccessStateInput {
  hasContactEmail: boolean;
  emailConfirmed: boolean;
  emailValidatedByManager: boolean;
  emailConfirmationStatus?: 'confirmed' | 'pending' | 'no_auth_user' | 'no_email' | 'unknown';
  emailStatusLoading?: boolean;
  accessStatus?: string | null;
  requiresPasswordReset?: boolean | null;
  credentialEvidence?: StudentCredentialEvidence;
  acceptedTerms?: boolean | null;
  acceptedTermsAt?: string | null;
  acceptedTermsVersion?: string | null;
}

const hasValue = (value?: string | null) => Boolean(value?.trim());

export const buildStudentAccessState = (input: StudentAccessStateInput) => {
  const evidence = input.credentialEvidence;
  const issuanceInProgress = Boolean(
    evidence?.temporaryPasswordIssueId
    || evidence?.temporaryPasswordIssueStartedAt
    || evidence?.temporaryPasswordIssuePasswordChangedAt,
  );
  const passwordUpdatedAt = Date.parse(evidence?.passwordUpdatedAt || '');
  const temporaryPasswordIssuedAt = Date.parse(evidence?.temporaryPasswordIssuedAt || '');
  const hasPasswordProof = Number.isFinite(passwordUpdatedAt);
  // A flag temporária só é limpa na finalização dos termos. A troca já realizada
  // é comprovada por uma atualização posterior à emissão, sem emissão em curso.
  const temporaryPasswordWasChanged = hasPasswordProof
    && Number.isFinite(temporaryPasswordIssuedAt)
    && passwordUpdatedAt > temporaryPasswordIssuedAt;
  const temporaryPasswordStillPending = evidence?.temporaryPasswordPending === true
    && !temporaryPasswordWasChanged;
  const hasOwnPasswordProof = hasPasswordProof
    && (evidence?.temporaryPasswordPending === false
      || (evidence?.temporaryPasswordPending === true && temporaryPasswordWasChanged))
    && !issuanceInProgress;
  const credentialStatus = issuanceInProgress
    ? 'issuing'
    : temporaryPasswordStillPending
      ? 'password_pending'
      : hasOwnPasswordProof && input.requiresPasswordReset === false
        ? 'ready'
        : hasOwnPasswordProof && input.requiresPasswordReset === true
          ? 'reconciliation_pending'
          : input.requiresPasswordReset === true && !hasPasswordProof
            && evidence?.temporaryPasswordPending === false
            ? 'password_pending'
            : 'unknown';
  const termsStatus = input.acceptedTerms === true
    && hasValue(input.acceptedTermsAt)
    && input.acceptedTermsVersion === TERMS_VERSION
    ? 'accepted'
    : input.acceptedTerms === false
      || (input.acceptedTerms === true && input.acceptedTermsVersion !== TERMS_VERSION)
      ? 'pending'
      : 'unknown';
  const emailStatus = !input.hasContactEmail
    ? 'not_applicable'
    : input.emailStatusLoading
      ? 'loading'
      : input.emailConfirmationStatus === 'confirmed' && input.emailConfirmed
        ? 'confirmed'
        : input.emailConfirmationStatus === 'pending'
          ? 'pending'
          : input.emailConfirmationStatus === 'no_auth_user'
            ? 'not_prepared'
            : 'unknown';

  const credentialReady = credentialStatus === 'ready';
  const needsPasswordSetup = credentialStatus === 'password_pending';
  const passwordLabel = {
    ready: 'Senha própria definida',
    password_pending: hasPasswordProof ? 'Troca de senha pendente' : 'Criação de senha pendente',
    reconciliation_pending: 'Senha registrada — atualização pendente',
    issuing: 'Emissão de senha temporária em andamento',
    unknown: 'Situação da senha não confirmada',
  }[credentialStatus];
  const termsLabel = {
    accepted: 'Aceite registrado',
    pending: 'Aceite pendente',
    unknown: 'Situação dos termos não confirmada',
  }[termsStatus];
  const emailLabel = {
    confirmed: 'Confirmado para login',
    pending: 'Confirmação para login pendente',
    not_prepared: 'Acesso por e-mail ainda não preparado',
    not_applicable: 'Não se aplica — login pela matrícula',
    loading: 'Verificando confirmação',
    unknown: 'Confirmação não verificada',
  }[emailStatus];
  const summary = !credentialReady
    ? passwordLabel
    : termsStatus === 'pending'
      ? 'Senha definida — termos de uso pendentes'
      : termsStatus === 'unknown'
        ? 'Senha definida — situação dos termos não confirmada'
        : emailStatus !== 'confirmed' && emailStatus !== 'not_applicable'
          ? 'Senha definida — confirmação do e-mail pendente'
          : input.accessStatus === 'ativo'
            ? 'Acesso concluído'
            : 'Etapas concluídas — situação do acesso a verificar';
  const actionLabel = credentialReady
    ? input.hasContactEmail ? 'Enviar recuperação de senha' : 'Gerar link de recuperação'
    : needsPasswordSetup
      ? input.hasContactEmail ? 'Reenviar primeiro acesso' : 'Gerar link de primeiro acesso'
      : 'Verificar acesso';
  const actionDescription = credentialReady
    ? input.hasContactEmail
      ? 'Envia um link seguro para redefinir a senha. O aceite dos termos é tratado separadamente no portal do aluno.'
      : 'Gera um link seguro de recuperação para entrega por um canal confirmado. O login continua pela matrícula.'
    : needsPasswordSetup
      ? 'Envia um link seguro para o aluno criar ou trocar a senha. Os termos pendentes serão apresentados no portal.'
      : 'Verifica a preparação do acesso preservando a senha já registrada. Acompanhe cada etapa acima.';

  return {
    credentialStatus,
    termsStatus,
    emailStatus,
    credentialReady,
    needsPasswordSetup,
    passwordLabel,
    termsLabel,
    emailLabel,
    summary,
    actionTitle: credentialReady ? 'Recuperação de acesso' : 'Preparação do acesso',
    actionLabel,
    actionDescription,
    redirectPath: credentialReady ? '/recuperar-senha' : '/login',
    canConfirmEmail: emailStatus === 'pending',
    showTemporaryPasswordAssistance: input.hasContactEmail && needsPasswordSetup,
    canIssueTemporaryPassword: input.hasContactEmail && needsPasswordSetup
      && (emailStatus === 'confirmed' || (emailStatus === 'pending' && input.emailValidatedByManager)),
  };
};
