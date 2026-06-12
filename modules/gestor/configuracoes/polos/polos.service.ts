import { supabase } from '../../../../lib/supabase';

export interface Polo {
  id?: string;
  nome: string;
  cnpj: string;
  cidade: string;
  estado: string;
  status: 'ativo' | 'inativo';
  created_at?: string;
  company_id?: string;
  is_matriz?: boolean;
}

export const polosService = {
  async getAll(): Promise<Polo[]> {
    const { data, error } = await supabase
      .from('polos')
      .select('*')
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar polos:', error);
      throw new Error(error.message);
    }

    return data || [];
  },

  async create(polo: Omit<Polo, 'id'>): Promise<Polo> {
    // Buscar a empresa principal
    const { data: company, error: compError } = await supabase
      .from('empresas')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (compError) {
      console.error('Erro ao buscar empresa principal para vincular ao polo:', compError);
    }

    const dbPolo = {
      nome: polo.nome,
      cnpj: polo.cnpj,
      cidade: polo.cidade,
      estado: polo.estado,
      status: polo.status,
      company_id: company?.id || null,
      is_matriz: false
    };

    const { data, error } = await supabase
      .from('polos')
      .insert(dbPolo)
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar polo:', error);
      throw new Error(error.message);
    }

    return data;
  },

  async update(id: string, polo: Partial<Polo>): Promise<Polo> {
    const { data, error } = await supabase
      .from('polos')
      .update(polo)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Erro ao atualizar polo:', error);
      throw new Error(error.message);
    }

    return data;
  },

  async delete(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('polos')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Erro ao excluir polo:', error);
      throw new Error(error.message);
    }

    return true;
  }
};
