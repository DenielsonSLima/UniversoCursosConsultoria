import { getMaceioIsoDate } from '../../../technicalClassDates';
import {
  isExternalTransferMoney, isExternalTransferRate, isTransferDate, type ExternalTransferScheduleItem,
} from './external-transfer.contract';

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

export const externalTransferScheduleItemError = (
  item: ExternalTransferScheduleItem,
  today = getMaceioIsoDate(),
): string | null => {
  if (!isExternalTransferMoney(item.valor) || Number(item.valor) <= 0) return 'Informe um valor positivo para esta cobrança.';
  if (!isTransferDate(item.vencimento) || item.vencimento < today) return 'Informe um vencimento válido, sem data passada.';
  if (!isExternalTransferMoney(item.descontoPontualidade) || Number(item.descontoPontualidade) >= Number(item.valor)) return 'O desconto deve ser válido e menor que o valor desta cobrança.';
  if (!isExternalTransferRate(item.multaAtrasoPercentual)) return 'A multa desta cobrança deve ficar abaixo de 100%.';
  if (!isExternalTransferRate(item.jurosAtrasoPercentual)) return 'Os juros desta cobrança devem ficar abaixo de 100%.';
  return null;
};
