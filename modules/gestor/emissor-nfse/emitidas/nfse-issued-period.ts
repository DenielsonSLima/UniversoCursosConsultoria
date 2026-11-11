import { getNfseCurrentMonth } from '../types/nfse.scope';
import type { NfseDocumentFilters } from '../types/nfse.types';

export interface NfseIssuedPeriodFilters {
  search: string;
  dateFrom: string;
  dateTo: string;
  courseType: string;
  origin: '' | 'ALUNO' | 'SERVICO';
}

export function createNfseIssuedPeriod(month = getNfseCurrentMonth()): NfseIssuedPeriodFilters {
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : getNfseCurrentMonth();
  const [year, monthNumber] = validMonth.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { search: '', dateFrom: `${validMonth}-01`, dateTo: `${validMonth}-${lastDay}`, courseType: '', origin: '' };
}

export function nfseIssuedQueryFilters(filters: NfseIssuedPeriodFilters): NfseDocumentFilters {
  return { ...filters, search: filters.search.trim(), status: 'EMITIDA', issuedState: 'ACTIVE', page: 1 };
}
