import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('DANFSe resolves only missing municipality labels without changing immutable fiscal fields', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'danfse-municipalities-'));
  try {
    const output = join(directory, 'resolver.cjs');
    await build({ entryPoints: [fileURLToPath(new URL('danfse-municipalities.service-core.ts', import.meta.url))],
      bundle: true, platform: 'node', format: 'cjs', outfile: output });
    const { createDanfseMunicipalityResolver } = createRequire(import.meta.url)(output);
    const fields = Object.freeze({
      'emit/enderNac/cMun': ['2800209'], xLocEmi: ['Aquidabã'],
      'DPS/infDPS/toma/end/endNac/cMun': ['2801108'],
    });
    const original = { accessKey: '1'.repeat(50), number: '1', environment: '2', fields,
      renderOptions: { cancellationState: 'CONFIRMED' } };
    const requests = [];
    const resolve = createDanfseMunicipalityResolver(async codes => {
      requests.push(codes);
      return [{ codigo_ibge: 2801108, nome: 'Canhoba', uf: 'SE' },
        { codigo_ibge: 2800209, nome: 'Não sobrescrever XML', uf: 'SE' }];
    });
    const result = await resolve(original, new AbortController().signal);
    assert.deepEqual(requests, [['2801108']]);
    assert.deepEqual(result.municipalityNames, { 2801108: 'Canhoba' });
    assert.equal(result.fields, original.fields);
    assert.equal(result.renderOptions, original.renderOptions);
    assert.equal(original.municipalityNames, undefined);
    const sameCity = { ...original, fields: { ...fields,
      'emit/enderNac/cMun': ['2805604'], xLocEmi: ['Porto da Folha'],
      'DPS/infDPS/toma/end/endNac/cMun': ['2805604'] } };
    assert.equal(await resolve(sameCity, new AbortController().signal), sameCity);
    assert.equal(requests.length, 1, 'An already correct note needs no lookup');
    const invalid = createDanfseMunicipalityResolver(async () => [{ codigo_ibge: '2801108', nome: 'Wrong UF', uf: 'AL' }]);
    assert.deepEqual((await invalid(original, new AbortController().signal)).municipalityNames, {});
    const unknown = createDanfseMunicipalityResolver(async () => []);
    assert.deepEqual((await unknown(original, new AbortController().signal)).municipalityNames, {});
    const abort = new AbortController();
    const cancelled = createDanfseMunicipalityResolver(async () => { abort.abort(); return []; });
    await assert.rejects(cancelled(original, abort.signal), { name: 'AbortError' });
    await assert.rejects(createDanfseMunicipalityResolver(async () => { throw new Error('offline'); })(original,
      new AbortController().signal), /offline/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
