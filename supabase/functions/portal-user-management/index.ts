import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildCorsHeaders, getClientIp, isRateLimitExceeded, json as sendJson } from '../asaas-api/shared.ts';

type IncomingPayload = {
  action?: string;
  partnerId?: string;
  email?: string | null;
  password?: string | null;
  redirectTo?: string;
  user?: Record<string, unknown>;
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
  user?: Record<string, unknown> | null;
  error?: string;
};

const TERMS_VERSION = Deno.env.get('TERMS_VERSION') || '2026-06-25';

const normalizeEmail = (value?: string | null) =>
  String(value || '').trim().toLowerCase();

const normalizeRedirectInput = (value?: string | null) =>
  String(value || '').trim();

const SUPABASE_PUBLIC_KEY_ENV_NAMES = [
  'SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_ANON_KEY',
];

const EXPLICIT_REDIRECT_ORIGIN_ENV_NAMES = [
  'PORTAL_ALLOWED_REDIRECT_ORIGINS',
  'ALLOWED_REDIRECT_ORIGINS',
];

const PUBLIC_SITE_URL_ENV_NAMES = [
  'PUBLIC_SITE_URL',
  'SITE_URL',
  'APP_URL',
  'VITE_PUBLIC_SITE_URL',
];

const DEFAULT_ALLOWED_REDIRECT_ORIGINS = [
  'https://universocc.com.br',
];

const normalizeEnvValue = (value?: string | null) =>
  String(value || '').trim();

const resolveSupabasePublicApiKey = (serviceRoleKey?: string | null) => {
  const serviceKey = normalizeEnvValue(serviceRoleKey);
  const apiKey = SUPABASE_PUBLIC_KEY_ENV_NAMES
    .map((name) => normalizeEnvValue(Deno.env.get(name)))
    .find((value) => value.length > 0) || null;

  if (!apiKey) {
    return {
      apiKey: null,
      message: 'Configuração de e-mail ausente no servidor (SUPABASE_ANON_KEY ou SUPABASE_PUBLISHABLE_KEY).',
    };
  }

  if (serviceKey && apiKey === serviceKey) {
    return {
      apiKey: null,
      message: 'Configuração insegura: a chave pública do Supabase não pode ser a service role key.',
    };
  }

  return { apiKey, message: null };
};

const parseOrigin = (value?: string | null) => {
  try {
    const url = new URL(normalizeEnvValue(value));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
};

const parseOriginList = (value?: string | null) =>
  normalizeEnvValue(value)
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const getAllowedRedirectOrigins = () => {
  const origins = new Set<string>();

  for (const value of DEFAULT_ALLOWED_REDIRECT_ORIGINS) {
    const origin = parseOrigin(value);
    if (origin) origins.add(origin);
  }

  for (const envName of EXPLICIT_REDIRECT_ORIGIN_ENV_NAMES) {
    for (const value of parseOriginList(Deno.env.get(envName))) {
      const origin = parseOrigin(value);
      if (origin) origins.add(origin);
    }
  }

  for (const envName of PUBLIC_SITE_URL_ENV_NAMES) {
    const origin = parseOrigin(Deno.env.get(envName));
    if (origin) origins.add(origin);
  }

  return Array.from(origins);
};

const resolveRedirectTarget = (value?: string | null) => {
  const allowedOrigins = getAllowedRedirectOrigins();
  if (allowedOrigins.length === 0) {
    return {
      redirectTo: null,
      status: 500,
      error: 'Configuração de redirecionamento ausente. Defina PORTAL_ALLOWED_REDIRECT_ORIGINS ou PUBLIC_SITE_URL.',
    };
  }

  try {
    const fallbackOrigin = allowedOrigins[0];
    const rawRedirect = normalizeRedirectInput(value) || '/login';
    const parsed = new URL(rawRedirect, fallbackOrigin);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { redirectTo: null, status: 400, error: 'redirectTo inválido.' };
    }

    if (!allowedOrigins.includes(parsed.origin)) {
      return { redirectTo: null, status: 400, error: 'Origem de redirectTo não permitida.' };
    }

    return { redirectTo: parsed.toString(), status: 200, error: null };
  } catch {
    return { redirectTo: null, status: 400, error: 'redirectTo inválido.' };
  }
};

const normalizeStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
};

const normalizePermissionsPayload = (value: unknown) => {
  const permissions = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return {
    modules: normalizeStringArray(permissions.modules),
    financeiroTabs: normalizeStringArray(permissions.financeiroTabs),
    allPolos: typeof permissions.allPolos === 'boolean' ? permissions.allPolos : false,
  };
};

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
      message: 'Configuração de e-mail ausente no servidor (SUPABASE_ANON_KEY ou SUPABASE_PUBLISHABLE_KEY).',
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
    .select('id, status, context, polo_ids, permissoes')
    .eq('email', authData.user.email.toLowerCase())
    .maybeSingle();

  if (gestorError || !gestor || !isActiveGestor(gestor.status)) {
    return { authorized: false, error: 'Acesso restrito para administradores.' };
  }

  return { authorized: true, gestor, gestorEmail: authData.user.email.toLowerCase() };
};

const getGestorScope = async (admin: any, gestor: any) => {
  const context = String(gestor?.context || '').trim();
  const permissions = normalizePermissionsPayload(gestor?.permissoes);
  const explicitPoloIds = normalizeStringArray(gestor?.polo_ids);
  if (!context || context.toLowerCase() === 'global') {
    return {
      global: permissions.allPolos || explicitPoloIds.length === 0,
      poloId: explicitPoloIds[0] || null,
      allowedPoloIds: explicitPoloIds,
    };
  }

  if (!isUuid(context)) {
    return { global: false, poloId: null, allowedPoloIds: explicitPoloIds };
  }

  const { data: polo } = await admin
    .from('polos')
    .select('id, is_matriz')
    .eq('id', context)
    .maybeSingle();

  return {
    global: Boolean(polo?.is_matriz) && (permissions.allPolos || explicitPoloIds.length === 0),
    poloId: context,
    allowedPoloIds: explicitPoloIds.length > 0 ? explicitPoloIds : [context],
  };
};

const gestorHasModule = (gestor: any, moduleId: string) => {
  const rawPermissions = gestor?.permissoes;
  if (!rawPermissions || typeof rawPermissions !== 'object') return true;
  const permissions = normalizePermissionsPayload(rawPermissions);
  if (permissions.modules.length === 0) return true;
  return permissions.modules.includes(moduleId);
};

const isPartnerInGestorScope = async (admin: any, gestor: any, partner: any) => {
  const scope = await getGestorScope(admin, gestor);
  if (scope.global) return true;
  if (!scope.poloId) return false;

  const partnerPoloId = partner?.polo_id || null;
  const partnerPoloIds = Array.isArray(partner?.polo_ids) ? partner.polo_ids : [];
  const allowedPoloIds = Array.isArray(scope.allowedPoloIds) ? scope.allowedPoloIds : [];

  return !partnerPoloId
    || allowedPoloIds.includes(partnerPoloId)
    || partnerPoloIds.some((poloId: string) => allowedPoloIds.includes(poloId));
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
  const corsHeadersForRequest = buildCorsHeaders(req);
  const json = (payload: FunctionResponse, status = 200) =>
    sendJson(payload, status, req);

  if (isRateLimitExceeded(`portal-user-management:${getClientIp(req)}`, 40, 60000)) {
    return json({
      success: false,
      error: 'Muitas tentativas. Tente novamente em alguns instantes.',
    }, 429);
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersForRequest });
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Método não permitido.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ success: false, error: 'Configuração do Supabase ausente.' }, 500);
  }

  const publicApiKey = resolveSupabasePublicApiKey(serviceRoleKey);

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
  if (!['send-student-invite', 'delete-partner', 'upsert-gestor-user'].includes(action)) {
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

  if (action === 'upsert-gestor-user') {
    const scope = await getGestorScope(admin, authorization.gestor);
    if (!scope.global || !gestorHasModule(authorization.gestor, 'configuracoes')) {
      return json({ success: false, error: 'Apenas gestor global com acesso a Configurações pode criar usuários.' }, 403);
    }

    const incomingUser = payload.user || {};
    const email = normalizeEmail(incomingUser.email as string | null);
    const password = String(payload.password || '').trim();
    const permissions = normalizePermissionsPayload(incomingUser.permissoes);
    const allPolos = permissions.allPolos;
    const poloIds = allPolos ? [] : normalizeStringArray(incomingUser.polo_ids);

    if (!email) {
      return json({ success: false, error: 'E-mail do usuário é obrigatório.' }, 400);
    }

    if (password.length < 6) {
      return json({ success: false, error: 'A senha precisa ter ao menos 6 caracteres.' }, 400);
    }

    if (!allPolos && poloIds.length === 0) {
      return json({ success: false, error: 'Selecione ao menos um polo para o usuário.' }, 400);
    }

    if (permissions.modules.length === 0) {
      return json({ success: false, error: 'Selecione ao menos um módulo para o usuário.' }, 400);
    }

    if (permissions.modules.includes('financeiro') && permissions.financeiroTabs.length === 0) {
      return json({ success: false, error: 'Selecione ao menos uma aba financeira.' }, 400);
    }

    let authUser: any;
    try {
      authUser = await findAuthUserByEmail(admin, email);
    } catch (error) {
      return json({
        success: false,
        error: error instanceof Error ? error.message : 'Não foi possível localizar usuário no Supabase Auth.',
      }, 500);
    }

    if (authUser?.id) {
      const { error: updateAuthError } = await admin.auth.admin.updateUserById(authUser.id, {
        password,
        user_metadata: {
          nome: incomingUser.nome,
          origem: 'usuarios_sistema',
        },
      });

      if (updateAuthError) {
        return json({ success: false, error: updateAuthError.message }, 500);
      }
    } else {
      const { data: createdAuth, error: createAuthError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          nome: incomingUser.nome,
          origem: 'usuarios_sistema',
        },
      });

      if (createAuthError) {
        return json({ success: false, error: createAuthError.message }, 500);
      }

      authUser = createdAuth?.user || null;
    }

    const userPayload = {
      nome: String(incomingUser.nome || '').trim(),
      email,
      cpf: incomingUser.cpf ? String(incomingUser.cpf) : null,
      telefone: incomingUser.telefone ? String(incomingUser.telefone) : null,
      perfil: String(incomingUser.perfil || 'Operacional').trim(),
      status: String(incomingUser.status || 'Ativo').trim(),
      context: String(incomingUser.context || 'global').trim(),
      polo_ids: poloIds,
      permissoes: permissions,
    };

    if (!userPayload.nome) {
      return json({ success: false, error: 'Nome do usuário é obrigatório.' }, 400);
    }

    const { data: savedUser, error: saveUserError } = await admin
      .from('usuarios_sistema')
      .upsert(userPayload, { onConflict: 'email' })
      .select('id, nome, email, cpf, telefone, perfil, status, context, polo_ids, permissoes, created_at')
      .single();

    if (saveUserError) {
      return json({ success: false, error: saveUserError.message }, 500);
    }

    return json({
      success: true,
      action: 'upsert-gestor-user',
      userId: authUser?.id || null,
      user: savedUser,
      message: authUser?.id ? 'Usuário cadastrado com acesso ao portal.' : 'Usuário salvo.',
    });
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

  const redirectResolution = resolveRedirectTarget(payload.redirectTo);
  if (!redirectResolution.redirectTo) {
    return json({
      success: false,
      error: redirectResolution.error || 'redirectTo inválido.',
    }, redirectResolution.status);
  }
  const finalRedirect = redirectResolution.redirectTo;
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

    const emailDelivery = publicApiKey.apiKey
      ? await sendRecoveryEmail(supabaseUrl, publicApiKey.apiKey, email, finalRedirect)
      : { sent: false, message: publicApiKey.message };

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
