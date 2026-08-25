import type { ProfessorFinancialPayment } from './financeiro.types';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export const formatProfessorFinancialCurrency = (value: number) => (
  currencyFormatter.format(value)
);

export const formatProfessorFinancialDate = (value: string | null) => {
  if (!value) return '—';
  const date = value.slice(0, 10).split('-');
  return date.length === 3 ? `${date[2]}/${date[1]}/${date[0]}` : value;
};

export const professorFinancialPoloLocation = (payment: ProfessorFinancialPayment) => (
  [payment.polo.city, payment.polo.state].filter(Boolean).join(' - ')
);

export const professorFinancialErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('autentica') || message.includes('perfil') || message.includes('escopo')) {
    return 'Não foi possível confirmar seu acesso ao Financeiro Docente. Entre novamente ou procure a instituição.';
  }
  if (message.includes('recibo') || message.includes('modelo') || message.includes('marca d água')) {
    return 'Não foi possível preparar o recibo oficial. Tente novamente ou procure a instituição.';
  }
  return 'Não foi possível carregar o Financeiro Docente. Verifique sua conexão e tente novamente.';
};
