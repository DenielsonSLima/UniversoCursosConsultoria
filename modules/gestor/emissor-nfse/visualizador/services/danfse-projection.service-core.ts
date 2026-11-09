import type { NfseRpcTransport } from '../../services/nfse.service-core';
import type { NfseScope } from '../../types/nfse.types';
import { assertScope, money, record, unwrapNfseEnvelope } from '../../services/nfse.validation';
import { NfseContractError } from '../../services/nfse.errors';
import type { DanfseComponents, DanfseProjection } from '../danfse.projection';

const amountNames = ['vDescIncond', 'vCalcReeRepRes', 'vISSQN', 'vPis', 'vCofins', 'vIBSTot', 'vCBS', 'vRetCSLL'] as const;

export function createDanfseProjectionService(transport: NfseRpcTransport) {
  return async (scope: NfseScope, components: DanfseComponents, signal?: AbortSignal): Promise<DanfseProjection> => {
    assertScope(scope);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scope.contextKey)) throw new NfseContractError();
    const payload: Record<string, string | boolean | null> = {};
    for (const key of amountNames) {
      const value = components[key];
      if (value !== null && (typeof value !== 'string' || !/^(?:0|0\.\d{2}|[1-9]\d{0,14}(?:\.\d{2})?)$/.test(value))) throw new NfseContractError();
      payload[key] = value;
    }
    if (components.tpRetPisCofins !== null && !/^[0-9]$/.test(components.tpRetPisCofins)) throw new NfseContractError();
    if (typeof components.hasIbsCbs !== 'boolean') throw new NfseContractError();
    payload.tpRetPisCofins = components.tpRetPisCofins;
    payload.hasIbsCbs = components.hasIbsCbs;
    const data = record(unwrapNfseEnvelope(await transport('get_nfse_danfse_projection_secure', {
      p_context_key: scope.contextKey, p_polo_id: scope.poloId,
      p_environment: scope.environment, p_month: scope.month, p_components: payload,
    }, signal), scope));
    return {
      exclusions: money(data.exclusions), totalIBSCBS: money(data.totalIBSCBS),
      socialRetentions: money(data.socialRetentions), pisOwn: money(data.pisOwn), cofinsOwn: money(data.cofinsOwn),
    };
  };
}
