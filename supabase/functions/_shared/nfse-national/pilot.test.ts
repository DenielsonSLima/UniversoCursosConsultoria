import { gzipSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
import { buildNationalDps } from './dps.ts';
import { pilotFixture, pilotAccessKey, syntheticAuthorizedNote } from './pilot-fixtures.ts';
import { createHomologationSchemaValidator } from './homologation-schema.ts';
import { createNationalHomologationPilot, type NationalPilotDependencies } from './pilot.ts';
import { decodeFiscalXml, encodeFiscalXml, MAX_FISCAL_XML_BYTES } from './pilot-codec.ts';
import { assertNationalLiveContract } from './live-contract.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
async function rejects(fn: () => unknown, expected: string) {
  let error: unknown;
  try { await fn(); } catch (caught) { error = caught; }
  assert(error instanceof Error && error.message === expected, `Expected ${expected}, got ${error}`);
}
const schema = createHomologationSchemaValidator();
const json = (value: unknown, status = 200) => ({ status, body: new TextEncoder().encode(JSON.stringify(value)) });

async function withCertificate(run: (material: NationalPilotDependencies['credential']) => Promise<void>) {
  const path = await Deno.makeTempDir({ dir: '/tmp', prefix: 'nfse-pilot-test-' });
  try {
    const result = await new Deno.Command('openssl', { args: ['req', '-x509', '-newkey', 'rsa:2048',
      '-nodes', '-days', '1', '-subj', '/CN=NFSE-SYNTHETIC-TEST', '-keyout', `${path}/key.pem`,
      '-out', `${path}/cert.pem`], stdout: 'null', stderr: 'piped' }).output();
    assert(result.success);
    await run({ privateKeyPem: await Deno.readTextFile(`${path}/key.pem`), certificatePem: await Deno.readTextFile(`${path}/cert.pem`) });
  } finally { await Deno.remove(path, { recursive: true }); }
}

Deno.test('WASM validates exact official XSD imports, IBS declaration and rejects malformed XML', async () => {
  const input = pilotFixture();
  const doc = buildNationalDps(input);
  await schema.validate(doc.xml, 'DPS_v1.01.xsd', 'HOMOLOGACAO');
  const declared = buildNationalDps({ ...input, ibscbs: { personalUse: '1', operationCode: '000001',
    recipientIsAcquirer: true, cst: '000', classificationCode: '000001' },
    review: { ...input.review, ibscbs: 'DECLARED_CONFIRMED' } });
  await schema.validate(declared.xml, 'DPS_v1.01.xsd', 'HOMOLOGACAO');
  await rejects(() => schema.validate(doc.xml.replace('<vServ>1.00', '<vServ>1e3'), 'DPS_v1.01.xsd', 'HOMOLOGACAO'),
    'OFFICIAL_XSD_VALIDATION_FAILED');
  await rejects(() => buildNationalDps({ ...input, environment: 'PRODUCAO' }), 'IBSCBS_REVIEW_REQUIRED');
  await rejects(() => schema.validate(doc.xml, 'DPS_v1.01.xsd', 'PRODUCAO'), 'SCHEMA_HOMOLOGATION_ONLY');
});

Deno.test('gzip codec limits expansion and rejects DTD, invalid base64 and unsafe encodings', async () => {
  assert(decodeFiscalXml(encodeFiscalXml('<teste>valor</teste>')) === '<teste>valor</teste>');
  await rejects(() => decodeFiscalXml('!!!!'), 'INVALID_GZIP_BASE64');
  await rejects(() => encodeFiscalXml('<!DOCTYPE x [<!ENTITY a "b">]><x/>'), 'UNSAFE_FISCAL_XML');
  await rejects(() => decodeFiscalXml(gzipSync(Buffer.alloc(MAX_FISCAL_XML_BYTES + 1, 65)).toString('base64')),
    'INVALID_OR_OVERSIZED_GZIP');
  await rejects(() => decodeFiscalXml(gzipSync(Buffer.from([0xff])).toString('base64')), 'INVALID_XML_UTF8');
});

Deno.test('pilot authorizes only matching XSD XML and reconciles the stable DPS before POST', async () => {
  await withCertificate(async credential => {
    const input = pilotFixture(); const expectedDpsId = buildNationalDps(input).referenceId;
    const methods: string[] = []; let authorizedXml = '';
    const pilot = createNationalHomologationPilot({ schema, credential, signatureProfile: 'RSA_SHA256',
      assertLiveContract() {}, transport: { async request(method, path, body) {
        methods.push(`${method} ${path}`);
        if (method === 'GET') return json({}, 404);
        const signed = decodeFiscalXml(JSON.parse(body!).dpsXmlGZipB64);
        authorizedXml = syntheticAuthorizedNote(signed, credential);
        return json({ tipoAmbiente: 2, idDps: expectedDpsId, chaveAcesso: pilotAccessKey,
          nfseXmlGZipB64: encodeFiscalXml(authorizedXml) }, 201);
      } } });
    const result = await pilot.issue({ input, expectedDpsId });
    assert(result.state === 'AUTHORIZED', JSON.stringify(result));
    assert(result.number === '9' && result.authorizedXml === authorizedXml && methods.length === 2);
    assert(methods[0] === `GET /dps/${expectedDpsId}` && methods[1] === 'POST /nfse');
    const consulted: string[] = [];
    const resume = createNationalHomologationPilot({ schema, credential, signatureProfile: 'RSA_SHA256',
      assertLiveContract() {}, transport: { async request(method, path) {
        consulted.push(method);
        return path.startsWith('/dps/') ? json({ tipoAmbiente: 2, idDps: expectedDpsId, chaveAcesso: pilotAccessKey }) :
          json({ tipoAmbiente: 2, nfseXmlGZipB64: encodeFiscalXml(authorizedXml) });
      } } });
    const reconciled = await resume.issue({ input, expectedDpsId });
    assert(reconciled.state === 'AUTHORIZED' && consulted.join() === 'GET,GET');
  });
});

Deno.test('pilot treats timeout/mismatches as uncertain, never repeats POST, preserves rejection codes', async () => {
  await withCertificate(async credential => {
    const input = pilotFixture(); const expectedDpsId = buildNationalDps(input).referenceId;
    for (const scenario of ['TIMEOUT', 'WRONG_XML', 'WRONG_ENVIRONMENT', 'REJECTED', 'REJECTED_UPPER_DPS',
      'CONFLICTING_DPS_ALIASES', 'CONSULT_FAILED', 'UNVERIFIED']) {
      let posts = 0;
      const pilot = createNationalHomologationPilot({ schema, credential, signatureProfile: 'RSA_SHA256',
        assertLiveContract() { if (scenario === 'UNVERIFIED') assertNationalLiveContract(); },
        transport: { async request(method, _path, body) {
          if (method === 'GET') return json({}, scenario === 'CONSULT_FAILED' ? 503 : 404);
          posts++;
          if (scenario === 'TIMEOUT') throw new Error('TIMEOUT');
          if (['REJECTED', 'REJECTED_UPPER_DPS', 'CONFLICTING_DPS_ALIASES'].includes(scenario)) {
            return json({ tipoAmbiente: 2,
              ...(scenario === 'REJECTED' ? { idDps: expectedDpsId } : { idDPS: expectedDpsId }),
              ...(scenario === 'CONFLICTING_DPS_ALIASES' ? { idDps: 'DPS' + '9'.repeat(42) } : {}),
              erros: [{ Codigo: 'E0718', Descricao: 'Do not retain raw provider messages' }] }, 400);
          }
          const signed = decodeFiscalXml(JSON.parse(body!).dpsXmlGZipB64);
          const note = syntheticAuthorizedNote(signed.replace('<vServ>1.00', '<vServ>2.00'), credential);
          return json({ tipoAmbiente: scenario === 'WRONG_ENVIRONMENT' ? 1 : 2, idDps: expectedDpsId,
            chaveAcesso: pilotAccessKey, nfseXmlGZipB64: encodeFiscalXml(note) }, 201);
        } } });
      const result = await pilot.issue({ input, expectedDpsId });
      const rejected = scenario === 'REJECTED' || scenario === 'REJECTED_UPPER_DPS';
      assert(result.state === (rejected ? 'REJECTED' : scenario === 'UNVERIFIED' ? 'BLOCKED' :
        'AWAITING_CONFIRMATION'), `${scenario}: ${JSON.stringify(result)}`);
      if (result.state === 'REJECTED') assert(result.codes.join() === 'E0718');
      if (scenario === 'CONFLICTING_DPS_ALIASES') assert(result.state === 'AWAITING_CONFIRMATION' &&
        result.code === 'RESPONSE_DPS_MISMATCH');
      assert(posts === (['CONSULT_FAILED', 'UNVERIFIED'].includes(scenario) ? 0 : 1));
      assert(!JSON.stringify(result).includes('Do not retain raw provider messages'));
    }
  });
});
