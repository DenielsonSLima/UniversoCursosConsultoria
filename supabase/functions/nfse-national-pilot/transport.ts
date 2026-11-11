import type { PreflightMaterial } from '../nfse-national-preflight/types.ts';
import { createNationalRelayTransport, type HomologationRelayConfig } from '../_shared/nfse-national/relay.ts';

/** SEFIN's TLS 1.2 renegotiation runs only in the pinned Node/OpenSSL executor. */
export function createPilotTransport(material: PreflightMaterial['material'], assertContract: () => void,
  config: HomologationRelayConfig) {
  return createNationalRelayTransport(config, material, { assertPostAllowed: assertContract });
}
