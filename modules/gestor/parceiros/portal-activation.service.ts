import { supabase } from '../../../lib/supabase';

type InvokeErrorPayload = {
  error?: string;
};

type InviteStudentPayload = {
  partnerId: string;
  email?: string;
  redirectTo?: string;
};

type InviteStudentResult = {
  success: boolean;
  action?: 'invite' | 'recovery';
  userId?: string | null;
  inviteSent?: boolean;
  recoveryEmailSent?: boolean;
  message?: string;
  recoveryLink?: string | null;
};

const invokeAdminFunction = async <T>(payload: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke('portal-user-management', {
    body: { action: 'send-student-invite', ...payload },
  });

  if (error) {
    const response = error as { message?: string; context?: { json: () => Promise<unknown> } };
    const body = response.context ? await response.context.json().catch(() => null) : null;
    const serverMessage = body && typeof body === 'object' && 'error' in body
      ? (body as { error?: string }).error
      : null;
    throw new Error(serverMessage || response.message || 'Não foi possível enviar o convite de acesso.');
  }

  const response = (data || {}) as InviteStudentResult & InvokeErrorPayload & Record<string, unknown>;
  if (response?.error) {
    throw new Error(response.error);
  }

  return response as unknown as T;
};

export const portalActivationService = {
  async ensureStudentAccess(payload: InviteStudentPayload): Promise<InviteStudentResult> {
    return invokeAdminFunction<InviteStudentResult>({
      partnerId: payload.partnerId,
      email: payload.email || null,
      redirectTo: payload.redirectTo,
    });
  },
};
