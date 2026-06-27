import { supabase } from '../../../lib/supabase';

export type RelatorioModalidade = 'todos' | 'TECNICO' | 'EAD' | 'LIVRE' | 'ESPECIALIZACAO';
export type RelatorioFinanceiroStatus = 'todos' | 'PAGO' | 'PENDENTE' | 'VENCIDO' | 'CANCELADO';
export type RelatorioTipoLancamento = 'todos' | 'MATRICULA' | 'PARCELA' | 'REMATRICULA' | 'AVULSO';

export interface RelatorioTurmaOption {
  id: string;
  nome: string;
  codigo: string;
  modalidade: string;
}

export interface RelatorioFinanceiroMensalItem {
  id: string;
  alunoNome: string;
  alunoCpf: string;
  cursoNome: string;
  turmaNome: string;
  turmaCodigo: string;
  modalidade: string;
  tipoLancamento: string;
  parcelaNumero?: number | null;
  descricao: string;
  vencimento: string;
  pagamento?: string | null;
  valor: number;
  valorPago: number;
  status: string;
  diasAtraso: number;
  asaasStatus?: string | null;
  asaasInvoiceUrl?: string | null;
}

export interface RelatorioMatriculaAcademicaItem {
  id: string;
  alunoId: string;
  alunoNome: string;
  alunoCpf: string;
  alunoRg?: string | null;
  alunoTelefone?: string | null;
  alunoEmail?: string | null;
  dataNascimento?: string | null;
  sexo?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  pcd?: boolean | null;
  pcdTipo?: string | null;
  status: string;
  dataMatricula?: string | null;
  dataConclusao?: string | null;
  cursoNome: string;
  modalidade: string;
  cargaHoraria: number;
  turmaId: string;
  turmaNome: string;
  turmaCodigo: string;
  turmaStatus: string;
  dataInicio?: string | null;
  dataFim?: string | null;
  poloNome: string;
  certificadoStatus?: string | null;
  certificadoCodigo?: string | null;
  certificadoEmissao?: string | null;
}

const normalizeDate = (value?: string | null) => value ? String(value).split('T')[0] : null;

const isPago = (status?: string | null) => String(status || '').toUpperCase() === 'PAGO';
const isVencido = (status?: string | null, vencimento?: string | null) => {
  const normalized = String(status || '').toUpperCase();
  const today = new Date().toISOString().slice(0, 10);
  return normalized === 'VENCIDO' || (normalized === 'PENDENTE' && Boolean(vencimento) && String(vencimento) < today);
};

const daysOverdue = (status?: string | null, vencimento?: string | null) => {
  if (!isVencido(status, vencimento) || !vencimento) return 0;
  const due = new Date(`${normalizeDate(vencimento)}T12:00:00`);
  const today = new Date();
  return Math.max(0, Math.ceil((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
};

const getTurmaCurso = (row: any) => row?.turmas?.cursos || row?.turma?.curso || {};
const getTurma = (row: any) => row?.turmas || row?.turma || {};

export const relatoriosService = {
  async getTurmasOptions(modalidade: RelatorioModalidade = 'todos', poloId?: string): Promise<RelatorioTurmaOption[]> {
    let query = supabase
      .from('turmas')
      .select('id, nome, codigo, polo_id, cursos!inner(nome, modalidade)')
      .order('nome', { ascending: true });

    if (modalidade !== 'todos') query = query.eq('cursos.modalidade', modalidade);
    if (poloId) query = query.eq('polo_id', poloId);

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((turma: any) => ({
      id: turma.id,
      nome: turma.nome || turma.codigo || 'Turma',
      codigo: turma.codigo || '',
      modalidade: turma.cursos?.modalidade || 'OUTRO',
    }));
  },

  async getFinanceiroTurmaMensal(filters: {
    competencia: string;
    modalidade: RelatorioModalidade;
    turmaId?: string;
    poloId?: string;
    status?: RelatorioFinanceiroStatus;
    tipoLancamento?: RelatorioTipoLancamento;
  }): Promise<RelatorioFinanceiroMensalItem[]> {
    const [year, month] = filters.competencia.split('-').map(Number);
    const startDate = `${filters.competencia}-01`;
    const endDate = new Date(year, month, 0).toISOString().slice(0, 10);

    let query = supabase
      .from('contas_receber')
      .select(`
        id,
        descricao,
        valor,
        valor_pago,
        data_vencimento,
        data_pagamento,
        status,
        tipo_lancamento,
        parcela_numero,
        asaas_status,
        asaas_invoice_url,
        parceiros(nome, cpf_cnpj),
        turmas!inner(id, nome, codigo, polo_id, cursos!inner(nome, modalidade))
      `)
      .gte('data_vencimento', startDate)
      .lte('data_vencimento', endDate)
      .order('data_vencimento', { ascending: true });

    if (filters.modalidade !== 'todos') query = query.eq('turmas.cursos.modalidade', filters.modalidade);
    if (filters.turmaId && filters.turmaId !== 'todos') query = query.eq('turma_id', filters.turmaId);
    if (filters.poloId) query = query.eq('turmas.polo_id', filters.poloId);
    if (filters.status && filters.status !== 'todos') query = query.eq('status', filters.status);
    if (filters.tipoLancamento && filters.tipoLancamento !== 'todos') query = query.eq('tipo_lancamento', filters.tipoLancamento);

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((row: any) => {
      const turma = getTurma(row);
      const curso = getTurmaCurso(row);
      return {
        id: row.id,
        alunoNome: row.parceiros?.nome || 'Aluno não informado',
        alunoCpf: row.parceiros?.cpf_cnpj || '',
        cursoNome: curso.nome || 'Curso',
        turmaNome: turma.nome || turma.codigo || 'Turma',
        turmaCodigo: turma.codigo || '',
        modalidade: curso.modalidade || 'OUTRO',
        tipoLancamento: row.tipo_lancamento || 'MENSALIDADE',
        parcelaNumero: row.parcela_numero,
        descricao: row.descricao || '',
        vencimento: row.data_vencimento,
        pagamento: row.data_pagamento,
        valor: Number(row.valor || 0),
        valorPago: Number(row.valor_pago || (isPago(row.status) ? row.valor : 0) || 0),
        status: isVencido(row.status, row.data_vencimento) ? 'VENCIDO' : (row.status || 'PENDENTE'),
        diasAtraso: daysOverdue(row.status, row.data_vencimento),
        asaasStatus: row.asaas_status,
        asaasInvoiceUrl: row.asaas_invoice_url,
      };
    });
  },

  async getMatriculasAcademicas(filters: {
    modalidade: RelatorioModalidade;
    turmaId?: string;
    poloId?: string;
    status?: string;
  }): Promise<RelatorioMatriculaAcademicaItem[]> {
    let query = supabase
      .from('matriculas')
      .select(`
        *,
        parceiros!inner(*),
        turmas!inner(*, cursos!inner(*), polos(*))
      `)
      .order('data_matricula', { ascending: false });

    if (filters.modalidade !== 'todos') query = query.eq('turmas.cursos.modalidade', filters.modalidade);
    if (filters.turmaId && filters.turmaId !== 'todos') query = query.eq('turma_id', filters.turmaId);
    if (filters.poloId) query = query.eq('turmas.polo_id', filters.poloId);
    if (filters.status && filters.status !== 'todos') query = query.eq('status', filters.status);

    const { data, error } = await query;
    if (error) throw error;

    const matriculaIds = (data || []).map((row: any) => row.id);
    let certificadosByMatricula = new Map<string, any>();

    if (matriculaIds.length) {
      const { data: certificados, error: certError } = await supabase
        .from('certificados_academicos')
        .select('matricula_id, status, codigo_validacao, data_emissao')
        .in('matricula_id', matriculaIds);

      if (!certError) {
        certificadosByMatricula = new Map((certificados || []).map((cert: any) => [cert.matricula_id, cert]));
      }
    }

    return (data || []).map((row: any) => {
      const aluno = row.parceiros || {};
      const turma = row.turmas || {};
      const curso = turma.cursos || {};
      const polo = turma.polos || {};
      const certificado = certificadosByMatricula.get(row.id);

      return {
        id: row.id,
        alunoId: row.aluno_id,
        alunoNome: aluno.nome || 'Aluno',
        alunoCpf: aluno.cpf_cnpj || '',
        alunoRg: aluno.rg,
        alunoTelefone: aluno.telefone,
        alunoEmail: aluno.email,
        dataNascimento: normalizeDate(aluno.data_nascimento),
        sexo: aluno.sexo,
        endereco: [aluno.endereco, aluno.numero, aluno.bairro].filter(Boolean).join(', '),
        cidade: aluno.cidade,
        uf: aluno.uf,
        pcd: aluno.pcd,
        pcdTipo: aluno.pcd_tipo,
        status: row.status || 'ATIVO',
        dataMatricula: normalizeDate(row.data_matricula),
        dataConclusao: normalizeDate(row.data_conclusao || row.concluido_em || row.updated_at),
        cursoNome: curso.nome || 'Curso',
        modalidade: curso.modalidade || 'OUTRO',
        cargaHoraria: Number(curso.carga_horaria || 0),
        turmaId: turma.id,
        turmaNome: turma.nome || turma.codigo || 'Turma',
        turmaCodigo: turma.codigo || '',
        turmaStatus: turma.status || '',
        dataInicio: normalizeDate(turma.data_inicio),
        dataFim: normalizeDate(turma.data_fim || turma.data_previsao_termino),
        poloNome: polo.nome || polo.cidade || 'Matriz',
        certificadoStatus: certificado?.status || null,
        certificadoCodigo: certificado?.codigo_validacao || null,
        certificadoEmissao: normalizeDate(certificado?.data_emissao),
      };
    });
  },
};
