/** Display registration fields only; never infer missing identity or location. */
export function formatNfseStudentCpf(value?: string | null): string {
  const cpf = value?.trim();
  if (!cpf) return 'CPF não informado';
  if (!/^[\d.\s-]+$/.test(cpf)) return 'CPF inválido';
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return 'CPF inválido';
  return `CPF ${digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}`;
}

export function formatNfseStudentLocation(city?: string | null, state?: string | null): string {
  const cityLabel = city?.trim();
  const stateLabel = state?.trim().toUpperCase();
  if (!cityLabel && !stateLabel) return 'Cidade/UF não informadas';
  return `${cityLabel || 'Cidade não informada'} / ${stateLabel || 'UF não informada'}`;
}
