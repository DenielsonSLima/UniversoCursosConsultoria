export type EmprestimoStatus = 'ATIVO' | 'QUITADO' | 'CANCELADO';
export type EmprestimoParcelaStatus = 'PENDENTE' | 'PAGO' | 'VENCIDO' | 'CANCELADO';
export type EmprestimoRateioStatus = EmprestimoParcelaStatus;
export type EmprestimoFormaPagamento = 'PIX' | 'TED' | 'DINHEIRO' | 'BOLETO';
export type EmprestimoStatusScope = 'TODOS' | 'ATIVOS' | 'FINALIZADOS';
/**
 * `SEM_RATEIO` representa um contrato próprio de um polo. Não cria custo,
 * conta a pagar ou baixa em nenhuma outra unidade.
 */
export type EmprestimoRateioModo = 'TODOS' | 'SELECIONADOS' | 'SEM_RATEIO';

export interface EmprestimoContaCredito {
  id: string;
  banco: string;
  titular: string;
  agencia: string;
  conta: string;
  natureza?: 'BANCARIA' | 'CAIXA_INTERNO';
}

export interface EmprestimoParcelaRateio {
  id: string;
  poloId: string;
  poloNome: string;
  valorPrincipal: number;
  valorEncargos: number;
  valorTotal: number;
  /** Valor efetivamente desembolsado no polo após os ajustes da baixa. */
  valorPago?: number;
  status: EmprestimoRateioStatus;
}

export interface EmprestimoParcela {
  id: string;
  numero: number;
  dataVencimento: string;
  valorPrincipal: number;
  valorEncargos: number;
  valorTotal: number;
  status: EmprestimoParcelaStatus;
  dataPagamento?: string;
  valorPago?: number;
  /** Ajustes auditáveis da baixa; não alteram os valores contratados acima. */
  jurosValor?: number;
  multaValor?: number;
  descontoValor?: number;
  observacaoBaixa?: string;
  contaPagarId?: string;
  rateios: EmprestimoParcelaRateio[];
}

export interface EmprestimoFinanceiro {
  id: string;
  /**
   * O banco mantém a coluna legada `polo_matriz_id`, mas o contrato pode
   * pertencer a um polo comum quando o modo é `SEM_RATEIO`.
   */
  poloResponsavelId: string;
  poloResponsavelNome?: string;
  poloResponsavelIsMatriz: boolean;
  rateioModo: EmprestimoRateioModo;
  /** Parceiro PJ de categoria BANCO que originou o contrato, quando canônico. */
  credorParceiroId?: string;
  credorNome: string;
  descricao: string;
  valorLiberado: number;
  valorTotalDivida: number;
  valorEncargos: number;
  /** Total líquido de parcelas efetivamente baixadas, devolvido pelo backend. */
  valorPago?: number;
  /** Total de parcelas abertas/vencidas, devolvido pelo backend. */
  valorPendente?: number;
  dataLiberacao: string;
  /** Conta física/caixa em que o crédito do contrato foi registrado. */
  contaCredito?: EmprestimoContaCredito;
  totalParcelas: number;
  status: EmprestimoStatus;
  observacao?: string;
  cancelamentoMotivo?: string;
  canceladoEm?: string;
  estornadoEm?: string;
  /** Sinalização devolvida pelo backend para orientar a ação auditável. */
  possuiBaixa: boolean;
  /**
   * Polos devolvidos canonicamente pelo RPC (ou derivados dos rateios das
   * parcelas na listagem). É metadado de escopo de cache, não um cálculo do
   * frontend.
   */
  rateioPoloIds: string[];
  parcelas: EmprestimoParcela[];
}

export interface CriarEmprestimoInput {
  requestId: string;
  poloResponsavelId: string;
  /** O backend valida que este parceiro é PJ, está ativo e pertence à categoria BANCO. */
  credorParceiroId: string;
  descricao: string;
  valorLiberado: number;
  valorTotalDivida: number;
  dataLiberacao: string;
  dataPrimeiroVencimento: string;
  totalParcelas: number;
  intervaloMeses: number;
  contaCreditoId: string;
  formaCredito: EmprestimoFormaPagamento;
  rateioModo: EmprestimoRateioModo;
  poloIds?: string[];
  observacao?: string;
}

export interface BaixarEmprestimoParcelasInput {
  emprestimoId: string;
  parcelaIds: string[];
  poloResponsavelId: string;
  requestId: string;
  contaBancariaId: string;
  dataPagamento: string;
  formaPagamento: EmprestimoFormaPagamento;
  jurosValor: number;
  multaValor: number;
  descontoValor: number;
  observacao?: string;
}

export interface BaixarEmprestimoParcelasResult {
  emprestimoId: string;
  status: EmprestimoStatus;
  parcelaIds: string[];
  valorBase: number;
  jurosValor: number;
  multaValor: number;
  descontoValor: number;
  valorPago: number;
  replayed: boolean;
}

export interface CancelarOuEstornarEmprestimoInput {
  emprestimoId: string;
  poloResponsavelId: string;
  requestId: string;
  motivo: string;
  confirmarEstorno: boolean;
}

export interface CancelarOuEstornarEmprestimoResult {
  emprestimoId: string;
  status: EmprestimoStatus;
  estornado: boolean;
  replayed: boolean;
}

export interface EmprestimosExportSnapshot {
  issuedAt: string;
  statusScope: EmprestimoStatusScope;
  total: number;
  polo: Record<string, unknown>;
  company: Record<string, unknown>;
  items: EmprestimoFinanceiro[];
}
