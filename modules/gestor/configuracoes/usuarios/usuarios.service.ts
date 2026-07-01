import { supabase } from '../../../../lib/supabase';
import {
  buildGestorPermissionsPayload,
  normalizeGestorPermissions,
} from '../../access-control';
import { UsuarioSistema, UsuarioSistemaInput } from './usuarios.types';

export type { UsuarioSistema, UsuarioSistemaInput } from './usuarios.types';

const USER_SELECT = 'id, nome, email, cpf, telefone, perfil, status, context, polo_ids, permissoes, created_at';

const normalizeUser = (row: any): UsuarioSistema => ({
  id: row.id,
  nome: row.nome,
  email: row.email,
  cpf: row.cpf || undefined,
  telefone: row.telefone || undefined,
  perfil: row.perfil,
  status: row.status,
  context: row.context,
  polo_ids: Array.isArray(row.polo_ids) ? row.polo_ids : [],
  permissoes: normalizeGestorPermissions(row.permissoes),
  created_at: row.created_at,
});

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

    return normalizeUser(data?.user || data);
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
    const { error } = await supabase
      .from('usuarios_sistema')
      .update({ status })
      .eq('id', id);

    if (error) {
      console.error('Erro ao alternar status do usuário:', error);
      throw new Error(error.message);
    }

    return true;
  },

  /**
   * Remove um usuário.
   */
  async deleteUser(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('usuarios_sistema')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Erro ao excluir usuário:', error);
      throw new Error(error.message);
    }

    return true;
  }
};
