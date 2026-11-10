import assert from 'node:assert/strict';
import { createPilotHandler, pilotCredentialChangeCode, type PilotHandlerDependencies, type PilotLedgerRow } from './handler.ts';
import { syntheticPilotScenario } from './scenario.ts';
import { buildNationalDps } from '../_shared/nfse-national/dps.ts';
import type { PreflightMaterial } from '../nfse-national-preflight/types.ts';

const scope = { contextKey: '00000000-0000-0000-0000-000000000010',
  poloId: '00000000-0000-0000-0000-000000000001', environment: 'HOMOLOGACAO' as const, month: '2026-11' };
const actor = '00000000-0000-0000-0000-000000000011';
const previewId = '00000000-0000-0000-0000-000000000090';
const requestId = '00000000-0000-0000-0000-000000000080';
const material: PreflightMaterial = { ...scope, actorId: actor, configurationVersion: 1,
  issuer: { cnpj: '00000000000100', municipalityCode: '2803401', municipalRegistration: null,
    opSimpNac: '3', regEspTrib: '0', regApTribSN: null },
  certificate: { notBefore: '2026-01-01T00:00:00Z', expiresAt: '2027-01-01T00:00:00Z', fingerprint: 'a'.repeat(64) },
  material: { certificatePem: 'CERTIFICATE_SENTINEL', chainPem: 'CHAIN_SENTINEL', privateKeyPem: 'PRIVATE_KEY_SENTINEL' } };
const scenario = syntheticPilotScenario(material, new Date('2026-11-10T15:00:00Z'));
const baseRow: PilotLedgerRow = { previewId, expiresAt: '2026-11-10T15:15:00Z', state: 'PREVIEWED', dispatch: false,
  fiscalInput: scenario.fiscalInput, preview: scenario.preview, result: null,
  configurationVersion: 1, certificateFingerprint: material.certificate.fingerprint };
const request = (action = 'PREVIEW', extra: Record<string, unknown> = {}) => new Request('https://local.test/pilot', {
  method: 'POST', headers: { authorization: 'Bearer synthetic', 'content-type': 'application/json' },
  body: JSON.stringify({ scope, action, requestId,
    ...(action === 'PREVIEW' ? {} : { previewId }), ...(action === 'ISSUE' ? { confirmed: true } : {}), ...extra }),
});

function harness(overrides: Partial<PilotHandlerDependencies> = {}) {
  const calls: { action: string; input?: unknown; reconcile?: boolean }[] = [];
  const deps: PilotHandlerDependencies = {
    authorize: async () => actor,
    preview: async () => { calls.push({ action: 'PREVIEW' }); return { row: globalThis.structuredClone(baseRow), available: true, reason: null }; },
    ledger: async (_command, _actor, action, input) => {
      calls.push({ action, input });
      if (action === 'FINISH') return { ...baseRow, state: 'AWAITING_CONFIRMATION', result: input as Record<string, unknown> };
      return { ...baseRow, state: 'PROCESSING', dispatch: true };
    },
    execute: async (_command, _actor, _row, reconcile) => {
      calls.push({ action: 'EXECUTE', reconcile });
      return { state: 'AWAITING_CONFIRMATION', dpsId: buildNationalDps(baseRow.fiscalInput).referenceId,
        code: 'TRANSMISSION_RESULT_UNCONFIRMED', signedDpsXml: '<DPS>XML_PRIVATE_SENTINEL</DPS>' };
    },
    rateLimited: () => false,
    respond: (_req, body, status) => Response.json(body, { status }),
    ...overrides,
  };
  return { calls, handler: createPilotHandler(deps) };
}

Deno.test('pilot handler denies unauthenticated scope and production before any ledger or execution', async () => {
  let authorized = 0;
  const denied = harness({ authorize: async () => { authorized++; throw new Error('PRIVATE_KEY_SENTINEL'); } });
  const deniedResponse = await denied.handler(request());
  assert.equal(deniedResponse.status, 403); assert.equal(denied.calls.length, 0);
  assert.equal((await deniedResponse.text()).includes('SENTINEL'), false);
  assert.equal((await denied.handler(request('PREVIEW', { scope: { ...scope, environment: 'PRODUCAO' } }))).status, 400);
  assert.equal(authorized, 1);
  const invalid = harness();
  assert.equal((await invalid.handler(request('ISSUE', { confirmed: false }))).status, 400);
  assert.equal((await invalid.handler(request('ISSUE', { previewId: undefined }))).status, 400);
  assert.equal(invalid.calls.length, 0);
});

Deno.test('preview accepts intent only and returns the server-owned synthetic payload', async () => {
  const h = harness();
  const response = await h.handler(request()); const envelope = await response.json();
  assert.equal(response.status, 200); assert.deepEqual(envelope.scope, scope);
  assert.deepEqual(envelope.data.payload, scenario.preview);
  assert.equal(envelope.data.payload.synthetic, true); assert.equal(envelope.data.payload.serviceAmount, '1.00');
  assert.deepEqual(h.calls.map((call) => call.action), ['PREVIEW']);
  assert.equal(/PRIVATE_KEY_SENTINEL|CERTIFICATE_SENTINEL|CHAIN_SENTINEL|fiscalInput|fingerprint/.test(JSON.stringify(envelope)), false);
  assert.equal((await h.handler(request('PREVIEW', { fiscalInput: { values: { serviceAmount: '260.00' } } }))).status, 400);
  assert.equal((await h.handler(request('PREVIEW', { receiptId: requestId }))).status, 400);
  assert.deepEqual(h.calls.map((call) => call.action), ['PREVIEW']);
});

Deno.test('first dispatch executes once and a repeated claim uses reconciliation only', async () => {
  const first = harness();
  const firstResponse = await first.handler(request('ISSUE'));
  assert.equal(firstResponse.status, 200);
  assert.deepEqual(first.calls.map((call) => call.action), ['CLAIM', 'EXECUTE', 'FINISH']);
  assert.equal(first.calls.find((call) => call.action === 'EXECUTE')?.reconcile, false);
  const replay = harness({ ledger: async (_command, _actor, action, input) => {
    replay.calls.push({ action, input });
    return { ...baseRow, state: 'PROCESSING', dispatch: false,
      result: action === 'FINISH' ? input as Record<string, unknown> : null };
  } });
  const response = await replay.handler(request('ISSUE'));
  assert.equal(response.status, 200);
  assert.deepEqual(replay.calls.map((call) => call.action), ['CLAIM', 'EXECUTE', 'FINISH']);
  assert.equal(replay.calls.find((call) => call.action === 'EXECUTE')?.reconcile, true);
  const data = (await response.json()).data;
  assert.equal(data.state, 'AWAITING_CONFIRMATION');
  assert.deepEqual(Object.keys(data).sort(), ['attemptId', 'message', 'state']);
  assert.equal(JSON.stringify(data).includes('XML_PRIVATE_SENTINEL'), false);
});

Deno.test('blocked concurrent recovery preserves uncertainty and the original in-flight authorization', async () => {
  let stored = globalThis.structuredClone(baseRow);
  const states: string[] = [];
  let entered!: () => void, release!: () => void;
  const firstEntered = new Promise<void>(resolve => { entered = resolve; });
  const completeFirst = new Promise<void>(resolve => { release = resolve; });
  const h = harness({
    ledger: async (_command, _actor, action, input) => {
      if (action === 'CLAIM' || action === 'READ') {
        const dispatch = action === 'CLAIM' && stored.state === 'PREVIEWED';
        if (dispatch) stored = { ...stored, state: 'PROCESSING' };
        return { ...stored, dispatch };
      }
      const result = input as Record<string, unknown>;
      assert.ok(['PROCESSING', 'AWAITING_CONFIRMATION'].includes(stored.state));
      stored = { ...stored, state: String(result.state), result };
      states.push(stored.state);
      return stored;
    },
    execute: async (_command, _actor, _row, reconcile) => {
      if (reconcile) return { state: 'BLOCKED', code: 'PILOT_CONFIGURATION_CHANGED' };
      entered(); await completeFirst;
      return { state: 'AUTHORIZED', dpsId: buildNationalDps(baseRow.fiscalInput).referenceId,
        number: '7', accessKey: '1'.repeat(50), authorizedXml: '<NFSe>PRIVATE_XML</NFSe>', signedDpsXml: '<DPS/>' };
    },
  });
  const original = h.handler(request('ISSUE'));
  await firstEntered;
  const replayResponse = await h.handler(request('ISSUE'));
  release();
  const originalResponse = await original;
  assert.equal((await replayResponse.json()).data.state, 'AWAITING_CONFIRMATION');
  assert.equal((await originalResponse.json()).data.state, 'AUTHORIZED');
  assert.deepEqual(states, ['AWAITING_CONFIRMATION', 'AUTHORIZED']);
  assert.equal(stored.state, 'AUTHORIZED');
  assert.equal(stored.result?.accessKey, '1'.repeat(50));
});

Deno.test('renewed certificate may reconcile the original issuer but never changes a reviewed dispatch', () => {
  const renewed = { ...material, configurationVersion: 2,
    certificate: { ...material.certificate, fingerprint: 'b'.repeat(64) } };
  assert.equal(pilotCredentialChangeCode(baseRow, renewed, true), null);
  assert.equal(pilotCredentialChangeCode(baseRow, renewed, false), 'PILOT_CONFIGURATION_CHANGED');
  const differentIssuer = { ...renewed, issuer: { ...renewed.issuer, cnpj: '00000000000200' } };
  assert.equal(pilotCredentialChangeCode(baseRow, differentIssuer, true), 'PILOT_ISSUER_CHANGED');
  assert.equal(pilotCredentialChangeCode(baseRow, differentIssuer, false), 'PILOT_ISSUER_CHANGED');
});

Deno.test('failed material authorization during recovery returns503 without FINISH or terminal state', async () => {
  for (const action of ['ISSUE', 'RECONCILE']) {
    const h = harness({ ledger: async (_command, _actor, ledgerAction) => {
      h.calls.push({ action: ledgerAction });
      return { ...baseRow, state: 'PROCESSING', dispatch: false };
    }, execute: async () => { throw new Error('MATERIAL_AUTHORIZATION_DENIED_SECRET_SENTINEL'); } });
    const response = await h.handler(request(action));
    assert.equal(response.status, 503);
    assert.deepEqual(h.calls.map(call => call.action), [action === 'ISSUE' ? 'CLAIM' : 'READ']);
    assert.equal((await response.text()).includes('SENTINEL'), false);
  }
});

Deno.test('explicit reconciliation of an unsent preview neither executes nor finishes', async () => {
  const h = harness({ ledger: async (_command, _actor, action) => {
    h.calls.push({ action }); return globalThis.structuredClone(baseRow);
  } });
  const response = await h.handler(request('RECONCILE'));
  assert.equal(response.status, 200); assert.equal((await response.json()).data.state, 'BLOCKED');
  assert.deepEqual(h.calls.map((call) => call.action), ['READ']);
});

Deno.test('authorization response excludes private FINISH proof and settled replays do not execute', async () => {
  const h = harness({
    execute: async () => ({ state: 'AUTHORIZED', dpsId: buildNationalDps(baseRow.fiscalInput).referenceId,
      accessKey: '1'.repeat(50), number: '7', authorizedXml: '<NFSe>AUTHORIZED_XML_SENTINEL</NFSe>',
      signedDpsXml: '<DPS>SIGNED_XML_SENTINEL</DPS>' }),
    ledger: async (_command, _actor, action, input) => {
      h.calls.push({ action, input });
      return action === 'FINISH' ? { ...baseRow, state: 'AUTHORIZED', result: input as Record<string, unknown> }
        : { ...baseRow, state: 'PROCESSING', dispatch: true };
    },
  });
  const response = await h.handler(request('ISSUE')); const envelope = await response.json();
  assert.equal(envelope.data.state, 'AUTHORIZED'); assert.equal(envelope.data.number, '7');
  assert.equal(envelope.data.accessKey, '1'.repeat(50));
  assert.equal(/XML_SENTINEL|privateKey|fiscalInput|fingerprint/.test(JSON.stringify(envelope)), false);
  const proof = h.calls.find((call) => call.action === 'FINISH')?.input as Record<string, unknown>;
  assert.equal(proof.authorizedXml, '<NFSe>AUTHORIZED_XML_SENTINEL</NFSe>');
  assert.equal(proof.dpsId, buildNationalDps(baseRow.fiscalInput).referenceId);
  const settled = harness({ ledger: async (_command, _actor, action) => {
    settled.calls.push({ action }); return { ...baseRow, state: 'AUTHORIZED',
      result: { number: '7', accessKey: '1'.repeat(50), message: 'Autorização preservada.', authorizedXml: 'XML_SENTINEL' } };
  } });
  const replay = await settled.handler(request('ISSUE'));
  assert.equal((await replay.json()).data.state, 'AUTHORIZED');
  assert.deepEqual(settled.calls.map((call) => call.action), ['CLAIM']);
});

Deno.test('provider and persistence exceptions return generic uncertainty without secret messages', async () => {
  for (const stage of ['preview', 'execute', 'finish']) {
    const h = harness({
      ...(stage === 'preview' ? { preview: async () => { throw new Error('PRIVATE_KEY_SENTINEL'); } } : {}),
      ...(stage === 'execute' ? { execute: async () => { throw new Error('PRIVATE_KEY_SENTINEL'); } } : {}),
      ...(stage === 'finish' ? { ledger: async (_command, _actor, action) => {
        if (action === 'FINISH') throw new Error('PRIVATE_KEY_SENTINEL');
        return { ...baseRow, state: 'PROCESSING', dispatch: true };
      } } : {}),
    });
    const response = await h.handler(request(stage === 'preview' ? 'PREVIEW' : 'ISSUE'));
    assert.equal(response.status, 503);
    const text = await response.text(); assert.equal(text.includes('SENTINEL'), false);
    assert.equal(text.includes(stage === 'preview' ? 'PILOT_PREVIEW_UNAVAILABLE' : 'PILOT_RESULT_UNCONFIRMED'), true);
  }
});

Deno.test('synthetic scenario preserves non-MEI Simples regime and server-owned service without exposing material', () => {
  const result = syntheticPilotScenario(material, new Date('2026-11-10T01:00:00Z'));
  assert.equal(result.fiscalInput.competence, '2026-11-09');
  assert.equal(result.fiscalInput.issuer.simpleNationalOption, '3');
  assert.equal(result.preview.opSimpNac, '3'); assert.equal(result.fiscalInput.service.nationalTaxCode, '080201');
  assert.equal(result.fiscalInput.values.serviceAmount, '1.00');
  assert.equal(result.fiscalInput.recipient.name, 'TOMADOR SINTETICO - TESTE SEM VALOR FISCAL');
  assert.equal(/SENTINEL|privateKeyPem|certificatePem|fingerprint/.test(JSON.stringify(result)), false);
  assert.equal(result.fiscalInput.issuer.simpleNationalAssessment, undefined);
  const assessed = syntheticPilotScenario({ ...material, issuer: { ...material.issuer, regApTribSN: '2' } });
  assert.equal(assessed.fiscalInput.issuer.simpleNationalAssessment, '2');
  const regular = syntheticPilotScenario({ ...material, issuer: { ...material.issuer, opSimpNac: '1' } });
  assert.equal(regular.fiscalInput.issuer.simpleNationalOption, '1');
  assert.throws(() => syntheticPilotScenario({ ...material, issuer: { ...material.issuer, opSimpNac: '2' } }), /PILOT_REVIEW_INCOMPATIBLE/);
  assert.throws(() => syntheticPilotScenario({ ...material, environment: 'PRODUCAO' } as unknown as PreflightMaterial), /PILOT_REVIEW_INCOMPATIBLE/);
});
