import { supabase } from '../../lib/supabase';
import { onlyDigits } from '../shared/utils/identityValidation';
import { GestorPermissions, normalizeGestorPermissions } from '../gestor/access-control';
import { syncAlunoGoogleAvatar } from './partner-avatar-sync';
import { isPortalScheduleBlocked, PortalScheduleRestriction } from './portal-schedule';
import { isActivePortalStatus } from './portal-status';
import { PORTAL_LAST_ACTIVITY_STORAGE_KEY } from '../shared/hooks/inactivity-policy';

export type PortalRole = 'Aluno' | 'Professor' | 'Gestor';

export interface PortalAuthProfile {
  id: string;
  nome: string;
  email: string;
  tipo: PortalRole;
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
  podeVisualizarTodosSetores?: boolean;
}

export interface PortalProfileOptions {
  preferredRole?: PortalRole;
  allowedRoles?: PortalRole[];
}

export interface GestorAccessScope {
  isGlobal: boolean;
  allowedPoloIds: string[] | null;
  activePoloId: string | null;
}

const MATRIZ_POLO_ID = '44444444-4444-4444-4444-444444444444';

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
};

const resolvePartnerPoloScope = (selectedPartner: any) => {
  const arrayPoloIds = normalizeStringArray(selectedPartner?.polo_ids);
  const legacyPoloId = typeof selectedPartner?.polo_id === 'string'
    ? selectedPartner.polo_id.trim()
    : null;

  if (arrayPoloIds.length > 0) {
    return {
      activePoloId: arrayPoloIds[0],
      poloIds: arrayPoloIds,
    };
  }

  if (legacyPoloId) {
    return {
      activePoloId: legacyPoloId,
      poloIds: [legacyPoloId],
    };
  }

  if (selectedPartner?.tipo === 'Professor') {
    return {
      activePoloId: MATRIZ_POLO_ID,
      poloIds: [MATRIZ_POLO_ID],
    };
  }

  return {
    activePoloId: null,
    poloIds: [],
  };
};

const getAuthenticatedUser = async () => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) return null;
  return userData.user;
};

const getAuthenticatedEmail = async () => {
  const user = await getAuthenticatedUser();
  return user?.email?.trim().toLowerCase() || null;
};

const isRoleAllowed = (role: PortalRole, allowedRoles?: PortalRole[]) =>
  !allowedRoles?.length || allowedRoles.includes(role);

export const getPortalSessionFromStorage = (): PortalAuthProfile | null => {
  const tipo = sessionStorage.getItem('logged_user_tipo') as PortalRole | null;
  const id = sessionStorage.getItem('logged_user_id');
  const nome = sessionStorage.getItem('logged_user_name');
  const email = sessionStorage.getItem('logged_user_email');

  if (!tipo || !id || !nome || !email) return null;
  if (tipo !== 'Aluno' && tipo !== 'Professor' && tipo !== 'Gestor') return null;

  return {
    id,
    nome,
    email,
    tipo,
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

  const context = (profile.context || '').trim();
  const permissions = profile.gestorPermissions || normalizeGestorPermissions(null, {
    fallbackFullAccess: false,
  });
  const explicitPoloIds = normalizeStringArray(profile.poloIds);
  const contextPoloIds = context && context !== 'global' ? [context] : [];
  const allowedPoloIds = explicitPoloIds.length > 0 ? explicitPoloIds : contextPoloIds;
  const isGlobal = permissions.allPolos && allowedPoloIds.length === 0;
  const activePoloId = isGlobal ? (profile.activePoloId || null) : allowedPoloIds[0] || null;

  return {
    isGlobal,
    allowedPoloIds: isGlobal ? null : allowedPoloIds,
    activePoloId,
  };
};

const buildPartnerProfile = async (selectedPartner: any, fallbackEmail: string): Promise<PortalAuthProfile | null> => {
  if (!selectedPartner || !isActivePortalStatus(selectedPartner.status)) return null;

  const { activePoloId, poloIds } = resolvePartnerPoloScope(selectedPartner);
  let acceptedTermsAt: string | null = null;
  let acceptedTermsVersion: string | null = null;
  let requiresPasswordReset = false;

  if (selectedPartner.tipo === 'Aluno') {
    const { data: partnerTermsRows, error: termsError } = await supabase
      .from('parceiros')
      .select('aceitou_termos_uso_em, termos_uso_versao, troca_senha_obrigatoria')
      .eq('id', selectedPartner.id)
      .maybeSingle();

    if (termsError) {
      const message = String(termsError.message || '').toLowerCase();
      const hasLegacyColumns = message.includes('aceitou_termos_uso') || message.includes('termos_uso_versao');
      const isMissingColumn = message.includes('does not exist') && hasLegacyColumns;
      if (!isMissingColumn) {
        throw new Error(termsError.message);
      }
      acceptedTermsAt = new Date().toISOString();
    } else if (partnerTermsRows) {
      acceptedTermsAt = partnerTermsRows.aceitou_termos_uso_em || null;
      acceptedTermsVersion = partnerTermsRows.termos_uso_versao || null;
      requiresPasswordReset = Boolean(partnerTermsRows.troca_senha_obrigatoria);
    }
  }

  return {
    id: selectedPartner.id,
    nome: selectedPartner.nome,
    email: selectedPartner.email || fallbackEmail,
    tipo: selectedPartner.tipo as PortalRole,
    activePoloId,
    poloIds,
    status: selectedPartner.status || null,
    acceptedTermsAt,
    acceptedTermsVersion,
    requiresPasswordReset,
  };
};

const buildGestorProfile = (gestorRows: any): PortalAuthProfile | null => {
  if (!gestorRows || !isActivePortalStatus(gestorRows.status)) return null;

  // Se houver perfil de acesso vinculado (pode vir como array dependendo do join ou objeto unico)
  const perfilAcesso = Array.isArray(gestorRows.perfis_acesso) 
    ? gestorRows.perfis_acesso[0] 
    : gestorRows.perfis_acesso;

  const personalizarPermissoes = Boolean(gestorRows.personalizar_permissoes);
  const userPermissions = normalizeGestorPermissions(gestorRows.permissoes, {
    fallbackFullAccess: false,
  });
  const profilePermissions = normalizeGestorPermissions(perfilAcesso?.permissoes, {
    fallbackFullAccess: false,
  });
  const permissionsSource = perfilAcesso && !personalizarPermissoes
    ? profilePermissions
    : userPermissions;
  // O perfil define módulos/abas. O alcance de polos continua sempre individual.
  const permissions: GestorPermissions = {
    ...permissionsSource,
    allPolos: userPermissions.allPolos,
  };
  const explicitPoloIds = normalizeStringArray(gestorRows.polo_ids);

  const restricao = gestorRows.restricao_horario ?? perfilAcesso?.restricao_horario ?? null;
  const isBlocked = isPortalScheduleBlocked(restricao);

  return {
    id: gestorRows.id,
    nome: gestorRows.nome,
    email: gestorRows.email,
    tipo: 'Gestor',
    context: gestorRows.context || null,
    activePoloId: explicitPoloIds[0] || null,
    poloIds: explicitPoloIds,
    gestorPermissions: permissions,
    status: gestorRows.status || null,
    perfil_acesso_id: gestorRows.perfil_acesso_id || null,
    personalizar_permissoes: personalizarPermissoes,
    isBlockedSchedule: isBlocked,
    restricao_horario: restricao || null,
    setorComunicacao: gestorRows.setor_comunicacao || 'todos',
    poloComunicacaoId: gestorRows.polo_comunicacao_id || null,
    podeVisualizarTodosSetores: Boolean(gestorRows.pode_visualizar_todos_setores),
  };
};

export const getPortalProfile = async (options: PortalProfileOptions = {}): Promise<PortalAuthProfile | null> => {
  const authenticatedUser = await getAuthenticatedUser();
  const email = authenticatedUser?.email?.trim().toLowerCase();
  if (!email) return null;

  const partnerSelect = 'id, nome, email, tipo, polo_id, polo_ids, status, foto_url';

  const { data: partnerRows, error: partnerError } = await supabase
    .from('parceiros')
    .select(partnerSelect)
    .ilike('email', email)
    .in('tipo', ['Aluno', 'Professor']);

  if (partnerError) throw new Error(partnerError.message);

  const orderedPartnerRoles = options.preferredRole && options.preferredRole !== 'Gestor'
    ? [options.preferredRole, ...(['Professor', 'Aluno'] as PortalRole[]).filter((role) => role !== options.preferredRole)]
    : (['Professor', 'Aluno'] as PortalRole[]);

  for (const role of orderedPartnerRoles) {
    if (!isRoleAllowed(role, options.allowedRoles)) continue;
    const selectedPartner = (partnerRows || []).find((p) => p.tipo === role);
    const partnerWithAvatar = selectedPartner?.tipo === 'Aluno'
      ? await syncAlunoGoogleAvatar(selectedPartner, authenticatedUser)
      : selectedPartner;
    const profile = await buildPartnerProfile(partnerWithAvatar, email);
    if (profile) return profile;
  }

  if (!isRoleAllowed('Gestor', options.allowedRoles)) return null;

  const { data: gestorRows, error: gestorError } = await supabase
    .from('usuarios_sistema')
    .select('id, nome, email, status, context, polo_ids, permissoes, perfil_acesso_id, personalizar_permissoes, restricao_horario, setor_comunicacao, polo_comunicacao_id, pode_visualizar_todos_setores, perfis_acesso(permissoes, restricao_horario)')
    .ilike('email', email)
    .limit(1)
    .maybeSingle();

  if (gestorError && gestorError.code !== 'PGRST116') {
    throw new Error(gestorError.message);
  }

  return buildGestorProfile(gestorRows);
};

export const getInstitutionalProfiles = async (): Promise<PortalAuthProfile[]> => {
  const [gestor, professor] = await Promise.all([
    getPortalProfile({ preferredRole: 'Gestor', allowedRoles: ['Gestor'] }),
    getPortalProfile({ preferredRole: 'Professor', allowedRoles: ['Professor'] }),
  ]);

  return [gestor, professor].filter(Boolean) as PortalAuthProfile[];
};

export const ensureLinkedAlunoProfile = async (sourceProfile?: PortalAuthProfile | null): Promise<PortalAuthProfile | null> => {
  const email = await getAuthenticatedEmail();
  if (!email) return null;

  const existingAluno = await getPortalProfile({ preferredRole: 'Aluno', allowedRoles: ['Aluno'] });
  if (existingAluno) return existingAluno;
  if (!sourceProfile) {
    sourceProfile = await getPortalProfile({ preferredRole: 'Gestor', allowedRoles: ['Gestor'] })
      || await getPortalProfile({ preferredRole: 'Professor', allowedRoles: ['Professor'] });
  }
  if (sourceProfile?.tipo === 'Aluno') return sourceProfile;

  const { data: partnerRows, error: partnerError } = await supabase
    .from('parceiros')
    .select('id, nome, email, tipo, polo_id, polo_ids, status, cpf_cnpj, telefone, data_nascimento')
    .ilike('email', email)
    .in('tipo', ['Professor', 'Aluno']);

  if (partnerError) throw new Error(partnerError.message);

  const sourcePartner = (partnerRows || []).find((p) => p.tipo === sourceProfile?.tipo)
    || (partnerRows || []).find((p) => p.tipo === 'Professor')
    || null;
  const cpf = onlyDigits(sourcePartner?.cpf_cnpj || '');
  let gestorCpf = '';

  let sourceName = sourcePartner?.nome || sourceProfile?.nome || '';
  let sourcePhone = sourcePartner?.telefone || null;
  let sourceBirthDate = sourcePartner?.data_nascimento || null;
  let sourcePoloId = sourcePartner?.polo_id || null;
  let sourcePoloIds = normalizeStringArray(sourcePartner?.polo_ids);

  if (!cpf && sourceProfile?.tipo === 'Gestor') {
    const { data: gestorRows, error: gestorError } = await supabase
      .from('usuarios_sistema')
      .select('id, nome, email, status, context, cpf, telefone')
      .ilike('email', email)
      .limit(1)
      .maybeSingle();

    if (gestorError && gestorError.code !== 'PGRST116') {
      throw new Error(gestorError.message);
    }

    gestorCpf = onlyDigits(gestorRows?.cpf || '');
    sourceName = gestorRows?.nome || sourceName;
    sourcePhone = gestorRows?.telefone || sourcePhone;
  }

  const sourceCpf = cpf || gestorCpf || onlyDigits((sourceProfile as any)?.cpf || '');
  if (!sourceCpf) {
    throw new Error('Para comprar curso como aluno, complete o CPF no cadastro do professor/gestor ou crie um cadastro de aluno.');
  }

  const { data: alunoByCpf, error: alunoByCpfError } = await supabase
    .from('parceiros')
    .select('id, nome, email, tipo, polo_id, polo_ids, status')
    .eq('tipo', 'Aluno')
    .eq('cpf_cnpj', sourceCpf)
    .maybeSingle();

  if (alunoByCpfError && alunoByCpfError.code !== 'PGRST116') {
    throw new Error(alunoByCpfError.message);
  }

  const alunoByCpfProfile = await buildPartnerProfile(alunoByCpf, email);
  if (alunoByCpfProfile) return alunoByCpfProfile;

  const alunoPayload = {
    tipo: 'Aluno',
    nome: sourceName || email,
    email,
    telefone: sourcePhone,
    cpf_cnpj: sourceCpf,
    data_nascimento: sourceBirthDate,
    polo_id: sourcePoloId,
    polo_ids: sourcePoloIds,
    status: 'ATIVO',
    observacao: `Cadastro aluno vinculado automaticamente ao acesso ${sourceProfile?.tipo || 'institucional'} para compra online.`,
  };

  const { data: insertedAluno, error: insertError } = await supabase
    .from('parceiros')
    .insert(alunoPayload)
    .select('id, nome, email, tipo, polo_id, polo_ids, status')
    .single();

  if (insertError) {
    throw new Error(insertError.message.includes('duplicate')
      ? 'Já existe um cadastro com este CPF. Verifique se o aluno está cadastrado corretamente antes de comprar.'
      : insertError.message);
  }

  return buildPartnerProfile(insertedAluno, email);
};
