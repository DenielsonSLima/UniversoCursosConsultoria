export function recipientDocumentLabel(value?: string | null): string {
  const digits = value?.replace(/\D/g, '') ?? '';
  if (digits.length === 11) return `CPF ${digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}`;
  if (digits.length === 14) return `CNPJ ${digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}`;
  return 'CPF/CNPJ não informado';
}

export function recipientLocationLabel(city?: string | null, state?: string | null): string {
  const name = city?.trim();
  const uf = state?.trim().toUpperCase();
  if (!name) return 'Cidade/UF não informada';
  return uf && /^[A-Z]{2}$/.test(uf) ? `${name} / ${uf}` : `${name} · UF não informada`;
}
