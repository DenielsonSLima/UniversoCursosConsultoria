import { buildNationalDps } from './dps.ts';
import { prepareNationalSignedXml } from './provider.ts';
import { encodeFiscalXml, parseFiscalJson } from './pilot-codec.ts';
import { assertHomologationEnvelope, readAccessKey, readAuthorizedXml } from './pilot-response.ts';
import { NfseContractError, requireContract } from './xml.ts';
import type { NationalPilotDependencies, NationalPilotIntent, NationalPilotResult } from './pilot.types.ts';
export type { NationalPilotDependencies, NationalPilotIntent, NationalPilotResult } from './pilot.types.ts';

const code = (error: unknown) => error instanceof NfseContractError ? error.code : 'PILOT_UNAVAILABLE';

/** A technical pilot only: caller owns authorization, durable identity, locks and persistence. */
export function createNationalHomologationPilot(deps: NationalPilotDependencies) {
  async function prepare(intent: NationalPilotIntent) {
    requireContract(intent.input.environment === 'HOMOLOGACAO', 'PILOT_HOMOLOGATION_ONLY');
    requireContract(intent.input.issuer.taxId.type === 'CNPJ' && intent.input.substitution === undefined,
      'PILOT_REGULAR_CNPJ_ONLY');
    requireContract(/^(?:[1-9]\d{0,3}|[1-4]\d{4})$/.test(intent.input.series), 'PILOT_API_SERIES_REQUIRED');
    const document = buildNationalDps(intent.input);
    requireContract(document.referenceId === intent.expectedDpsId, 'PILOT_DPS_IDENTITY_MISMATCH');
    const { signedXml } = await prepareNationalSignedXml(document, deps);
    return { dpsId: document.referenceId, signedDpsXml: signedXml };
  }

  async function consult(prepared: { dpsId: string; signedDpsXml: string }): Promise<NationalPilotResult | null> {
    const response = await deps.transport.request('GET', `/dps/${prepared.dpsId}`);
    if (response.status === 404) return null;
    requireContract(response.status === 200, 'DPS_CONSULTATION_UNCONFIRMED');
    const envelope = parseFiscalJson(response.body);
    assertHomologationEnvelope(envelope, prepared.dpsId);
    const accessKey = readAccessKey(envelope);
    const note = await deps.transport.request('GET', `/nfse/${accessKey}`);
    requireContract(note.status === 200, 'NFSE_CONSULTATION_UNCONFIRMED');
    const noteEnvelope = parseFiscalJson(note.body);
    if (noteEnvelope.chaveAcesso !== undefined) requireContract(noteEnvelope.chaveAcesso === accessKey,
      'RESPONSE_ACCESS_KEY_MISMATCH');
    const authorized = await readAuthorizedXml(noteEnvelope, { ...prepared, accessKey }, deps.schema);
    return { state: 'AUTHORIZED', ...prepared, accessKey, ...authorized };
  }

  return {
    async issue(intent: NationalPilotIntent): Promise<NationalPilotResult> {
      let prepared: { dpsId: string; signedDpsXml: string };
      try { prepared = await prepare(intent); deps.assertLiveContract(); }
      catch (error) { return { state: 'BLOCKED', code: code(error) }; }
      try {
        // Check the stable identity before POST, even when a prior response was lost.
        const existing = await consult(prepared);
        if (existing) return existing;
        const response = await deps.transport.request('POST', '/nfse',
          JSON.stringify({ dpsXmlGZipB64: encodeFiscalXml(prepared.signedDpsXml) }));
        const envelope = parseFiscalJson(response.body);
        if (response.status === 201) {
          assertHomologationEnvelope(envelope, prepared.dpsId);
          const accessKey = readAccessKey(envelope);
          const authorized = await readAuthorizedXml(envelope, { ...prepared, accessKey }, deps.schema);
          return { state: 'AUTHORIZED', ...prepared, accessKey, ...authorized };
        }
        if (response.status === 400) {
          assertHomologationEnvelope(envelope, prepared.dpsId);
          requireContract(Array.isArray(envelope.erros) && envelope.erros.length > 0 &&
            envelope.erros.length <= 100, 'UNCONFIRMED_REJECTION');
          const codes = envelope.erros.map(error => error?.Codigo ?? error?.codigo);
          requireContract(codes.every(value => typeof value === 'string' && /^[A-Z0-9_-]{1,32}$/.test(value)),
            'UNCONFIRMED_REJECTION');
          return { state: 'REJECTED', ...prepared, codes };
        }
        return { state: 'AWAITING_CONFIRMATION', ...prepared, code: 'TRANSMISSION_RESULT_UNCONFIRMED' };
      } catch (error) { return { state: 'AWAITING_CONFIRMATION', ...prepared, code: code(error) }; }
    },
    async reconcile(intent: NationalPilotIntent): Promise<NationalPilotResult> {
      let prepared: { dpsId: string; signedDpsXml: string };
      try { prepared = await prepare(intent); }
      catch (error) { return { state: 'BLOCKED', code: code(error) }; }
      try {
        return await consult(prepared) || { state: 'AWAITING_CONFIRMATION', ...prepared, code: 'DPS_NOT_FOUND' };
      } catch (error) { return { state: 'AWAITING_CONFIRMATION', ...prepared, code: code(error) }; }
    },
  };
}
