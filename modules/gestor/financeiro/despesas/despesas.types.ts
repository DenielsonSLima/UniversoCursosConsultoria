import type { CategoriaFinanceiraTipo, DespesaTipo } from './despesas.queryKeys';

export interface CategoriaFinanceira {
  id: string;
  nome: string;
  tipo: CategoriaFinanceiraTipo;
  descricao?: string;
  status: 'ativo' | 'inativo';
  createdAt?: string;
}

export interface DespesaLancamento {
  id: string;
  despesaLancamentoId?: string;
  poloId?: string;
  poloNome?: string;
  tipo: DespesaTipo;
  descricao: string;
  valorBase: number;
  jurosValor: number;
  multaValor: number;
  descontoValor: number;
  valor: number;
  dataLancamento?: string;
  dataVencimento: string;
  dataPagamento?: string;
  valorPago?: number;
  status: 'PENDENTE' | 'PAGO' | 'VENCIDO' | 'CANCELADO';
  categoriaFinanceiraId?: string;
  categoriaNome?: string;
  fornecedorId?: string;
  fornecedorNome?: string;
  formaPagamento?: string;
  contaBancariaId?: string;
  contaBancariaNome?: string;
  parcelaNumero: number;
  totalParcelas: number;
  grupoParcelas?: string;
  observacao?: string;
  turmaId?: string;
  turmaNome?: string;
  anexoBucket?: string;
  anexoPath?: string;
  anexoNome?: string;
  anexoMime?: string;
  anexoTamanho?: number;
  cancelamentoMotivo?: string;
  canceladoEm?: string;
  estornadoEm?: string;
  createdAt: string;
  isRateioDerived?: boolean;
  rateioMode?: 'SEM_RATEIO' | 'TODOS' | 'SELECIONADOS';
  rateioPolosQuantidade?: number;
  poloMatrizId?: string;
  poloMatrizNome?: string;
  convenioMesId?: string;
  convenioId?: string;
  convenioNome?: string;
  convenioCompetencia?: string;
}

export interface DespesaReciboSnapshot {
  receipt: {
    lancamentoId: string;
    reciboTitulo?: string;
    reciboNumero?: string;
    descricao: string;
    valor: number;
    valorBase?: number;
    jurosValor?: number;
    multaValor?: number;
    descontoValor?: number;
    dataLancamento?: string;
    dataVencimento: string;
    dataPagamento?: string;
    valorPago?: number;
    fornecedorNome?: string;
    fornecedorDocumento?: string;
    categoriaNome?: string;
    formaPagamento?: string;
    contaBancariaNome?: string;
    poloId?: string;
    poloNome?: string;
    parcelaNumero?: number;
    totalParcelas?: number;
    observacao?: string;
    status?: string;
  };
  polo: {
    id?: string;
    nome: string;
    nomeFantasia?: string;
    cnpj?: string;
    cidade?: string;
    estado?: string;
    uf?: string;
    status?: string;
    is_matriz?: boolean;
    logoUrl?: string;
    endereco?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cep?: string;
    telefone?: string;
    email?: string;
    watermark_url?: string;
    watermark_opacity?: number;
    watermark_scale?: number;
    watermark_rotate?: boolean;
  };
}

export interface DespesaBaixaParams {
  requestId: string;
  contaBancariaId: string;
  dataPagamento: string;
  formaPagamento: string;
  jurosValor?: number;
  multaValor?: number;
  descontoValor?: number;
}

export interface UpdateDespesaInput {
  requestId: string;
  descricao: string;
  valorBase: number;
  dataLancamento: string;
  dataVencimento: string;
  jurosValor?: number;
  multaValor?: number;
  descontoValor?: number;
  categoriaFinanceiraId?: string;
  fornecedorId?: string;
  observacao?: string;
  turmaId?: string;
}

export interface CancelarOuEstornarDespesaInput {
  requestId: string;
  motivo: string;
  confirmarEstorno?: boolean;
}

export interface ExcluirDespesasPendentesInput {
  requestId: string;
  poloId: string;
  tipo: DespesaTipo;
  despesaIds: string[];
}

export interface ExcluirDespesasPendentesResult {
  requestId: string;
  despesaIds: string[];
  quantidade: number;
}

export interface DespesaRateioInput {
  modo: 'TODOS' | 'SELECIONADOS';
  poloIds?: string[];
}

export interface CreateDespesaInput {
  requestId: string;
  poloId: string;
  tipo: DespesaTipo;
  descricao: string;
  valor: number;
  jurosValor?: number;
  multaValor?: number;
  descontoValor?: number;
  dataLancamento?: string;
  dataVencimento: string;
  categoriaFinanceiraId?: string;
  fornecedorId?: string;
  observacao?: string;
  turmaId?: string;
  totalParcelas?: number;
  intervaloQuantidade?: number;
  intervaloUnidade?: 'DIAS' | 'SEMANAS' | 'MESES';
  splitTotal?: boolean;
  markAsPaid?: boolean;
  formaPagamento?: string;
  contaBancariaId?: string;
  rateio?: DespesaRateioInput;
  convenioMesId?: string;
  anexo?: File;
}

export interface CreateCategoriaFinanceiraInput {
  nome: string;
  tipo: CategoriaFinanceiraTipo;
  descricao?: string;
  status?: 'ativo' | 'inativo';
}

export interface DespesasSummary {
  totalValue: number;
  paidValue: number;
  pendingValue: number;
  vencidosCount: number;
}

export interface DespesaGroupSummary {
  categoriaId?: string;
  categoriaNome: string;
  totalValue: number;
  paidValue: number;
  itemCount: number;
}
