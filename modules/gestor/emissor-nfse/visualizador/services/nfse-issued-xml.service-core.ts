import type { NfseDocument, NfseScope } from '../../types/nfse.types';
import type { NfseRpcTransport } from '../../services/nfse.service-core';
import { NfseContractError, NfseUnavailableError } from '../../services/nfse.errors';
import { assertScope, record, unwrapNfseEnvelope } from '../../services/nfse.validation';
import { DANFSE_XML_MAX_BYTES } from '../danfse.types';
import { parseDanfseXml } from '../danfse.xml';

/** Proposed server contract; only enable alongside the authorized-document ledger. */
export const NFSE_AUTHORIZED_XML_RPC = 'get_nfse_authorized_xml_secure';
export type IssuedNfseIdentity = Pick<NfseDocument, 'id' | 'status' | 'number' | 'accessKey'>;

export function createNfseIssuedArtifactService(
  transport: NfseRpcTransport, enabled = false, parse = parseDanfseXml,
) {
  return async (scope: NfseScope, selected: IssuedNfseIdentity, signal?: AbortSignal) => {
    assertScope(scope);
    if (!enabled) throw new NfseUnavailableError();
    if (selected.status !== 'EMITIDA' || typeof selected.id !== 'string' || !selected.id.trim()
      || selected.id.length > 128 || !/^\d{50}$/.test(selected.accessKey ?? '')
      || !/^\d{1,15}$/.test(selected.number ?? '')) throw new NfseContractError();
    signal?.throwIfAborted();
    const data = record(unwrapNfseEnvelope(await transport(NFSE_AUTHORIZED_XML_RPC, {
      p_context_key: scope.contextKey, p_polo_id: scope.poloId,
      p_environment: scope.environment, p_month: scope.month, p_document_id: selected.id,
    }, signal), scope));
    signal?.throwIfAborted();
    if (data.documentId !== selected.id || data.status !== 'EMITIDA'
      || data.accessKey !== selected.accessKey || data.number !== selected.number
      || typeof data.xml !== 'string' || !data.xml.trim()
      || typeof data.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(data.sha256)) throw new NfseContractError();
    const bytes = new TextEncoder().encode(data.xml);
    if (bytes.length > DANFSE_XML_MAX_BYTES) throw new NfseContractError();
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    signal?.throwIfAborted();
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== data.sha256) throw new NfseContractError();
    const document = parse(data.xml);
    if (document.accessKey !== selected.accessKey || document.number !== selected.number
      || document.environment !== (scope.environment === 'PRODUCAO' ? '1' : '2')) throw new NfseContractError();
    // Original XML is retained only by the on-demand export operation, never its query cache.
    return { document, xml: data.xml };
  };
}

export function createNfseIssuedXmlService(
  transport: NfseRpcTransport, enabled = false, parse = parseDanfseXml,
) {
  const read = createNfseIssuedArtifactService(transport, enabled, parse);
  return async (scope: NfseScope, selected: IssuedNfseIdentity, signal?: AbortSignal) =>
    (await read(scope, selected, signal)).document;
}
