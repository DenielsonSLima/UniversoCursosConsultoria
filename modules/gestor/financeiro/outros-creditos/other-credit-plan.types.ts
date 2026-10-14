import type { BanesePaymentRecord } from '../../../aluno/financeiro/banese/banese-payment.types';

export type OtherCreditPlanRole = 'PARCELA' | 'MATRICULA' | 'REMATRICULA';
export type OtherCreditPlanPeriodicity = 'MENSAL_CALENDARIO' | 'DIAS_CORRIDOS_30';
export type OtherCreditPlanConditionsInput = {
  jurosMensalPercentual: number;
  multaPercentual: number;
  descontoTipo: 'FIXO' | 'PERCENTUAL';
  descontoValor: number;
  descontoDiasAntecedencia: number;
};
export type OtherCreditPlanFeeInput = { valor: number; vencimento: string; condicoes?: OtherCreditPlanConditionsInput };
export type OtherCreditPlanFinancialTerms = {
  nominalAmount: number;
  dueDate: string;
  discount: { type: 'fixed' | 'percentage'; value: number; validUntil: string } | null;
  penalty: { type: 'fixed' | 'percentage'; value: number; startsOn: string } | null;
  interest: { type: 'daily-fixed' | 'monthly-percentage'; value: number; startsOn: string } | null;
};
export type OtherCreditPlanInput = {
  clienteId: string;
  descricao: string;
  categoriaFinanceiraId?: string | null;
  quantidadeParcelas: number;
  valorParcela: number;
  primeiroVencimento: string;
  periodicidade?: OtherCreditPlanPeriodicity;
  parcelasPersonalizadas?: { numero: number; valor: number; vencimento: string }[];
  jurosMensalPercentual: number;
  multaPercentual: number;
  descontoTipo: 'FIXO' | 'PERCENTUAL';
  descontoValor: number;
  descontoDiasAntecedencia: number;
  matricula: OtherCreditPlanFeeInput | null;
  rematricula: OtherCreditPlanFeeInput | null;
};

export type OtherCreditPlanPreview = {
  versao: 1;
  input: OtherCreditPlanInput;
  quantidadeParcelas: number;
  totalParcelas: number;
  totalTaxas: number;
  totalNominal: number;
  totalComDesconto: number;
  parcelas: {
    ordem: number;
    papel: OtherCreditPlanRole;
    numero: number;
    valor: number;
    dataVencimento: string;
    financialTerms: OtherCreditPlanFinancialTerms;
    valorComDesconto: number;
  }[];
};

export type OtherCreditPlanReceivable = Omit<BanesePaymentRecord, 'gateway_financial_terms'> & {
  payment_summary?: import('../settlements/financial-payment.summary.ts').FinancialPaymentSummary;
  outros_creditos_papel?: OtherCreditPlanRole;
  gateway_submission_status?: string | null;
  gateway_financial_terms?: OtherCreditPlanFinancialTerms | null;
  gateway_financial_terms_confirmed_at?: string | null;
};

export type OtherCreditPlan = {
  plano: {
    id: string;
    polo_id: string;
    cliente_id: string;
    cliente_nome?: string;
    descricao: string;
    categoria_financeira_id?: string | null;
    input: OtherCreditPlanInput;
    preview: OtherCreditPlanPreview;
    created_at: string;
  };
  receivables: OtherCreditPlanReceivable[];
  replayed?: boolean;
};

export type OtherCreditPlanProgress = { done: number; total: number };
