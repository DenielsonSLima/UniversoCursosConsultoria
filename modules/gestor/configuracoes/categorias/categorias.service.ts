import { supabase } from '../../../../lib/supabase';

export interface Categoria {
  id?: string;
  nome: string;
  tipo: 'aluno' | 'professor' | 'pf' | 'pj';
  descricao: string;
  status: 'ativo' | 'inativo';
  created_at?: string;
}

export const categoriasQueryKeys = {
  all: ['categorias'] as const,
  activeByType: (tipo: Categoria['tipo']) => ['categorias', 'ativas', tipo] as const,
};

const normalizeCategoriaNome = (nome: string) => nome.trim().toLocaleUpperCase('pt-BR');

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

  async getActiveByType(tipo: Categoria['tipo']): Promise<Categoria[]> {
    const { data, error } = await supabase
      .from('categorias')
      .select('*')
      .eq('tipo', tipo)
      .eq('status', 'ativo')
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar categorias ativas:', error);
      throw new Error(error.message);
    }

    return data || [];
  },

  async create(categoria: Omit<Categoria, 'id'>): Promise<Categoria> {
    const payload = {
      ...categoria,
      nome: normalizeCategoriaNome(categoria.nome),
    };
    const { data, error } = await supabase
      .from('categorias')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar categoria:', error);
      throw new Error(error.message);
    }

    return data;
  },

  async update(id: string, categoria: Partial<Categoria>): Promise<Categoria> {
    const payload = {
      ...categoria,
      ...(categoria.nome !== undefined
        ? { nome: normalizeCategoriaNome(categoria.nome) }
        : {}),
    };
    const { data, error } = await supabase
      .from('categorias')
      .update(payload)
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
