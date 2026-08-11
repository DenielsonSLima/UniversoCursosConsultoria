export interface ParcelaPlanoFinanceiroUnico {
  id: string;
  tipo: 'PARCELA';
  numero: number;
  label: string;
  valor: number;
  dataVencimento: string;
  fingerprint?: string;
}

export interface RegraPlanoFinanceiroUnico {
  valorTotal: number;
  qtdParcelas: number;
  primeiroVencimento: string;
  diaVencimento: number;
  descontoPontualidade: number;
  jurosAtrasoPercentual: number;
  multaAtraso: number;
  revisao: number;
  fingerprint: string;
  cronograma: ParcelaPlanoFinanceiroUnico[];
}

export interface ResumoPlanoFinanceiroUnico {
  alunosComPlano: number;
  parcelasGeradas: number;
  totalLancado: number;
  totalRecebido: number;
  emAberto: number;
}

export interface PlanoFinanceiroUnicoWorkspace {
  turmaId: string;
  configurado: boolean;
  motivo?: 'PLANO_AUSENTE';
  regra?: RegraPlanoFinanceiroUnico;
  resumo?: ResumoPlanoFinanceiroUnico;
}

export interface MatricularAlunoPlanoFinanceiroUnicoInput {
  requestId: string;
  turmaId: string;
  alunoId: string;
  expectedRevisao: number;
  expectedFingerprint: string;
}

export interface AlunoDisponivelPlanoFinanceiroUnico {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  telefone?: string | null;
  responsavel_telefone?: string | null;
}

export interface TurmaDestinoPlanoFinanceiroUnico {
  id: string;
  nome: string;
  codigo: string | null;
  polo_id: string;
  polos?: { nome?: string | null } | null;
}

export interface ParcelaGeradaPlanoFinanceiroUnico {
  id: string;
  numero: number;
  valor: number;
  vencimento: string;
  status: string;
  formaPagamento: string;
}

export interface MatricularAlunoPlanoFinanceiroUnicoResult {
  requestId: string;
  replayed: boolean;
  matricula: {
    id: string;
    alunoId: string;
    turmaId: string;
    status: string;
  };
  plano: RegraPlanoFinanceiroUnico;
  parcelasInseridas: number;
  parcelasGeradas: number;
  parcelas: ParcelaGeradaPlanoFinanceiroUnico[];
}
