import type {
  AlunoEadPaymentMethod,
  AlunoFinancialItem,
  AlunoFinancialModalityAccent,
} from './financeiro.types.ts';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const modalityAccents: Record<string, AlunoFinancialModalityAccent> = {
  DISCIPLINA: {
    line: 'border-l-cyan-500',
    group: 'bg-cyan-50/80 text-cyan-800 border-cyan-100',
    card: 'border-cyan-100 bg-cyan-50/25',
    action: 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-cyan-600/20',
    soft: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  },
  EAD: {
    line: 'border-l-sky-500',
    group: 'bg-sky-50/80 text-sky-800 border-sky-100',
    card: 'border-sky-100 bg-sky-50/25',
    action: 'bg-sky-600 hover:bg-sky-700 text-white shadow-sky-600/20',
    soft: 'bg-sky-50 text-sky-700 border-sky-100',
  },
  TECNICO: {
    line: 'border-l-violet-500',
    group: 'bg-violet-50/80 text-violet-800 border-violet-100',
    card: 'border-violet-100 bg-violet-50/25',
    action: 'bg-violet-600 hover:bg-violet-700 text-white shadow-violet-600/20',
    soft: 'bg-violet-50 text-violet-700 border-violet-100',
  },
  LIVRE: {
    line: 'border-l-emerald-500',
    group: 'bg-emerald-50/80 text-emerald-800 border-emerald-100',
    card: 'border-emerald-100 bg-emerald-50/25',
    action: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20',
    soft: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  },
  ESPECIALIZACAO: {
    line: 'border-l-amber-500',
    group: 'bg-amber-50/80 text-amber-800 border-amber-100',
    card: 'border-amber-100 bg-amber-50/25',
    action: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20',
    soft: 'bg-amber-50 text-amber-700 border-amber-100',
  },
  OUTROS: {
    line: 'border-l-slate-400',
    group: 'bg-slate-50 text-slate-700 border-slate-100',
    card: 'border-slate-100 bg-slate-50/30',
    action: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20',
    soft: 'bg-slate-50 text-slate-700 border-slate-100',
  },
};

export const formatAlunoFinancialCurrency = (value: number) => (
  currencyFormatter.format(value)
);

export const formatAlunoFinancialDate = (value?: string | null) => {
  if (!value) return '—';
  const date = value.slice(0, 10).split('-');
  return date.length === 3 ? `${date[2]}/${date[1]}/${date[0]}` : value;
};

export const formatAlunoPaymentMethod = (value?: string | null) => (
  String(value || '').trim() || 'Forma não informada'
);

export const getAlunoFinancialModalityAccent = (modality: string) => (
  modalityAccents[modality] || modalityAccents.OUTROS
);

export const getAlunoFinancialModalityLabel = (modality: string) => ({
  DISCIPLINA: 'Disciplina',
  EAD: 'EAD',
  TECNICO: 'Técnico',
  LIVRE: 'Livre',
  ESPECIALIZACAO: 'Especialização',
  OUTROS: 'Outros',
}[modality] || 'Outros');

export const getAlunoFinancialModalityClassName = (modality: string) => ({
  DISCIPLINA: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  EAD: 'bg-sky-50 text-sky-700 border-sky-100',
  TECNICO: 'bg-violet-50 text-violet-700 border-violet-100',
  LIVRE: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  ESPECIALIZACAO: 'bg-amber-50 text-amber-700 border-amber-100',
  OUTROS: 'bg-slate-50 text-slate-700 border-slate-100',
}[modality] || 'bg-slate-50 text-slate-700 border-slate-100');

export const normalizeAlunoEadPaymentMethod = (
  value?: string | null,
): AlunoEadPaymentMethod => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'BOLETO') return 'BOLETO';
  if (['CARTAO', 'CARTÃO', 'CREDIT_CARD'].includes(normalized)) return 'CREDIT_CARD';
  return 'PIX';
};

export const isAlunoPaidThroughAsaas = (item: AlunoFinancialItem) => (
  item.statusCode === 'PAGO' && (
    String(item.origem_pagamento || '').toUpperCase() === 'ASAAS'
    || ['RECEIVED', 'CONFIRMED'].includes(String(item.asaas_status || '').toUpperCase())
    || Boolean(item.asaas_transaction_receipt_url)
  )
);

export const alunoFinancialErrorMessage = (error: unknown) => {
  const code = error instanceof Error ? error.message : '';
  if (code === 'ALUNO_FINANCE_RECEIPT_UNAVAILABLE') {
    return 'Não foi possível preparar o recibo oficial. Tente novamente ou procure a instituição.';
  }
  return 'Não foi possível carregar o Financeiro do Aluno. Verifique sua conexão e tente novamente.';
};

const safeEadPaymentMessages = new Set([
  'O gateway não retornou o link do checkout do cartão.',
  'O Banese registrou a cobrança, mas não retornou a rota autenticada do boleto.',
  'O navegador bloqueou a nova aba do boleto.',
]);

export const alunoEadPaymentErrorMessage = (
  error: unknown,
  context: 'CHECKOUT' | 'BOLETO',
) => {
  const message = error instanceof Error ? error.message.trim() : '';
  if (safeEadPaymentMessages.has(message)) return message;
  return context === 'BOLETO'
    ? 'Não foi possível abrir o boleto Banese.'
    : 'Não foi possível preparar o pagamento EAD.';
};
