import { supabase } from '../../../../../lib/supabase';
import { getMaceioIsoDate } from '../technicalClassDates';

export interface AvailableStudent {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  telefone?: string | null;
  tipo_documento?: string | null;
  rg?: string | null;
  nome_mae?: string | null;
  responsavel_nome?: string | null;
  responsavel_cpf?: string | null;
  responsavel_parentesco?: string | null;
  responsavel_telefone?: string | null;
  responsavel_email?: string | null;
  responsavel_financeiro?: boolean | null;
  situacao_ensino_medio?: string | null;
  serie_ensino_medio_atual?: number | null;
  escola_ensino_medio?: string | null;
  ano_conclusao_ensino_medio?: number | string | null;
  ano_previsto_conclusao_ensino_medio?: number | null;
}

export interface TurmaFinanceiroMatriculaConfig {
  valorMatricula: number;
  valorRematricula: number;
  valorParcela: number;
  descontoPontualidade: number;
  jurosAtraso: number;
  multaAtraso: number;
  aplicarDescontoMatricula: boolean;
  aplicarMultaJurosMatricula: boolean;
  aplicarDescontoMensalidade: boolean;
  aplicarMultaJurosMensalidade: boolean;
  aplicarDescontoRematricula: boolean;
  aplicarMultaJurosRematricula: boolean;
  diaVencimento: number;
  qtdParcelas: number;
  origemFinanceira: 'LEGADO' | 'NORMAL';
  financeiroHerdado: boolean;
  gerarCobrancasFuturas: boolean;
  sincronizarAsaasFuturo: boolean;
}

export interface PrevisaoFinanceiraTurma {
  turma_id: string;
  referencia: string;
  gerar_cobrancas_futuras: boolean;
  quantidade_prevista: string;
}

export const isValidStudentCpf = (value?: string | null) => {
  const cpf = String(value || '').replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calcDigit = (slice: string, factor: number) => {
    const sum = slice.split('').reduce((total, digit) => total + Number(digit) * factor--, 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return calcDigit(cpf.slice(0, 9), 10) === Number(cpf[9])
    && calcDigit(cpf.slice(0, 10), 11) === Number(cpf[10]);
};

export const turmaAlunosService = {
  async getAvailableStudents(turmaId: string, searchTerm: string): Promise<AvailableStudent[]> {
    const normalizedSearch = searchTerm.trim().replace(/\s+/g, ' ');
    if (normalizedSearch.length < 2) return [];

    const { data, error } = await supabase.rpc('search_gestao_available_students', {
      p_turma_id: turmaId,
      p_search: normalizedSearch,
      p_limit: 30,
    });
    if (error) throw error;
    return (data || []) as AvailableStudent[];
  },

  async getFinanceiroMatriculaConfig(turmaId: string): Promise<TurmaFinanceiroMatriculaConfig> {
    const { data, error } = await supabase
      .from('turmas')
      .select('valor_matricula, valor_rematricula, valor_parcela, desconto_pontualidade, juros_atraso, multa_atraso, aplicar_desconto_matricula, aplicar_multa_juros_matricula, aplicar_desconto_mensalidade, aplicar_multa_juros_mensalidade, aplicar_desconto_rematricula, aplicar_multa_juros_rematricula, dia_vencimento_padrao, qtd_parcelas, origem_financeira, financeiro_herdado, gerar_cobrancas_futuras, sincronizar_asaas_futuro')
      .eq('id', turmaId)
      .single();

    if (error) throw error;

    return {
      valorMatricula: Number(data.valor_matricula || 0),
      valorRematricula: Number(data.valor_rematricula || 0),
      valorParcela: Number(data.valor_parcela || 0),
      descontoPontualidade: Number(data.desconto_pontualidade || 0),
      jurosAtraso: Number(data.juros_atraso || 0),
      multaAtraso: Number(data.multa_atraso || 0),
      aplicarDescontoMatricula: data.aplicar_desconto_matricula === true,
      aplicarMultaJurosMatricula: data.aplicar_multa_juros_matricula !== false,
      aplicarDescontoMensalidade: data.aplicar_desconto_mensalidade !== false,
      aplicarMultaJurosMensalidade: data.aplicar_multa_juros_mensalidade !== false,
      aplicarDescontoRematricula: data.aplicar_desconto_rematricula !== false,
      aplicarMultaJurosRematricula: data.aplicar_multa_juros_rematricula !== false,
      diaVencimento: Number(data.dia_vencimento_padrao || 10),
      qtdParcelas: Number(data.qtd_parcelas || 11),
      origemFinanceira: (data.origem_financeira === 'LEGADO' ? 'LEGADO' : 'NORMAL'),
      financeiroHerdado: data.financeiro_herdado ?? false,
      gerarCobrancasFuturas: data.gerar_cobrancas_futuras ?? false,
      sincronizarAsaasFuturo: data.sincronizar_asaas_futuro !== false,
    };
  },

  async preverGeracaoCobrancasFuturas(turmaId: string): Promise<PrevisaoFinanceiraTurma> {
    const { data, error } = await supabase.rpc('prever_geracao_cobrancas_futuras', {
      p_turma_id: turmaId,
      p_data_referencia: getMaceioIsoDate(),
    });

    if (error) throw error;
    return ((data || [])[0] || {}) as PrevisaoFinanceiraTurma;
  },
};
