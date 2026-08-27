export const formatCaixaCurrency = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(value);

export const formatCaixaPercent = (value: number) => `${new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
}).format(value)}%`;

const CANONICAL_DECIMAL_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const SIGNED_CANONICAL_DECIMAL_PATTERN = /^-?\d+(?:\.\d{1,2})?$/;

export const isCaixaCanonicalDecimalText = (value: unknown): value is string => (
  typeof value === 'string' && CANONICAL_DECIMAL_PATTERN.test(value)
);

/**
 * A posição líquida pode ficar negativa, mas continua sendo devolvida pelo
 * backend como decimal textual para não perder precisão no navegador.
 */
export const isCaixaSignedCanonicalDecimalText = (value: unknown): value is string => (
  typeof value === 'string' && SIGNED_CANONICAL_DECIMAL_PATTERN.test(value)
);

/**
 * Formata o texto decimal canônico devolvido pelo banco sem convertê-lo para
 * `number`. Assim, valores acima do limite seguro do JavaScript preservam os
 * centavos exatos recebidos da RPC.
 */
export const formatCaixaCanonicalCurrency = (value: string) => {
  if (!isCaixaSignedCanonicalDecimalText(value)) return 'R$ 0,00';

  const isNegative = value.startsWith('-');
  const [integerPart, fractionPart = ''] = (isNegative ? value.slice(1) : value).split('.');
  const integer = BigInt(integerPart);
  const fraction = fractionPart.padEnd(2, '0');
  const groupedInteger = new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 0,
  }).format(integer);

  return `R$ ${isNegative ? '-' : ''}${groupedInteger},${fraction}`;
};

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
