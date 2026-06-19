
import { supabase } from '../../../../lib/supabase';

// Helper de mapeamento: Banco (snake_case) -> Frontend (camelCase)
function mapToFrontend(db: any) {
  if (!db) return null;
  return {
    id: db.id,
    nomeFantasia: db.nome_fantasia,
    razaoSocial: db.razao_social,
    cnpj: db.cnpj,
    endereco: db.endereco,
    numero: db.numero,
    bairro: db.bairro,
    cidade: db.cidade,
    uf: db.uf,
    cep: db.cep,
    telefone: db.telefone,
    email: db.email,
    tipo: db.tipo,
    logoUrl: db.logo_url,
    ativo: db.ativo
  };
}

// Helper de mapeamento: Frontend (camelCase) -> Banco (snake_case)
function mapToDatabase(fe: any) {
  if (!fe) return null;
  return {
    nome_fantasia: fe.nomeFantasia,
    razao_social: fe.razaoSocial,
    cnpj: fe.cnpj,
    endereco: fe.endereco,
    numero: fe.numero,
    bairro: fe.bairro,
    cidade: fe.cidade,
    uf: fe.uf,
    cep: fe.cep,
    telefone: fe.telefone,
    email: fe.email,
    tipo: fe.tipo,
    logo_url: fe.logoUrl,
    ativo: fe.ativo !== undefined ? fe.ativo : true
  };
}

export const empresasService = {
  async getAll(): Promise<any[]> {
    const { data, error } = await supabase
      .from('empresas')
      .select('*')
      .order('nome_fantasia', { ascending: true });

    if (error) {
      console.error('Erro ao buscar empresas:', error);
      throw new Error(error.message);
    }

    return (data || []).map(mapToFrontend);
  },

  async create(data: any) {
    const dbData = mapToDatabase(data);
    const { data: created, error } = await supabase
      .from('empresas')
      .insert(dbData)
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar empresa:', error);
      throw new Error(error.message);
    }

    return mapToFrontend(created);
  },

  async update(id: string, data: any) {
    const dbData = mapToDatabase(data);
    const { data: updated, error } = await supabase
      .from('empresas')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Erro ao atualizar empresa:', error);
      throw new Error(error.message);
    }

    return mapToFrontend(updated);
  },

  async toggleStatus(id: string, status: boolean) {
    const { error } = await supabase
      .from('empresas')
      .update({ ativo: status })
      .eq('id', id);

    if (error) {
      console.error('Erro ao alternar status da empresa:', error);
      throw new Error(error.message);
    }

    return true;
  },

  async delete(id: string) {
    const { error } = await supabase
      .from('empresas')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Erro ao excluir empresa:', error);
      throw new Error(error.message);
    }

    return true;
  },

  /**
   * Obtém a primeira empresa cadastrada no banco de dados (que representa a Empresa Principal / Matriz)
   */
  async getCompanyPrincipal(): Promise<any> {
    const { data, error } = await supabase
      .from('empresas')
      .select('*')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar empresa principal:', error);
      throw new Error(error.message);
    }

    return mapToFrontend(data);
  },

  /**
   * Salva a configuração da Empresa Principal (Matriz).
   * Se já houver empresa criada, atualiza; caso contrário, insere uma nova.
   * Em seguida, garante a criação/atualização do Polo correspondente como Matriz.
   */
  async saveCompanyPrincipal(data: any): Promise<any> {
    const dbData = mapToDatabase(data);
    let companyId = data.id;

    if (!companyId) {
      const existing = await this.getCompanyPrincipal();
      if (existing) {
        companyId = existing.id;
      }
    }

    let resultCompany;
    if (companyId) {
      const { data: updated, error } = await supabase
        .from('empresas')
        .update(dbData)
        .eq('id', companyId)
        .select()
        .single();
      if (error) {
        console.error('Erro ao atualizar empresa principal:', error);
        throw new Error(error.message);
      }
      resultCompany = mapToFrontend(updated);
    } else {
      const { data: inserted, error } = await supabase
        .from('empresas')
        .insert(dbData)
        .select()
        .single();
      if (error) {
        console.error('Erro ao inserir empresa principal:', error);
        throw new Error(error.message);
      }
      resultCompany = mapToFrontend(inserted);
    }

    // Criar ou atualizar o Polo Matriz correspondente
    if (resultCompany && resultCompany.id) {
      const { data: existingPolo } = await supabase
        .from('polos')
        .select('id')
        .eq('company_id', resultCompany.id)
        .eq('is_matriz', true)
        .maybeSingle();

      const poloData = {
        company_id: resultCompany.id,
        nome: resultCompany.nomeFantasia,
        cnpj: resultCompany.cnpj,
        cidade: resultCompany.cidade || 'Aracaju',
        estado: resultCompany.uf || 'SE',
        endereco: resultCompany.endereco || '',
        numero: resultCompany.numero || '',
        bairro: resultCompany.bairro || '',
        cep: resultCompany.cep || '',
        telefone: resultCompany.telefone || '',
        email: resultCompany.email || '',
        logo_url: resultCompany.logoUrl || '',
        status: 'ativo',
        is_matriz: true
      };

      if (existingPolo) {
        const { error: updateError } = await supabase
          .from('polos')
          .update(poloData)
          .eq('id', existingPolo.id);
        if (updateError) console.error('Erro ao atualizar polo matriz:', updateError);
      } else {
        const { error: insertError } = await supabase
          .from('polos')
          .insert(poloData);
        if (insertError) console.error('Erro ao criar polo matriz:', insertError);
      }
    }

    return resultCompany;
  },

  /**
   * Faz o upload da logo para o bucket público 'documentos' na pasta 'logos'
   */
  async uploadLogo(file: File): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const filePath = `logos/logo_${Date.now()}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('documentos')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      console.error('Erro ao fazer upload da logo da empresa:', error);
      throw new Error(error.message);
    }

    const { data: urlData } = supabase.storage
      .from('documentos')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  }
};
