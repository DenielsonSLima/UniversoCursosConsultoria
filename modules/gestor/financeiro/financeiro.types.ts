export interface ContaBancaria {
  id?: string;
  banco: string;
  titular: string;
  agencia: string;
  conta: string;
  tipo: string;
  natureza?: 'BANCARIA' | 'CAIXA_INTERNO';
  poloId: string;
  poloNome?: string;
  poloCnpj?: string;
  poloCidade?: string;
  poloUf?: string;
  polosUso: string[];
  saldoInicial: number;
  dataSaldo?: string;
  ativo?: boolean;
  saldoAtual?: number;
  saldoContabilConta?: number;
  saldoGerencialPolo?: number;
  compartilhada?: boolean;
  recebido?: number;
  pago?: number;
}

export interface FinanceiroPolo {
  id: string;
  nome: string;
  cnpj: string | null;
  cidade: string | null;
  estado: string | null;
  uf?: string | null;
  is_matriz: boolean;
}

export const isContaDisponivelNoPolo = (
  account: ContaBancaria,
  poloId?: string | null,
) => (
  !poloId
  || poloId === 'todos'
  || account.polosUso.includes(poloId)
);

export interface ContasReceber {
  id?: string;
  poloId: string;
  poloNome?: string;
  poloCnpj?: string;
  poloCidade?: string;
  poloUf?: string;
  descricao: string;
  valor: number;
  dataVencimento: string;
  dataEmissao?: string;
  dataPagamento?: string;
  valorPago?: number;
  status: 'PENDENTE' | 'PAGO' | 'VENCIDO' | 'SUSPENSO' | 'ESTORNADO' | 'CANCELADO' | 'DEVOLVIDO';
  categoria: 'MENSALIDADE' | 'OUTROS_CREDITOS' | 'ADIANTAMENTO_TOMADO';
  categoriaFinanceiraId?: string;
  categoriaFinanceiraNome?: string;
  clienteId?: string;
  clienteNome?: string;
  clienteCpfCnpj?: string;
  clienteTelefone?: string;
  matriculaId?: string;
  turmaId?: string;
  formaPagamento?: 'BOLETO' | 'PIX' | 'CARTAO' | 'DINHEIRO';
  origemPagamento?: string;
  gatewayProvider?: string;
  gatewayPaymentMethod?: string;
  gatewaySettlementChannel?: 'PIX' | 'BOLETO' | 'NAO_IDENTIFICADO' | 'MISTO';
  gatewaySettlementSource?: 'API' | 'CNAB240' | 'MANUAL';
  contaBancariaId?: string;
  nossoNumeroAsaas?: string;
  boletoNossoNumero?: string;
  boletoDescontoConfigurado?: number;
  boletoDescontoValidoAte?: string;
  boletoDescontoSituacao?: 'VIGENTE' | 'EXPIRADO';
  asaasPaymentId?: string;
  asaasPaymentLinkId?: string;
  asaasInvoiceUrl?: string;
  asaasBankSlipUrl?: string;
  asaasInstallmentId?: string;
  asaasTransactionReceiptUrl?: string;
  asaasStatus?: string;
  asaasLastError?: string;
  taxa?: number;
  valorLiquido?: number;
  descontoAplicado?: number;
  jurosAplicados?: number;
  multaAplicada?: number;
  createdAt?: string;
  tipoLancamento?: 'MATRICULA' | 'PARCELA' | 'REMATRICULA' | 'DEPENDENCIA';
  parcelaNumero?: number;
  origemCronogramaId?: string;
  turmaNome?: string;
  cursoNome?: string;
  cursoModalidade?: string;
}

export interface ContasPagar {
  id?: string;
  poloId: string;
  poloNome?: string;
  descricao: string;
  valor: number;
  dataVencimento: string;
  dataPagamento?: string;
  valorPago?: number;
  status: 'PENDENTE' | 'PAGO' | 'VENCIDO' | 'ESTORNADO' | 'CANCELADO';
  categoria: 'DESPESA_VARIAVEL' | 'DESPESA_ADMINISTRATIVA' | 'OUTRAS_DESPESAS' | 'ADIANTAMENTO_CEDIDO' | 'EMPRESTIMO';
  fornecedorId?: string;
  fornecedorNome?: string;
  formaPagamento?: 'BOLETO' | 'PIX' | 'TED' | 'DINHEIRO';
  contaBancariaId?: string;
  createdAt?: string;
}

export interface TransferenciaConta {
  id?: string;
  poloId: string;
  poloNome?: string;
  poloCnpj?: string;
  poloCidade?: string;
  poloUf?: string;
  contaOrigemId: string;
  contaOrigemNome?: string;
  contaOrigemBanco?: string;
  contaOrigemTitular?: string;
  contaOrigemAgencia?: string;
  contaOrigemConta?: string;
  poloDestinoId: string;
  poloDestinoNome?: string;
  poloDestinoCnpj?: string;
  poloDestinoCidade?: string;
  poloDestinoUf?: string;
  contaDestinoId: string;
  contaDestinoNome?: string;
  contaDestinoBanco?: string;
  contaDestinoTitular?: string;
  contaDestinoAgencia?: string;
  contaDestinoConta?: string;
  valor: number;
  dataTransferencia: string;
  observacao?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TransferenciasFilters {
  poloId?: string | null;
  search?: string;
  contaOrigemId?: string;
  contaDestinoId?: string;
  dataInicio?: string;
  dataFim?: string;
  mesAtual?: boolean;
}

export interface TransferenciasSummary {
  totalValue: number;
  totalCount: number;
}

export interface TransferenciaInput {
  requestId: string;
  poloOrigemId: string;
  contaOrigemId: string;
  poloDestinoId: string;
  contaDestinoId: string;
  valor: number;
  dataTransferencia: string;
  observacao?: string;
}

export interface FluxoMensal {
  mes: string;
  ano: number;
  mesNome: string;
  creditos: number;
  debitos: number;
  atrasoReceber: number;
  atrasoPagar: number;
}

export interface FinanceiroSummary {
  totalRecebido: number;
  totalAReceber: number;
  totalPago: number;
  totalAPagar: number;
  saldoCaixa: number;
}

export interface ReceivablesSummary {
  pendingCount: number;
  receivedCount: number;
  canceledCount: number;
  allCount: number;
  pendingValue: number;
  receivedValue: number;
  canceledValue: number;
  overdueCount: number;
  overdueValue: number;
  allValue: number;
}

export interface ReceivablesSummaryFilters {
  poloId?: string;
  turmaId?: string;
  search?: string;
  dueStart?: string;
  dueEnd?: string;
  categoryId?: string;
}

export type ReceivablesStatusScope = 'pending' | 'received' | 'overdue' | 'canceled' | 'all';
export type ReceivablesGroupMode = 'none' | 'student' | 'class' | 'polo';

export interface ReceivablesPageFilters extends ReceivablesSummaryFilters {
  statusScope: ReceivablesStatusScope;
  groupMode: ReceivablesGroupMode;
  page: number;
  pageSize: number;
  groupKey?: string;
}

export interface ReceivablesPage {
  rows: ContasReceber[];
  totalItems: number;
  page: number;
  pageSize: number;
}

export interface ReceivablesGroupSummary {
  key: string;
  label: string;
  itemCount: number;
  pendingCount: number;
  receivedCount: number;
  canceledCount: number;
  nextDue: string;
  first: ContasReceber;
}

export interface ReceivablesGroupsPage {
  groups: ReceivablesGroupSummary[];
  totalItems: number;
  totalReceivables: number;
  page: number;
  pageSize: number;
}

export interface ActiveReceivablesClass {
  id: string;
  nome: string;
  codigo?: string | null;
}
