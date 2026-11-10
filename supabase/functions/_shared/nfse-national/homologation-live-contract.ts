import { NATIONAL_LIVE_CONTRACT } from './live-contract.ts';
import { requireContract } from './xml.ts';

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue | null => value !== null && typeof value === 'object' &&
  !Array.isArray(value) ? value as ObjectValue : null;

export const HOMOLOGATION_PILOT_CONTRACT = Object.freeze({
  environment: 'HOMOLOGACAO' as const,
  profile: 'RSA_SHA1_LEGACY' as const,
  acceptance: 'TO_BE_TESTED' as const,
  signatureBasis: 'OFFICIAL_MANUAL_1.00.02_SECTION_6.1.4',
  signatureSource: 'https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/manualintegradosnnfse_v1-00-02-producao.pdf',
  signatureSourceDate: '2022-09-14',
  schemaPackage: NATIONAL_LIVE_CONTRACT.homologationSchemaPackage,
  schemaZipSha256: NATIONAL_LIVE_CONTRACT.homologationSchemaZipSha256,
  schemaValidator: 'libxml2-wasm@0.7.2',
  requestProperty: 'dpsXmlGZipB64',
  responseProperty: 'nfseXmlGZipB64',
});

/** Server-owned result of runPreflight. A browser-provided object is never evidence. */
export interface HomologationProbeEvidence {
  checkedAt: string;
  environment: string;
  checks: { code: string; status: string }[];
  endpoints: { url: string; status: number | null; tlsVerified: boolean; error: string | null }[];
  contracts: { kind: string; url: string; summary: {
    version: unknown; paths: { path: string; operations: {
      method: string; parameters: { in: unknown; required: boolean; schema: unknown }[];
      requestBody: unknown;
    }[] }[]; schemas: Record<string, unknown>; signatureAlgorithmReferences: string[];
  } }[];
}

const officialSefinSpecs = new Set([
  'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/swagger/docs/v1',
  'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/swagger/v1/swagger.json',
]);

function resolve(value: unknown, definitions: Record<string, unknown>, depth = 0): ObjectValue | null {
  const source = object(value);
  if (!source || depth > 8) return null;
  if (typeof source.$ref === 'string') {
    const match = source.$ref.match(/^#\/(?:definitions|components\/schemas)\/([A-Za-z0-9_.-]+)$/);
    return match ? resolve(definitions[match[1]], definitions, depth + 1) : null;
  }
  return source;
}

function hasFields(value: unknown, definitions: Record<string, unknown>, fields: Record<string, string>) {
  const source = resolve(value, definitions);
  const properties = object(source?.properties);
  return source?.type === 'object' && properties && Object.entries(fields).every(([name, type]) =>
    resolve(properties[name], definitions)?.type === type);
}

/** Documentary legacy profile permits a controlled experiment, not a claim of current acceptance. */
export function assessHomologationPilotContract(probe: HomologationProbeEvidence,
  now = Date.now()): { available: boolean; reason: string | null; profile: 'RSA_SHA1_LEGACY';
    acceptance: 'TO_BE_TESTED'; source: typeof HOMOLOGATION_PILOT_CONTRACT } {
  const result = (reason: string | null) => ({ available: reason === null, reason,
    profile: HOMOLOGATION_PILOT_CONTRACT.profile, acceptance: HOMOLOGATION_PILOT_CONTRACT.acceptance,
    source: HOMOLOGATION_PILOT_CONTRACT });
  if (probe?.environment !== 'HOMOLOGACAO') return result('PILOT_HOMOLOGATION_ONLY');
  const checkedAt = Date.parse(probe.checkedAt);
  if (!Number.isFinite(checkedAt) || !Number.isFinite(now) || now - checkedAt > 300_000 ||
    checkedAt - now > 5_000) return result('PILOT_PREFLIGHT_EXPIRED');
  if (!probe.checks.some(check => check.code === 'CERTIFICATE_VALID' && check.status === 'PASSED')) {
    return result('PILOT_CERTIFICATE_UNVERIFIED');
  }
  const contracts = probe.contracts.filter(contract => contract.kind === 'SEFIN' &&
    officialSefinSpecs.has(contract.url) && probe.endpoints.some(endpoint => endpoint.url === contract.url &&
      endpoint.status === 200 && endpoint.tlsVerified === true && endpoint.error === null));
  if (!contracts.length) return result('PILOT_MTLS_SPEC_UNVERIFIED');
  for (const contract of contracts) {
    const summary = contract.summary;
    if (typeof summary.version !== 'string' || !/^(?:2\.0|3\.)/.test(summary.version)) continue;
    const post = summary.paths.find(path => path.path === '/nfse')?.operations.find(op => op.method === 'POST');
    if (!post) continue;
    const request = post.parameters.find(parameter => parameter.in === 'body' && parameter.required)?.schema ||
      object(post.requestBody)?.['application/json'];
    const requestSchema = resolve(request, summary.schemas);
    if (!hasFields(requestSchema, summary.schemas, { dpsXmlGZipB64: 'string' }) ||
      !Array.isArray(requestSchema?.required) || requestSchema.required.length !== 1 ||
      requestSchema.required[0] !== 'dpsXmlGZipB64') continue;
    const issue = summary.schemas.NFSePostResponseSucesso;
    const note = summary.schemas.NFSeGetResponseSucesso;
    const dps = summary.schemas.DpsGetResponse;
    if (!hasFields(issue, summary.schemas, { tipoAmbiente: 'integer', idDps: 'string', chaveAcesso: 'string', nfseXmlGZipB64: 'string' }) ||
      !hasFields(note, summary.schemas, { tipoAmbiente: 'integer', nfseXmlGZipB64: 'string' }) ||
      !hasFields(dps, summary.schemas, { tipoAmbiente: 'integer', idDps: 'string', chaveAcesso: 'string' })) continue;
    if (!summary.paths.some(path => /^\/dps\/\{\w+\}$/.test(path.path) && path.operations.some(op => op.method === 'GET')) ||
      !summary.paths.some(path => /^\/nfse\/\{\w+\}$/.test(path.path) && path.operations.some(op => op.method === 'GET'))) continue;
    const algorithms = summary.signatureAlgorithmReferences;
    if (algorithms.some(uri => /rsa-sha256$/.test(uri)) && !algorithms.some(uri => /rsa-sha1$/.test(uri))) {
      return result('PILOT_SIGNATURE_PROFILE_CHANGED');
    }
    return result(null);
  }
  return result('PILOT_JSON_ENVELOPE_UNVERIFIED');
}

export function assertNationalHomologationPilotContract(probe: HomologationProbeEvidence, now = Date.now()): void {
  const assessment = assessHomologationPilotContract(probe, now);
  requireContract(assessment.available, assessment.reason || 'PILOT_CONTRACT_UNVERIFIED');
}
