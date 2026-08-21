import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import { GestorPermissions, normalizeGestorPermissions } from '../gestor/access-control';
import { PortalScheduleRestriction } from './portal-schedule';
import { PORTAL_LAST_ACTIVITY_STORAGE_KEY } from '../shared/hooks/inactivity-policy';
import { resolveGestorPoloScope } from './gestor-polo-scope';
import { listPortalContexts } from './portal-context.service';
import type { PortalContext, PortalRole } from './portal-context.contract';
import { resolvePortalActivePoloId } from './profile-selection';

export type { PortalContext, PortalRole } from './portal-context.contract';

export interface PortalAuthProfile {
  id: string;
  nome: string;
  email: string;
  tipo: PortalRole;
  telefone?: string | null;
  fotoPath?: string | null;
  /** Identificador de contexto devolvido pela RPC; nunca é uma autorização local. */
  contextId?: string | null;
  portalContext?: PortalContext | null;
  capabilities?: readonly string[];
  allPolos?: boolean;
  requiresPoloSelection?: boolean;
  scopes?: PortalContext['scopes'];
  activePoloId?: string | null;
  poloIds?: string[];
  context?: string | null;
  gestorPermissions?: GestorPermissions;
  status?: string | null;
  acceptedTermsAt?: string | null;
  acceptedTermsVersion?: string | null;
  requiresPasswordReset?: boolean;
  perfil_acesso_id?: string | null;
  personalizar_permissoes?: boolean;
  isBlockedSchedule?: boolean;
  restricao_horario?: PortalScheduleRestriction | null;
  setorComunicacao?: string | null;
  poloComunicacaoId?: string | null;
  podeVisualizarTodosPolos?: boolean;
  podeVisualizarTodosSetores?: boolean;
}

export interface PortalProfileOptions {
  preferredRole?: PortalRole;
  allowedRoles?: PortalRole[];
  authenticatedUser?: User | null;
  /** Dica de seleção; somente vale se reaparecer na resposta canônica da RPC. */
  contextId?: string | null;
}

export interface GestorAccessScope {
  isGlobal: boolean;
  allowedPoloIds: string[] | null;
  activePoloId: string | null;
}

const getAuthenticatedUser = async () => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) return null;
  return userData.user;
};

const getCanonicalGestorPermissions = (
  context: PortalContext,
): GestorPermissions | undefined => {
  if (context.role !== 'Gestor') return undefined;

  const permissionScope = context.scopes.find((scope) => (
    scope
    && typeof scope === 'object'
    && !Array.isArray(scope)
    && (scope as Record<string, unknown>).kind === 'GESTOR_PERMISSIONS'
  )) as Record<string, unknown> | undefined;
  const normalized = normalizeGestorPermissions(permissionScope?.permissions, {
    fallbackFullAccess: false,
  });

  // Os dois sinais vêm da mesma RPC. Em eventual divergência, nunca ampliamos
  // o alcance apresentado pelo portal.
  return {
    ...normalized,
    allPolos: context.allPolos && normalized.allPolos,
  };
};

/**
 * Adapta somente a apresentação do contexto canônico. O `contextId`, as
 * capabilities e os polos continuam sendo revalidados pelas RPCs de cada
 * domínio; esta projeção nunca confere permissão por conta própria.
 */
export const profileFromPortalContext = (
  context: PortalContext,
  authenticatedUser: User,
): PortalAuthProfile => ({
  id: context.contextId,
  nome: context.label,
  email: authenticatedUser.email?.trim().toLowerCase() || '',
  tipo: context.role,
  contextId: context.contextId,
  portalContext: context,
  capabilities: context.capabilities,
  allPolos: context.allPolos,
  requiresPoloSelection: context.requiresPoloSelection,
  scopes: context.scopes,
  activePoloId: context.poloIds[0] || null,
  poloIds: [...context.poloIds],
  gestorPermissions: getCanonicalGestorPermissions(context),
  status: 'ATIVO',
  ...(context.firstAccess ? {
    acceptedTermsAt: context.firstAccess.acceptedTermsAt,
    acceptedTermsVersion: context.firstAccess.acceptedTermsVersion,
    requiresPasswordReset: context.firstAccess.requiresPasswordReset,
  } : {}),
});

export const getPortalContexts = async (
  authenticatedUser?: User | null,
): Promise<readonly PortalContext[]> => {
  const resolvedUser = authenticatedUser || await getAuthenticatedUser();
  if (!resolvedUser) return [];
  return listPortalContexts();
};

const getContextProfiles = async (
  authenticatedUser: User,
  roles?: readonly PortalRole[],
): Promise<PortalAuthProfile[]> => {
  const contexts = await getPortalContexts(authenticatedUser);
  const persistedPoloId = sessionStorage.getItem('active_polo_id');
  return contexts
    .filter((context) => !roles?.length || roles.includes(context.role))
    .map((context) => {
      const profile = profileFromPortalContext(context, authenticatedUser);
      return {
        ...profile,
        activePoloId: resolvePortalActivePoloId(
          context.role,
          context.poloIds,
          persistedPoloId,
        ),
      };
    });
};

/** Perfis elegíveis ao login público; sem relacionamento verificado a RPC não devolve Responsável. */
export const getPublicPortalProfiles = async (
  authenticatedUser?: User | null,
): Promise<PortalAuthProfile[]> => {
  const resolvedUser = authenticatedUser || await getAuthenticatedUser();
  if (!resolvedUser) return [];
  return getContextProfiles(resolvedUser, ['Aluno', 'Responsavel']);
};

export const getPortalSessionFromStorage = (): PortalAuthProfile | null => {
  const tipo = sessionStorage.getItem('logged_user_tipo') as PortalRole | null;
  const id = sessionStorage.getItem('logged_user_id');
  const nome = sessionStorage.getItem('logged_user_name');
  const email = sessionStorage.getItem('logged_user_email');

  if (!tipo || !id || !nome || !email) return null;
  if (!['Aluno', 'Responsavel', 'Professor', 'Coordenador', 'Gestor'].includes(tipo)) return null;

  return {
    id,
    nome,
    email,
    tipo,
    contextId: sessionStorage.getItem('portal_context_id') || null,
    activePoloId: sessionStorage.getItem('active_polo_id') || null,
    poloIds: [],
    gestorPermissions: normalizeGestorPermissions(null, { fallbackFullAccess: false }),
    status: 'ATIVO',
    context: null,
  };
};

export const savePortalSession = (profile: PortalAuthProfile) => {
  sessionStorage.setItem('logged_user_id', profile.id);
  sessionStorage.setItem('logged_user_name', profile.nome);
  sessionStorage.setItem('logged_user_email', profile.email);
  sessionStorage.setItem('logged_user_tipo', profile.tipo);
  if (profile.contextId) {
    sessionStorage.setItem('portal_context_id', profile.contextId);
  } else {
    sessionStorage.removeItem('portal_context_id');
  }
  try {
    localStorage.setItem(PORTAL_LAST_ACTIVITY_STORAGE_KEY, String(Date.now()));
  } catch {
    // A sessão continua funcional com o relógio de inatividade em memória.
  }

  const activePoloId =
    profile.activePoloId ||
    (profile.tipo === 'Gestor' && profile.context && profile.context !== 'global'
      ? profile.context
      : null);

  if (activePoloId) {
    sessionStorage.setItem('active_polo_id', activePoloId);
  } else {
    sessionStorage.removeItem('active_polo_id');
  }
};

export const clearPortalSession = () => {
  sessionStorage.removeItem('logged_user_id');
  sessionStorage.removeItem('logged_user_name');
  sessionStorage.removeItem('logged_user_email');
  sessionStorage.removeItem('logged_user_tipo');
  sessionStorage.removeItem('portal_context_id');
  sessionStorage.removeItem('active_polo_id');
  sessionStorage.removeItem('current_polo_id');
  try {
    localStorage.removeItem(PORTAL_LAST_ACTIVITY_STORAGE_KEY);
  } catch {
    // O redirecionamento de logout não pode depender da disponibilidade do storage.
  }
};

export const getGestorAccessScope = (profile?: PortalAuthProfile | null): GestorAccessScope => {
  if (!profile || profile.tipo !== 'Gestor') {
    return {
      isGlobal: false,
      allowedPoloIds: [],
      activePoloId: null,
    };
  }

  const permissions = profile.gestorPermissions || normalizeGestorPermissions(null, {
    fallbackFullAccess: false,
  });

  return resolveGestorPoloScope({
    context: profile.context,
    explicitPoloIds: profile.poloIds,
    allPolos: permissions.allPolos,
    preferredPoloId: profile.activePoloId,
  });
};

export const getPortalProfile = async (options: PortalProfileOptions = {}): Promise<PortalAuthProfile | null> => {
  const authenticatedUser =
    options.authenticatedUser || await getAuthenticatedUser();
  if (!authenticatedUser?.email) return null;

  const profiles = await getContextProfiles(authenticatedUser, options.allowedRoles);
  const roleProfiles = options.preferredRole
    ? profiles.filter((profile) => profile.tipo === options.preferredRole)
    : profiles;
  const requestedContextId = options.contextId?.trim()
    || sessionStorage.getItem('portal_context_id')?.trim()
    || null;

  if (requestedContextId) {
    const selected = roleProfiles.find((profile) => profile.contextId === requestedContextId);
    if (selected) return selected;
    // Um contexto explicitamente recebido pelo fluxo e que não reaparece na
    // RPC não pode cair silenciosamente em outro perfil.
    if (options.contextId) return null;
  }

  return roleProfiles[0] || null;
};

export const getInstitutionalProfiles = async (
  authenticatedUser?: User | null,
): Promise<PortalAuthProfile[]> => {
  const resolvedUser = authenticatedUser || await getAuthenticatedUser();
  if (!resolvedUser) return [];
  return getContextProfiles(resolvedUser, ['Gestor', 'Professor', 'Coordenador']);
};

const getLinkedAlunoFailureMessage = (message: string) => {
  if (message.includes('ALUNO_CHECKOUT_ACESSO_JA_VINCULADO_A_PROFESSOR')) {
    return 'Este acesso já pertence a um perfil de professor e não pode receber também um perfil de aluno. Use um acesso de aluno ou fale com a secretaria.';
  }
  if (message.includes('ALUNO_CHECKOUT_CPF_ORIGEM_OBRIGATORIO')) {
    return 'Para comprar curso como aluno, complete o CPF no cadastro do professor/gestor ou crie um cadastro de aluno.';
  }
  if (message.includes('ALUNO_CHECKOUT_CPF_JA_VINCULADO')) {
    return 'Já existe um cadastro de aluno com este CPF vinculado a outro acesso. Fale com a secretaria para revisar o cadastro.';
  }
  if (message.includes('ALUNO_CHECKOUT_IDENTIDADE_DIVERGENTE')
    || message.includes('ALUNO_CHECKOUT_EMAIL_CANONICO_DIVERGENTE')) {
    return 'Os dados de acesso não conferem com o cadastro de aluno. Fale com a secretaria antes de continuar.';
  }
  if (message.includes('ALUNO_CHECKOUT_PERFIL_INATIVO')) {
    return 'O cadastro de aluno está inativo. Fale com a secretaria antes de continuar.';
  }
  return 'Não foi possível preparar o perfil de aluno para esta compra. Tente novamente ou fale com a secretaria.';
};

export const ensureLinkedAlunoProfile = async (
  sourceProfile?: PortalAuthProfile | null,
  requestId?: string,
): Promise<PortalAuthProfile | null> => {
  const existingAluno = await getPortalProfile({ preferredRole: 'Aluno', allowedRoles: ['Aluno'] });
  if (existingAluno) return existingAluno;
  if (!sourceProfile) {
    sourceProfile = await getPortalProfile({ preferredRole: 'Gestor', allowedRoles: ['Gestor'] })
      || await getPortalProfile({ preferredRole: 'Professor', allowedRoles: ['Professor'] });
  }
  if (sourceProfile?.tipo === 'Aluno') return sourceProfile;
  if (!sourceProfile?.contextId && !sourceProfile?.id) return null;
  if (!requestId) {
    throw new Error('Não foi possível iniciar esta operação com segurança. Atualize a página e tente novamente.');
  }

  const { error } = await supabase.rpc('portal_garantir_perfil_aluno_checkout', {
    p_source_context_id: sourceProfile.contextId || sourceProfile.id,
    p_request_id: requestId,
  });

  if (error) throw new Error(getLinkedAlunoFailureMessage(error.message));
  return getPortalProfile({ preferredRole: 'Aluno', allowedRoles: ['Aluno'] });
};
