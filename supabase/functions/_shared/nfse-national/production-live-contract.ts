import { NATIONAL_LIVE_CONTRACT } from './live-contract.ts';
import { requireContract } from './xml.ts';
import type { ProductionEventEnvelopeContract } from './production.types.ts';
import { PRODUCTION_SERIES_COMPATIBILITY } from './production-series-compatibility.ts';
import { PRODUCTION_AUTHORIZED_REFERENCE } from './production-reference-evidence.ts';

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue | null => value !== null && typeof value === 'object' &&
  !Array.isArray(value) ? value as ObjectValue : null;

export const PRODUCTION_DOCUMENTARY_CONTRACT = Object.freeze({
  environment: 'PRODUCAO' as const,
  profile: 'RSA_SHA1_LEGACY' as const,
  acceptance: 'AUTHORIZED_ENVELOPE_REFERENCE_VERIFIED' as const,
  signatureSource: 'https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/manualintegradosnnfse_v1-00-02-producao.pdf',
  signatureSection: '6.1.4', signatureSourceDate: '2022-09-14',
  apiSource: 'https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao/apis-prod-restrita-e-producao',
  schemaPackage: NATIONAL_LIVE_CONTRACT.schemaPackage,
  schemaZipSha256: NATIONAL_LIVE_CONTRACT.schemaZipSha256,
  schemaValidator: 'libxml2-wasm@0.7.2',
  seriesSchemaConflict: 'ORIGINAL_ARTIFACT_ONLY' as const,
  schemaProfile: PRODUCTION_SERIES_COMPATIBILITY.id,
  derivedTypesSha256: PRODUCTION_SERIES_COMPATIBILITY.derivedSha256,
  authorizedReference: PRODUCTION_AUTHORIZED_REFERENCE,
});

/** Obtained server-side using the production A1 over verified TLS, never supplied by the browser. */
export interface ProductionContractEvidence {
  environment: 'PRODUCAO';
  checkedAt: string;
  url: string;
  status: number;
  tlsVerified: boolean;
  certificateValid: boolean;
  specification: unknown;
}

const specifications = new Set([
  'https://sefin.nfse.gov.br/SefinNacional/swagger/docs/v1',
  'https://sefin.nfse.gov.br/SefinNacional/swagger/v1/swagger.json',
]);

function resolve(value: unknown, definitions: ObjectValue, depth = 0): ObjectValue | null {
  const source = object(value);
  if (!source || depth > 8) return null;
  if (typeof source.$ref === 'string') {
    const match = source.$ref.match(/^#\/(?:definitions|components\/schemas)\/([A-Za-z0-9_.-]+)$/);
    return match ? resolve(definitions[match[1]], definitions, depth + 1) : null;
  }
  return source;
}

function properties(value: unknown, definitions: ObjectValue) {
  const source = resolve(value, definitions);
  return source?.type === 'object' ? object(source.properties) : null;
}

function fields(value: unknown, definitions: ObjectValue, expected: Record<string, string>): boolean {
  const source = properties(value, definitions);
  return source !== null && Object.entries(expected).every(([name, type]) => resolve(source[name], definitions)?.type === type);
}

function requestSchema(operation: ObjectValue) {
  const body = Array.isArray(operation.parameters) ? operation.parameters.map(object)
    .find(parameter => parameter?.in === 'body' && parameter.required === true) : null;
  return body?.schema || object(object(object(operation.requestBody)?.content)?.['application/json'])?.schema;
}

function responseSchema(operation: ObjectValue | null, status: string) {
  const response = object(object(operation?.responses)?.[status]);
  return response?.schema || object(object(response?.content)?.['application/json'])?.schema;
}

function eventEnvelope(get: ObjectValue | null, post: ObjectValue | null,
  definitions: ObjectValue): ProductionEventEnvelopeContract | null {
  if (!get || !post) return null;
  const request = resolve(requestSchema(post), definitions);
  const props = properties(request, definitions);
  const requestNames = Object.keys(props || {}).filter(name => /(?:pedidoRegistroEvento|pedRegEvento)XmlGZipB64$/.test(name) &&
    resolve(props?.[name], definitions)?.type === 'string');
  if (requestNames.length !== 1 || !Array.isArray(request?.required) || request.required.length !== 1 ||
    request.required[0] !== requestNames[0]) return null;
  const response = responseSchema(get, '200');
  const responseProps = properties(response, definitions);
  if (!responseProps || !fields(response, definitions, { tipoAmbiente: 'integer' })) return null;
  const lists: ProductionEventEnvelopeContract[] = [];
  for (const [name, property] of Object.entries(responseProps)) {
    const array = resolve(property, definitions);
    if (array?.type !== 'array') continue;
    const item = properties(array.items, definitions);
    const xmlFields = Object.keys(item || {}).filter(key => /eventoXmlGZipB64$/i.test(key) &&
      resolve(item?.[key], definitions)?.type === 'string');
    if (xmlFields.length !== 1) continue;
    const eventId = Object.keys(item || {}).filter(key => /^idEvento$/i.test(key) &&
      resolve(item?.[key], definitions)?.type === 'string');
    if (eventId.length > 1) continue;
    lists.push({ requestProperty: requestNames[0], listProperty: name, xmlProperty: xmlFields[0],
      eventIdProperty: eventId[0] || null });
  }
  return lists.length === 1 ? lists[0] : null;
}

/** Requires a fresh authenticated production wire contract and the pinned validated XML reference. */
export function assessNationalProductionContract(evidence: ProductionContractEvidence, now = Date.now()) {
  const result = (reason: string | null, eventContract: ProductionEventEnvelopeContract | null = null) => ({
    transportAvailable: reason === null,
    issueAvailable: reason === null,
    issueReason: reason,
    cancellationAvailable: reason === null && eventContract !== null,
    cancellationReason: reason || (eventContract ? null : 'PRODUCTION_EVENT_JSON_CONTRACT_UNVERIFIED'),
    eventContract, profile: PRODUCTION_DOCUMENTARY_CONTRACT.profile, source: PRODUCTION_DOCUMENTARY_CONTRACT,
  });
  if (evidence?.environment !== 'PRODUCAO') return result('PRODUCTION_ONLY');
  const checked = Date.parse(evidence.checkedAt);
  if (!Number.isFinite(checked) || !Number.isFinite(now) || now - checked > 300_000 || checked - now > 5_000) {
    return result('PRODUCTION_PREFLIGHT_EXPIRED');
  }
  if (!specifications.has(evidence.url) || evidence.status !== 200 || evidence.tlsVerified !== true ||
    evidence.certificateValid !== true) return result('PRODUCTION_MTLS_SPEC_UNVERIFIED');
  const spec = object(evidence.specification);
  if (!spec || !/^(?:2\.0|3\.)/.test(String(spec.swagger || spec.openapi || ''))) {
    return result('PRODUCTION_SPECIFICATION_UNVERIFIED');
  }
  const documentedAlgorithms = JSON.stringify(spec).match(/https?:[^"\s<>]*rsa-sha(?:1|256)/g) || [];
  if (documentedAlgorithms.some(uri => uri.endsWith('rsa-sha256')) &&
    !documentedAlgorithms.some(uri => uri.endsWith('rsa-sha1'))) return result('PRODUCTION_SIGNATURE_PROFILE_CHANGED');
  const definitions = object(spec.definitions) || object(object(spec.components)?.schemas) || {};
  const paths = object(spec.paths) || {};
  const issue = object(object(paths['/nfse'])?.post);
  const getDps = Object.entries(paths).find(([path]) => /^\/dps\/\{\w+\}$/.test(path))?.[1];
  const getNote = Object.entries(paths).find(([path]) => /^\/nfse\/\{\w+\}$/.test(path))?.[1];
  const request = resolve(issue && requestSchema(issue), definitions);
  if (!issue || !fields(request, definitions, { dpsXmlGZipB64: 'string' }) ||
    !Array.isArray(request?.required) || request.required.length !== 1 || request.required[0] !== 'dpsXmlGZipB64' ||
    !fields(responseSchema(issue, '201'), definitions,
      { tipoAmbiente: 'integer', idDps: 'string', chaveAcesso: 'string', nfseXmlGZipB64: 'string' }) ||
    !fields(responseSchema(object(object(getDps)?.get), '200'), definitions,
      { tipoAmbiente: 'integer', idDps: 'string', chaveAcesso: 'string' }) ||
    !fields(responseSchema(object(object(getNote)?.get), '200'), definitions,
      { tipoAmbiente: 'integer', nfseXmlGZipB64: 'string' })) return result('PRODUCTION_JSON_ENVELOPE_UNVERIFIED');
  const eventPath = Object.entries(paths).find(([path]) => /^\/nfse\/\{\w+\}\/eventos$/.test(path))?.[1];
  const detailPath = Object.entries(paths).find(([path]) => /^\/nfse\/\{\w+\}\/eventos\/\{\w+\}\/\{\w+\}$/.test(path))?.[1];
  const postEvent = object(object(eventPath)?.post);
  const detail = object(object(detailPath)?.get);
  const eventRequest = resolve(postEvent && requestSchema(postEvent), definitions);
  const requiredEventFields = { tipoAmbiente: 'integer', versaoAplicativo: 'string',
    dataHoraProcessamento: 'string', eventoXmlGZipB64: 'string' };
  if (postEvent && detail && fields(eventRequest, definitions, { pedidoRegistroEventoXmlGZipB64: 'string' }) &&
    Array.isArray(eventRequest?.required) && eventRequest.required.length === 1 &&
    eventRequest.required[0] === 'pedidoRegistroEventoXmlGZipB64' &&
    fields(responseSchema(detail, '200'), definitions, requiredEventFields) &&
    fields(responseSchema(postEvent, '201'), definitions, requiredEventFields)) {
    // The GET response profile was proven by authenticated SEFIN1.6.0 reads:
    // eventos[].arquivoXml contains Base64(ASCII Base64(GZip UTF8 XML)).
    // Swagger still declares the POST success object here; no generic fallback.
    return result(null, { requestProperty: 'pedidoRegistroEventoXmlGZipB64', listProperty: 'eventos',
      xmlProperty: 'arquivoXml', eventIdProperty: null, responseMode: 'ARCHIVE_DOUBLE_BASE64_GZIP', lookupSequence: '001' });
  }
  return result(null, eventEnvelope(object(object(eventPath)?.get), postEvent, definitions));
}

export function assertNationalProductionContract(evidence: ProductionContractEvidence,
  operation: 'ISSUE' | 'CANCEL', now = Date.now()): void {
  const assessment = assessNationalProductionContract(evidence, now);
  requireContract(operation === 'ISSUE' ? assessment.issueAvailable : assessment.cancellationAvailable,
    (operation === 'ISSUE' ? assessment.issueReason : assessment.cancellationReason) || 'PRODUCTION_CONTRACT_UNVERIFIED');
}
