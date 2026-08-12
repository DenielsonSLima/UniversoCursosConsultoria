import { supabase } from '../../../lib/supabase';
import { formatMatricula } from '../../../lib/academicUtils';

export type RelatorioModalidade = 'todos' | 'TECNICO' | 'EAD' | 'LIVRE' | 'ESPECIALIZACAO' | 'SUPERIOR';
export type RelatorioFinanceiroStatus = 'todos' | 'PAGO' | 'PENDENTE' | 'VENCIDO' | 'CANCELADO';
export type RelatorioTipoLancamento = 'todos' | 'MATRICULA' | 'PARCELA' | 'REMATRICULA' | 'AVULSO';
export type RelatorioMovimentacaoFinanceiraTipo =
  | 'EXTRATO_CONTA'
  | 'ENTRADAS'
  | 'SAIDAS'
  | 'RECEITAS'
  | 'DESPESAS'
  | 'CATEGORIAS';
export type RelatorioMovimentacaoFinanceiraStatus =
  | 'ATIVOS'
  | 'TODOS'
  | 'PAGO'
  | 'PENDENTE'
  | 'VENCIDO'
  | 'SUSPENSO'
  | 'CANCELADO'
  | 'ESTORNADO'
  | 'DEVOLVIDO';

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
}

export type RelatorioFinanceiroPreEstagioSituacao = 'QUITADO' | 'PENDENTE' | 'CADASTRO_INCOMPLETO';

export interface RelatorioFinanceiroPreEstagioItem {
  matriculaId: string;
  alunoId: string;
  alunoNome: string;
  alunoCpf: string;
  matricula: string;
  parcelasPrevistas: number;
  parcelasRegistradas: number;
  parcelasPagas: number;
  parcelasEmAberto: number;
  parcelasVencidas: number;
  parcelasNaoGeradas: number;
  valorEmAberto: number;
  situacao: RelatorioFinanceiroPreEstagioSituacao;
}

export interface RelatorioFinanceiroPreEstagioData {
  turma: {
    id: string;
    nome: string;
    codigo: string;
    cursoNome: string;
    modalidade: string;
    parcelasPrevistas: number;
  };
  alunos: RelatorioFinanceiroPreEstagioItem[];
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

export interface RelatorioMovimentacaoFinanceiraFiltros {
  tipo: RelatorioMovimentacaoFinanceiraTipo;
  poloId?: string | null;
  dataInicio: string;
  dataFim: string;
  contaBancariaId?: string | null;
  categoria?: string | null;
  status?: RelatorioMovimentacaoFinanceiraStatus;
  busca?: string | null;
}

export interface RelatorioMovimentacaoFinanceiraConta {
  id: string;
  banco: string;
  titular: string;
  agencia: string;
  conta: string;
  natureza: 'BANCARIA' | 'CAIXA_INTERNO';
  polo: string;
  compartilhada: boolean;
  ativa: boolean;
  rotulo: string;
}

export interface RelatorioMovimentacaoFinanceiraCategoria {
  chave: string;
  rotulo: string;
}

export interface RelatorioMovimentacaoFinanceiraItem {
  id: string;
  data: string;
  direcao: 'ENTRADA' | 'SAIDA' | 'NEUTRO';
  classificacao: string;
  origem: string;
  descricao: string;
  contraparte: string;
  categoriaChave: string;
  categoria: string;
  status: string;
  contaId: string | null;
  conta: string;
  polo: string;
  valor: number;
  valorPrevisto: number;
  valorRealizado: number;
  saldoApos: number | null;
}

export interface RelatorioMovimentacaoFinanceiraResumo {
  totalLancamentos: number;
  valorPrevisto: number;
  valorRealizado: number;
  valorEmAberto: number;
  totalEntradas: number;
  totalSaidas: number;
  saldoAbertura: number | null;
  saldoFechamento: number | null;
  saldoDisponivel: boolean;
  saldoObservacao: string | null;
}

export interface RelatorioMovimentacaoFinanceiraAgregacao {
  chave: string;
  rotulo: string;
  totalLancamentos: number;
  valorPrevisto: number;
  valorRealizado: number;
  valorEmAberto: number;
  totalEntradas: number;
  totalSaidas: number;
}

export interface RelatorioMovimentacaoFinanceiraData {
  meta: {
    tipo: RelatorioMovimentacaoFinanceiraTipo;
    dataReferencia: 'PAGAMENTO' | 'VENCIMENTO';
    dataInicio: string;
    dataFim: string;
    escopo: string;
    contaSelecionadaId: string | null;
    contaSelecionada: string | null;
  };
  contas: RelatorioMovimentacaoFinanceiraConta[];
  categorias: RelatorioMovimentacaoFinanceiraCategoria[];
  agregacoes: {
    categorias: RelatorioMovimentacaoFinanceiraAgregacao[];
    classificacoes: RelatorioMovimentacaoFinanceiraAgregacao[];
    origens: RelatorioMovimentacaoFinanceiraAgregacao[];
  };
  resumo: RelatorioMovimentacaoFinanceiraResumo;
  movimentos: RelatorioMovimentacaoFinanceiraItem[];
  completo: boolean;
  limite: number;
  mensagem: string | null;
}

export interface RelatorioFluxoCaixaFiltros {
  poloId?: string | null;
  dataInicio: string;
  dataFim: string;
}

export interface RelatorioFluxoCaixaLinha {
  chave: string;
  rotulo: string;
  tipo: 'REALIZADO' | 'PROJECAO' | 'RESULTADO';
  valor: number;
}

export interface RelatorioFluxoCaixaData {
  meta: {
    dataInicio: string;
    dataFim: string;
    escopo: string;
  };
  resumo: {
    entradasRealizadas: number;
    saidasRealizadas: number;
    receitasEmAberto: number;
    despesasEmAberto: number;
    fluxoRealizado: number;
    fluxoProjetado: number;
  };
  linhas: RelatorioFluxoCaixaLinha[];
  mensagem: string | null;
}

export interface RelatorioInadimplenciaFiltros {
  poloId?: string | null;
  dataCorte: string;
  minDiasAtraso: number;
  busca?: string | null;
}

export interface RelatorioInadimplenciaFaixa {
  chave: string;
  rotulo: string;
  quantidade: number;
  valorEmAberto: number;
}

export interface RelatorioInadimplenciaDevedor {
  id: string;
  devedor: string;
  contato: string;
  curso: string;
  polo: string;
  descricao: string;
  dataVencimento: string;
  diasAtraso: number;
  faixa: string;
  valorEmAberto: number;
}

export interface RelatorioInadimplenciaData {
  meta: {
    dataCorte: string;
    escopo: string;
    minDiasAtraso: number;
  };
  resumo: {
    quantidadeTitulos: number;
    quantidadeDevedores: number;
    valorEmAtraso: number;
    valorFaturadoVencido: number;
    percentualInadimplencia: number | null;
    percentualComparavel: boolean;
  };
  faixas: RelatorioInadimplenciaFaixa[];
  devedores: RelatorioInadimplenciaDevedor[];
  completo: boolean;
  limite: number;
  mensagem: string | null;
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

type RelatorioRawRecord = Record<string, unknown>;

const asRelatorioRawRecord = (value: unknown): RelatorioRawRecord => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as RelatorioRawRecord
    : {}
);

const asRelatorioRawArray = (value: unknown) => (
  Array.isArray(value) ? value.map(asRelatorioRawRecord) : []
);

const asRequiredRelatorioNumber = (value: unknown, field: string) => {
  if (
    typeof value !== 'number'
    && (typeof value !== 'string' || !value.trim())
  ) {
    throw new Error(`O relatório financeiro retornou o campo obrigatório "${field}" sem valor.`);
  }

  const parsed = Number(typeof value === 'string' ? value.trim() : value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`O relatório financeiro retornou o campo obrigatório "${field}" inválido.`);
  }

  return parsed;
};

const asRelatorioNullableNumber = (value: unknown, field: string) => {
  if (value === null || value === undefined || value === '') return null;
  return asRequiredRelatorioNumber(value, field);
};

const asRelatorioString = (value: unknown) => (
  typeof value === 'string' ? value : ''
);

const asRelatorioNullableString = (value: unknown) => (
  typeof value === 'string' && value ? value : null
);

const asMovimentacaoTipo = (value: unknown): RelatorioMovimentacaoFinanceiraTipo => {
  if (
    value === 'EXTRATO_CONTA'
    || value === 'ENTRADAS'
    || value === 'SAIDAS'
    || value === 'RECEITAS'
    || value === 'DESPESAS'
    || value === 'CATEGORIAS'
  ) return value;
  throw new Error('O relatório financeiro retornou um tipo de visão inválido.');
};

const asMovimentacaoDirecao = (value: unknown): RelatorioMovimentacaoFinanceiraItem['direcao'] => {
  if (value === 'ENTRADA' || value === 'SAIDA') return value;
  return 'NEUTRO';
};

const asMovimentacaoContaNatureza = (value: unknown): RelatorioMovimentacaoFinanceiraConta['natureza'] => (
  value === 'CAIXA_INTERNO' ? 'CAIXA_INTERNO' : 'BANCARIA'
);

const asFluxoCaixaLinhaTipo = (value: unknown): RelatorioFluxoCaixaLinha['tipo'] => {
  if (value === 'PROJECAO' || value === 'RESULTADO') return value;
  return 'REALIZADO';
};

const mapMovimentacaoAgregacao = (
  value: RelatorioRawRecord,
): RelatorioMovimentacaoFinanceiraAgregacao => ({
  chave: asRelatorioString(value.chave),
  rotulo: asRelatorioString(value.rotulo),
  totalLancamentos: asRequiredRelatorioNumber(value.total_lancamentos, 'agregacoes.total_lancamentos'),
  valorPrevisto: asRequiredRelatorioNumber(value.valor_previsto, 'agregacoes.valor_previsto'),
  valorRealizado: asRequiredRelatorioNumber(value.valor_realizado, 'agregacoes.valor_realizado'),
  valorEmAberto: asRequiredRelatorioNumber(value.valor_em_aberto, 'agregacoes.valor_em_aberto'),
  totalEntradas: asRequiredRelatorioNumber(value.total_entradas, 'agregacoes.total_entradas'),
  totalSaidas: asRequiredRelatorioNumber(value.total_saidas, 'agregacoes.total_saidas'),
});

export const mapRelatorioMovimentacaoFinanceira = (
  value: unknown,
): RelatorioMovimentacaoFinanceiraData => {
  let payload = Array.isArray(value) ? value[0] : value;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      throw new Error('O relatório financeiro retornou um contrato inválido.');
    }
  }

  const record = asRelatorioRawRecord(payload);
  const meta = asRelatorioRawRecord(record.meta);
  const resumo = asRelatorioRawRecord(record.resumo);
  const agregacoes = asRelatorioRawRecord(record.agregacoes);

  if (!Object.keys(meta).length || !Object.keys(resumo).length || !Array.isArray(record.movimentos)) {
    throw new Error('O relatório financeiro retornou um contrato incompleto.');
  }

  return {
    meta: {
      tipo: asMovimentacaoTipo(meta.tipo),
      dataReferencia: meta.data_referencia === 'VENCIMENTO' ? 'VENCIMENTO' : 'PAGAMENTO',
      dataInicio: asRelatorioString(meta.data_inicio),
      dataFim: asRelatorioString(meta.data_fim),
      escopo: asRelatorioString(meta.escopo),
      contaSelecionadaId: asRelatorioNullableString(meta.conta_selecionada_id),
      contaSelecionada: asRelatorioNullableString(meta.conta_selecionada),
    },
    contas: asRelatorioRawArray(record.contas).map((conta) => ({
      id: asRelatorioString(conta.id),
      banco: asRelatorioString(conta.banco),
      titular: asRelatorioString(conta.titular),
      agencia: asRelatorioString(conta.agencia),
      conta: asRelatorioString(conta.conta),
      natureza: asMovimentacaoContaNatureza(conta.natureza),
      polo: asRelatorioString(conta.polo),
      compartilhada: conta.compartilhada === true,
      ativa: conta.ativa !== false,
      rotulo: asRelatorioString(conta.rotulo),
    })).filter((conta) => Boolean(conta.id && conta.rotulo)),
    categorias: asRelatorioRawArray(record.categorias).map((categoria) => ({
      chave: asRelatorioString(categoria.chave),
      rotulo: asRelatorioString(categoria.rotulo),
    })).filter((categoria) => Boolean(categoria.chave && categoria.rotulo)),
    agregacoes: {
      categorias: asRelatorioRawArray(agregacoes.categorias)
        .map(mapMovimentacaoAgregacao)
        .filter((item) => Boolean(item.chave && item.rotulo)),
      classificacoes: asRelatorioRawArray(agregacoes.classificacoes)
        .map(mapMovimentacaoAgregacao)
        .filter((item) => Boolean(item.chave && item.rotulo)),
      origens: asRelatorioRawArray(agregacoes.origens)
        .map(mapMovimentacaoAgregacao)
        .filter((item) => Boolean(item.chave && item.rotulo)),
    },
    resumo: {
      totalLancamentos: asRequiredRelatorioNumber(resumo.total_lancamentos, 'resumo.total_lancamentos'),
      valorPrevisto: asRequiredRelatorioNumber(resumo.valor_previsto, 'resumo.valor_previsto'),
      valorRealizado: asRequiredRelatorioNumber(resumo.valor_realizado, 'resumo.valor_realizado'),
      valorEmAberto: asRequiredRelatorioNumber(resumo.valor_em_aberto, 'resumo.valor_em_aberto'),
      totalEntradas: asRequiredRelatorioNumber(resumo.total_entradas, 'resumo.total_entradas'),
      totalSaidas: asRequiredRelatorioNumber(resumo.total_saidas, 'resumo.total_saidas'),
      saldoAbertura: resumo.saldo_abertura === null ? null : asRequiredRelatorioNumber(resumo.saldo_abertura, 'resumo.saldo_abertura'),
      saldoFechamento: resumo.saldo_fechamento === null ? null : asRequiredRelatorioNumber(resumo.saldo_fechamento, 'resumo.saldo_fechamento'),
      saldoDisponivel: resumo.saldo_disponivel === true,
      saldoObservacao: asRelatorioNullableString(resumo.saldo_observacao),
    },
    movimentos: asRelatorioRawArray(record.movimentos).map((item) => ({
      id: asRelatorioString(item.id),
      data: asRelatorioString(item.data),
      direcao: asMovimentacaoDirecao(item.direcao),
      classificacao: asRelatorioString(item.classificacao),
      origem: asRelatorioString(item.origem),
      descricao: asRelatorioString(item.descricao),
      contraparte: asRelatorioString(item.contraparte),
      categoriaChave: asRelatorioString(item.categoria_chave),
      categoria: asRelatorioString(item.categoria),
      status: asRelatorioString(item.status),
      contaId: asRelatorioNullableString(item.conta_id),
      conta: asRelatorioString(item.conta),
      polo: asRelatorioString(item.polo),
      valor: asRequiredRelatorioNumber(item.valor, 'movimentos.valor'),
      valorPrevisto: asRequiredRelatorioNumber(item.valor_previsto, 'movimentos.valor_previsto'),
      valorRealizado: asRequiredRelatorioNumber(item.valor_realizado, 'movimentos.valor_realizado'),
      saldoApos: item.saldo_apos === null ? null : asRequiredRelatorioNumber(item.saldo_apos, 'movimentos.saldo_apos'),
    })).filter((item) => Boolean(item.id && item.data)),
    completo: record.completo === true,
    limite: asRequiredRelatorioNumber(record.limite, 'limite'),
    mensagem: asRelatorioNullableString(record.mensagem),
  };
};

const parseRelatorioPayload = (value: unknown, errorMessage: string): RelatorioRawRecord => {
  let payload = Array.isArray(value) ? value[0] : value;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      throw new Error(errorMessage);
    }
  }

  const record = asRelatorioRawRecord(payload);
  if (!Object.keys(record).length) throw new Error(errorMessage);
  return record;
};

export const mapRelatorioFluxoCaixa = (value: unknown): RelatorioFluxoCaixaData => {
  const record = parseRelatorioPayload(value, 'O fluxo de caixa retornou um contrato inválido.');
  const meta = asRelatorioRawRecord(record.meta);
  const resumo = asRelatorioRawRecord(record.resumo);

  if (!Object.keys(meta).length || !Object.keys(resumo).length || !Array.isArray(record.linhas)) {
    throw new Error('O fluxo de caixa retornou um contrato incompleto.');
  }

  return {
    meta: {
      dataInicio: asRelatorioString(meta.data_inicio),
      dataFim: asRelatorioString(meta.data_fim),
      escopo: asRelatorioString(meta.escopo),
    },
    resumo: {
      entradasRealizadas: asRequiredRelatorioNumber(resumo.entradas_realizadas, 'resumo.entradas_realizadas'),
      saidasRealizadas: asRequiredRelatorioNumber(resumo.saidas_realizadas, 'resumo.saidas_realizadas'),
      receitasEmAberto: asRequiredRelatorioNumber(resumo.receitas_em_aberto, 'resumo.receitas_em_aberto'),
      despesasEmAberto: asRequiredRelatorioNumber(resumo.despesas_em_aberto, 'resumo.despesas_em_aberto'),
      fluxoRealizado: asRequiredRelatorioNumber(resumo.fluxo_realizado, 'resumo.fluxo_realizado'),
      fluxoProjetado: asRequiredRelatorioNumber(resumo.fluxo_projetado, 'resumo.fluxo_projetado'),
    },
    linhas: asRelatorioRawArray(record.linhas).map((linha) => ({
      chave: asRelatorioString(linha.chave),
      rotulo: asRelatorioString(linha.rotulo),
      tipo: asFluxoCaixaLinhaTipo(linha.tipo),
      valor: asRequiredRelatorioNumber(linha.valor, 'linhas.valor'),
    })).filter((linha) => Boolean(linha.chave && linha.rotulo)),
    mensagem: asRelatorioNullableString(record.mensagem),
  };
};

export const mapRelatorioInadimplencia = (value: unknown): RelatorioInadimplenciaData => {
  const record = parseRelatorioPayload(value, 'O relatório de inadimplência retornou um contrato inválido.');
  const meta = asRelatorioRawRecord(record.meta);
  const resumo = asRelatorioRawRecord(record.resumo);

  if (
    !Object.keys(meta).length
    || !Object.keys(resumo).length
    || !Array.isArray(record.faixas)
    || !Array.isArray(record.devedores)
  ) {
    throw new Error('O relatório de inadimplência retornou um contrato incompleto.');
  }

  return {
    meta: {
      dataCorte: asRelatorioString(meta.data_corte),
      escopo: asRelatorioString(meta.escopo),
      minDiasAtraso: asRequiredRelatorioNumber(meta.min_dias_atraso, 'meta.min_dias_atraso'),
    },
    resumo: {
      quantidadeTitulos: asRequiredRelatorioNumber(resumo.quantidade_titulos, 'resumo.quantidade_titulos'),
      quantidadeDevedores: asRequiredRelatorioNumber(resumo.quantidade_devedores, 'resumo.quantidade_devedores'),
      valorEmAtraso: asRequiredRelatorioNumber(resumo.valor_em_atraso, 'resumo.valor_em_atraso'),
      valorFaturadoVencido: asRequiredRelatorioNumber(resumo.valor_faturado_vencido, 'resumo.valor_faturado_vencido'),
      percentualInadimplencia: asRelatorioNullableNumber(resumo.percentual_inadimplencia, 'resumo.percentual_inadimplencia'),
      percentualComparavel: resumo.percentual_comparavel === true,
    },
    faixas: asRelatorioRawArray(record.faixas).map((faixa) => ({
      chave: asRelatorioString(faixa.chave),
      rotulo: asRelatorioString(faixa.rotulo),
      quantidade: asRequiredRelatorioNumber(faixa.quantidade, 'faixas.quantidade'),
      valorEmAberto: asRequiredRelatorioNumber(faixa.valor_em_aberto, 'faixas.valor_em_aberto'),
    })).filter((faixa) => Boolean(faixa.chave && faixa.rotulo)),
    devedores: asRelatorioRawArray(record.devedores).map((devedor) => ({
      id: asRelatorioString(devedor.id),
      devedor: asRelatorioString(devedor.devedor),
      contato: asRelatorioString(devedor.contato),
      curso: asRelatorioString(devedor.curso),
      polo: asRelatorioString(devedor.polo),
      descricao: asRelatorioString(devedor.descricao),
      dataVencimento: asRelatorioString(devedor.data_vencimento),
      diasAtraso: asRequiredRelatorioNumber(devedor.dias_atraso, 'devedores.dias_atraso'),
      faixa: asRelatorioString(devedor.faixa),
      valorEmAberto: asRequiredRelatorioNumber(devedor.valor_em_aberto, 'devedores.valor_em_aberto'),
    })).filter((devedor) => Boolean(devedor.id && devedor.dataVencimento)),
    completo: record.completo === true,
    limite: asRequiredRelatorioNumber(record.limite, 'limite'),
    mensagem: asRelatorioNullableString(record.mensagem),
  };
};

export const relatoriosService = {
  async getMovimentacaoFinanceira(
    filters: RelatorioMovimentacaoFinanceiraFiltros,
  ): Promise<RelatorioMovimentacaoFinanceiraData> {
    const { data, error } = await supabase.rpc(
      'get_relatorio_movimentacao_financeira_secure',
      {
        p_polo_id: filters.poloId && filters.poloId !== 'todos' ? filters.poloId : null,
        p_tipo: filters.tipo,
        p_data_inicio: filters.dataInicio,
        p_data_fim: filters.dataFim,
        p_conta_bancaria_id: filters.contaBancariaId || null,
        p_categoria: filters.categoria || null,
        p_status: filters.status || 'ATIVOS',
        p_busca: filters.busca?.trim() || null,
      },
    );

    if (error) {
      console.error('Erro ao buscar movimentação financeira para relatório:', {
        code: error.code,
        message: error.message,
      });
      throw error;
    }

    return mapRelatorioMovimentacaoFinanceira(data);
  },

  async getFluxoCaixa(
    filters: RelatorioFluxoCaixaFiltros,
  ): Promise<RelatorioFluxoCaixaData> {
    const { data, error } = await supabase.rpc(
      'get_relatorio_fluxo_caixa_secure',
      {
        p_polo_id: filters.poloId && filters.poloId !== 'todos' ? filters.poloId : null,
        p_data_inicio: filters.dataInicio,
        p_data_fim: filters.dataFim,
      },
    );

    if (error) {
      console.error('Erro ao buscar fluxo de caixa para relatório:', {
        code: error.code,
        message: error.message,
      });
      throw error;
    }

    return mapRelatorioFluxoCaixa(data);
  },

  async getInadimplencia(
    filters: RelatorioInadimplenciaFiltros,
  ): Promise<RelatorioInadimplenciaData> {
    const { data, error } = await supabase.rpc(
      'get_relatorio_inadimplencia_secure',
      {
        p_polo_id: filters.poloId && filters.poloId !== 'todos' ? filters.poloId : null,
        p_data_corte: filters.dataCorte,
        p_min_dias_atraso: filters.minDiasAtraso,
        p_busca: filters.busca?.trim() || null,
      },
    );

    if (error) {
      console.error('Erro ao buscar inadimplência para relatório:', {
        code: error.code,
        message: error.message,
      });
      throw error;
    }

    return mapRelatorioInadimplencia(data);
  },

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
      };
    });
  },

  async getFinanceiroPreEstagioTurma(turmaId: string): Promise<RelatorioFinanceiroPreEstagioData> {
    const { data: matriculas, error: matriculasError } = await supabase
      .from('matriculas')
      .select(`
        id,
        aluno_id,
        data_matricula,
        status,
        parceiros!inner(nome, cpf_cnpj, polo_id),
        turmas!inner(
          id, nome, codigo, qtd_parcelas, polo_id,
          cursos!inner(nome, modalidade)
        )
      `)
      .eq('turma_id', turmaId)
      .in('status', ['ATIVO', 'ativo'])
      .order('data_matricula', { ascending: true });

    if (matriculasError) throw matriculasError;

    const activeEnrollments = matriculas || [];
    const enrollmentIds = activeEnrollments.map((row: any) => row.id);
    const studentIds = activeEnrollments.map((row: any) => row.aluno_id);

    let receivables: any[] = [];
    if (enrollmentIds.length) {
      const { data, error } = await supabase
        .from('contas_receber')
        .select('id, matricula_id, cliente_id, status, parcela_numero, data_vencimento, valor, valor_pago')
        .eq('turma_id', turmaId)
        .eq('tipo_lancamento', 'PARCELA')
        .or(`matricula_id.in.(${enrollmentIds.join(',')}),cliente_id.in.(${studentIds.join(',')})`)
        .order('parcela_numero', { ascending: true });

      if (error) throw error;
      receivables = data || [];
    }

    const firstEnrollment: any = activeEnrollments[0];
    const turma = firstEnrollment?.turmas || {};
    const curso = turma.cursos || {};
    const configuredInstallments = Math.max(0, Number(turma.qtd_parcelas || 0));
    const today = new Date().toISOString().slice(0, 10);
    const finalStatuses = new Set(['CANCELADO', 'ESTORNADO', 'DEVOLVIDO']);

    const alunos = activeEnrollments.map((row: any): RelatorioFinanceiroPreEstagioItem => {
      const aluno = row.parceiros || {};
      const studentReceivables = receivables.filter((receivable: any) => (
        receivable.matricula_id === row.id
        || (!receivable.matricula_id && receivable.cliente_id === row.aluno_id)
      ));
      const validReceivables = studentReceivables.filter((receivable: any) => (
        !finalStatuses.has(String(receivable.status || '').toUpperCase())
      ));
      const parcelasPagas = validReceivables.filter((receivable: any) => (
        String(receivable.status || '').toUpperCase() === 'PAGO'
      )).length;
      const parcelasEmAberto = validReceivables.length - parcelasPagas;
      const parcelasVencidas = validReceivables.filter((receivable: any) => {
        const status = String(receivable.status || '').toUpperCase();
        return status === 'VENCIDO'
          || (status === 'PENDENTE' && Boolean(receivable.data_vencimento) && receivable.data_vencimento < today);
      }).length;
      const parcelasPrevistas = Math.max(configuredInstallments, validReceivables.length);
      const parcelasNaoGeradas = Math.max(0, parcelasPrevistas - validReceivables.length);
      const valorEmAberto = validReceivables
        .filter((receivable: any) => String(receivable.status || '').toUpperCase() !== 'PAGO')
        .reduce(
          (total: number, receivable: any) => total + Math.max(
            0,
            Number(receivable.valor || 0) - Number(receivable.valor_pago || 0),
          ),
          0,
        );

      const situacao: RelatorioFinanceiroPreEstagioSituacao = parcelasPrevistas === 0 || parcelasNaoGeradas > 0
        ? 'CADASTRO_INCOMPLETO'
        : parcelasEmAberto > 0
          ? 'PENDENTE'
          : 'QUITADO';

      return {
        matriculaId: row.id,
        alunoId: row.aluno_id,
        alunoNome: aluno.nome || 'Aluno',
        alunoCpf: aluno.cpf_cnpj || '',
        matricula: formatMatricula(row.id, row.data_matricula, aluno.polo_id || turma.polo_id),
        parcelasPrevistas,
        parcelasRegistradas: validReceivables.length,
        parcelasPagas,
        parcelasEmAberto,
        parcelasVencidas,
        parcelasNaoGeradas,
        valorEmAberto,
        situacao,
      };
    });

    return {
      turma: {
        id: turma.id || turmaId,
        nome: turma.nome || turma.codigo || 'Turma',
        codigo: turma.codigo || '',
        cursoNome: curso.nome || 'Curso',
        modalidade: curso.modalidade || 'TECNICO',
        parcelasPrevistas: configuredInstallments,
      },
      alunos: alunos.sort((a, b) => a.alunoNome.localeCompare(b.alunoNome, 'pt-BR')),
    };
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
        id, aluno_id, turma_id, status, data_matricula,
        parceiros!inner(
          nome, cpf_cnpj, rg, telefone, email, data_nascimento, sexo,
          endereco, numero, bairro, cidade, uf, pcd, pcd_tipo
        ),
        turmas!inner(
          id, nome, codigo, status, data_inicio, data_previsao_termino,
          polo_id, curso_id, turno,
          cursos!inner(nome, modalidade, carga_horaria),
          polos(nome, cidade)
        )
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
        .select('matricula_id, status, codigo_validacao, data_conclusao, emitido_em')
        .in('matricula_id', matriculaIds);

      if (certError) throw certError;
      certificadosByMatricula = new Map((certificados || []).map((cert: any) => [cert.matricula_id, cert]));
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
        dataConclusao: normalizeDate(certificado?.data_conclusao),
        cursoNome: curso.nome || 'Curso',
        modalidade: curso.modalidade || 'OUTRO',
        cargaHoraria: Number(curso.carga_horaria || 0),
        turmaId: turma.id,
        turmaNome: turma.nome || turma.codigo || 'Turma',
        turmaCodigo: turma.codigo || '',
        turmaStatus: turma.status || '',
        dataInicio: normalizeDate(turma.data_inicio),
        dataFim: normalizeDate(turma.data_previsao_termino),
        poloNome: polo.nome || polo.cidade || 'Matriz',
        certificadoStatus: certificado?.status || null,
        certificadoCodigo: certificado?.codigo_validacao || null,
        certificadoEmissao: normalizeDate(certificado?.emitido_em),
      };
    });
  },

  async getLucroTurmaRevenues(turmaId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('contas_receber')
      .select('id, descricao, valor, valor_pago, data_vencimento, data_pagamento, status, parceiros(nome)')
      .eq('turma_id', turmaId)
      .order('data_vencimento', { ascending: true });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      descricao: row.descricao || 'Recebimento',
      valor: Number(row.valor || 0),
      valorPago: Number(row.valor_pago || (row.status === 'PAGO' ? row.valor : 0) || 0),
      dataVencimento: row.data_vencimento,
      dataPagamento: row.data_pagamento,
      status: row.status,
      alunoNome: row.parceiros?.nome || 'Cliente Geral'
    }));
  },

  async getLucroTurmaExpenses(turmaId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('despesas_lancamentos')
      .select('id, descricao, valor, valor_pago, data_vencimento, data_pagamento, status, categorias_financeiras(nome), parceiros(nome)')
      .eq('turma_id', turmaId)
      .order('data_vencimento', { ascending: true });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      descricao: row.descricao || 'Despesa',
      valor: Number(row.valor || 0),
      valorPago: Number(row.valor_pago || (row.status === 'PAGO' ? row.valor : 0) || 0),
      dataVencimento: row.data_vencimento,
      dataPagamento: row.data_pagamento,
      status: row.status,
      categoriaNome: row.categorias_financeiras?.nome || 'Despesa Geral',
      fornecedorNome: row.parceiros?.nome || 'Fornecedor Geral'
    }));
  },
};
