import type { NationalHttpResponse } from '../_shared/nfse-national/mtls.ts';
import { parseFiscalJson } from '../_shared/nfse-national/pilot-codec.ts';
import { assertNationalEnvelope, readAccessKey } from '../_shared/nfse-national/pilot-response.ts';
import { NfseContractError } from '../_shared/nfse-national/xml.ts';
import { productionDpsJsonIdentityMatches } from '../_shared/nfse-national/production-json-identity.ts';
interface Transport { request(method: 'GET' | 'POST', path: string, body?: string): Promise<NationalHttpResponse> }
/** Independent hard gate: the background worker cannot mutate fiscal state remotely. */
export function fiscalReadOnlyTransport(transport: Transport, dpsId: string, accessKey?: string) {
  if (!/^DPS\d{42}$/.test(dpsId) || accessKey !== undefined && !/^\d{50}$/.test(accessKey)) throw new NfseContractError('WORKER_IDENTITY_INVALID');
  let resolvedKey = accessKey;
  return {
    async request(method: 'GET' | 'POST', path: string, body?: string): Promise<NationalHttpResponse> {
      const specification = path === '/swagger/docs/v1' || path === '/swagger/v1/swagger.json';
      const ownDps = path === `/dps/${dpsId}`;
      const ownNote = resolvedKey !== undefined && (path === `/nfse/${resolvedKey}` ||
        path === `/nfse/${resolvedKey}/eventos/101101/1` || path === `/nfse/${resolvedKey}/eventos`);
      if (method !== 'GET' || body !== undefined || !(specification || ownDps || ownNote)) throw new NfseContractError('WORKER_READ_ONLY_ROUTE');
      const response = await transport.request('GET', path);
      if (response.status === 429) throw new NfseContractError('WORKER_RATE_LIMITED');
      if (ownDps && response.status === 200) {
        const envelope = parseFiscalJson(response.body);
        assertNationalEnvelope(envelope, 'PRODUCAO');
        if (!productionDpsJsonIdentityMatches(envelope,dpsId)) throw new NfseContractError('WORKER_DPS_MISMATCH');
        const key = readAccessKey(envelope);
        if (resolvedKey !== undefined && resolvedKey !== key) throw new NfseContractError('WORKER_KEY_MISMATCH');
        resolvedKey = key;
      }
      return response;
    },
  };
}
