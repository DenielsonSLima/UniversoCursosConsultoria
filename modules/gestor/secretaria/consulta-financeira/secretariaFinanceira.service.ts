import { supabase } from '../../../../lib/supabase';
import { formatMatricula } from '../../../../lib/academicUtils';

export interface SecretariaFinanceiraAluno {
  id: string;
  nome: string;
  cpf: string;
  email?: string;
  telefone?: string;
}

export interface SecretariaFinanceiraTurma {
  id: string;
  nome: string;
  codigo: string;
  cursoNome: string;
  modalidade: string;
  poloNome: string;
  poloCnpj: string;
  poloCidade: string;
  poloUf: string;
}

export interface SecretariaFinanceiraRecebivel {
  id: string;
  alunoId?: string;
  alunoNome: string;
  alunoCpf: string;
  alunoEmail?: string;
  matriculaId?: string;
  matricula: string;
  turmaId?: string;
  turmaNome: string;
  turmaCodigo: string;
  cursoNome: string;
  modalidade: string;
  poloNome: string;
  poloCnpj: string;
  poloCidade: string;
  poloUf: string;
  descricao: string;
  valor: number;
  valorPago?: number;
  dataVencimento: string;
  dataPagamento?: string;
  status: string;
  formaPagamento?: string;
  origemPagamento?: string;
  tipoLancamento?: string;
  parcelaNumero?: number;
  asaasStatus?: string;
  asaasPaymentId?: string;
  asaasInvoiceUrl?: string;
  asaasBankSlipUrl?: string;
  asaasInstallmentId?: string;
}

const normalizeSearchTerm = (term: string) =>
  term.trim().replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ');

const normalizeStatus = (status?: string) => (status || '').toUpperCase();

const mapRecebivel = (row: any): SecretariaFinanceiraRecebivel => {
  const matricula = row.matriculas;
  const turma = row.turmas;
  const polo = row.polos || turma?.polos;
  const aluno = row.parceiros;

  return {
    id: row.id,
    alunoId: row.cliente_id || undefined,
    alunoNome: aluno?.nome || 'Aluno não informado',
    alunoCpf: aluno?.cpf_cnpj || '',
    alunoEmail: aluno?.email || undefined,
    matriculaId: row.matricula_id || undefined,
    matricula: row.matricula_id
      ? formatMatricula(row.matricula_id, matricula?.data_matricula, row.polo_id)
      : 'Sem matrícula',
    turmaId: row.turma_id || undefined,
    turmaNome: turma?.nome || 'Sem turma vinculada',
    turmaCodigo: turma?.codigo || '',
    cursoNome: turma?.cursos?.nome || '',
    modalidade: turma?.cursos?.modalidade || '',
    poloNome: polo?.nome || '',
    poloCnpj: polo?.cnpj || '',
    poloCidade: polo?.cidade || '',
    poloUf: polo?.estado || polo?.uf || '',
    descricao: row.descricao || 'Cobrança',
    valor: Number(row.valor || 0),
    valorPago: row.valor_pago === null || row.valor_pago === undefined ? undefined : Number(row.valor_pago),
    dataVencimento: row.data_vencimento,
    dataPagamento: row.data_pagamento || undefined,
    status: normalizeStatus(row.status),
    formaPagamento: row.forma_pagamento || undefined,
    origemPagamento: row.origem_pagamento || undefined,
    tipoLancamento: row.tipo_lancamento || undefined,
    parcelaNumero: row.parcela_numero ?? undefined,
    asaasStatus: row.asaas_status || undefined,
    asaasPaymentId: row.asaas_payment_id || undefined,
    asaasInvoiceUrl: row.asaas_invoice_url || undefined,
    asaasBankSlipUrl: row.asaas_bank_slip_url || undefined,
    asaasInstallmentId: row.asaas_installment_id || undefined,
  };
};

const RECEBIVEIS_SELECT = `
  id,
  polo_id,
  descricao,
  valor,
  data_vencimento,
  data_pagamento,
  valor_pago,
  status,
  categoria,
  cliente_id,
  matricula_id,
  turma_id,
  forma_pagamento,
  origem_pagamento,
  tipo_lancamento,
  parcela_numero,
  asaas_payment_id,
  asaas_invoice_url,
  asaas_bank_slip_url,
  asaas_installment_id,
  asaas_status,
  parceiros(nome, cpf_cnpj, email, telefone),
  matriculas(id, data_matricula, status),
  turmas(id, nome, codigo, cursos(nome, modalidade), polos(nome, cnpj, cidade, estado)),
  polos(nome, cnpj, cidade, estado)
`;

export const secretariaFinanceiraService = {
  async searchAlunos(poloId: string, term: string): Promise<SecretariaFinanceiraAluno[]> {
    const safeTerm = normalizeSearchTerm(term);
    if (safeTerm.length < 2) return [];

    const { data, error } = await supabase
      .from('parceiros')
      .select('id, nome, cpf_cnpj, email, telefone')
      .eq('tipo', 'Aluno')
      .or(`polo_id.eq.${poloId},polo_id.is.null`)
      .or(`nome.ilike.%${safeTerm}%,cpf_cnpj.ilike.%${safeTerm}%`)
      .order('nome', { ascending: true })
      .limit(20);

    if (error) throw error;
    return (data || []).map((aluno: any) => ({
      id: aluno.id,
      nome: aluno.nome,
      cpf: aluno.cpf_cnpj || '',
      email: aluno.email || undefined,
      telefone: aluno.telefone || undefined,
    }));
  },

  async getTurmas(poloId: string): Promise<SecretariaFinanceiraTurma[]> {
    const { data, error } = await supabase
      .from('turmas')
      .select('id, nome, codigo, status, cursos(nome, modalidade), polos(nome, cnpj, cidade, estado)')
      .or(`polo_id.eq.${poloId},polo_id.is.null`)
      .order('nome', { ascending: true });

    if (error) throw error;
    return (data || []).map((turma: any) => ({
      id: turma.id,
      nome: turma.nome,
      codigo: turma.codigo || '',
      cursoNome: turma.cursos?.nome || '',
      modalidade: turma.cursos?.modalidade || '',
      poloNome: turma.polos?.nome || '',
      poloCnpj: turma.polos?.cnpj || '',
      poloCidade: turma.polos?.cidade || '',
      poloUf: turma.polos?.estado || turma.polos?.uf || '',
    }));
  },

  async getRecebiveisByAluno(alunoId: string, poloId: string): Promise<SecretariaFinanceiraRecebivel[]> {
    const { data, error } = await supabase
      .from('contas_receber')
      .select(RECEBIVEIS_SELECT)
      .eq('cliente_id', alunoId)
      .or(`polo_id.eq.${poloId},polo_id.is.null`)
      .order('data_vencimento', { ascending: true });

    if (error) throw error;
    return (data || []).map(mapRecebivel);
  },

  async getRecebiveisByTurma(turmaId: string): Promise<SecretariaFinanceiraRecebivel[]> {
    const { data, error } = await supabase
      .from('contas_receber')
      .select(RECEBIVEIS_SELECT)
      .eq('turma_id', turmaId)
      .order('data_vencimento', { ascending: true });

    if (error) throw error;
    return (data || []).map(mapRecebivel);
  },

  async searchRecebiveis(poloId: string, term: string): Promise<SecretariaFinanceiraRecebivel[]> {
    const safeTerm = normalizeSearchTerm(term);
    const { data, error } = await supabase
      .from('contas_receber')
      .select(RECEBIVEIS_SELECT)
      .or(`polo_id.eq.${poloId},polo_id.is.null`)
      .order('data_vencimento', { ascending: true })
      .limit(250);

    if (error) throw error;
    const rows = (data || []).map(mapRecebivel);
    if (safeTerm.length < 2) return rows.slice(0, 60);
    const normalized = safeTerm.toLowerCase();
    return rows.filter((item) =>
      [
        item.alunoNome,
        item.alunoCpf,
        item.descricao,
        item.turmaNome,
        item.turmaCodigo,
        item.matricula,
        item.asaasPaymentId,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized))
    );
  },
};
