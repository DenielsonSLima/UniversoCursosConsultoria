import { supabase } from '../../../../lib/supabase';

export interface Polo {
  id?: string;
  nome: string;
  nomeFantasia?: string;
  cnpj: string;
  cidade: string;
  estado: string;
  uf?: string;
  status: 'ativo' | 'inativo';
  ativo?: boolean;
  created_at?: string;
  company_id?: string;
  is_matriz?: boolean;
  logoUrl?: string;
  endereco?: string;
  numero?: string;
  bairro?: string;
  cep?: string;
  telefone?: string;
  email?: string;
  watermark_url?: string;
  watermark_opacity?: number;
  watermark_scale?: number;
  watermark_rotate?: boolean;
}

export const polosService = {
  async getAll(): Promise<Polo[]> {
    const { data, error } = await supabase
      .from('polos')
      .select('*, empresas(*)')
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar polos:', error);
      throw new Error(error.message);
    }

    return (data || []).map((p: any) => ({
      id: p.id,
      nome: p.nome,
      nomeFantasia: p.nome,
      cnpj: p.cnpj,
      cidade: p.cidade,
      estado: p.estado,
      uf: p.estado,
      status: p.status,
      ativo: p.status === 'ativo',
      created_at: p.created_at,
      company_id: p.company_id,
      is_matriz: p.is_matriz,
      logoUrl: p.logo_url || p.empresas?.logo_url || '',
      endereco: p.endereco || p.empresas?.endereco || '',
      numero: p.numero || p.empresas?.numero || '',
      bairro: p.bairro || p.empresas?.bairro || '',
      cep: p.cep || p.empresas?.cep || '',
      telefone: p.telefone || p.empresas?.telefone || '',
      email: p.email || p.empresas?.email || '',
      watermark_url: p.watermark_url,
      watermark_opacity: p.watermark_opacity,
      watermark_scale: p.watermark_scale,
      watermark_rotate: p.watermark_rotate !== false
    }));
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
      is_matriz: false,
      endereco: polo.endereco || null,
      numero: polo.numero || null,
      bairro: polo.bairro || null,
      cep: polo.cep || null,
      telefone: polo.telefone || null,
      email: polo.email || null,
      logo_url: polo.logoUrl || null
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
    const dbPolo: any = { ...polo };
    
    // Map camelCase fields to snake_case db columns if present
    if ('logoUrl' in dbPolo) {
      dbPolo.logo_url = dbPolo.logoUrl;
      delete dbPolo.logoUrl;
    }
    
    delete dbPolo.nomeFantasia;
    delete dbPolo.uf;
    delete dbPolo.ativo;

    const { data, error } = await supabase
      .from('polos')
      .update(dbPolo)
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
  },

  async getById(id: string): Promise<Polo> {
    const { data, error } = await supabase
      .from('polos')
      .select('*, empresas(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar polo por ID:', error);
      throw new Error(error.message);
    }

    if (!data) return null as any;

    const p: any = data;
    return {
      id: p.id,
      nome: p.nome,
      nomeFantasia: p.nome,
      cnpj: p.cnpj,
      cidade: p.cidade,
      estado: p.estado,
      uf: p.estado,
      status: p.status,
      ativo: p.status === 'ativo',
      created_at: p.created_at,
      company_id: p.company_id,
      is_matriz: p.is_matriz,
      logoUrl: p.logo_url || p.empresas?.logo_url || '',
      endereco: p.endereco || p.empresas?.endereco || '',
      numero: p.numero || p.empresas?.numero || '',
      bairro: p.bairro || p.empresas?.bairro || '',
      cep: p.cep || p.empresas?.cep || '',
      telefone: p.telefone || p.empresas?.telefone || '',
      email: p.email || p.empresas?.email || '',
      watermark_url: p.watermark_url,
      watermark_opacity: p.watermark_opacity,
      watermark_scale: p.watermark_scale,
      watermark_rotate: p.watermark_rotate !== false
    };
  }
};
