export const enrollmentStatusStyle: Record<string, string> = {
  ATIVO: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  TRANCADO: 'bg-amber-50 text-amber-700 border-amber-100',
  CANCELADO: 'bg-rose-50 text-rose-700 border-rose-100',
  DESISTENTE: 'bg-rose-50 text-rose-700 border-rose-100',
  TRANSFERIDO: 'bg-violet-50 text-violet-700 border-violet-100',
  CONCLUIDO: 'bg-blue-50 text-blue-700 border-blue-100',
};

export const formatEnrollmentDate = (value?: string | null) =>
  value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';

export const isValidEnrollmentCpf = (value?: string | null) => {
  const cpf = String(value || '').replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calcDigit = (slice: string, factor: number) => {
    const sum = slice.split('').reduce((total, digit) => total + Number(digit) * factor--, 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calcDigit(cpf.slice(0, 9), 10) === Number(cpf[9])
    && calcDigit(cpf.slice(0, 10), 11) === Number(cpf[10]);
};
