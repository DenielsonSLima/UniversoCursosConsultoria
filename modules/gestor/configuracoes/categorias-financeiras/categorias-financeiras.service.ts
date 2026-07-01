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

const toUpper = (value?: string | null) => (value || '').trim().toLocaleUpperCase('pt-BR');

const mapCategoria = (row: any): CategoriaFinanceira => ({
  id: row.id,
  nome: toUpper(row.nome),
  tipo: row.tipo,
  descricao: row.descricao ? toUpper(row.descricao) : undefined,
  status: row.status,
  createdAt: row.created_at,
});

export const categoriasFinanceirasService = {
  async getAll(): Promise<CategoriaFinanceira[]> {
    const { data, error } = await supabase
      .from('categorias_financeiras')
      .select('*')
      .order('tipo', { ascending: true })
      .order('nome', { ascending: true });

    if (error) throw error;
    return (data || []).map(mapCategoria);
  },

  async create(input: Omit<CategoriaFinanceira, 'id' | 'createdAt'>): Promise<CategoriaFinanceira> {
    const { data, error } = await supabase
      .from('categorias_financeiras')
      .insert({
        ...input,
        nome: toUpper(input.nome),
        descricao: input.descricao ? toUpper(input.descricao) : null,
      })
      .select()
      .single();
    if (error) throw error;
    return mapCategoria(data);
  },

  async update(id: string, input: Partial<Omit<CategoriaFinanceira, 'id' | 'createdAt'>>): Promise<CategoriaFinanceira> {
    const payload = {
      ...input,
      ...(input.nome !== undefined ? { nome: toUpper(input.nome) } : {}),
      ...(input.descricao !== undefined ? { descricao: input.descricao ? toUpper(input.descricao) : null } : {}),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('categorias_financeiras')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return mapCategoria(data);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('categorias_financeiras').delete().eq('id', id);
    if (error) throw error;
  },
};
