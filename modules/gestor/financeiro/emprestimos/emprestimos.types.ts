export type EmprestimoStatus = 'ATIVO' | 'QUITADO' | 'CANCELADO';
export type EmprestimoParcelaStatus = 'PENDENTE' | 'PAGO' | 'VENCIDO' | 'CANCELADO';
export type EmprestimoRateioStatus = EmprestimoParcelaStatus;
export type EmprestimoFormaPagamento = 'PIX' | 'TED' | 'DINHEIRO' | 'BOLETO';
/**
 * `SEM_RATEIO` representa um contrato próprio de um polo. Não cria custo,
 * conta a pagar ou baixa em nenhuma outra unidade.
 */
export type EmprestimoRateioModo = 'TODOS' | 'SELECIONADOS' | 'SEM_RATEIO';

export interface EmprestimoParcelaRateio {
  id: string;
  poloId: string;
  poloNome: string;
  valorPrincipal: number;
  valorEncargos: number;
  valorTotal: number;
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
  credorNome: string;
  descricao: string;
  valorLiberado: number;
  valorTotalDivida: number;
  valorEncargos: number;
  dataLiberacao: string;
  totalParcelas: number;
  status: EmprestimoStatus;
  observacao?: string;
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
  credorNome: string;
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

export interface BaixarEmprestimoParcelaInput {
  parcelaId: string;
  poloResponsavelId: string;
  requestId: string;
  contaBancariaId: string;
  dataPagamento: string;
  formaPagamento: EmprestimoFormaPagamento;
}

export interface BaixarEmprestimoParcelaResult {
  id: string;
  status: EmprestimoParcelaStatus;
  valorPago: number;
  replayed: boolean;
}
