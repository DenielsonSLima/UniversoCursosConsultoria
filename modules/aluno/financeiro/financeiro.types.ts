export type AlunoFinancialStatus = 'ABERTO' | 'ATRASADO' | 'PAGO' | 'TODOS';
export type AlunoFinancialModality =
  | 'TODOS'
  | 'DISCIPLINA'
  | 'EAD'
  | 'TECNICO'
  | 'LIVRE'
  | 'ESPECIALIZACAO'
  | 'OUTROS';
export type AlunoFinancialViewMode = 'table' | 'cards';
export type AlunoEadPaymentMethod = 'PIX' | 'BOLETO' | 'CREDIT_CARD';

export interface AlunoFinancialFilters {
  search: string;
  startDate: string;
  endDate: string;
  modality: AlunoFinancialModality;
  status: AlunoFinancialStatus;
  page: number;
  pageSize: number;
}

export interface AlunoFinancialSummary {
  baseValue: number;
  paidValue: number;
  punctualDiscount: number;
  totalUntilDue: number;
  interestPercent: number;
  interestValue: number;
  lateFeeValue: number;
  totalWithLate: number;
  highlightValue: number;
  highlightLabel: string;
  hasDiscount: boolean;
  hasLateCharge: boolean;
  canLateCharge: boolean;
}

export interface AlunoFinancialItem {
  id: string;
  cliente_id: string | null;
  matricula_id: string | null;
  turma_id: string | null;
  polo_id: string | null;
  descricao: string;
  categoria: string;
  tipo_lancamento: string | null;
  parcela_numero: number | null;
  valor: number;
  valor_pago: number;
  valueOutstanding: number;
  data_vencimento: string | null;
  data_pagamento: string | null;
  status: string;
  statusCode: string;
  statusLabel: string;
  isOverdue: boolean;
  receiptEligible: boolean;
  forma_pagamento: string | null;
  origem_pagamento: string | null;
  modalidade: Exclude<AlunoFinancialModality, 'TODOS'> | string;
  cursoId: string | null;
  cursoNome: string;
  turmaNome: string;
  chargeKind: string;
  isIsolatedDependency: boolean;
  asaas_invoice_url: string | null;
  asaas_status: string | null;
  asaas_transaction_receipt_url: string | null;
  gateway_provider: string | null;
  gateway_environment: string | null;
  gateway_payment_method: string | null;
  gateway_payment_id: string | null;
  gateway_status: string | null;
  gateway_bank_slip_url: string | null;
  gateway_invoice_url: string | null;
  gateway_boleto_linha_digitavel: string | null;
  gateway_boleto_codigo_barras: string | null;
  gateway_boleto_nosso_numero: string | null;
  turmas: Record<string, unknown> | null;
  parceiros: {
    nome?: string | null;
    cpf_cnpj?: string | null;
    documentMasked?: string | null;
  } | null;
  financialSummary: AlunoFinancialSummary;
  financial_summary: AlunoFinancialSummary;
  modalityAccent: AlunoFinancialModalityAccent;
}

export interface AlunoFinancialModalityAccent {
  line: string;
  group: string;
  card: string;
  action: string;
  soft: string;
}

export interface AlunoFinancialListPayload {
  items: AlunoFinancialItem[];
  summary: {
    totalPaid: number;
    totalPending: number;
    recordCount: number;
    openByModality: Array<{
      modality: string;
      count: number;
      total: number;
    }>;
  };
  filters: {
    counts: Record<AlunoFinancialStatus, number>;
  };
  pagination: {
    currentPage: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface AlunoFinancialReceiptPayload {
  model: {
    key: 'recibo';
    source: 'MODELO_RECIBO_PADRAO';
    revision: number;
    orientation: 'portrait';
    documentKind: 'RECIBO_PAGAMENTO_ALUNO';
  };
  receipt: {
    id: string;
    receiptNumber: string;
    title: string;
    statusCode: 'PAGO';
    statusLabel: string;
    description: string;
    category: string;
    payerName: string;
    payerDocument: string | null;
    courseLabel: string;
    valueExpected: number;
    valuePaid: number;
    valueOutstanding: number;
    dueDate: string | null;
    dueDateLabel: string;
    paidAt: string | null;
    paidAtLabel: string;
    paymentMethod: string;
    poloName: string;
    poloLocation: string;
    declaration: string;
    footerNote: string;
    emittedAt: string;
    emittedAtLabel: string;
  };
  institution: {
    id: string;
    name: string;
    cnpj: string | null;
    address: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    phone: string | null;
    email: string | null;
    isHeadquarters: boolean;
    unitName: string;
    logoUrl: string | null;
  };
  watermark: {
    enabled: boolean;
    label: string;
    imageUrl: string | null;
    opacity: number;
    scale: number;
    rotate: boolean;
    source: 'CONFIGURACAO_POLO' | 'FALLBACK_MODELO_RECIBO';
  };
}
