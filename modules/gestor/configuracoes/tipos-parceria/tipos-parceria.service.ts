import { supabase } from '../../../../lib/supabase';

export interface TipoParceria {
  id?: string;
  nome: string;
  descricao: string;
  status: 'ativo' | 'inativo';
  updated_at?: string;
}

export const tiposParceriaQueryKeys = {
  all: ['tipos-parceria'] as const,
  active: ['tipos-parceria', 'ativos'] as const,
};

export const tiposParceriaService = {
  async getAll(): Promise<TipoParceria[]> {
    const { data, error } = await supabase
      .from('tipos_parceria')
      .select('*')
      .order('nome', { ascending: true });

    if (error) throw new Error(error.message);
    return data || [];
  },

  async getActive(): Promise<TipoParceria[]> {
    const { data, error } = await supabase
      .from('tipos_parceria')
      .select('*')
      .eq('status', 'ativo')
      .order('nome', { ascending: true });

    if (error) throw new Error(error.message);
    return data || [];
  },

  async create(tipo: Omit<TipoParceria, 'id'>): Promise<TipoParceria> {
    const { data, error } = await supabase
      .from('tipos_parceria')
      .insert({ ...tipo, nome: tipo.nome.trim().toUpperCase() })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  async update(id: string, tipo: Partial<TipoParceria>): Promise<TipoParceria> {
    const payload = {
      ...tipo,
      ...(tipo.nome ? { nome: tipo.nome.trim().toUpperCase() } : {}),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('tipos_parceria')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('tipos_parceria')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  },
};
