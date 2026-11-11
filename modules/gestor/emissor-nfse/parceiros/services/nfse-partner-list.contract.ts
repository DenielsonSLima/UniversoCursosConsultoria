import { NfseContractError } from '../../services/nfse.errors';
import { integer, list, record, string } from '../../services/nfse.validation';
import type { NfseScope } from '../../types/nfse.types';
import type { NfsePartnerServiceFilters } from '../types/nfse-partner-services.types';
import { partnerServiceUuid } from './nfse-partner-services.contract';

export function validPartnerFilterDate(value: string) {
  return !value || /^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}
export function partnerServiceFilters(filters: NfsePartnerServiceFilters) {
  const search = string(filters.search, true).trim();
  if (search.length > 100 || !validPartnerFilterDate(filters.dateFrom) || !validPartnerFilterDate(filters.dateTo)
    || filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo
    || !['', 'PJ', 'PF', 'ALUNO'].includes(filters.partnerType)) throw new NfseContractError();
  return { p_search: search || null, p_date_from: filters.dateFrom || null, p_date_to: filters.dateTo || null,
    p_partner_type: filters.partnerType || null };
}
export interface NfsePartnerRemovalInput { requestId: string; serviceIds: string[] }
const serviceIds = (value: unknown) => {
  const ids = list(value, partnerServiceUuid).map(id => id.toLowerCase()).sort();
  if (!ids.length || ids.length > 100 || new Set(ids).size !== ids.length) throw new NfseContractError();
  return ids;
};
export function partnerRemovalInput(input: NfsePartnerRemovalInput) {
  return { p_request_id: partnerServiceUuid(input.requestId), p_service_ids: serviceIds(input.serviceIds) };
}
export function parsePartnerRemoval(value: unknown, expected: string[]) {
  const row = record(value), ids = serviceIds(row.serviceIds), removedCount = integer(row.removedCount, 1);
  if (removedCount !== ids.length || JSON.stringify(ids) !== JSON.stringify(serviceIds(expected))) throw new NfseContractError();
  return { id: partnerServiceUuid(row.id), serviceIds: ids, removedCount, message: string(row.message) };
}
/** A lost response is retried only by the user, using the original request. */
export function createPartnerRemovalAttempt(uuid: () => string = () => crypto.randomUUID()) {
  let previous: { key: string; input: NfsePartnerRemovalInput } | undefined;
  return (scope: NfseScope, selected: string[]) => {
    const ids = serviceIds(selected), key = JSON.stringify([scope.contextKey, scope.poloId, scope.environment, scope.month, ids]);
    if (previous?.key !== key) previous = { key, input: { requestId: uuid(), serviceIds: ids } };
    return { requestId: previous.input.requestId, serviceIds: [...previous.input.serviceIds] };
  };
}
