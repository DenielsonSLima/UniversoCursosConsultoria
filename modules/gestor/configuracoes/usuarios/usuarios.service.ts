import { supabase } from '../../../../lib/supabase';
import {
  buildGestorPermissionsPayload,
  normalizeGestorPermissions,
} from '../../access-control';
import {
  UsuarioManagementState,
  UsuarioSistema,
  UsuarioSistemaInput,
} from './usuarios.types';

export type { UsuarioSistema, UsuarioSistemaInput } from './usuarios.types';

const USER_SELECT =
  'id, nome, email, cpf, telefone, perfil, status, context, polo_ids, ' +
  'permissoes, perfil_acesso_id, personalizar_permissoes, restricao_horario, ' +
  'setor_comunicacao, polo_comunicacao_id, pode_visualizar_todos_polos, ' +
  'pode_visualizar_todos_setores, ' +
  'perfis_acesso(nome, permissoes, restricao_horario), created_at';

const resolvePerfilNome = (value: unknown) => {
  if (!value) return null;
  if (Array.isArray(value)) return (value[0] as { nome?: string } | undefined)?.nome || null;
  return (value as { nome?: string }).nome || null;
};

const normalizeUser = (row: any): UsuarioSistema => {
  const profile = Array.isArray(row.perfis_acesso) ? row.perfis_acesso[0] : row.perfis_acesso;
  const userPermissions = normalizeGestorPermissions(row.permissoes, { fallbackFullAccess: false });
  const inheritedPermissions = normalizeGestorPermissions(profile?.permissoes, { fallbackFullAccess: false });
  const source = profile && !row.personalizar_permissoes ? inheritedPermissions : userPermissions;

  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    cpf: row.cpf || undefined,
    telefone: row.telefone || undefined,
    perfil: row.perfil,
    status: row.status,
    context: row.context,
    polo_ids: Array.isArray(row.polo_ids) ? row.polo_ids : [],
    permissoes: { ...source, allPolos: userPermissions.allPolos },
    created_at: row.created_at,
    perfil_acesso_id: row.perfil_acesso_id || null,
    perfil_nome: resolvePerfilNome(row.perfis_acesso),
    personalizar_permissoes: Boolean(row.personalizar_permissoes),
    // Mantém somente a regra individual; null significa herdar a agenda do perfil.
    restricao_horario: row.restricao_horario || null,
    setor_comunicacao: row.setor_comunicacao || 'todos',
    polo_comunicacao_id: row.polo_comunicacao_id || null,
    pode_visualizar_todos_polos: Boolean(row.pode_visualizar_todos_polos),
    pode_visualizar_todos_setores: Boolean(row.pode_visualizar_todos_setores),
  };
};

const normalizeUsers = (rows: any[] | null): UsuarioSistema[] => (rows || []).map(normalizeUser);

const getFunctionErrorMessage = async (error: any, fallback: string) => {
  const body = error?.context ? await error.context.json().catch(() => null) : null;
  if (body && typeof body === 'object' && 'error' in body) {
    return String((body as { error?: string }).error || fallback);
  }
  return error?.message || fallback;
};

export const usuariosService = {
  /**
   * Retorna os usuários filtrados por um contexto de empresa específico.
   */
  async getUsersByContext(contextId: string): Promise<UsuarioSistema[]> {
    const { data, error } = await supabase
      .from('usuarios_sistema')
      .select(USER_SELECT)
      .eq('context', contextId)
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar usuários do contexto:', error);
      throw new Error(error.message);
    }

    return normalizeUsers(data);
  },

  /**
   * Retorna os usuários de contexto global.
   */
  async getGlobalUsers(): Promise<UsuarioSistema[]> {
    const { data, error } = await supabase
      .from('usuarios_sistema')
      .select(USER_SELECT)
      .eq('context', 'global')
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar usuários globais:', error);
      throw new Error(error.message);
    }

    return normalizeUsers(data);
  },

  /**
   * Cria um novo usuário na tabela usuarios_sistema.
   */
  async createUser(user: UsuarioSistemaInput): Promise<UsuarioSistema> {
    const { senha, ...dbUser } = user;
    const payload = {
      ...dbUser,
      polo_ids: user.permissoes.allPolos ? [] : user.polo_ids,
      permissoes: buildGestorPermissionsPayload(user.permissoes),
    };

    const { data, error } = await supabase.functions.invoke('portal-user-management', {
      body: {
        action: 'upsert-gestor-user',
        password: senha,
        user: payload,
      },
    });
    if (error) {
      console.error('Erro ao criar usuário:', error);
      throw new Error(await getFunctionErrorMessage(error, 'Não foi possível criar o usuário.'));
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return {
      ...normalizeUser(data?.user || data),
      access_message: typeof data?.message === 'string' ? data.message : undefined,
    };
  },

  /**
   * Atualiza dados de um usuário existente.
   */
  async updateUser(id: string, user: Partial<UsuarioSistemaInput>): Promise<UsuarioSistema> {
    const { senha, ...dbUser } = user;
    const payload = dbUser.permissoes
      ? {
          ...dbUser,
          polo_ids: dbUser.permissoes.allPolos ? [] : dbUser.polo_ids,
          permissoes: buildGestorPermissionsPayload(dbUser.permissoes),
        }
      : dbUser;

    const { data, error } = await supabase
      .from('usuarios_sistema')
      .update(payload)
      .eq('id', id)
      .select(USER_SELECT)
      .single();

    if (error) {
      console.error('Erro ao atualizar usuário:', error);
      throw new Error(error.message);
    }

    return normalizeUser(data);
  },

  /**
   * Alterna o status (Ativo/Inativo) de um usuário.
   */
  async toggleUserStatus(id: string, status: 'Ativo' | 'Inativo'): Promise<boolean> {
    const { data, error } = await supabase.functions.invoke('portal-user-management', {
      body: {
        action: 'set-gestor-user-status',
        userId: id,
        status,
      },
    });

    if (error) {
      console.error('Erro ao alternar status do usuário:', error);
      throw new Error(await getFunctionErrorMessage(error, 'Não foi possível alterar o status do usuário.'));
    }
    if (data?.error) throw new Error(data.error);

    return true;
  },

  /**
   * Remove um usuário.
   */
  async deleteUser(id: string): Promise<boolean> {
    const { data, error } = await supabase.functions.invoke('portal-user-management', {
      body: {
        action: 'delete-gestor-user',
        userId: id,
      },
    });

    if (error) {
      console.error('Erro ao excluir usuário:', error);
      throw new Error(await getFunctionErrorMessage(error, 'Não foi possível excluir o usuário.'));
    }
    if (data?.error) throw new Error(data.error);

    return true;
  },

  async getManagementStates(userIds: string[]): Promise<Record<string, UsuarioManagementState>> {
    if (userIds.length === 0) return {};

    const { data, error } = await supabase.functions.invoke('portal-user-management', {
      body: {
        action: 'list-gestor-user-management-states',
        userIds,
      },
    });

    if (error) {
      console.error('Erro ao verificar o histórico dos usuários:', error);
      throw new Error(await getFunctionErrorMessage(error, 'Não foi possível verificar o histórico dos usuários.'));
    }
    if (data?.error) throw new Error(data.error);

    return (data?.managementStates || []).reduce(
      (states: Record<string, UsuarioManagementState>, state: UsuarioManagementState) => {
        states[state.userId] = state;
        return states;
      },
      {},
    );
  },
};
