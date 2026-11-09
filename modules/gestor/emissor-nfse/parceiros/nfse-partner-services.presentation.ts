/** Input/output presentation only; all financial validation and totals are RPC-owned. */
export function nfsePartnerInputAmount(value: string): string {
  return value.replace(/\./g, '').replace(',', '.');
}

export function nfsePartnerAmountInput(value: string): string {
  const [integer, decimal = '00'] = value.split('.');
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decimal}`;
}

export function nfsePartnerDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export function nfsePartnerToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Maceio', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
