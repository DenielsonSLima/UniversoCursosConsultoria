// File: modules/gestor/parceiros/parceiros.service.ts

import { supabase } from '../../../lib/supabase';
import { isValidCpf, isValidEmail, normalizeEmail } from '../../shared/utils/identityValidation';
import { portalActivationService } from './portal-activation.service';

const MATRIZ_POLO_ID = '44444444-4444-4444-4444-444444444444';
const ESTANCIA_LEGACY_POLO_ID = '55555555-5555-5555-5555-555555555555';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const uniqueTruthy = <T,>(values: Array<T | null | undefined>) =>
  Array.from(new Set(values.filter(Boolean) as T[]));

const resolvePoloId = (data: any): string | null => {
  const directPoloId = data?.poloId || data?.polo_id;
  if (directPoloId && UUID_RE.test(String(directPoloId))) return String(directPoloId).toLowerCase();
  if (data?.polo === 'matriz') return MATRIZ_POLO_ID;
  if (data?.polo === 'estancia') return ESTANCIA_LEGACY_POLO_ID;
  return null;
};

const formatPoloNome = (polo: any, fallbackPoloId?: string | null) => {
  if (polo?.nome) {
    const cidadeUf = [polo.cidade, polo.estado || polo.uf].filter(Boolean).join('/');
    return cidadeUf ? `${polo.nome} - ${cidadeUf}` : polo.nome;
  }
  if (fallbackPoloId === MATRIZ_POLO_ID) return 'Matriz';
  if (fallbackPoloId === ESTANCIA_LEGACY_POLO_ID) return 'Polo Estância';
  return 'Geral (Todos os Polos)';
};

const mapAlunoLookup = (row: any) => ({
  id: row.id,
  nome: row.nome,
  cpf: row.cpf_masked || null,
  email: null,
  status: row.status,
  poloId: row.polo_id,
  poloIds: row.polo_ids || [],
  tipo: 'Aluno',
  existingAluno: true,
  jaVinculadoPolo: Boolean(row.ja_vinculado_polo),
});

function validateAlunoProfessorIdentity(data: any) {
  const tipo = data?.tipo;
  if (tipo !== 'Aluno' && tipo !== 'Professor') return;

  const hasCpf = Object.prototype.hasOwnProperty.call(data, 'cpf') || Object.prototype.hasOwnProperty.call(data, 'cpf_cnpj');
  const hasEmail = Object.prototype.hasOwnProperty.call(data, 'email');

  if (hasCpf) {
    const cpf = data?.cpf || data?.cpf_cnpj;
    if (!isValidCpf(cpf || '')) {
      throw new Error(`CPF inválido para cadastro de ${tipo.toLowerCase()}.`);
    }
  }

  if (hasEmail) {
    if (!isValidEmail(data?.email || '')) {
      throw new Error(`E-mail inválido para cadastro de ${tipo.toLowerCase()}. Ele será usado como login.`);
    }
    data.email = normalizeEmail(data.email);
  }
}

// Helper to convert YYYY-MM-DD (DB) to DD/MM/AAAA (Frontend)
function dateDbToBr(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const clean = dateStr.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

// Helper to convert DD/MM/AAAA (Frontend) to YYYY-MM-DD (DB)
function dateBrToDb(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return null;
}

// Helper to map DB snake_case to Frontend camelCase
function toCamel(s: any) {
  if (!s) return null;
  const poloNome = formatPoloNome(s.polos, s.polo_id);
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
    polo: s.polo_id === MATRIZ_POLO_ID
      ? 'matriz' 
      : (s.polo_id === ESTANCIA_LEGACY_POLO_ID ? 'estancia' : 'geral'),
    poloNome,
    status: s.status,
    observacao: s.observacao,
    foto: s.foto_url,
    dataNascimento: dateDbToBr(s.data_nascimento),
    sexo: s.sexo,
    rg: s.rg,
    tipoDocumento: s.tipo_documento || 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',
    orgaoEmissor: s.orgao_emissor,
    rgUfEmissao: s.rg_uf_emissao,
    rgDataEmissao: dateDbToBr(s.rg_data_emissao),
    nacionalidade: s.nacionalidade,
    naturalidade: s.naturalidade,
    tituloEleitor: s.titulo_eleitor,
    reservista: s.reservista,
    nomeMae: s.nome_mae,
    nomePai: s.nome_pai,
    nomeSocial: s.nome_social,
    estadoCivil: s.estado_civil,
    pcd: s.pcd,
    pcdTipo: s.pcd_tipo,
    escolaridadeAnterior: s.escolaridade_anterior,
    instituicaoOrigem: s.instituicao_origem,
    anoConclusaoEnsinoMedio: s.ano_conclusao_ensino_medio,
    responsavelNome: s.responsavel_nome,
    responsavelCpf: s.responsavel_cpf,
    responsavelParentesco: s.responsavel_parentesco,
    responsavelTelefone: s.responsavel_telefone,
    responsavelEmail: s.responsavel_email,
    responsavelFinanceiro: s.responsavel_financeiro,
    responsavelCargo: s.responsavel_cargo,
    especialidade: s.especialidade,
    titulacao: s.titulacao,
    areaFormacao: s.area_formacao,
    registroProfissional: s.registro_profissional,
    numeroRegistro: s.numero_registro,
    instituicaoFormacao: s.instituicao_formacao,
    tipoVinculo: s.tipo_vinculo,
    chavePix: s.chave_pix,
    banco: s.banco,
    agencia: s.agencia,
    conta: s.conta,
    tipoConta: s.tipo_conta,
    tipoServico: s.tipo_servico,
    tipoPj: s.tipo_pj,
    tipoConvenio: s.tipo_convenio,
    aceitouTermosUso: s.aceitou_termos_uso,
    aceitouTermosUsoEm: s.aceitou_termos_uso_em,
    termosUsoVersao: s.termos_uso_versao,
    trocaSenhaObrigatoria: s.troca_senha_obrigatoria,
    poloIds: s.polo_ids || [],
    modalidadesAluno: s.modalidadesAluno || [],
    cursosAlunoIds: s.cursosAlunoIds || [],
    turmasAlunoIds: s.turmasAlunoIds || [],
    createdAt: s.created_at,
    updatedAt: s.updated_at
  };
}

// Helper to map Frontend camelCase to DB snake_case
function toSnake(c: any) {
  if (!c) return null;
  const poloId = resolvePoloId(c);
  const poloIds = uniqueTruthy<string>([
    ...((Array.isArray(c.poloIds) ? c.poloIds : c.polo_ids) || []),
    poloId,
  ]);
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
    polo_id: poloId,
    status: c.status || 'ATIVO',
    observacao: c.observacao || null,
    foto_url: c.foto || null,
    data_nascimento: dateBrToDb(c.dataNascimento),
    sexo: c.sexo || null,
    rg: c.rg || null,
    tipo_documento: c.tipoDocumento || 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',
    orgao_emissor: c.orgaoEmissor || null,
    rg_uf_emissao: c.rgUfEmissao || null,
    rg_data_emissao: dateBrToDb(c.rgDataEmissao),
    nacionalidade: c.nacionalidade || 'Brasileira',
    naturalidade: c.naturalidade || null,
    titulo_eleitor: c.tituloEleitor || null,
    reservista: c.reservista || null,
    nome_mae: c.nomeMae || null,
    nome_pai: c.nomePai || null,
    nome_social: c.nomeSocial || null,
    estado_civil: c.estadoCivil || null,
    pcd: c.pcd || false,
    pcd_tipo: c.pcdTipo || null,
    escolaridade_anterior: c.escolaridadeAnterior || null,
    instituicao_origem: c.instituicaoOrigem || null,
    ano_conclusao_ensino_medio: c.anoConclusaoEnsinoMedio || null,
    responsavel_nome: c.responsavelNome || null,
    responsavel_cpf: c.responsavelCpf || null,
    responsavel_parentesco: c.responsavelParentesco || null,
    responsavel_telefone: c.responsavelTelefone || null,
    responsavel_email: c.responsavelEmail || null,
    responsavel_financeiro: c.responsavelFinanceiro || false,
    responsavel_cargo: c.responsavelCargo || null,
    especialidade: c.especialidade || null,
    titulacao: c.titulacao || null,
    area_formacao: c.areaFormacao || null,
    registro_profissional: c.registroProfissional || null,
    numero_registro: c.numeroRegistro || null,
    instituicao_formacao: c.instituicaoFormacao || null,
    tipo_vinculo: c.tipoVinculo || null,
    chave_pix: c.chavePix || null,
    banco: c.banco || null,
    agencia: c.agencia || null,
    conta: c.conta || null,
    tipo_conta: c.tipoConta || null,
    tipo_servico: c.tipoServico || null,
    tipo_pj: c.tipoPj || null,
    tipo_convenio: c.tipoConvenio || null,
    aceitou_termos_uso: c.aceitouTermosUso ?? c.aceitou_termos_uso ?? false,
    aceitou_termos_uso_em: c.aceitouTermosUsoEm || c.aceitou_termos_uso_em || null,
    termos_uso_versao: c.termosUsoVersao || c.termos_uso_versao || null,
    troca_senha_obrigatoria: c.trocaSenhaObrigatoria ?? c.troca_senha_obrigatoria ?? false,
    polo_ids: poloIds,
  };
}

export const parceirosService = {
  async getAll(tipo?: string, filters?: { poloId?: string; includeGlobal?: boolean }) {
    let query = supabase.from('parceiros').select('*, polos(nome,cidade,estado)');
    let filterTipo: string | null = null;
    
    if (tipo && tipo !== 'todos') {
      filterTipo = tipo;
      if (tipo === 'professores') filterTipo = 'Professor';
      if (tipo === 'alunos') filterTipo = 'Aluno';
      if (tipo === 'pj') filterTipo = 'PJ';
      if (tipo === 'pf') filterTipo = 'PF';
      query = query.eq('tipo', filterTipo);
    }

    if (filters?.poloId && filters.poloId !== 'todos') {
      const scopedFilter = `polo_id.eq.${filters.poloId},polo_ids.cs.{${filters.poloId}}`;
      if (filters.includeGlobal && filterTipo !== 'Aluno') {
        query = filterTipo
          ? query.or(`${scopedFilter},polo_id.is.null`)
          : query.or(`${scopedFilter},and(polo_id.is.null,tipo.neq.Aluno)`);
      } else {
        query = query.or(scopedFilter);
      }
    }
    
    const { data, error } = await query.order('nome', { ascending: true });
    
    if (error) {
      console.error('Erro ao buscar parceiros:', error);
      throw error;
    }
    
    const partners = (data || []).map(toCamel);
    const alunoIds = partners.filter((partner) => partner?.tipo === 'Aluno').map((partner) => partner.id).filter(Boolean);

    if (alunoIds.length === 0) {
      return partners;
    }

    const { data: matriculas, error: matriculasError } = await supabase
      .from('matriculas')
      .select('aluno_id, turma_id, status, turmas(id, curso_id, cursos(id, nome, modalidade))')
      .in('aluno_id', alunoIds);

    if (matriculasError) {
      console.error('Erro ao buscar modalidades dos alunos:', matriculasError);
      throw matriculasError;
    }

    const alunoCursos = new Map<string, { modalidades: Set<string>; cursos: Set<string>; turmas: Set<string> }>();

    (matriculas || []).forEach((matricula: any) => {
      const status = String(matricula.status || '').toUpperCase();
      if (['CANCELADO', 'CANCELADA', 'DESISTENTE'].includes(status)) return;

      const turma = Array.isArray(matricula.turmas) ? matricula.turmas[0] : matricula.turmas;
      const curso = turma && (Array.isArray(turma.cursos) ? turma.cursos[0] : turma.cursos);
      if (!matricula.aluno_id || !curso?.modalidade) return;

      const current = alunoCursos.get(matricula.aluno_id) || {
        modalidades: new Set<string>(),
        cursos: new Set<string>(),
        turmas: new Set<string>(),
      };

      current.modalidades.add(String(curso.modalidade).toUpperCase());
      if (curso.id) current.cursos.add(curso.id);
      if (matricula.turma_id) current.turmas.add(matricula.turma_id);
      alunoCursos.set(matricula.aluno_id, current);
    });

    return partners.map((partner) => {
      const alunoInfo = alunoCursos.get(partner.id);
      if (!alunoInfo) return partner;

      return {
        ...partner,
        modalidadesAluno: Array.from(alunoInfo.modalidades),
        cursosAlunoIds: Array.from(alunoInfo.cursos),
        turmasAlunoIds: Array.from(alunoInfo.turmas),
      };
    });
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
    validateAlunoProfessorIdentity(data);
    if (data?.tipo === 'Aluno') {
      const existingAluno = await this.findAlunoParaVinculo(data.cpf || data.cpf_cnpj || data.email);
      if (existingAluno) return existingAluno;
    }

    const dbData = toSnake(data);
    const { data: inserted, error } = await supabase
      .from('parceiros')
      .insert(dbData)
      .select()
      .single();
      
    if (error) {
      if (data?.tipo === 'Aluno') {
        const existingAluno = await this.findAlunoParaVinculo(data.cpf || data.cpf_cnpj || data.email);
        if (existingAluno) return existingAluno;
      }
      console.error('Erro ao criar parceiro:', error);
      throw error;
    }
    
    return toCamel(inserted);
  },

  async update(id: string, data: any) {
    validateAlunoProfessorIdentity(data);
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

  async uploadProfilePhoto(alunoId: string, currentProfile: any, file: File) {
    if (!file.type.startsWith('image/')) {
      throw new Error('Envie uma imagem em JPG, PNG ou WEBP.');
    }

    const filePath = `${alunoId}/perfil/foto_${Date.now()}.jpg`;
    const { data, error: uploadError } = await supabase.storage
      .from('documentos')
      .upload(filePath, file, {
        cacheControl: '3600',
        contentType: file.type || 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('Erro no upload da foto do aluno:', uploadError);
      throw uploadError;
    }

    const { data: urlData } = supabase.storage
      .from('documentos')
      .getPublicUrl(data.path);

    const publicUrl = urlData.publicUrl;
    const { email, cpf, cnpj, cpf_cnpj, nome, nomeCompleto, ...editableProfile } = currentProfile || {};
    await this.update(alunoId, { ...editableProfile, foto: publicUrl });

    return publicUrl;
  },

  async delete(id: string) {
    return portalActivationService.deletePartner(id);
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
        status: 'ATIVO'
      })
      .select()
      .single();
      
    if (error) {
      console.error('Erro ao matricular aluno:', error);
      throw error;
    }
    
    return data;
  },

  async updateMatriculaStatus(matriculaId: string, status: string) {
    const { data, error } = await supabase
      .from('matriculas')
      .update({ status: status.toUpperCase() })
      .eq('id', matriculaId)
      .select()
      .single();
      
    if (error) {
      console.error('Erro ao atualizar status da matricula:', error);
      throw error;
    }
    
    return data;
  },

  async getTurmasDisponiveis(poloId?: string) {
    let query = supabase
      .from('turmas')
      .select('*, cursos(*), polos(nome,cidade,estado)')
      .eq('status', 'EM_ANDAMENTO');

    if (poloId && poloId !== 'todos') {
      query = query.eq('polo_id', poloId);
    }

    const { data, error } = await query.order('nome', { ascending: true });
      
    if (error) {
      console.error('Erro ao buscar turmas disponíveis:', error);
      throw error;
    }
    
    return (data || []).map(t => ({
      id: t.id,
      codigo: t.codigo,
      nome: t.nome,
      cursoNome: t.cursos?.nome,
      modalidade: t.cursos?.modalidade,
      poloId: t.polo_id,
      poloNome: formatPoloNome(t.polos, t.polo_id),
      turno: t.turno,
      vagasTotais: t.vagas_totais
    }));
  },

  async getPolos() {
    const { data, error } = await supabase
      .from('polos')
      .select('*')
      .in('status', ['ativo', 'ATIVO'])
      .order('nome', { ascending: true });
    if (error) {
      console.error('Erro ao buscar polos:', error);
      throw error;
    }
    return data || [];
  },

  async findAlunoParaVinculo(identifier?: string | null) {
    const value = String(identifier || '').trim();
    if (!value) return null;

    const { data, error } = await supabase.rpc('buscar_aluno_global_para_vinculo', {
      p_identifier: value,
    });

    if (error) {
      console.error('Erro ao localizar aluno para vínculo:', error);
      return null;
    }

    const first = Array.isArray(data) ? data[0] : null;
    return first ? mapAlunoLookup(first) : null;
  },

  async getKpis() {
    const { data, error } = await supabase.rpc('get_parceiros_kpis');
    if (error) {
      console.error('Erro ao buscar KPIs dos parceiros:', error);
      throw error;
    }
    const kpi = data && data[0] ? data[0] : { 
      total_parceiros: 0, 
      total_parceiros_ativos: 0,
      total_alunos: 0, 
      total_alunos_ativos: 0, 
      total_alunos_inativos: 0, 
      total_professores: 0, 
      total_professores_ativos: 0, 
      total_professores_inativos: 0 
    };
    return {
      totalParceiros: Number(kpi.total_parceiros),
      totalParceirosAtivos: Number(kpi.total_parceiros_ativos),
      totalAlunosVinculados: Number(kpi.total_alunos),
      totalAlunosAtivos: Number(kpi.total_alunos_ativos),
      totalAlunosInativos: Number(kpi.total_alunos_inativos),
      totalProfessoresVinculados: Number(kpi.total_professores),
      totalProfessoresAtivos: Number(kpi.total_professores_ativos),
      totalProfessoresInativos: Number(kpi.total_professores_inativos)
    };
  }
};
