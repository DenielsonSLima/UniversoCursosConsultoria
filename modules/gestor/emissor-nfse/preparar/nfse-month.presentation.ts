export const NFSE_MONTH_NAMES = Array.from({ length: 12 }, (_, index) => {
  const name = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2000, index, 1)));
  return name[0].toLocaleUpperCase('pt-BR') + name.slice(1);
});

export function formatNfseMonth(value: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return '';
  return `${NFSE_MONTH_NAMES[Number(value.slice(5, 7)) - 1]} de ${value.slice(0, 4)}`;
}
