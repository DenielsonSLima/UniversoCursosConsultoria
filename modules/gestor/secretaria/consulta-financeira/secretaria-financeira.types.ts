import type { SecretariaFinanceiraRecebivel } from './secretariaFinanceira.service';

export type FinanceMode = 'individual' | 'lote' | 'custom';

export type PaymentMethod = 'BOLETO' | 'PIX' | 'CARTAO' | 'DINHEIRO';

export type SettlementForm = {
  accountId: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  paidValue: string;
  interestValue: string;
  penaltyValue: string;
  discountValue: string;
  additionValue: string;
};

export type StudentDebtGroup = {
  key: string;
  alunoId?: string;
  alunoNome: string;
  alunoCpf: string;
  matricula: string;
  rows: SecretariaFinanceiraRecebivel[];
  total: number;
};

export type CourseDebtGroup = {
  key: string;
  cursoNome: string;
  modalidade: string;
  turmaNome: string;
  rows: SecretariaFinanceiraRecebivel[];
  students: StudentDebtGroup[];
  total: number;
};

export type CustomFinanceStudent = {
  id: string;
  nome: string;
  cpf: string;
  courses: Set<string>;
  total: number;
};
