import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type IncomingPayload = {
  action?: string;
  partnerId?: string;
  email?: string | null;
  redirectTo?: string;
};

type FunctionResponse = {
  success: boolean;
  action?: string;
  userId?: string | null;
  partnerDeleted?: boolean;
  authUserDeleted?: boolean;
  inviteSent?: boolean;
  recoveryEmailSent?: boolean;
  message?: string;
  recoveryLink?: string | null;
  error?: string;
};

const TERMS_VERSION = Deno.env.get('TERMS_VERSION') || '2026-06-25';

const json = (payload: FunctionResponse, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const normalizeEmail = (value?: string | null) =>
  String(value || '').trim().toLowerCase();

const normalizeRedirectInput = (value?: string | null) =>
  String(value || '').trim();

const extractTextFromResponse = async (response: Response) => {
  const raw = await response.text().catch(() => '');
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.msg && typeof parsed.msg === 'string') return parsed.msg;
    if (parsed?.error_description && typeof parsed.error_description === 'string') return parsed.error_description;
    if (parsed?.error && typeof parsed.error === 'string') return parsed.error;
    if (parsed?.message && typeof parsed.message === 'string') return parsed.message;
  } catch {
    return raw;
  }

  return null;
};

const sendRecoveryEmail = async (
  supabaseUrl: string,
  apiKey: string | null,
  email: string,
  redirectTo: string,
) => {
  if (!apiKey) {
    return {
      sent: false,
      message: 'Configuração de e-mail ausente no servidor (SUPABASE_ANON_KEY).',
    };
  }

  try {
    const recoveryUrl = new URL(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/recover`);
    recoveryUrl.searchParams.set('redirect_to', redirectTo);
    const response = await fetch(recoveryUrl.toString(), {
      method: 'POST',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const errorMessage = (await extractTextFromResponse(response))
        || `Não foi possível enviar o e-mail de recuperação (${response.status}).`;
      return {
        sent: false,
        message: errorMessage,
      };
    }

    return { sent: true, message: null };
  } catch (error) {
    return {
      sent: false,
      message: error instanceof Error ? error.message : 'Falha inesperada ao enviar e-mail de recuperação.',
    };
  }
};

const isActiveGestor = (status?: string | null) => {
  const current = String(status || '').trim().toUpperCase();
  return current !== 'INATIVO' && current !== 'INACTIVE' && current !== 'BLOQUEADO';
};

const isUuid = (value?: string | null) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());

const ensureAuthorizedGestor = async (admin: any, bearer: string | null) => {
  if (!bearer) {
    return { authorized: false, error: 'Não autenticado.' };
  }

  const { data: authData, error: authError } = await admin.auth.getUser(bearer);
  if (authError || !authData?.user?.email) {
    return { authorized: false, error: 'Sessão inválida para executar esta ação.' };
  }

  const { data: gestor, error: gestorError } = await admin
    .from('usuarios_sistema')
    .select('id, status, context')
    .eq('email', authData.user.email.toLowerCase())
    .maybeSingle();

  if (gestorError || !gestor || !isActiveGestor(gestor.status)) {
    return { authorized: false, error: 'Acesso restrito para administradores.' };
  }

  return { authorized: true, gestor, gestorEmail: authData.user.email.toLowerCase() };
};

const getGestorScope = async (admin: any, gestor: any) => {
  const context = String(gestor?.context || '').trim();
  if (!context || context.toLowerCase() === 'global') {
    return { global: true, poloId: null };
  }

  if (!isUuid(context)) {
    return { global: false, poloId: null };
  }

  const { data: polo } = await admin
    .from('polos')
    .select('id, is_matriz')
    .eq('id', context)
    .maybeSingle();

  return {
    global: Boolean(polo?.is_matriz),
    poloId: context,
  };
};

const isPartnerInGestorScope = async (admin: any, gestor: any, partner: any) => {
  const scope = await getGestorScope(admin, gestor);
  if (scope.global) return true;
  if (!scope.poloId) return false;

  const partnerPoloId = partner?.polo_id || null;
  const partnerPoloIds = Array.isArray(partner?.polo_ids) ? partner.polo_ids : [];

  return !partnerPoloId
    || partnerPoloId === scope.poloId
    || partnerPoloIds.includes(scope.poloId);
};

const findAuthUserByEmail = async (admin: any, email: string) => {
  const targetEmail = normalizeEmail(email);
  let page = 1;
  const perPage = 1000;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const user = (data?.users || []).find((item: any) => normalizeEmail(item.email) === targetEmail);
    if (user) return user;

    if (!data?.users?.length || data.users.length < perPage) return null;
    page += 1;
  }

  return null;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Método não permitido.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonymousKey = Deno.env.get('SUPABASE_ANON_KEY')
    || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
    || Deno.env.get('VITE_SUPABASE_ANON_KEY')
    || serviceRoleKey;

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ success: false, error: 'Configuração do Supabase ausente.' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let payload: IncomingPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ success: false, error: 'Payload inválido.' }, 400);
  }

  const action = String(payload.action || '').trim();
  if (!['send-student-invite', 'delete-partner'].includes(action)) {
    return json({ success: false, error: 'Ação inválida.' }, 400);
  }

  const authHeader = req.headers.get('authorization') || '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7)
    : null;

  const authorization = await ensureAuthorizedGestor(admin, bearer);
  if (!authorization.authorized) {
    return json({ success: false, error: authorization.error || 'Não autorizado.' }, 401);
  }

  const partnerId = String(payload.partnerId || '').trim();
  if (!partnerId) {
    return json({ success: false, error: 'partnerId é obrigatório.' }, 400);
  }

  const { data: partner, error: partnerError } = await admin
    .from('parceiros')
    .select('id, tipo, nome, email, polo_id, polo_ids')
    .eq('id', partnerId)
    .maybeSingle();

  if (partnerError) {
    return json({ success: false, error: partnerError.message }, 500);
  }

  if (!partner) {
    return json({ success: false, error: 'Parceiro não encontrado.' }, 404);
  }

  const canManagePartner = await isPartnerInGestorScope(admin, authorization.gestor, partner);
  if (!canManagePartner) {
    return json({ success: false, error: 'Você não tem permissão para gerenciar este parceiro.' }, 403);
  }

  if (action === 'delete-partner') {
    const email = normalizeEmail(partner.email);
    const shouldDeleteAuthUser = ['Aluno', 'Professor'].includes(partner.tipo) && Boolean(email);
    let authUserDeleted = false;

    if (shouldDeleteAuthUser) {
      if (email === authorization.gestorEmail) {
        return json({
          success: false,
          error: 'Não é possível excluir o usuário de autenticação da sessão atual. Use outro administrador para esta remoção.',
        }, 400);
      }

      let authUser: any;
      try {
        authUser = await findAuthUserByEmail(admin, email);
      } catch (error) {
        return json({
          success: false,
          error: error instanceof Error ? error.message : 'Não foi possível localizar o usuário no Supabase Auth.',
        }, 500);
      }

      if (authUser?.id) {
        const { error: deleteAuthError } = await admin.auth.admin.deleteUser(authUser.id);
        if (deleteAuthError) {
          return json({
            success: false,
            error: deleteAuthError.message || 'Não foi possível excluir o usuário no Supabase Auth.',
          }, 500);
        }
        authUserDeleted = true;
      }
    }

    const { error: deletePartnerError } = await admin
      .from('parceiros')
      .delete()
      .eq('id', partner.id);

    if (deletePartnerError) {
      return json({
        success: false,
        error: deletePartnerError.message || 'Não foi possível excluir o parceiro.',
      }, 500);
    }

    return json({
      success: true,
      action: 'delete-partner',
      partnerDeleted: true,
      authUserDeleted,
      message: shouldDeleteAuthUser
        ? authUserDeleted
          ? 'Parceiro e usuário de autenticação excluídos com sucesso.'
          : 'Parceiro excluído. Nenhum usuário correspondente foi encontrado no Supabase Auth.'
        : 'Parceiro excluído com sucesso.',
    });
  }

  if (partner.tipo !== 'Aluno') {
    return json({ success: false, error: 'Só é possível enviar convite para alunos.' }, 400);
  }

  const email = normalizeEmail(payload.email || partner.email);
  if (!email) {
    return json({ success: false, error: 'E-mail do aluno não informado.' }, 400);
  }

  const defaultOrigin = new URL(req.url).origin;
  const redirectTo = normalizeRedirectInput(payload.redirectTo) || `${defaultOrigin}/login`;

  const ensureLinkRedirect = (url: string, fallbackPath: string) => {
    try {
      const parsed = new URL(url, defaultOrigin);
      return parsed.toString();
    } catch {
      return `${defaultOrigin}${fallbackPath}`;
    }
  };

  const finalRedirect = ensureLinkRedirect(redirectTo, '/login');
  const markStudentNeedsAccess = async () => {
    const now = new Date().toISOString();
    const { error } = await admin
      .from('parceiros')
      .update({
        troca_senha_obrigatoria: true,
        aceitou_termos_uso: true,
        aceitou_termos_uso_em: now,
        termos_uso_versao: TERMS_VERSION,
      })
      .eq('id', partner.id);

    if (error) {
      return error.message;
    }

    return null;
  };

  const inviteResult = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      nome: partner.nome,
      origem: 'cadastro_gestor',
      partner_id: partner.id,
    },
    redirectTo: finalRedirect,
  });

  if (inviteResult.error) {
    const updateError = await markStudentNeedsAccess();
    if (updateError) {
      return json({
        success: false,
        error: updateError,
      }, 500);
    }

    const emailDelivery = await sendRecoveryEmail(supabaseUrl, anonymousKey, email, finalRedirect);

    if (emailDelivery.sent) {
      return json({
        success: true,
        action: 'recovery',
        userId: null,
        inviteSent: false,
        recoveryEmailSent: true,
        recoveryLink: null,
        message: 'Usuário já possui acesso. Enviamos o link de recuperação por e-mail.',
      });
    }

    const recovery = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: finalRedirect,
      },
    });

    if (recovery.error) {
      return json({
        success: false,
        error: recovery.error.message || emailDelivery.message || inviteResult.error.message || 'Não foi possível enviar o convite de acesso.',
      }, 500);
    }

    return json({
      success: true,
      action: 'recovery',
      userId: recovery.data?.user?.id || null,
      inviteSent: false,
      recoveryEmailSent: false,
      recoveryLink: recovery.data?.properties?.action_link || null,
      message: emailDelivery.message
        ? `Falha ao enviar e-mail automático: ${emailDelivery.message} Geramos um link de recuperação para enviar manualmente, se necessário.`
        : 'Usuário já possui acesso. Geramos um link de recuperação para primeiro acesso.',
    });
  }

  const updateError = await markStudentNeedsAccess();
  if (updateError) {
    return json({
      success: false,
      error: updateError,
    }, 500);
  }

  return json({
    success: true,
    action: 'invite',
    userId: inviteResult.data?.user?.id || null,
    inviteSent: true,
    recoveryLink: null,
    message: 'Convite de acesso enviado com sucesso.',
  });
});
