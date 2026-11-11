import type { NfseDocumentFilters } from '../types/nfse.types';
import { NfseContractError } from './nfse.errors';
import { oneOf, string } from './nfse.validation';

const date = (value?: string) => {
  if (!value) return null;
  if (!/^(19[0-9]{2}|20[0-9]{2}|21[0-9]{2})-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new NfseContractError();
  return value;
};
export function nfseDocumentFilterArgs(filters: NfseDocumentFilters) {
  const from = date(filters.dateFrom), to = date(filters.dateTo), courseType = filters.courseType ? string(filters.courseType).trim() : null;
  if (from && to && from > to || courseType && courseType.length > 100) throw new NfseContractError();
  return { p_date_from: from, p_date_to: to, p_course_type: courseType || null,
    p_origin: filters.origin ? oneOf(filters.origin, ['ALUNO', 'SERVICO']) : null };
}
