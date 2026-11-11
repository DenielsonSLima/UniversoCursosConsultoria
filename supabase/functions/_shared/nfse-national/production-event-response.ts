import { decodeFiscalXml } from './pilot-codec.ts';
import { assertNationalEnvelope, parseNationalFiscalXml, nationalFiscalChild,
  nationalFiscalSemantic } from './pilot-response.ts';
import { NFSE_NAMESPACE, NfseContractError, requireContract } from './xml.ts';
import {decodeProductionEventArchive,productionEventArchiveItems} from './production-event-archive.ts';
import {matchProductionCancellationReasonRepresentation} from './production-event-representation.ts';
import type { PreparedProductionCancellation, ProductionEventEnvelopeContract,
  ProductionSchemaValidator, VerifiedProductionEvent } from './production.types.ts';

export function assertProductionEventEnvelopeContract(contract: ProductionEventEnvelopeContract) {
  requireContract(contract.responseMode === undefined || ['LIST', 'SINGLE_EVENT', 'ARCHIVE_DOUBLE_BASE64_GZIP'].includes(contract.responseMode), 'EVENT_JSON_CONTRACT_UNVERIFIED');
  const single = contract.responseMode === 'SINGLE_EVENT';
  const archive = contract.responseMode === 'ARCHIVE_DOUBLE_BASE64_GZIP';
  requireContract(!single || (contract.listProperty === null && contract.lookupSequence === '001'), 'EVENT_JSON_CONTRACT_UNVERIFIED');
  requireContract(!archive || (contract.listProperty === 'eventos' && contract.xmlProperty === 'arquivoXml' &&
    contract.eventIdProperty === null && contract.lookupSequence === '001'), 'EVENT_JSON_CONTRACT_UNVERIFIED');
  for (const name of [contract.requestProperty, contract.xmlProperty, ...(!single ? [contract.listProperty] : [])]) {
    requireContract(typeof name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,79}$/.test(name) &&
      !['constructor', 'prototype'].includes(name), 'EVENT_JSON_CONTRACT_UNVERIFIED');
  }
  requireContract(contract.eventIdProperty === null || /^[A-Za-z][A-Za-z0-9]{0,79}$/.test(contract.eventIdProperty),
    'EVENT_JSON_CONTRACT_UNVERIFIED');
}

export function assertProductionSingleEventEnvelope(envelope: Record<string, unknown>, error = false,
  optionalError = false): void {
  assertNationalEnvelope(envelope, 'PRODUCAO');
  requireContract(typeof envelope.versaoAplicativo === 'string' && envelope.versaoAplicativo.length > 0 && envelope.versaoAplicativo.length <= 255 &&
    typeof envelope.dataHoraProcessamento === 'string' && envelope.dataHoraProcessamento.length <= 80 &&
    /^\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(envelope.dataHoraProcessamento) &&
    Number.isFinite(Date.parse(envelope.dataHoraProcessamento)), 'EVENT_JSON_CONTRACT_UNVERIFIED');
  if (error && (!optionalError || Object.hasOwn(envelope, 'erro'))) {
    requireContract(envelope.erro !== null && typeof envelope.erro === 'object' && !Array.isArray(envelope.erro), 'EVENT_JSON_CONTRACT_UNVERIFIED');
    const detail = envelope.erro as Record<string, unknown>;
    for (const key of ['codigo', 'descricao', 'complemento']) {
      requireContract(!Object.hasOwn(detail, key) || typeof detail[key] === 'string', 'EVENT_JSON_CONTRACT_UNVERIFIED');
    }
  }
}

/** Explicit official API contract plus authenticated response profile; no encoding fallback. */
export async function readProductionEvents(envelope: Record<string, unknown>,
  contract: ProductionEventEnvelopeContract, prepared: PreparedProductionCancellation,
  schema: ProductionSchemaValidator): Promise<VerifiedProductionEvent[]> {
  assertProductionEventEnvelopeContract(contract);
  assertNationalEnvelope(envelope, 'PRODUCAO');
  const single = contract.responseMode === 'SINGLE_EVENT';
  const archive = contract.responseMode === 'ARCHIVE_DOUBLE_BASE64_GZIP';
  if (single || archive) assertProductionSingleEventEnvelope(envelope);
  const items = archive ? productionEventArchiveItems(envelope,prepared) : single ? [envelope] : envelope[contract.listProperty!];
  requireContract(Array.isArray(items) && items.length <= 1000, 'UNCONFIRMED_EVENT_LIST');
  const events: VerifiedProductionEvent[] = [];
  const ids = new Set<string>();
  for (const item of items) {
    requireContract(item !== null && typeof item === 'object' && !Array.isArray(item), 'UNCONFIRMED_EVENT_LIST');
    const xml = archive ? decodeProductionEventArchive(item[contract.xmlProperty]) : decodeFiscalXml(item[contract.xmlProperty]);
    try { await schema.validate(xml, 'evento_v1.01.xsd', 'PRODUCAO'); }
    catch { throw new NfseContractError('EVENT_XML_SCHEMA_INVALID'); }
    const root = parseNationalFiscalXml(xml).documentElement;
    requireContract(root.namespaceURI === NFSE_NAMESPACE && root.localName === 'evento' &&
      root.getAttribute('versao') === '1.01', 'EVENT_XML_ROOT_MISMATCH');
    const info = nationalFiscalChild(root, 'infEvento');
    const id = info.getAttribute('Id') || '';
    const match = id.match(/^EVT(\d{50})(\d{6})(\d{3})$/);
    requireContract(match, 'EVENT_XML_ID_FORMAT_MISMATCH');
    requireContract(match[1] === prepared.input.accessKey, 'EVENT_XML_ACCESS_KEY_MISMATCH');
    requireContract(!ids.has(id), 'EVENT_XML_DUPLICATE_ID');
    ids.add(id);
    const [, accessKey, code, sequence] = match;
    if (single || archive) {
      requireContract(code === prepared.input.eventCode, 'EVENT_XML_TYPE_MISMATCH');
      requireContract(sequence === contract.lookupSequence, 'EVENT_XML_SEQUENCE_MISMATCH');
    }
    const sequenceText = nationalFiscalChild(info, 'nSeqEvento').textContent || '';
    requireContract(/^\d{1,3}$/.test(sequenceText) && Number(sequenceText) === Number(sequence), 'EVENT_XML_SEQUENCE_VALUE_MISMATCH');
    requireContract(['1', '2', '3'].includes(nationalFiscalChild(info, 'ambGer').textContent || ''), 'EVENT_XML_GENERATOR_MISMATCH');
    if (contract.eventIdProperty !== null) requireContract(item[contract.eventIdProperty] === id,
      'EVENT_JSON_IDENTITY_MISMATCH');
    const request = nationalFiscalChild(info, 'pedRegEvento');
    const requestInfo = nationalFiscalChild(request, 'infPedReg');
    requireContract(requestInfo.getAttribute('Id') === `PRE${accessKey}${code}`, 'EVENT_XML_REQUEST_ID_MISMATCH');
    requireContract(nationalFiscalChild(requestInfo, 'chNFSe').textContent === accessKey, 'EVENT_XML_REQUEST_KEY_MISMATCH');
    requireContract(nationalFiscalChild(requestInfo, 'tpAmb').textContent === '1', 'EVENT_XML_ENVIRONMENT_MISMATCH');
    try { nationalFiscalChild(requestInfo, `e${code}`); }
    catch { throw new NfseContractError('EVENT_XML_TYPE_PAYLOAD_MISMATCH'); }
    let payloadEvidence;
    if (code === prepared.input.eventCode) {
      const sent = nationalFiscalChild(parseNationalFiscalXml(prepared.signedEventXml).documentElement, 'infPedReg');
      if(nationalFiscalSemantic(sent)!==nationalFiscalSemantic(requestInfo)){
        if(archive)payloadEvidence=matchProductionCancellationReasonRepresentation(sent,requestInfo,prepared.input.reason,prepared.input.eventCode);
        requireContract(payloadEvidence,'REGISTERED_EVENT_PAYLOAD_MISMATCH');
      }
    }
    events.push({ id, accessKey, code, sequence, environment: 'PRODUCAO', xml,
      ...(payloadEvidence?{payloadEvidence}:{}) });
  }
  return events;
}
