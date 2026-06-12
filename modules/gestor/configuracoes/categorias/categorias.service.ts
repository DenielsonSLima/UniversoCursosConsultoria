import { supabase } from '../../../../lib/supabase';

export interface Categoria {
  id?: string;
  nome: string;
  tipo: 'aluno' | 'professor' | 'pf' | 'pj';
  descricao: string;
  status: 'ativo' | 'inativo';
  created_at?: string;
}

export const categoriasService = {
  async getAll(): Promise<Categoria[]> {
    const { data, error } = await supabase
      .from('categorias')
      .select('*')
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar categorias:', error);
      throw new Error(error.message);
    }

    return data || [];
  },

  async create(categoria: Omit<Categoria, 'id'>): Promise<Categoria> {
    const { data, error } = await supabase
      .from('categorias')
      .insert(categoria)
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar categoria:', error);
      throw new Error(error.message);
    }

    return data;
  },

  async update(id: string, categoria: Partial<Categoria>): Promise<Categoria> {
    const { data, error } = await supabase
      .from('categorias')
      .update(categoria)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Erro ao atualizar categoria:', error);
      throw new Error(error.message);
    }

    return data;
  },

  async delete(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('categorias')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Erro ao excluir categoria:', error);
      throw new Error(error.message);
    }

    return true;
  }
};
