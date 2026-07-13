export function onlyDigits(value?: string | null): string {
  return String(value || '').replace(/\D/g, '');
}

export function formatCpf(value?: string | null): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length !== 11) return value || '';

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function formatCnpj(value?: string | null): string {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length !== 14) return value || '';

  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function formatCpfCnpj(value?: string | null): string {
  const digits = onlyDigits(value);
  if (digits.length === 11) return formatCpf(digits);
  if (digits.length === 14) return formatCnpj(digits);

  return value || '';
}

export function formatPhone(value?: string | null): string {
  const digits = onlyDigits(value);
  const local = digits.startsWith('55') ? digits.slice(2) : digits;

  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;

  return value || 'Não cadastrado';
}
