export type FinancialPaymentSourceKind = 'RECEIVABLE' | 'EXPENSE' | 'PAYABLE';
export type FinancialPaymentMethod = 'DINHEIRO' | 'PIX' | 'CARTAO' | 'BOLETO' | 'TED';
export type FinancialPaymentComponent = {
  accountId: string;
  method: FinancialPaymentMethod;
  amount: string;
  accountName?: string;
};
export type FinancialPaymentInput = {
  requestId: string;
  sourceId: string;
  paymentDate: string;
  components: FinancialPaymentComponent[];
  interest: string;
  penalty: string;
  addition: string;
  discount: string;
  notes: string;
};
export type FinancialPaymentConfirmation = { input: FinancialPaymentInput; fingerprint: string };
export type FinancialPaymentPreview = {
  sourceKind: FinancialPaymentSourceKind;
  sourceId: string;
  originalAmount: string;
  previouslyPaid: string;
  remainingBefore: string;
  paymentAmount: string;
  principalPaid: string;
  discount: string;
  interest: string;
  penalty: string;
  addition: string;
  remainingAfter: string;
  status: 'PAGO' | 'PENDENTE' | 'VENCIDO';
  components: FinancialPaymentComponent[];
  fingerprint: string;
  requiresRemoteCancellation?: boolean;
};
export type FinancialPaymentResult = {
  success: true;
  paymentId: string;
  replayed: boolean;
  preview: FinancialPaymentPreview;
  academicSyncWarning?: string | null;
};
export type FinancialPaymentHistoryEntry = {
  id: string;
  paymentDate: string;
  paymentAmount: string;
  principalPaid: string;
  discount: string;
  interest: string;
  penalty: string;
  addition: string;
  remainingAfter?: string;
  components: FinancialPaymentComponent[];
  actorName?: string;
  createdAt?: string;
  reversedAt?: string | null;
  notes?: string;
};
export type FinancialPaymentHistory = {
  summary: {
    originalAmount: string;
    previouslyPaid: string;
    remainingBefore: string;
    status: string;
    hasEvents: boolean;
  };
  events: FinancialPaymentHistoryEntry[];
};
