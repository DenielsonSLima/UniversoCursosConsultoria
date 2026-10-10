export const parseExternalTransferDecimal = (value: string, percentage = false): string | null => {
  let clean = value.replace(/R\$/gi, '').replace(/\s/g, '').trim();
  if (!clean || /[^\d.,]/.test(clean)) return null;
  if (percentage) {
    if (!/^\d{1,3}(?:[.,]\d{0,6})?$/.test(clean)) return null;
    clean = clean.replace(',', '.');
    const [integer, fraction = ''] = clean.split('.');
    return `${integer.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(6, '0')}`;
  }
  if (clean.includes(',')) {
    if (!/^\d+(?:\.\d{3})*(?:,\d{0,2})?$/.test(clean)) return null;
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(clean)) clean = clean.replace(/\./g, '');
  if (!/^\d+(?:\.\d{0,2})?$/.test(clean)) return null;
  const [integer, fraction = ''] = clean.split('.');
  return `${integer.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(2, '0')}`;
};

export const formatExternalTransferDecimal = (value: string, percentage = false): string => {
  if (!/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) return value;
  return Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: percentage ? 0 : 2,
    maximumFractionDigits: percentage ? 6 : 2,
  });
};
export const externalTransferMoney = (value: string): string => `R$ ${formatExternalTransferDecimal(value)}`;
export const externalTransferDate = (value: string): string => value.split('-').reverse().join('/');
