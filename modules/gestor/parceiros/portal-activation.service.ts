import { supabase } from '../../../lib/supabase';

type InvokeErrorPayload = {
  error?: string;
};

type InviteStudentPayload = {
  partnerId: string;
  email?: string;
  redirectTo?: string;
};

export type PartnerGoogleIdentityStatus = {
  email: string | null;
  has_auth_user: boolean;
  google_linked: boolean;
  google_email: string | null;
  linked_at: string | null;
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

type DeletePartnerResult = {
  success: boolean;
  action?: 'delete-partner';
  partnerDeleted?: boolean;
  authUserDeleted?: boolean;
  message?: string;
};

const invokeAdminFunction = async <T>(payload: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke('portal-user-management', {
    body: payload,
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
      action: 'send-student-invite',
      partnerId: payload.partnerId,
      email: payload.email || null,
      redirectTo: payload.redirectTo,
    });
  },

  async deletePartner(partnerId: string): Promise<DeletePartnerResult> {
    return invokeAdminFunction<DeletePartnerResult>({
      action: 'delete-partner',
      partnerId,
    });
  },

  async getPartnerGoogleIdentityStatus(partnerId: string): Promise<PartnerGoogleIdentityStatus> {
    const { data, error } = await supabase.rpc('get_partner_google_identity_status', {
      p_partner_id: partnerId,
    });

    if (error) {
      throw new Error(error.message || 'Não foi possível verificar o vínculo Google.');
    }

    const row = Array.isArray(data) ? data[0] : data;
    return {
      email: row?.email || null,
      has_auth_user: Boolean(row?.has_auth_user),
      google_linked: Boolean(row?.google_linked),
      google_email: row?.google_email || null,
      linked_at: row?.linked_at || null,
    };
  },

  async unlinkPartnerGoogleIdentity(partnerId: string): Promise<string> {
    const { data, error } = await supabase.rpc('unlink_partner_google_identity', {
      p_partner_id: partnerId,
    });

    if (error) {
      throw new Error(error.message || 'Não foi possível desvincular o Google.');
    }

    const row = Array.isArray(data) ? data[0] : data;
    return row?.message || 'Conta Google desvinculada com sucesso.';
  },
};
