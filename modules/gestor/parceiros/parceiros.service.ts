// File: modules/gestor/parceiros/parceiros.service.ts

import { supabase } from '../../../lib/supabase';

// Helper to map DB snake_case to Frontend camelCase
function toCamel(s: any) {
  if (!s) return null;
  return {
    id: s.id,
    tipo: s.tipo,
    nome: s.nome,
    nomeCompleto: s.nome,
    cpf: s.cpf_cnpj,
    cnpj: s.cpf_cnpj,
    email: s.email,
    telefone: s.telefone,
    contato1: s.telefone,
    cep: s.cep,
    endereco: s.endereco,
    numero: s.numero,
    complemento: s.complemento,
    bairro: s.bairro,
    cidade: s.cidade,
    uf: s.uf,
    poloId: s.polo_id,
    polo: s.polo_id === '44444444-4444-4444-4444-444444444444' ? 'matriz' : 'estancia',
    poloNome: s.polos?.nome || (s.polo_id === '44444444-4444-4444-4444-444444444444' ? 'Matriz - Aracaju' : 'Polo Estância'),
    status: s.status,
    observacao: s.observacao,
    foto: s.foto_url,
    dataNascimento: s.data_nascimento,
    sexo: s.sexo,
    rg: s.rg,
    orgaoEmissor: s.orgao_emissor,
    nacionalidade: s.nacionalidade,
    naturalidade: s.naturalidade,
    tituloEleitor: s.titulo_eleitor,
    reservista: s.reservista,
    nomeMae: s.nome_mae,
    nomePai: s.nome_pai,
    nomeSocial: s.nome_social,
    responsavelNome: s.responsavel_nome,
    responsavelCpf: s.responsavel_cpf,
    responsavelParentesco: s.responsavel_parentesco,
    especialidade: s.especialidade,
    tipoPj: s.tipo_pj,
    createdAt: s.created_at,
    updatedAt: s.updated_at
  };
}

// Helper to map Frontend camelCase to DB snake_case
function toSnake(c: any) {
  if (!c) return null;
  return {
    tipo: c.tipo,
    nome: c.nomeCompleto || c.nome,
    cpf_cnpj: c.cpf || c.cnpj || c.cpf_cnpj || null,
    email: c.email || null,
    telefone: c.contato1 || c.telefone || null,
    cep: c.cep || null,
    endereco: c.endereco || null,
    numero: c.numero || null,
    complemento: c.complemento || null,
    bairro: c.bairro || null,
    cidade: c.cidade || null,
    uf: c.uf || null,
    polo_id: c.polo === 'matriz' || c.poloId === '44444444-4444-4444-4444-444444444444' 
      ? '44444444-4444-4444-4444-444444444444' 
      : (c.polo === 'estancia' || c.poloId === '55555555-5555-5555-5555-555555555555' 
        ? '55555555-5555-5555-5555-555555555555' 
        : null),
    status: c.status || 'ativo',
    observacao: c.observacao || null,
    foto_url: c.foto || null,
    data_nascimento: c.dataNascimento || null,
    sexo: c.sexo || null,
    rg: c.rg || null,
    orgao_emissor: c.orgaoEmissor || null,
    nacionalidade: c.nacionalidade || 'Brasileira',
    naturalidade: c.naturalidade || null,
    titulo_eleitor: c.tituloEleitor || null,
    reservista: c.reservista || null,
    nome_mae: c.nomeMae || null,
    nome_pai: c.nomePai || null,
    nome_social: c.nomeSocial || null,
    responsavel_nome: c.responsavelNome || null,
    responsavel_cpf: c.responsavelCpf || null,
    responsavel_parentesco: c.responsavelParentesco || null,
    especialidade: c.especialidade || null,
    tipo_pj: c.tipoPj || null
  };
}

export const parceirosService = {
  async getAll(tipo?: string) {
    let query = supabase.from('parceiros').select('*, polos(nome)');
    
    if (tipo && tipo !== 'todos') {
      let filterTipo = tipo;
      if (tipo === 'professores') filterTipo = 'Professor';
      if (tipo === 'alunos') filterTipo = 'Aluno';
      if (tipo === 'pj') filterTipo = 'PJ';
      if (tipo === 'pf') filterTipo = 'PF';
      query = query.eq('tipo', filterTipo);
    }
    
    const { data, error } = await query.order('nome', { ascending: true });
    
    if (error) {
      console.error('Erro ao buscar parceiros:', error);
      throw error;
    }
    
    return (data || []).map(toCamel);
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from('parceiros')
      .select('*, polos(nome)')
      .eq('id', id)
      .single();
      
    if (error) {
      console.error('Erro ao buscar parceiro por id:', error);
      throw error;
    }
    
    return toCamel(data);
  },

  async create(data: any) {
    const dbData = toSnake(data);
    const { data: inserted, error } = await supabase
      .from('parceiros')
      .insert(dbData)
      .select()
      .single();
      
    if (error) {
      console.error('Erro ao criar parceiro:', error);
      throw error;
    }
    
    return toCamel(inserted);
  },

  async update(id: string, data: any) {
    const dbData = toSnake(data);
    const { data: updated, error } = await supabase
      .from('parceiros')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
      
    if (error) {
      console.error('Erro ao atualizar parceiro:', error);
      throw error;
    }
    
    return toCamel(updated);
  },

  async delete(id: string) {
    const { error } = await supabase
      .from('parceiros')
      .delete()
      .eq('id', id);
      
    if (error) {
      console.error('Erro ao deletar parceiro:', error);
      throw error;
    }
    
    return true;
  },

  // Documentos Métodos
  async getDocumentos(alunoId: string) {
    const { data, error } = await supabase
      .from('documentos_aluno')
      .select('*')
      .eq('aluno_id', alunoId)
      .order('nome_documento', { ascending: true });
      
    if (error) {
      console.error('Erro ao buscar documentos do aluno:', error);
      throw error;
    }
    
    return (data || []).map(d => ({
      id: d.id,
      alunoId: d.aluno_id,
      nome: d.nome_documento,
      status: d.status,
      arquivoUrl: d.arquivo_url,
      observacao: d.observacao,
      updatedAt: d.updated_at
    }));
  },

  async updateDocumentoStatus(docId: string, status: string, observacao?: string) {
    const { data, error } = await supabase
      .from('documentos_aluno')
      .update({ status, observacao, updated_at: new Date().toISOString() })
      .eq('id', docId)
      .select()
      .single();
      
    if (error) {
      console.error('Erro ao atualizar status do documento:', error);
      throw error;
    }
    
    return data;
  },

  async uploadDocumento(alunoId: string, docName: string, file: File) {
    const cleanDocName = docName.replace(/[^a-zA-Z0-9]/g, '_');
    const fileExt = file.name.split('.').pop();
    const filePath = `${alunoId}/${cleanDocName}_${Date.now()}.${fileExt}`;
    
    const { data, error: uploadError } = await supabase.storage
      .from('documentos')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });
      
    if (uploadError) {
      console.error('Erro no upload do arquivo:', uploadError);
      throw uploadError;
    }
    
    const { data: urlData } = supabase.storage
      .from('documentos')
      .getPublicUrl(data.path);
      
    const publicUrl = urlData.publicUrl;
    
    // Atualiza o registro no banco
    const { error: dbError } = await supabase
      .from('documentos_aluno')
      .update({
        arquivo_url: publicUrl,
        status: 'entregue',
        updated_at: new Date().toISOString()
      })
      .eq('aluno_id', alunoId)
      .eq('nome_documento', docName);
      
    if (dbError) {
      console.error('Erro ao atualizar arquivo no banco:', dbError);
      throw dbError;
    }
    
    return publicUrl;
  },

  // Matrículas & Turmas
  async getMatriculas(alunoId: string) {
    const { data, error } = await supabase
      .from('matriculas')
      .select('*, turmas(*, cursos(*))')
      .eq('aluno_id', alunoId);
      
    if (error) {
      console.error('Erro ao buscar matriculas do aluno:', error);
      throw error;
    }
    
    return data || [];
  },

  async matricularAluno(alunoId: string, turmaId: string) {
    const { data, error } = await supabase
      .from('matriculas')
      .insert({
        aluno_id: alunoId,
        turma_id: turmaId,
        status: 'ativo'
      })
      .select()
      .single();
      
    if (error) {
      console.error('Erro ao matricular aluno:', error);
      throw error;
    }
    
    return data;
  },

  async getTurmasDisponiveis() {
    const { data, error } = await supabase
      .from('turmas')
      .select('*, cursos(*)');
      
    if (error) {
      console.error('Erro ao buscar turmas disponíveis:', error);
      throw error;
    }
    
    return (data || []).map(t => ({
      id: t.id,
      codigo: t.codigo,
      nome: t.nome,
      cursoNome: t.cursos?.nome,
      modalidade: t.status,
      turno: t.turno,
      vagasTotais: t.vagas_totais
    }));
  },

  async getKpis() {
    const { data, error } = await supabase.rpc('get_parceiros_kpis');
    if (error) {
      console.error('Erro ao buscar KPIs dos parceiros:', error);
      throw error;
    }
    const kpi = data && data[0] ? data[0] : { total_parceiros: 0, total_alunos: 0, total_professores: 0 };
    return {
      totalParceiros: Number(kpi.total_parceiros),
      totalAlunosVinculados: Number(kpi.total_alunos),
      totalProfessoresVinculados: Number(kpi.total_professores)
    };
  }
};

