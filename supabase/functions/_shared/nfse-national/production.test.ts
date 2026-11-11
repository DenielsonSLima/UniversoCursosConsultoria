import { buildNationalDps } from './dps.ts';
import { buildNationalCancellation } from './events.ts';
import { createNationalProductionIssuer } from './production.ts';
import { createNationalProductionCancellation } from './production-cancellation.ts';
import { createProductionSchemaValidator, createProductionNumericSeriesCompatibilityValidator } from './production-schema.ts';
import { deriveProductionNumericSeriesSchemas, PRODUCTION_SERIES_COMPATIBILITY } from './production-series-compatibility.ts';
import { PRODUCTION_SCHEMAS } from './schemas/production.generated.ts';
import { Buffer } from 'node:buffer';
import { createHomologationSchemaValidator } from './homologation-schema.ts';
import { pilotFixture, pilotAccessKey, syntheticAuthorizedNote } from './pilot-fixtures.ts';
import { encodeFiscalXml, decodeFiscalXml } from './pilot-codec.ts';
import { productionFixture, cancellationFixture, withProductionTestCertificate,
  syntheticProductionEvent } from './production.test-fixtures.ts';
import { NfseContractError } from './xml.ts';
import { verifyPinnedProductionReferenceXml } from './production-reference-verification.ts';
import type { ProductionEventEnvelopeContract } from './production.types.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
async function rejects(run: () => unknown, expected: string) {
  let error: unknown;
  try { await run(); } catch (caught) { error = caught; }
  assert(error instanceof Error && error.message === expected, `Expected ${expected}; got ${error}`);
}
const json = (value: unknown, status = 200) => ({ status, body: new TextEncoder().encode(JSON.stringify(value)) });
const official = createProductionSchemaValidator();
const compatibility = createProductionNumericSeriesCompatibilityValidator();
const eventContract: ProductionEventEnvelopeContract = { requestProperty: 'requestXmlGZipB64',
  listProperty: 'events', xmlProperty: 'xmlGZipB64', eventIdProperty: null };

Deno.test('original production XSD keeps numerical series conflict explicit; HOMO remains separate', async () => {
  const input = productionFixture();
  const document = buildNationalDps(input);
  assert(!document.xml.includes('finNFSe') && document.xml.includes('<infoCompl><xInfComp>Complemento sintetico offline'));
  assert(document.xml.indexOf('<xDescServ>') < document.xml.indexOf('<cNBS>'));
  await rejects(() => official.validate(document.xml, 'DPS_v1.01.xsd', 'PRODUCAO'), 'PRODUCTION_DPS_SERIES_SCHEMA_CONFLICT');
  const homologation = createHomologationSchemaValidator();
  await homologation.validate(buildNationalDps(pilotFixture()).xml, 'DPS_v1.01.xsd', 'HOMOLOGACAO');
  await rejects(() => official.validate(document.xml, 'DPS_v1.01.xsd', 'HOMOLOGACAO'), 'SCHEMA_PRODUCTION_ONLY');
  await official.validate(buildNationalCancellation(cancellationFixture(pilotAccessKey)).xml,
    'pedRegEvento_v1.01.xsd', 'PRODUCAO');
  await rejects(() => official.validate('<!DOCTYPE x><x/>', 'evento_v1.01.xsd', 'PRODUCAO'), 'UNSAFE_FISCAL_XML');
});

Deno.test('derived compatibility changes exactly two anchor bytes in one official type and retains all validation', async () => {
  const derived = deriveProductionNumericSeriesSchemas();
  const metadata = PRODUCTION_SERIES_COMPATIBILITY;
  for (const [name, original] of Object.entries(PRODUCTION_SCHEMAS)) {
    if (name !== metadata.filename) {
      assert(derived[name].base64 === original.base64 && derived[name].sha256 === original.sha256);
      continue;
    }
    const before = Buffer.from(original.base64, 'base64');
    const after = Buffer.from(derived[name].base64, 'base64');
    assert(after.byteLength === before.byteLength - 2);
    assert(after.toString('utf8') === before.toString('utf8').replace(metadata.before, metadata.after));
    assert(Buffer.from(await crypto.subtle.digest('SHA-256', after)).toString('hex') === metadata.derivedSha256);
  }
  const input = productionFixture();
  await compatibility.validate(buildNationalDps(input).xml, 'DPS_v1.01.xsd', 'PRODUCAO');
  await rejects(() => buildNationalDps({ ...input, service: { ...input.service, complementaryInfo: 'x'.repeat(2001) } }),
    'INVALID_XML_TEXT_LENGTH');
  for (const series of ['0', '50000', '70000', '^1$', '1.0']) {
    await rejects(() => buildNationalDps({ ...input, series }),
      ['^1$', '1.0'].includes(series) ? 'INVALID_DPS_SERIES' : 'PRODUCTION_API_SERIES_REQUIRED');
  }
  const xml = buildNationalDps(input).xml;
  await rejects(() => verifyPinnedProductionReferenceXml(xml), 'REFERENCE_XML_HASH_MISMATCH');
  await rejects(() => compatibility.validate(xml.replace('<vServ>1.00', '<vServ>1e3'), 'DPS_v1.01.xsd', 'PRODUCAO'),
    'OFFICIAL_XSD_VALIDATION_FAILED');
  await rejects(() => compatibility.validate(xml.replace('<cTribNac>080201', '<cTribNac>bogus'), 'DPS_v1.01.xsd', 'PRODUCAO'),
    'OFFICIAL_XSD_VALIDATION_FAILED');
  await rejects(() => compatibility.validate(xml.replace('<serie>49998', '<serie>^1$'), 'DPS_v1.01.xsd', 'PRODUCAO'),
    'OFFICIAL_XSD_VALIDATION_FAILED');
});

Deno.test('production persists signed DPS and reconciles stable identity before a single POST', async () => {
  await withProductionTestCertificate(async credential => {
    const input = productionFixture(); const dpsId = buildNationalDps(input).referenceId;
    const calls: string[] = []; let authorizedXml = '';
    const issuer = createNationalProductionIssuer({ credential, signatureProfile: 'RSA_SHA256',
      schema: compatibility, assertLiveContract() {}, transport: { async request(method, path, body) {
        calls.push(`${method} ${path}`);
        if (method === 'GET') return json({}, 404);
        const signed = decodeFiscalXml(JSON.parse(body!).dpsXmlGZipB64);
        authorizedXml = syntheticAuthorizedNote(signed, credential);
        return json({ tipoAmbiente: 1, idDps: dpsId, chaveAcesso: pilotAccessKey,
          nfseXmlGZipB64: encodeFiscalXml(authorizedXml) }, 201);
      } } });
    const prepared = await issuer.prepare(input, dpsId);
    await rejects(() => issuer.prepare({ ...input, values: { ...input.values, issRate: '3.54' } }, dpsId),
      'SN_ASSESSMENT_1_UNRETAINED_RATE_FORBIDDEN');
    input.service.description = 'Caller mutation must not alter persisted snapshot';
    const result = await issuer.issue(prepared);
    assert(result.state === 'AUTHORIZED' && result.authorizedXml === authorizedXml, JSON.stringify(result));
    assert(calls.join('|') === `GET /dps/${dpsId}|POST /nfse`);
    const readOnly = createNationalProductionIssuer({ credential: { privateKeyPem: '', certificatePem: '' },
      signatureProfile: 'RSA_SHA256', schema: compatibility,
      assertLiveContract() { throw new Error('GET must not use POST gate'); }, transport: { async request(method, path) {
        assert(method === 'GET');
        return path.startsWith('/dps/') ? json({ tipoAmbiente: 1, idDps: dpsId, chaveAcesso: pilotAccessKey }) :
          json({ tipoAmbiente: 1, nfseXmlGZipB64: encodeFiscalXml(authorizedXml) });
      } } });
    assert((await readOnly.reconcile(prepared)).state === 'AUTHORIZED');
    const tampered = await issuer.issue({ ...prepared, signedDpsXml: prepared.signedDpsXml.replace('<vServ>1.00', '<vServ>2.00') });
    assert(tampered.state === 'BLOCKED' && calls.length === 2);
  });
});

Deno.test('production uncertain responses never authorize another environment or retry a POST on reconcile', async () => {
  await withProductionTestCertificate(async credential => {
    for (const scenario of ['TIMEOUT', 'WRONG_ENVIRONMENT', 'REJECTED', 'MISMATCH', 'GATE', 'XSD']) {
      const input = productionFixture(); const dpsId = buildNationalDps(input).referenceId;
      let posts = 0;
      const issuer = createNationalProductionIssuer({ credential, signatureProfile: 'RSA_SHA256',
        schema: scenario === 'XSD' ? official : compatibility,
        assertLiveContract() { if (scenario === 'GATE') throw new NfseContractError('PRODUCTION_CONTRACT_UNVERIFIED'); },
        transport: { async request(method, _path, body) {
          if (method === 'GET') return json({}, 404);
          posts++;
          if (scenario === 'TIMEOUT') throw new Error('TIMEOUT');
          if (scenario === 'REJECTED') return json({ tipoAmbiente: 1, idDPS: dpsId, erros: [{ Codigo: 'E0037' }] }, 400);
          const xml = syntheticAuthorizedNote(decodeFiscalXml(JSON.parse(body!).dpsXmlGZipB64)
            .replace('<vServ>1.00', scenario === 'MISMATCH' ? '<vServ>2.00' : '<vServ>1.00'), credential);
          return json({ tipoAmbiente: scenario === 'WRONG_ENVIRONMENT' ? 2 : 1, idDps: dpsId,
            chaveAcesso: pilotAccessKey, nfseXmlGZipB64: encodeFiscalXml(xml) }, 201);
        } } });
      if (scenario === 'XSD') {
        await rejects(() => issuer.prepare(input, dpsId), 'PRODUCTION_DPS_SERIES_SCHEMA_CONFLICT');
        assert(posts === 0); continue;
      }
      const prepared = await issuer.prepare(input, dpsId);
      const result = await issuer.issue(prepared);
      assert(result.state === (scenario === 'REJECTED' ? 'REJECTED' : scenario === 'GATE' ? 'BLOCKED' : 'AWAITING_CONFIRMATION'));
      if (result.state === 'REJECTED') assert(result.codes.join() === 'E0037');
      await issuer.reconcile(prepared);
      assert(posts === (scenario === 'GATE' ? 0 : 1));
    }
  });
});

Deno.test('cancel confirms only matching official event XML fetched back after POST; analysis remains pending', async () => {
  await withProductionTestCertificate(async credential => {
    for (const eventCode of ['101101', '101103'] as const) {
      let registered = ''; const calls: string[] = [];
      const engine = createNationalProductionCancellation({ credential, signatureProfile: 'RSA_SHA256', schema: official,
        eventContract, assertLiveContract() {}, assertCancellationAllowed() {}, transport: { async request(method, path, body) {
          calls.push(`${method} ${path}`);
          if (method === 'POST') {
            registered = syntheticProductionEvent(decodeFiscalXml(JSON.parse(body!)[eventContract.requestProperty]),
              pilotAccessKey, eventCode, credential);
            return json({ accepted: true }, 201);
          }
          return json({ tipoAmbiente: 1, events: registered ? [{ xmlGZipB64: encodeFiscalXml(registered) }] : [] });
        } } });
      const prepared = await engine.prepare(cancellationFixture(pilotAccessKey, eventCode));
      const result = await engine.cancel(prepared);
      assert(result.state === 'CONFIRMED', JSON.stringify(result));
      assert(result.cancellationState === (eventCode === '101101' ? 'CANCELLED' : 'AWAITING_ANALYSIS'));
      assert(calls.length === 3 && calls[0].startsWith('GET ') && calls[1].startsWith('POST ') && calls[2].startsWith('GET '));
      const replay = await engine.reconcile(prepared);
      assert(replay.state === 'CONFIRMED' && Number(calls.length) === 4);
    }
  });
});

Deno.test('cancel timeout, mismatched event, unknown eligibility and missing GET never claim cancellation', async () => {
  await withProductionTestCertificate(async credential => {
    for (const scenario of ['TIMEOUT', 'MISMATCH', 'ELIGIBILITY', 'MISSING_GET', 'ACK_ONLY']) {
      let posts = 0;
      const engine = createNationalProductionCancellation({ credential, signatureProfile: 'RSA_SHA256', schema: official,
        eventContract, assertLiveContract() {}, assertCancellationAllowed() {
          if (scenario === 'ELIGIBILITY') throw new NfseContractError('MUNICIPAL_CANCELLATION_RULES_UNVERIFIED');
        }, transport: { async request(method, _path, body) {
          if (method === 'POST') { posts++; if (scenario === 'TIMEOUT') throw new Error('TIMEOUT'); return json({}, 201); }
          if (scenario === 'MISSING_GET') return json({}, 404);
          if (scenario === 'MISMATCH' && posts) {
            const requested = buildNationalCancellation(cancellationFixture(pilotAccessKey)).xml
              .replace('Valor informado incorretamente', 'Outra justificativa incorreta');
            const xml = syntheticProductionEvent(requested, pilotAccessKey, '101101', credential);
            return json({ tipoAmbiente: 1, events: [{ xmlGZipB64: encodeFiscalXml(xml) }] });
          }
          assert(body === undefined);
          return json({ tipoAmbiente: 1, events: [] });
        } } });
      const prepared = await engine.prepare(cancellationFixture(pilotAccessKey));
      const result = await engine.cancel(prepared);
      assert(result.state === (scenario === 'ELIGIBILITY' ? 'BLOCKED' : 'AWAITING_CONFIRMATION'), JSON.stringify(result));
      await engine.reconcile(prepared);
      assert(posts === (['ELIGIBILITY', 'MISSING_GET'].includes(scenario) ? 0 : 1));
    }
  });
});
