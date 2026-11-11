import { createNationalRelayTransport, type HomologationRelayConfig } from '../_shared/nfse-national/relay.ts';
import { assertPreflightUrl, createPreflightTransport } from './transport.ts';
import type { PreflightMaterial, PreflightTransport } from './types.ts';

/** ADN works with native TLS. SEFIN requires the reviewed Node/OpenSSL channel. */
export function createCompositePreflightTransport(material: PreflightMaterial,
  config: HomologationRelayConfig): PreflightTransport {
  const native = createPreflightTransport(material.material);
  const relay = createNationalRelayTransport(config, material.material);
  return {
    close() { native.close(); relay.close(); },
    async get(raw) {
      const url = assertPreflightUrl(raw);
      if (url.origin !== 'https://sefin.producaorestrita.nfse.gov.br') return await native.get(raw);
      const path = url.pathname.slice('/API/SefinNacional'.length);
      const result = await relay.request('GET', path);
      return { status: result.status, body: new globalThis.TextDecoder().decode(result.body), tlsVerified: true };
    },
  };
}
