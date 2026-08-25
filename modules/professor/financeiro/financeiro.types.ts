export type ProfessorFinancialStatus = 'ABERTO' | 'ATRASADO' | 'PAGO' | 'TODOS';
export type ProfessorFinancialViewMode = 'cards' | 'table';

export interface ProfessorFinancialFilters {
  search: string;
  startDate: string;
  endDate: string;
  category: string;
  status: ProfessorFinancialStatus;
  page: number;
  pageSize: number;
}

export interface ProfessorFinancialPayment {
  id: string;
  description: string;
  category: string;
  valueExpected: number;
  valuePaid: number;
  valueOutstanding: number;
  dueDate: string | null;
  paymentDate: string | null;
  paymentMethod: string | null;
  statusCode: Exclude<ProfessorFinancialStatus, 'TODOS'> | string;
  statusLabel: string;
  receiptEligible: boolean;
  polo: {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
  };
}

export interface ProfessorFinancialListPayload {
  items: ProfessorFinancialPayment[];
  summary: {
    totalReceived: number;
    totalIncoming: number;
    recordCount: number;
  };
  filters: {
    categories: string[];
    counts: Record<ProfessorFinancialStatus, number>;
  };
  pagination: {
    currentPage: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface ProfessorFinancialReceiptPayload {
  model: {
    key: 'recibo';
    source: 'MODELO_RECIBO_PADRAO';
    revision: number;
    orientation: 'portrait';
    documentKind: 'RECIBO_HONORARIOS_PROFESSOR';
  };
  receipt: {
    id: string;
    receiptNumber: string;
    title: string;
    statusCode: 'PAGO';
    statusLabel: string;
    description: string;
    category: string;
    beneficiaryName: string;
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

export interface ProfessorFinancialReceiptRequest {
  professorId: string;
  poloId: string;
  paymentId: string;
}
