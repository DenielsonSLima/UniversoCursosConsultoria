export interface ParcelaPlanoFinanceiroUnico {
  id: string;
  tipo: 'PARCELA';
  numero: number;
  label: string;
  valor: number;
  dataVencimento: string;
  fingerprint?: string;
  simulacao?: SimulacaoParcelaPlanoFinanceiroUnico;
}

export interface SimulacaoParcelaPlanoFinanceiroUnico {
  descontoAplicado: number;
  jurosMensal: number;
  jurosPercentualDia: number;
  jurosValorDia: number;
  multa: number;
  valorComDesconto: number;
  valorComAtraso30Dias: number;
  mensagemPontualidade: string;
  mensagemAtraso30Dias: string;
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

export interface PreviewTurmaPlanoFinanceiroUnicoInput {
  cursoId: string;
  poloId: string;
  plano: {
    valorTotal: number;
    qtdParcelas: number;
    primeiroVencimento: string;
    descontoPontualidade: number;
    jurosAtrasoPercentual: number;
    multaAtraso: number;
  };
}

export type ModoCondicaoPlanoFinanceiroUnico = 'HERDAR' | 'PERSONALIZAR';
export type TipoDescontoComercialPlanoFinanceiroUnico = 'NENHUM' | 'A_VISTA' | 'NEGOCIADO';
export type MotivoCondicaoPlanoFinanceiroUnico =
  | 'BOLSA'
  | 'CONVENIO'
  | 'INCENTIVO'
  | 'NEGOCIACAO'
  | 'A_VISTA'
  | 'OUTRO';

export interface AjusteCondicaoPlanoFinanceiroUnico {
  modo: ModoCondicaoPlanoFinanceiroUnico;
  qtdParcelas?: number;
  primeiroVencimento?: string;
  descontoComercialTipo?: TipoDescontoComercialPlanoFinanceiroUnico;
  descontoComercialValor?: number;
  descontoPontualidade?: number;
  jurosAtrasoPercentual?: number;
  multaAtraso?: number;
  expectedOverrideRevisao?: number;
  expectedOverrideFingerprint?: string;
}

export interface RegraCondicaoPlanoFinanceiroUnico extends RegraPlanoFinanceiroUnico {
  origem: ModoCondicaoPlanoFinanceiroUnico;
  valorTotalNominal: number;
  valorTotalEfetivo: number;
  menorParcela: number;
  descontoComercial: {
    tipo: TipoDescontoComercialPlanoFinanceiroUnico;
    valor: number;
  };
  identidade: {
    planoTurmaRevisao: number;
    planoTurmaFingerprint: string;
    overrideRevisao?: number;
    overrideFingerprint?: string;
    efetivaFingerprint: string;
    preview: boolean;
  };
  mensagens: {
    pagamentoAteVencimento: string;
    pagamentoCom30DiasAtraso: string;
    parcelamento: string;
  };
}

export interface PreviewCondicaoPlanoFinanceiroUnicoInput {
  turmaId: string;
  alunoId: string;
  ajuste: AjusteCondicaoPlanoFinanceiroUnico;
}

export interface MatricularAlunoPlanoFinanceiroUnicoV2Input
  extends PreviewCondicaoPlanoFinanceiroUnicoInput {
  requestId: string;
  expectedRevisao: number;
  expectedFingerprint: string;
  gerarAgora: boolean;
  codigo?: string;
  motivo?: MotivoCondicaoPlanoFinanceiroUnico;
  justificativa?: string;
}

export interface MatricularAlunoPlanoFinanceiroUnicoV2Result {
  requestId: string;
  replayed: boolean;
  matricula: {
    id: string;
    alunoId: string;
    turmaId: string;
    status: string;
  };
  plano: RegraCondicaoPlanoFinanceiroUnico;
  financeiroGerado: boolean;
  parcelasInseridas: number;
  parcelasGeradas: number;
  parcelas: ParcelaGeradaPlanoFinanceiroUnico[];
}

export interface PendenciaPlanoFinanceiroUnico {
  matricula: { id: string; status: string };
  aluno: { id: string; nome: string; cpfCnpj?: string | null };
  config: {
    status: string;
    ajuste: AjusteCondicaoPlanoFinanceiroUnico;
    overrideRevisao?: number;
    overrideFingerprint?: string;
  };
  regra: RegraCondicaoPlanoFinanceiroUnico;
}

export interface PendenciasPlanoFinanceiroUnicoResult {
  turmaId: string;
  total: number;
  pendencias: PendenciaPlanoFinanceiroUnico[];
}

export interface CodigoCondicaoPlanoFinanceiroUnicoStatus {
  turmaId: string;
  configurado: boolean;
  revisao?: number;
  atualizadoEm?: string;
}

export interface RedefinirCodigoCondicaoPlanoFinanceiroUnicoInput {
  turmaId: string;
  requestId: string;
  novoCodigo: string;
  justificativa: string;
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
