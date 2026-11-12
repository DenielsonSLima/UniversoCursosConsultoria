import { buildNationalCancellation, projectCancellationState } from './events.ts';
import type { CancellationInput } from './events.ts';
import { signNationalXml, verifyNationalXml } from './signature.ts';
import { encodeFiscalXml, parseFiscalJson } from './pilot-codec.ts';
import { nationalFiscalChild, nationalFiscalSemantic, parseNationalFiscalXml } from './pilot-response.ts';
import { productionErrorCode, readProductionRejection } from './production.ts';
import { readProductionEvents, assertProductionEventEnvelopeContract, assertProductionSingleEventEnvelope } from './production-event-response.ts';
import { requireContract } from './xml.ts';
import type { PreparedProductionCancellation, ProductionCancellationDependencies,
  ProductionCancellationDiagnostics, ProductionCancellationResult } from './production.types.ts';

function documentFor(input: CancellationInput) {
  requireContract(input.environment === 'PRODUCAO' && input.author.type === 'CNPJ', 'PRODUCTION_ISSUER_CANCELLATION_ONLY');
  requireContract(input.accessKey[8] === '2' && input.accessKey.slice(9, 23) === input.author.value,
    'CANCELLATION_ISSUER_MISMATCH');
  return buildNationalCancellation(input);
}

/** A confirmed fiscal event is required. Neither HTTP success nor an analysis request promises cancellation. */
export function createNationalProductionCancellation(deps: ProductionCancellationDependencies) {
  async function assertPrepared(prepared: PreparedProductionCancellation, dispatch: boolean) {
    const document = documentFor(prepared.input);
    requireContract(document.referenceId === prepared.eventReferenceId, 'PREPARED_EVENT_IDENTITY_MISMATCH');
    const sent = nationalFiscalChild(parseNationalFiscalXml(prepared.signedEventXml).documentElement, 'infPedReg');
    const expected = nationalFiscalChild(parseNationalFiscalXml(document.xml).documentElement, 'infPedReg');
    requireContract(nationalFiscalSemantic(sent) === nationalFiscalSemantic(expected), 'PREPARED_EVENT_PAYLOAD_MISMATCH');
    await deps.schema.validate(prepared.signedEventXml, 'pedRegEvento_v1.01.xsd', 'PRODUCAO');
    if (dispatch) requireContract(verifyNationalXml(document, prepared.signedEventXml,
      deps.credential.certificatePem, deps.signatureProfile), 'PREPARED_EVENT_SIGNATURE_MISMATCH');
    assertProductionEventEnvelopeContract(deps.eventContract);
  }

  async function consult(prepared: PreparedProductionCancellation, diagnostics: ProductionCancellationDiagnostics,
    phase: 'BEFORE_POST' | 'AFTER_POST' | 'RECONCILE'): Promise<ProductionCancellationResult | null> {
    const single = ['SINGLE_EVENT','ARCHIVE_DOUBLE_BASE64_GZIP'].includes(deps.eventContract.responseMode || '');
    // Manual API1.2 §1.5.2.d uses numeric sequence1 in the URL. Padding001
    // belongs to the XML event ID and remains enforced by readProductionEvents.
    const route = `/nfse/${prepared.input.accessKey}/eventos` +
      (single ? `/${prepared.input.eventCode}/${Number(deps.eventContract.lookupSequence)}` : '');
    diagnostics.errorLocation = phase === 'RECONCILE' ? 'RECONCILE_LOOKUP' : `${phase}_LOOKUP`;
    const response = await deps.transport.request('GET', route);
    diagnostics.consult = { phase, httpStatus: response.status };
    const envelope = parseFiscalJson(response.body);
    if (single && response.status === 404) {
      // Live SEFIN1.6.0 omits the optional error detail for a missing specific event.
      // Only404 permits that omission; successful event XML and POST rejections remain strict.
      assertProductionSingleEventEnvelope(envelope, true, true);
      return null;
    }
    // Unknown errors never justify another POST. A recovery after a prior lease remains GET-only.
    requireContract(response.status === 200, 'EVENT_CONSULTATION_UNCONFIRMED');
    const events=await readProductionEvents(envelope, deps.eventContract, prepared, deps.schema);
    const registered = events.find(event => event.code === prepared.input.eventCode);
    if (!registered) return null;
    const cancellationState = projectCancellationState(prepared.input.accessKey, 'PRODUCAO', events);
    requireContract(cancellationState !== 'UNCHANGED', 'CANCELLATION_STATE_UNCONFIRMED');
    return { state: 'CONFIRMED', code:'CONFIRMED', accessKey: prepared.input.accessKey, eventId: registered.id,
      eventCode: registered.code, eventXml: registered.xml, cancellationState, signedEventXml: prepared.signedEventXml,
      ...(registered.payloadEvidence?{payloadEvidence:registered.payloadEvidence}:{}) };
  }

  return {
    async prepare(input: CancellationInput): Promise<PreparedProductionCancellation> {
      const document = documentFor(input);
      await deps.schema.validate(document.xml, 'pedRegEvento_v1.01.xsd', 'PRODUCAO');
      const signedEventXml = signNationalXml(document, deps.credential, deps.signatureProfile);
      await deps.schema.validate(signedEventXml, 'pedRegEvento_v1.01.xsd', 'PRODUCAO');
      return { input: globalThis.structuredClone(input), eventReferenceId: document.referenceId, signedEventXml };
    },
    async cancel(prepared: PreparedProductionCancellation): Promise<ProductionCancellationResult> {
      try {
        await assertPrepared(prepared, true);
        deps.assertLiveContract('CANCEL');
        deps.assertCancellationAllowed(prepared.input);
      } catch (error) { return { state: 'BLOCKED', code: productionErrorCode(error) }; }
      const identity = { accessKey: prepared.input.accessKey, signedEventXml: prepared.signedEventXml };
      const diagnostics: ProductionCancellationDiagnostics = { execution: 'CANCEL', postAttemptedInThisExecution: false };
      try {
        const existing = await consult(prepared, diagnostics, 'BEFORE_POST');
        if (existing) return existing;
        diagnostics.errorLocation = 'POST_REQUEST';
        diagnostics.postAttemptedInThisExecution = true;
        const response = await deps.transport.request('POST', `/nfse/${prepared.input.accessKey}/eventos`,
          JSON.stringify({ [deps.eventContract.requestProperty]: encodeFiscalXml(prepared.signedEventXml) }));
        diagnostics.postResponseStatus = response.status;
        if (response.status === 400) {
          diagnostics.errorLocation = 'POST_REJECTION_ENVELOPE';
          const rejection = parseFiscalJson(response.body);
          let codes: string[];
          if (['SINGLE_EVENT','ARCHIVE_DOUBLE_BASE64_GZIP'].includes(deps.eventContract.responseMode || '')) {
            assertProductionSingleEventEnvelope(rejection, true);
            const code = (rejection.erro as Record<string, unknown>).codigo;
            requireContract(typeof code === 'string' && /^[A-Z0-9_-]{1,32}$/.test(code), 'UNCONFIRMED_REJECTION');
            codes = [code];
          } else {
            codes = readProductionRejection(rejection);
          }
          if (codes.some(code => ['E0802', 'E1805', 'E0840'].includes(code))) {
            // Official Anexo II forbids another generated ID/cancellation. A
            // duplicate response may describe a prior accepted attempt; only
            // its registered XML can establish the fiscal cancellation state.
            return await consult(prepared, diagnostics, 'AFTER_POST') || { state: 'AWAITING_CONFIRMATION', ...identity,
              code: 'REGISTERED_EVENT_NOT_FOUND', diagnostics };
          }
          return { state: 'REJECTED', ...identity, codes };
        }
        if (response.status === 200 || response.status === 201) {
          // The live contract validates POST's EventosPostResponseSucesso separately
          // from GET's archive encoding. Accept only the complete registered XML,
          // never the status/acknowledgement alone. Unknown/invalid bodies fall back
          // to the same GET-only reconciliation; no second POST is permitted.
          if (['SINGLE_EVENT', 'ARCHIVE_DOUBLE_BASE64_GZIP'].includes(deps.eventContract.responseMode || '')) {
            try {
              const events = await readProductionEvents(parseFiscalJson(response.body), {
                requestProperty: deps.eventContract.requestProperty, listProperty: null,
                xmlProperty: 'eventoXmlGZipB64', eventIdProperty: null,
                responseMode: 'SINGLE_EVENT', lookupSequence: '001',
              }, prepared, deps.schema);
              const registered = events.find(event => event.code === prepared.input.eventCode);
              const cancellationState = projectCancellationState(prepared.input.accessKey, 'PRODUCAO', events);
              if (registered && cancellationState !== 'UNCHANGED') return {
                state: 'CONFIRMED', code: 'CONFIRMED', ...identity, eventId: registered.id,
                eventCode: registered.code, eventXml: registered.xml, cancellationState,
              };
            } catch { /* Preserve strict XML validation and recover through GET. */ }
          }
          return await consult(prepared, diagnostics, 'AFTER_POST') || { state: 'AWAITING_CONFIRMATION', ...identity,
            code: 'REGISTERED_EVENT_NOT_FOUND', diagnostics };
        }
        return { state: 'AWAITING_CONFIRMATION', ...identity, code: 'EVENT_RESULT_UNCONFIRMED', diagnostics };
      } catch (error) { return { state: 'AWAITING_CONFIRMATION', ...identity, code: productionErrorCode(error), diagnostics }; }
    },
    async reconcile(prepared: PreparedProductionCancellation): Promise<ProductionCancellationResult> {
      const identity = { accessKey: prepared.input.accessKey, signedEventXml: prepared.signedEventXml };
      const diagnostics: ProductionCancellationDiagnostics = { execution: 'RECONCILE_CANCEL', postAttemptedInThisExecution: false };
      try {
        await assertPrepared(prepared, false);
        return await consult(prepared, diagnostics, 'RECONCILE') || { state: 'AWAITING_CONFIRMATION', ...identity, code: 'REGISTERED_EVENT_NOT_FOUND', diagnostics };
      } catch (error) { return { state: 'AWAITING_CONFIRMATION', ...identity, code: productionErrorCode(error), diagnostics }; }
    },
  };
}
