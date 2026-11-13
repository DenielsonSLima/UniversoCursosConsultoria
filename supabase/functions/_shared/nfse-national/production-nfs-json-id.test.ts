import assert from 'node:assert/strict';
import { createNationalProductionIssuer } from './production.ts';
import { buildNationalDps } from './dps.ts';
import { createProductionNumericSeriesCompatibilityValidator } from './production-schema.ts';
import { productionFixture, withProductionTestCertificate } from './production.test-fixtures.ts';
import { pilotAccessKey, syntheticAuthorizedNote } from './pilot-fixtures.ts';
import { encodeFiscalXml } from './pilot-codec.ts';
import { assertNationalEnvelope } from './pilot-response.ts';
import { fiscalReadOnlyTransport } from '../../nfse-reconciliation-worker/read-only-transport.ts';

const json = (value: unknown, status = 200) => ({ status, body: new TextEncoder().encode(JSON.stringify(value)) });

Deno.test('production NFS JSON alias authorizes only with the exact access key and full same-DPS XML', async () => {
  await withProductionTestCertificate(async credential => {
    const input = productionFixture(), expected = buildNationalDps(input).referenceId;
    for (const action of ['ISSUE', 'RECONCILE'] as const) for (const field of ['idDps', 'idDPS', 'BOTH']) {
      const calls: string[] = []; let xml = '';
      const raw = { async request(method: 'GET' | 'POST', path: string) {
        calls.push(`${method} ${path}`);
        if (action === 'ISSUE' && method === 'GET') return json({}, 404);
        const identifiers = field === 'BOTH' ? { idDps: expected, idDPS: `NFS${pilotAccessKey}` }
          : { [field]: `NFS${pilotAccessKey}` };
        return json({ tipoAmbiente: 1, chaveAcesso: pilotAccessKey, ...identifiers,
          ...(path.startsWith('/dps/') ? {} : { nfseXmlGZipB64: encodeFiscalXml(xml) }) }, method === 'POST' ? 201 : 200);
      } };
      const issuer = createNationalProductionIssuer({ credential, signatureProfile: 'RSA_SHA1_LEGACY',
        schema: createProductionNumericSeriesCompatibilityValidator(), assertLiveContract() {},
        transport: action === 'RECONCILE' ? fiscalReadOnlyTransport(raw, expected) : raw });
      const prepared = await issuer.prepare(input, expected);
      xml = syntheticAuthorizedNote(prepared.signedDpsXml, credential);
      const result = await (action === 'ISSUE' ? issuer.issue(prepared) : issuer.reconcile(prepared));
      assert.equal(result.state, 'AUTHORIZED', `${action}/${field}`);
      if (result.state === 'AUTHORIZED') { assert.equal(result.dpsId, expected); assert.equal(result.authorizedXml, xml); }
      assert.deepEqual(calls, action === 'ISSUE' ? [`GET /dps/${expected}`, 'POST /nfse']
        : [`GET /dps/${expected}`, `GET /nfse/${pilotAccessKey}`]);
    }
  });
});

Deno.test('NFS hints never replace fiscal XML identity, payload, environment or a usable XML proof', async () => {
  await withProductionTestCertificate(async credential => {
    const input = productionFixture(), expected = buildNationalDps(input).referenceId;
    for (const scenario of ['OTHER_ALIAS_KEY', 'CONFLICT', 'NULL', 'NUMBER', 'BAD_KEY', 'WRONG_ENV',
      'WRONG_DPS', 'WRONG_PAYLOAD', 'WRONG_XML_ENV', 'MISSING_XML', 'NOT_AUTHORIZED'] as const) {
      let xml = ''; const calls: string[] = [];
      const issuer = createNationalProductionIssuer({ credential, signatureProfile: 'RSA_SHA1_LEGACY',
        schema: createProductionNumericSeriesCompatibilityValidator(), assertLiveContract() {}, transport: {
          async request(method, path) {
            calls.push(`${method} ${path}`);
            if (method === 'GET') return json({}, 404);
            let returned = xml;
            if (scenario === 'WRONG_DPS') returned = returned.replace(`Id="${expected}"`, `Id="${expected.slice(0, -1)}4"`);
            if (scenario === 'WRONG_PAYLOAD') returned = returned.replace('<vServ>1.00', '<vServ>2.00');
            if (scenario === 'WRONG_XML_ENV') returned = returned.replace('<tpAmb>1</tpAmb>', '<tpAmb>2</tpAmb>');
            if (scenario === 'NOT_AUTHORIZED') returned = returned.replace('<cStat>100</cStat>', '<cStat>101</cStat>');
            const alias = scenario === 'OTHER_ALIAS_KEY' ? `NFS${'7'.repeat(50)}` : scenario === 'NULL' ? null
              : scenario === 'NUMBER' ? 123 : `NFS${pilotAccessKey}`;
            return json({ tipoAmbiente: scenario === 'WRONG_ENV' ? 2 : 1, idDps: alias,
              chaveAcesso: scenario === 'BAD_KEY' ? 'invalid' : pilotAccessKey,
              ...(scenario === 'CONFLICT' ? { idDPS: `DPS${'7'.repeat(42)}` } : {}),
              ...(scenario === 'MISSING_XML' ? {} : { nfseXmlGZipB64: encodeFiscalXml(returned) }) }, 201);
          },
        } });
      const prepared = await issuer.prepare(input, expected); xml = syntheticAuthorizedNote(prepared.signedDpsXml, credential);
      assert.equal((await issuer.issue(prepared)).state, 'AWAITING_CONFIRMATION', scenario);
      assert.deepEqual(calls, [`GET /dps/${expected}`, 'POST /nfse']);
    }
    assert.throws(() => assertNationalEnvelope({ tipoAmbiente: 2, idDps: `NFS${pilotAccessKey}`,
      chaveAcesso: pilotAccessKey }, 'HOMOLOGACAO', expected), /RESPONSE_DPS_MISMATCH/);
  });
});
