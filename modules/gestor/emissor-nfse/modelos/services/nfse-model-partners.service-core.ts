import type { NfseScope } from '../../types/nfse.types';
import type { NfseRpcTransport } from '../../services/nfse.service-core';
import { NfseContractError } from '../../services/nfse.errors';
import { assertScope, record, string, unwrapNfseEnvelope } from '../../services/nfse.validation';

export interface NfseModelPartnerOption { value: string; label: string }
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function createNfseModelPartnerService(transport: NfseRpcTransport) {
  return {
    async search(scope: NfseScope, query: string, selectedId?: string | null, signal?: AbortSignal): Promise<NfseModelPartnerOption[]> {
      assertScope(scope);
      const search = query.trim();
      if (!uuid(scope.contextKey) || search.length > 100 || (selectedId && !uuid(selectedId))) throw new NfseContractError();
      if (!selectedId && search.length < 2) return [];
      const envelope = await transport('search_nfse_model_partners_secure', {
        p_context_key: scope.contextKey, p_polo_id: scope.poloId, p_environment: scope.environment, p_month: scope.month,
        p_search: search, p_partner_id: selectedId || null,
      }, signal);
      const data = record(unwrapNfseEnvelope(envelope, scope));
      if (!Array.isArray(data.rows) || data.rows.length > 20 || data.page !== 1 || data.pageSize !== 20
        || data.totalItems !== data.rows.length) throw new NfseContractError();
      const options = data.rows.map(item => {
        const row = record(item), value = string(row.id), label = string(row.label);
        if (!uuid(value) || label.length > 300 || (selectedId && value !== selectedId)) throw new NfseContractError();
        return { value, label };
      });
      if (new Set(options.map(item => item.value)).size !== options.length) throw new NfseContractError();
      return options;
    },
  };
}
