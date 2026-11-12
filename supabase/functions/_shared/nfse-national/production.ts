import { buildNationalDps } from './dps.ts';
import type { NationalDpsInput } from './dps.types.ts';
import { signNationalXml, verifyNationalXml } from './signature.ts';
import { encodeFiscalXml, parseFiscalJson } from './pilot-codec.ts';
import { assertNationalEnvelope, readAccessKey, readAuthorizedXml, parseNationalFiscalXml,
  nationalFiscalChild, nationalFiscalSemantic } from './pilot-response.ts';
import { NfseContractError, requireContract } from './xml.ts';
import type { PreparedProductionDps, ProductionDependencies, ProductionIssueResult, ProductionDpsIdentityDiagnostics } from './production.types.ts';

export const productionErrorCode = (error: unknown) =>
  error instanceof NfseContractError ? error.code : 'PRODUCTION_UNAVAILABLE';

export function readProductionRejection(envelope: Record<string, unknown>): string[] {
  assertNationalEnvelope(envelope, 'PRODUCAO');
  requireContract(Array.isArray(envelope.erros) && envelope.erros.length > 0 &&
    envelope.erros.length <= 100, 'UNCONFIRMED_REJECTION');
  const codes = envelope.erros.map(error => error?.Codigo ?? error?.codigo);
  requireContract(codes.every(value => typeof value === 'string' && /^[A-Z0-9_-]{1,32}$/.test(value)),
    'UNCONFIRMED_REJECTION');
  return codes;
}

/** Shape only: no raw identifier, access key, XML, arbitrary response text or credential material. */
export function productionDpsIdentityDiagnostics(envelope: Record<string, unknown>, expectedDpsId: string): ProductionDpsIdentityDiagnostics {
  const result: ProductionDpsIdentityDiagnostics = { expectedDpsLength: expectedDpsId.length,
    chaveAcessoPresent: Object.hasOwn(envelope, 'chaveAcesso') };
  for (const name of ['idDps', 'idDPS'] as const) {
    if (!Object.hasOwn(envelope, name)) continue;
    const value = envelope[name];
    if (typeof value === 'string') result[name] = value === expectedDpsId ? 'MATCH_EXPECTED_DPS'
      : expectedDpsId.startsWith('DPS') && value === expectedDpsId.slice(3) ? 'MATCH_WITHOUT_DPS_PREFIX'
      : value.startsWith('NFS') ? 'NFS_PREFIX' : 'OTHER_STRING';
    else result[name] = value === null ? 'NULL' : typeof value === 'number' ? 'NUMBER'
      : typeof value === 'boolean' ? 'BOOLEAN' : typeof value === 'undefined' ? 'UNDEFINED' : 'OBJECT';
  }
  return result;
}

function productionDpsIdentifiers(envelope: Record<string, unknown>): unknown[] {
  return ['idDps', 'idDPS'].filter(name => Object.hasOwn(envelope, name)).map(name => envelope[name]);
}
/** Production JSON IDs are optional; any supplied ID remains exact. XML proof is always required separately. */
function assertProductionDpsEnvelope(envelope: Record<string, unknown>, expectedDpsId: string): void {
  assertNationalEnvelope(envelope, 'PRODUCAO');
  requireContract(productionDpsIdentifiers(envelope).every(value => value === expectedDpsId), 'RESPONSE_DPS_MISMATCH');
}

function documentFor(input: NationalDpsInput) {
  requireContract(input.environment === 'PRODUCAO' && input.purpose === 'REGULAR' &&
    input.issuer.taxId.type === 'CNPJ' && input.substitution === undefined, 'PRODUCTION_REGULAR_CNPJ_ONLY');
  requireContract(/^(?:[1-9]\d{0,3}|[1-4]\d{4})$/.test(input.series), 'PRODUCTION_API_SERIES_REQUIRED');
  requireContract(input.review.ibscbs !== 'SYNTHETIC_PILOT_OMISSION', 'PRODUCTION_REAL_FISCAL_REVIEW_REQUIRED');
  if (input.issuer.simpleNationalOption === '3') {
    requireContract(['1', '2', '3'].includes(input.issuer.simpleNationalAssessment || ''),
      'SIMPLE_NATIONAL_ASSESSMENT_REQUIRED');
    if (input.issuer.simpleNationalAssessment === '1' && input.values.issRetention === '1') {
      requireContract(input.values.issRate === undefined, 'SN_ASSESSMENT_1_UNRETAINED_RATE_FORBIDDEN');
    }
  }
  return buildNationalDps(input);
}

/** Caller owns authorization, immutable server snapshot, identity allocation and one dispatch lease. */
export function createNationalProductionIssuer(deps: ProductionDependencies) {
  async function assertPrepared(prepared: PreparedProductionDps, dispatch: boolean) {
    const document = documentFor(prepared.input);
    requireContract(document.referenceId === prepared.dpsId, 'PRODUCTION_DPS_IDENTITY_MISMATCH');
    const sent = nationalFiscalChild(parseNationalFiscalXml(prepared.signedDpsXml).documentElement, 'infDPS');
    const expected = nationalFiscalChild(parseNationalFiscalXml(document.xml).documentElement, 'infDPS');
    requireContract(nationalFiscalSemantic(sent) === nationalFiscalSemantic(expected),
      'PREPARED_DPS_PAYLOAD_MISMATCH');
    await deps.schema.validate(prepared.signedDpsXml, 'DPS_v1.01.xsd', 'PRODUCAO');
    // A certificate rotation may still reconcile a prior request with GET. POST must use its verified signer.
    if (dispatch) requireContract(verifyNationalXml(document, prepared.signedDpsXml,
      deps.credential.certificatePem, deps.signatureProfile), 'PREPARED_DPS_SIGNATURE_MISMATCH');
  }

  async function consult(prepared: PreparedProductionDps): Promise<ProductionIssueResult | null> {
    const response = await deps.transport.request('GET', `/dps/${prepared.dpsId}`);
    if (response.status === 404) return null;
    requireContract(response.status === 200, 'DPS_CONSULTATION_UNCONFIRMED');
    const envelope = parseFiscalJson(response.body);
    assertNationalEnvelope(envelope, 'PRODUCAO');
    const identifiers = productionDpsIdentifiers(envelope);
    if (!identifiers.every(value => value === prepared.dpsId)) {
      return { state: 'AWAITING_CONFIRMATION', dpsId: prepared.dpsId, signedDpsXml: prepared.signedDpsXml,
        code: 'RESPONSE_DPS_MISMATCH', diagnostics: productionDpsIdentityDiagnostics(envelope, prepared.dpsId) };
    }
    assertProductionDpsEnvelope(envelope, prepared.dpsId);
    const accessKey = readAccessKey(envelope);
    const note = await deps.transport.request('GET', `/nfse/${accessKey}`);
    requireContract(note.status === 200, 'NFSE_CONSULTATION_UNCONFIRMED');
    const noteEnvelope = parseFiscalJson(note.body);
    if (noteEnvelope.chaveAcesso !== undefined) requireContract(noteEnvelope.chaveAcesso === accessKey,
      'RESPONSE_ACCESS_KEY_MISMATCH');
    const authorized = await readAuthorizedXml(noteEnvelope, { ...prepared, accessKey }, deps.schema, 'PRODUCAO');
    return { state: 'AUTHORIZED', dpsId: prepared.dpsId, signedDpsXml: prepared.signedDpsXml, accessKey, ...authorized };
  }

  return {
    async prepare(input: NationalDpsInput, expectedDpsId: string): Promise<PreparedProductionDps> {
      const document = documentFor(input);
      requireContract(document.referenceId === expectedDpsId, 'PRODUCTION_DPS_IDENTITY_MISMATCH');
      await deps.schema.validate(document.xml, 'DPS_v1.01.xsd', 'PRODUCAO');
      const signedDpsXml = signNationalXml(document, deps.credential, deps.signatureProfile);
      await deps.schema.validate(signedDpsXml, 'DPS_v1.01.xsd', 'PRODUCAO');
      return { input: globalThis.structuredClone(input), dpsId: document.referenceId, signedDpsXml };
    },
    async issue(prepared: PreparedProductionDps): Promise<ProductionIssueResult> {
      try { await assertPrepared(prepared, true); deps.assertLiveContract('ISSUE'); }
      catch (error) { return { state: 'BLOCKED', code: productionErrorCode(error) }; }
      const identity = { dpsId: prepared.dpsId, signedDpsXml: prepared.signedDpsXml };
      let postIdentityDiagnostics: ProductionDpsIdentityDiagnostics | undefined;
      try {
        const existing = await consult(prepared);
        if (existing) return existing;
        const response = await deps.transport.request('POST', '/nfse',
          JSON.stringify({ dpsXmlGZipB64: encodeFiscalXml(prepared.signedDpsXml) }));
        const envelope = parseFiscalJson(response.body);
        // Preserve only non-identifying response-shape evidence when a POST response conflicts.
        // Never retain raw response bodies, fiscal XML or credential material.
        postIdentityDiagnostics = productionDpsIdentityDiagnostics(envelope, prepared.dpsId);
        if (response.status === 201) {
          assertProductionDpsEnvelope(envelope, prepared.dpsId);
          const accessKey = readAccessKey(envelope);
          const authorized = await readAuthorizedXml(envelope, { ...prepared, accessKey }, deps.schema, 'PRODUCAO');
          return { state: 'AUTHORIZED', ...identity, accessKey, ...authorized };
        }
        if (response.status === 400) {
          assertNationalEnvelope(envelope, 'PRODUCAO', prepared.dpsId);
          return { state: 'REJECTED', ...identity, codes: readProductionRejection(envelope) };
        }
        return { state: 'AWAITING_CONFIRMATION', ...identity, code: 'TRANSMISSION_RESULT_UNCONFIRMED' };
      } catch (error) {
        const code = productionErrorCode(error);
        return { state: 'AWAITING_CONFIRMATION', ...identity, code,
          ...(code === 'RESPONSE_DPS_MISMATCH' && postIdentityDiagnostics
            ? { diagnostics: postIdentityDiagnostics } : {}) };
      }
    },
    async reconcile(prepared: PreparedProductionDps): Promise<ProductionIssueResult> {
      // Once dispatch may have happened, even a local validation failure is uncertain, never terminal.
      const identity = { dpsId: prepared.dpsId, signedDpsXml: prepared.signedDpsXml };
      try {
        await assertPrepared(prepared, false);
        return await consult(prepared) || { state: 'AWAITING_CONFIRMATION', ...identity, code: 'DPS_NOT_FOUND' };
      } catch (error) { return { state: 'AWAITING_CONFIRMATION', ...identity, code: productionErrorCode(error) }; }
    },
  };
}
