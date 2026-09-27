import { supabase } from '../../../../lib/supabase';
import type { CategoriaFinanceiraTipo } from './despesas.queryKeys';
import { mapCategoriaFinanceira, normalizeCategoriaFinanceiraInput } from './despesas.mapper';
import type { CategoriaFinanceira, CreateCategoriaFinanceiraInput } from './despesas.types';

export const getCategoriasFinanceiras = async (
  tipo?: CategoriaFinanceiraTipo,
): Promise<CategoriaFinanceira[]> => {
  let query = supabase.from('categorias_financeiras').select('*')
    .eq('status', 'ativo').order('nome', { ascending: true });
  if (tipo) query = query.eq('tipo', tipo);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapCategoriaFinanceira);
};

export const createCategoriaFinanceira = async (
  input: CreateCategoriaFinanceiraInput,
): Promise<CategoriaFinanceira> => {
  const { data, error } = await supabase.from('categorias_financeiras').insert({
    nome: normalizeCategoriaFinanceiraInput(input.nome),
    tipo: input.tipo,
    descricao: input.descricao ? normalizeCategoriaFinanceiraInput(input.descricao) : null,
    status: input.status || 'ativo',
  }).select().single();
  if (error) throw error;
  return mapCategoriaFinanceira(data);
};

export const updateCategoriaFinanceira = async (
  id: string,
  input: Partial<CreateCategoriaFinanceiraInput>,
): Promise<CategoriaFinanceira> => {
  const payload = {
    ...input,
    ...(input.nome !== undefined
      ? { nome: normalizeCategoriaFinanceiraInput(input.nome) }
      : {}),
    ...(input.descricao !== undefined
      ? { descricao: input.descricao ? normalizeCategoriaFinanceiraInput(input.descricao) : null }
      : {}),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('categorias_financeiras')
    .update(payload).eq('id', id).select().single();
  if (error) throw error;
  return mapCategoriaFinanceira(data);
};

export const deleteCategoriaFinanceira = async (id: string): Promise<void> => {
  const { error } = await supabase.from('categorias_financeiras').delete().eq('id', id);
  if (error) throw error;
};

export const getAllCategoriasFinanceiras = async (): Promise<CategoriaFinanceira[]> => {
  const { data, error } = await supabase.from('categorias_financeiras').select('*')
    .order('tipo', { ascending: true }).order('nome', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapCategoriaFinanceira);
};
