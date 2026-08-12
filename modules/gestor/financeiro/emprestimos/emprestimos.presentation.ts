import type {
  EmprestimoContaCredito,
  EmprestimoFinanceiro,
  EmprestimoParcela,
} from './emprestimos.types';

export const formatEmprestimoCurrency = (value: number) => (
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
);

export const formatEmprestimoDate = (value?: string) => (
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : '—'
);

/** A UI só organiza a identidade da conta devolvida pelo backend. */
export const formatEmprestimoContaCredito = (conta?: EmprestimoContaCredito) => {
  if (!conta) return 'Conta não retornada';
  const identity = [conta.banco, conta.titular].filter(Boolean).join(' • ');
  const details = [
    conta.agencia ? `Ag. ${conta.agencia}` : '',
    conta.conta ? `Conta ${conta.conta}` : '',
  ].filter(Boolean).join(' • ');
  return [identity, details].filter(Boolean).join(' — ') || 'Conta não retornada';
};

export const emprestimoStatusClass = (status: string) => {
  if (status === 'PAGO' || status === 'QUITADO') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'VENCIDO') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (status === 'CANCELADO') return 'border-slate-200 bg-slate-100 text-slate-500';
  return 'border-amber-200 bg-amber-50 text-amber-700';
};

export const emprestimoStatusLabel = (status: string) => (
  status === 'QUITADO' ? 'Quitado' : status.charAt(0) + status.slice(1).toLowerCase()
);

export const getEmprestimoOpenParcelas = (emprestimo: EmprestimoFinanceiro) => (
  emprestimo.parcelas.filter((parcela) => (
    parcela.status === 'PENDENTE' || parcela.status === 'VENCIDO'
  ))
);

export const getEmprestimoNextParcela = (emprestimo: EmprestimoFinanceiro): EmprestimoParcela | null => (
  getEmprestimoOpenParcelas(emprestimo)[0] || null
);
