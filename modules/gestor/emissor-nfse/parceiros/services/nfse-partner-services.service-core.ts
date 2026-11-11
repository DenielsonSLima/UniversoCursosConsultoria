import type { NfseScope } from '../../types/nfse.types';
import type { NfseRpcTransport } from '../../services/nfse.service-core';
import { assertScope, integer, unwrapNfseEnvelope } from '../../services/nfse.validation';
import { NfseContractError } from '../../services/nfse.errors';
import { NFSE_PARTNER_SERVICE_PAGE_SIZE, type NfsePartnerServiceInput } from '../types/nfse-partner-services.types';
import { nfsePartnerServiceDefinition, parseNfsePartnerServiceOptions, parseNfsePartnerServiceSaved, parseNfsePartnerServicesPage, parseNfseServicePartnerSearch, partnerServiceUuid } from './nfse-partner-services.contract';

export function createNfsePartnerServices(transport: NfseRpcTransport) {
  const call = async (name: string, scope: NfseScope, args: Record<string, unknown>, signal?: AbortSignal) => {
    assertScope(scope); partnerServiceUuid(scope.contextKey);
    return unwrapNfseEnvelope(await transport(name, { p_context_key: scope.contextKey, p_polo_id: scope.poloId,
      p_environment: scope.environment, p_month: scope.month, ...args }, signal), scope);
  };
  return {
    async searchPartners(scope: NfseScope, term: string, selectedId?: string | null, signal?: AbortSignal) {
      const search = term.trim();
      if (search.length > 100) throw new NfseContractError();
      if (!selectedId && search.length < 2) return [];
      return parseNfseServicePartnerSearch(await call('search_nfse_service_partners_secure', scope,
        { p_search: search, p_partner_id: selectedId ? partnerServiceUuid(selectedId) : null }, signal));
    },
    async options(scope: NfseScope, signal?: AbortSignal) {
      return parseNfsePartnerServiceOptions(await call('get_nfse_partner_service_options_secure', scope, {}, signal));
    },
    async list(scope: NfseScope, page: number, signal?: AbortSignal) {
      integer(page, 1);
      return parseNfsePartnerServicesPage(await call('get_nfse_partner_services_secure', scope,
        { p_page: page, p_page_size: NFSE_PARTNER_SERVICE_PAGE_SIZE }, signal), page);
    },
    async save(scope: NfseScope, input: NfsePartnerServiceInput) {
      const definition = nfsePartnerServiceDefinition(input);
      if (!definition.serviceDate.startsWith(`${scope.month}-`)) throw new NfseContractError();
      const saved = parseNfsePartnerServiceSaved(await call('save_nfse_partner_service_secure', scope,
        { p_request_id: partnerServiceUuid(input.requestId), p_definition: definition }));
      const expectedAction = definition.generateReceivable ? definition.existingReceivableId ? 'LINKED' : 'CREATED' : 'NONE';
      if (saved.receivableAction !== expectedAction
        || (definition.existingReceivableId && saved.receivableId !== definition.existingReceivableId)) throw new NfseContractError();
      return saved;
    },
  };
}
