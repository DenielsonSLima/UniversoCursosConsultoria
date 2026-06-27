import { supabase } from '../../../../lib/supabase';

export interface UsuarioSistema {
  id?: string;
  nome: string;
  email: string;
  cpf?: string;
  telefone?: string;
  perfil: string;
  status: 'Ativo' | 'Inativo';
  context: string;
}

export const usuariosService = {
  /**
   * Retorna os usuários filtrados por um contexto de empresa específico.
   */
  async getUsersByContext(contextId: string): Promise<UsuarioSistema[]> {
    const { data, error } = await supabase
      .from('usuarios_sistema')
      .select('*')
      .eq('context', contextId)
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar usuários do contexto:', error);
      throw new Error(error.message);
    }

    return data || [];
  },

  /**
   * Retorna os usuários de contexto global.
   */
  async getGlobalUsers(): Promise<UsuarioSistema[]> {
    const { data, error } = await supabase
      .from('usuarios_sistema')
      .select('*')
      .eq('context', 'global')
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar usuários globais:', error);
      throw new Error(error.message);
    }

    return data || [];
  },

  /**
   * Cria um novo usuário na tabela usuarios_sistema.
   */
  async createUser(user: Omit<UsuarioSistema, 'id'>): Promise<UsuarioSistema> {
    const insertUser = async (payload: Omit<UsuarioSistema, 'id'> | Omit<UsuarioSistema, 'id' | 'cpf'>) => supabase
      .from('usuarios_sistema')
      .insert(payload)
      .select()
      .single();

    let { data, error } = await insertUser(user);

    if (error && (error.message?.includes('cpf') || error.message?.includes('telefone'))) {
      const { cpf, telefone, ...withoutIdentityExtras } = user;
      const retry = await insertUser(withoutIdentityExtras);
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('Erro ao criar usuário:', error);
      throw new Error(error.message);
    }

    return data;
  },

  /**
   * Atualiza dados de um usuário existente.
   */
  async updateUser(id: string, user: Partial<UsuarioSistema>): Promise<UsuarioSistema> {
    const { data, error } = await supabase
      .from('usuarios_sistema')
      .update(user)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Erro ao atualizar usuário:', error);
      throw new Error(error.message);
    }

    return data;
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
