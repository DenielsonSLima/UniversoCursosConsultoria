// File: modules/gestor/configuracoes/categorias-financeiras/categorias-financeiras.service.ts

import { supabase } from '../../../../lib/supabase';

export type CategoriaFinanceiraTipo = 'DESPESA_FIXA' | 'DESPESA_VARIAVEL' | 'OUTRO_DEBITO';

export interface CategoriaFinanceira {
  id: string;
  nome: string;
  tipo: CategoriaFinanceiraTipo;
  descricao?: string;
  status: 'ativo' | 'inativo';
  createdAt?: string;
}

export const categoriasFinanceirasService = {
  async getAll(): Promise<CategoriaFinanceira[]> {
    const { data, error } = await supabase
      .from('categorias_financeiras')
      .select('*')
      .order('tipo', { ascending: true })
      .order('nome', { ascending: true });

    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      nome: row.nome,
      tipo: row.tipo,
      descricao: row.descricao ?? undefined,
      status: row.status,
      createdAt: row.created_at,
    }));
  },

  async create(input: Omit<CategoriaFinanceira, 'id' | 'createdAt'>): Promise<CategoriaFinanceira> {
    const { data, error } = await supabase
      .from('categorias_financeiras')
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return { id: data.id, nome: data.nome, tipo: data.tipo, descricao: data.descricao, status: data.status };
  },

  async update(id: string, input: Partial<Omit<CategoriaFinanceira, 'id' | 'createdAt'>>): Promise<CategoriaFinanceira> {
    const { data, error } = await supabase
      .from('categorias_financeiras')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return { id: data.id, nome: data.nome, tipo: data.tipo, descricao: data.descricao, status: data.status };
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('categorias_financeiras').delete().eq('id', id);
    if (error) throw error;
  },
};
