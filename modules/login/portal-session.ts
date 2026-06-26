import { supabase } from '../../lib/supabase';

export type PortalRole = 'Aluno' | 'Professor' | 'Gestor';

export interface PortalAuthProfile {
  id: string;
  nome: string;
  email: string;
  tipo: PortalRole;
  activePoloId?: string | null;
  poloIds?: string[];
  context?: string | null;
  status?: string | null;
  acceptedTermsAt?: string | null;
  acceptedTermsVersion?: string | null;
  requiresPasswordReset?: boolean;
}

const normalizeStatus = (status?: string | null) => (status || '').trim().toUpperCase();

const isActiveStatus = (status?: string | null) => {
  if (!status) return true;
  const normalized = normalizeStatus(status);
  return normalized !== 'INATIVO' && normalized !== 'INACTIVE' && normalized !== 'BLOQUEADO';
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
};

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
    status: 'ATIVO',
    context: null,
  };
};

export const savePortalSession = (profile: PortalAuthProfile) => {
  sessionStorage.setItem('logged_user_id', profile.id);
  sessionStorage.setItem('logged_user_name', profile.nome);
  sessionStorage.setItem('logged_user_email', profile.email);
  sessionStorage.setItem('logged_user_tipo', profile.tipo);

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
};

export const getPortalProfile = async (): Promise<PortalAuthProfile | null> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.email) return null;

  const email = userData.user.email.trim().toLowerCase();
  const partnerSelect = 'id, nome, email, tipo, polo_id, polo_ids, status';

  const { data: partnerRows, error: partnerError } = await supabase
    .from('parceiros')
    .select(partnerSelect)
    .ilike('email', email)
    .in('tipo', ['Aluno', 'Professor']);

  if (partnerError) throw new Error(partnerError.message);

  const selectedPartner = (partnerRows || []).find((p) => p.tipo === 'Professor')
    || (partnerRows || []).find((p) => p.tipo === 'Aluno') || null;

  if (selectedPartner && isActiveStatus(selectedPartner.status)) {
    const poloIds = normalizeStringArray(selectedPartner.polo_ids);
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
      email: selectedPartner.email || userData.user.email,
      tipo: selectedPartner.tipo as PortalRole,
      activePoloId: poloIds[0] || selectedPartner.polo_id || null,
      poloIds,
      status: selectedPartner.status || null,
      acceptedTermsAt,
      acceptedTermsVersion,
      requiresPasswordReset,
    };
  }

  const { data: gestorRows, error: gestorError } = await supabase
    .from('usuarios_sistema')
    .select('id, nome, email, status, context')
    .ilike('email', email)
    .limit(1)
    .maybeSingle();

  if (gestorError && gestorError.code !== 'PGRST116') {
    throw new Error(gestorError.message);
  }

  if (!gestorRows || !isActiveStatus(gestorRows.status)) return null;

  return {
    id: gestorRows.id,
    nome: gestorRows.nome,
    email: gestorRows.email,
    tipo: 'Gestor',
    context: gestorRows.context || null,
    status: gestorRows.status || null,
  };
};
