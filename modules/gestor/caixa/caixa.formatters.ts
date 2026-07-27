export const formatCaixaCurrency = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(value);

export const formatCaixaCompetencia = (competencia: string) => {
  if (!competencia) return '';
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${competencia}T12:00:00`));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};

export const formatCaixaDate = (value: string | null) => {
  if (!value) return 'Não informada';
  const [date] = value.split('T');
  const [year, month, day] = date.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

export const formatCaixaDateTime = (value: string | null) => {
  if (!value) return 'Sem movimentação no período';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
};

export const formatCaixaInstallment = (
  number: number | null,
  total: number | null,
  entryType?: string,
) => {
  if (!number) {
    if (entryType === 'MATRICULA') return 'Matrícula';
    if (entryType === 'REMATRICULA') return 'Rematrícula';
    return 'À vista / parcela única';
  }
  return total && total >= number ? `Parcela ${number}/${total}` : `Parcela ${number}`;
};
