import { supabase } from '../../../../lib/supabase';
import type {
  ResponsavelAccessPreparationResult,
  ResponsavelAccessResendResult,
  ResponsavelAccessStatus,
  ResponsavelEmailConfirmationResult,
  ResponsavelTemporaryPasswordResult,
} from './responsavel-access.contract';
import { requireResponsavelRequestId } from './responsaveis.contract';

type RpcRecord = Record<string, unknown>;

const asRecord = (value: unknown, message: string): RpcRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as RpcRecord;
};

const requiredString = (value: unknown, field: string) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`O campo ${field} não foi devolvido pelo serviço autorizado.`);
  }
  return value.trim();
};

const optionalString = (value: unknown) => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const optionalBoolean = (value: unknown) => (
  typeof value === 'boolean' ? value : undefined
);

const invokePortalUserManagement = async <T>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke('portal-user-management', { body });
  if (error) {
    const contextual = error as { message?: string; context?: { json?: () => Promise<unknown> } };
    const payload = await contextual.context?.json?.().catch(() => null);
    const serverMessage = payload && typeof payload === 'object' && 'error' in payload
      ? (payload as { error?: unknown }).error
      : null;
    throw new Error(
      typeof serverMessage === 'string'
        ? serverMessage
        : contextual.message || 'Não foi possível concluir a ação de acesso.',
    );
  }
  if (data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string') {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
};

const normalizeAccessStatus = (value: unknown): ResponsavelAccessStatus => {
  const source = asRecord(value, 'O serviço devolveu uma situação de acesso inválida.');
  return {
    responsavelLegalId: requiredString(source.responsavelLegalId, 'responsavelLegalId'),
    status: requiredString(source.status, 'status'),
    authUserExists: optionalBoolean(source.authUserExists),
    emailConfirmed: optionalBoolean(source.emailConfirmed),
    emailValidatedByManager: optionalBoolean(source.emailValidatedByManager),
    temporaryPasswordPending: optionalBoolean(source.temporaryPasswordPending),
    temporaryPasswordAllowed: optionalBoolean(source.temporaryPasswordAllowed),
    requiresPasswordChange: optionalBoolean(source.requiresPasswordChange),
    termsAccepted: optionalBoolean(source.termsAccepted),
    currentTermsVersion: optionalString(source.currentTermsVersion),
    firstAccessPending: optionalBoolean(source.firstAccessPending),
  };
};

const normalizePreparationResult = (value: unknown): ResponsavelAccessPreparationResult => {
  const source = asRecord(value, 'O serviço não confirmou o preparo do acesso.');
  return {
    success: source.success === true,
    action: source.action === 'ensure-responsavel-access' ? source.action : undefined,
    userId: optionalString(source.userId),
    inviteSent: typeof source.inviteSent === 'boolean' ? source.inviteSent : undefined,
    profileLinked: typeof source.profileLinked === 'boolean' ? source.profileLinked : undefined,
    profileLinkState: optionalString(source.profileLinkState),
    message: optionalString(source.message),
  };
};

const normalizeResendResult = (value: unknown): ResponsavelAccessResendResult => {
  const source = asRecord(value, 'O serviço não confirmou o reenvio do acesso.');
  return {
    success: source.success === true,
    action: source.action === 'resend-responsavel-access' ? source.action : undefined,
    userId: optionalString(source.userId),
    recoveryEmailSent: typeof source.recoveryEmailSent === 'boolean'
      ? source.recoveryEmailSent
      : undefined,
    requestFinalized: source.requestFinalized === true,
    profileLinkState: optionalString(source.profileLinkState),
    message: optionalString(source.message),
  };
};

const normalizeEmailConfirmationResult = (
  value: unknown,
): ResponsavelEmailConfirmationResult => {
  const source = asRecord(value, 'O serviço não confirmou a validação do e-mail.');
  return {
    success: source.success === true,
    action: source.action === 'confirm-responsavel-email' ? source.action : undefined,
    userId: optionalString(source.userId),
    emailConfirmed: source.emailConfirmed === true,
    emailValidatedByManager: source.emailValidatedByManager === true,
    message: optionalString(source.message),
  };
};

export const responsavelAccessService = {
  async listarStatus(responsavelLegalIds: readonly string[]): Promise<readonly ResponsavelAccessStatus[]> {
    if (responsavelLegalIds.length === 0) return [];
    const result = await invokePortalUserManagement<unknown>({
      action: 'list-responsavel-access-statuses',
      responsavelLegalIds: [...new Set(responsavelLegalIds)],
    });
    const source = asRecord(result, 'O serviço não devolveu as situações de acesso.');
    if (!Array.isArray(source.statuses)) {
      throw new Error('O serviço não devolveu a lista de situações de acesso.');
    }
    return source.statuses.map(normalizeAccessStatus);
  },

  async preparar(responsavelLegalId: string, requestId: string) {
    const result = normalizePreparationResult(await invokePortalUserManagement({
      action: 'ensure-responsavel-access',
      responsavelLegalId: requiredString(responsavelLegalId, 'responsavelLegalId'),
      requestId: requireResponsavelRequestId(requestId),
    }));
    if (!result.success || !['linked', 'already_linked'].includes(result.profileLinkState || '')) {
      throw new Error(result.message || 'O serviço não confirmou o preparo do acesso.');
    }
    return result;
  },

  async reenviar(responsavelLegalId: string, requestId: string) {
    const result = normalizeResendResult(await invokePortalUserManagement({
      action: 'resend-responsavel-access',
      responsavelLegalId: requiredString(responsavelLegalId, 'responsavelLegalId'),
      requestId: requireResponsavelRequestId(requestId),
    }));
    if (!result.success) throw new Error(result.message || 'O serviço não confirmou o reenvio.');
    return result;
  },

  async confirmarEmail(responsavelLegalId: string) {
    const result = normalizeEmailConfirmationResult(await invokePortalUserManagement({
      action: 'confirm-responsavel-email',
      responsavelLegalId: requiredString(responsavelLegalId, 'responsavelLegalId'),
      emailValidatedByManager: true,
    }));
    if (!result.success) throw new Error(result.message || 'O serviço não confirmou a validação do e-mail.');
    return result;
  },

  async emitirSenhaTemporaria(responsavelLegalId: string): Promise<ResponsavelTemporaryPasswordResult> {
    const value = await invokePortalUserManagement<unknown>({
      action: 'issue-responsavel-temporary-password',
      responsavelLegalId: requiredString(responsavelLegalId, 'responsavelLegalId'),
    });
    const source = asRecord(value, 'O serviço não confirmou a emissão da senha temporária.');
    const temporaryPassword = requiredString(source.temporaryPassword, 'temporaryPassword');
    if (source.success !== true) {
      throw new Error(optionalString(source.message) || 'O serviço não confirmou a emissão da senha temporária.');
    }
    return {
      success: true,
      action: source.action === 'issue-responsavel-temporary-password' ? source.action : undefined,
      userId: optionalString(source.userId),
      emailConfirmed: source.emailConfirmed === true,
      emailValidatedByManager: source.emailValidatedByManager === true,
      temporaryPassword,
      message: optionalString(source.message),
    };
  },
};
