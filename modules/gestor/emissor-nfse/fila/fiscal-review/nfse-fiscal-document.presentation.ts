/** Display only: preserve incomplete documents and never change the fiscal payload. */
export function formatNfseFiscalDocument(value?: string | null): string {
  if (value == null) return '';
  if (!/^[\d.\s/-]+$/.test(value)) return value;

  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  return value;
}
