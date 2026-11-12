import assert from 'node:assert/strict';
import { createNationalProductionIssuer } from './production.ts';
import { buildNationalDps } from './dps.ts';
import { createProductionNumericSeriesCompatibilityValidator } from './production-schema.ts';
import { productionFixture, withProductionTestCertificate } from './production.test-fixtures.ts';
import { pilotAccessKey } from './pilot-fixtures.ts';

const json = (value: unknown, status: number) => ({ status,
  body: new TextEncoder().encode(JSON.stringify(value)) });

Deno.test('POST identity conflicts preserve non-identifying evidence without accepting, consulting again or resending', async () => {
  await withProductionTestCertificate(async credential => {
    const input = productionFixture(), expected = buildNationalDps(input).referenceId;
    const variants = [
      { idDps: `NFS${pilotAccessKey}` },
      { idDPS: expected.slice(3) },
      { idDps: null },
      { idDps: 18 },
      { idDps: expected, idDPS: expected.slice(0, -1) + '8' },
      { idDps: '<unsafe>\n' + 'x'.repeat(150) },
    ];
    for (const status of [201, 400]) for (const ids of variants) {
      const calls: string[] = [];
      const issuer = createNationalProductionIssuer({ credential,
        signatureProfile: 'RSA_SHA1_LEGACY', schema: createProductionNumericSeriesCompatibilityValidator(),
        assertLiveContract() {}, transport: { async request(method, path) {
          calls.push(`${method} ${path}`);
          if (method === 'GET') return json({}, 404);
          return json({ tipoAmbiente: 1, ...ids, chaveAcesso: pilotAccessKey,
            nfseXmlGZipB64: 'DO_NOT_RETAIN_XML', privateKey: 'DO_NOT_RETAIN_SECRET',
            erros: [{ Codigo: 'E0001' }] }, status);
        } } });
      const prepared = await issuer.prepare(input, expected);
      const result = await issuer.issue(prepared);
      assert.equal(result.state, 'AWAITING_CONFIRMATION');
      if (result.state !== 'AWAITING_CONFIRMATION') throw new Error('Expected uncertainty');
      assert.equal(result.code, 'RESPONSE_DPS_MISMATCH');
      assert.equal(result.diagnostics?.expectedDpsLength, expected.length);
      assert.equal(result.diagnostics?.chaveAcessoPresent, true);
      assert.deepEqual(Object.keys(result.diagnostics || {}).sort(),
        ['expectedDpsLength', 'chaveAcessoPresent', ...Object.keys(ids)].sort());
      const categories = ['NFS_PREFIX', 'MATCH_WITHOUT_DPS_PREFIX', 'NULL', 'NUMBER',
        'MATCH_EXPECTED_DPS', 'OTHER_STRING'];
      const index = variants.indexOf(ids);
      assert.equal(result.diagnostics?.[index === 1 ? 'idDPS' : 'idDps'], categories[index]);
      if (index === 4) assert.equal(result.diagnostics?.idDPS, 'OTHER_STRING');
      const evidence = JSON.stringify(result.diagnostics);
      for (const forbidden of [pilotAccessKey, expected, expected.slice(3), 'DO_NOT_RETAIN', '<unsafe>', 'xxxx']) {
        assert.ok(!evidence.includes(forbidden), `Leaked response content: ${forbidden}`);
      }
      assert.deepEqual(calls, [`GET /dps/${expected}`, 'POST /nfse']);
    }
  });
});
