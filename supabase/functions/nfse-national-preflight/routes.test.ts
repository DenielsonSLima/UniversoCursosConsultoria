import assert from 'node:assert/strict';
import { summarizePublicSpec } from './public-contract.ts';
import { municipalRoutes, runPreflight } from './probe.ts';
import type { PreflightMaterial } from './types.ts';

const material = { environment: 'HOMOLOGACAO', month: '2026-11',
  issuer: { municipalityCode: '2803401' }, certificate: { expiresAt: '2027-01-01' } } as PreflightMaterial;
const intent = { scope: material, referenceDate: '2026-11-10', serviceCode: '080101' };
const operation = { get: { parameters: [] } };

Deno.test('public spec projection retains safe official basePath/servers and rejects alternate origins and URI templates', () => {
  const summary = summarizePublicSpec({ openapi: '3.0.1', paths: {}, host: 'adn.producaorestrita.nfse.gov.br',
    basePath: '/parametrizacao/ParametrosMunicipais', servers: [
      { url: '/parametrizacao/ParametrosMunicipais', description: 'SECRET_SENTINEL' },
      { url: 'https://adn.producaorestrita.nfse.gov.br/parametrizacao' }, { url: '/' },
      { url: 'https://adn.nfse.gov.br/parametrizacao' }, { url: 'https://attacker.invalid/parametrizacao' },
      { url: '/parametrizacao/{tenant}' }, { url: '/parametrizacao?token=SECRET_SENTINEL' },
      { url: '//attacker.invalid/parametrizacao' }, { url: '/parametrizacao/../private' },
    ] });
  assert.deepEqual(summary.servers, [{ url: '/parametrizacao/ParametrosMunicipais' },
    { url: 'https://adn.producaorestrita.nfse.gov.br/parametrizacao' }, { url: '/' }]);
  assert.equal(summary.basePath, '/parametrizacao/ParametrosMunicipais');
  assert.equal(summary.host, 'adn.producaorestrita.nfse.gov.br');
  assert.equal(JSON.stringify(summary).includes('SECRET_SENTINEL'), false);
});

Deno.test('municipal route discovery applies official service prefix and date path, never invents a municipal tax code', () => {
  const spec = { openapi: '3.0.1', servers: [{ url: '/parametrizacao/ParametrosMunicipais' }], paths: {
    '/{codigoMunicipio}/convenio': operation,
    '/{codigoMunicipio}/{codigoServico}/{competencia}/aliquota': operation,
    '/{codigoMunicipio}/{codigoServico}/{competencia}/regimes_especiais': operation,
    '/{codigoMunicipio}/{competencia}/retencoes': operation,
    '/{codigoMunicipio}/{numeroBeneficio}/{competencia}/beneficio': operation,
  } };
  const routes = municipalRoutes(spec, material, intent);
  assert.deepEqual(routes.map(route => route.url), [
    'https://adn.producaorestrita.nfse.gov.br/parametrizacao/ParametrosMunicipais/2803401/convenio',
    'https://adn.producaorestrita.nfse.gov.br/parametrizacao/ParametrosMunicipais/2803401/080101/2026-11-10/aliquota',
    'https://adn.producaorestrita.nfse.gov.br/parametrizacao/ParametrosMunicipais/2803401/080101/2026-11-10/regimes_especiais',
    'https://adn.producaorestrita.nfse.gov.br/parametrizacao/ParametrosMunicipais/2803401/2026-11-10/retencoes',
  ]);
  assert.equal(routes.some(route => route.url.includes('beneficio')), false);
  assert.equal(municipalRoutes(spec, material, { ...intent, serviceCode: undefined }).length, 2);
  assert.equal(municipalRoutes(spec, material, { ...intent, serviceCode: '../nfse' }).length, 2);
  assert.equal(municipalRoutes({ ...spec, paths: { '//attacker.invalid/data': operation } }, material, intent).length, 0);
});

Deno.test('municipal HTTP404 remains unclassified and does not become fiscal ineligibility', async () => {
  const spec = { openapi: '3.0.1', basePath: '/parametrizacao/ParametrosMunicipais',
    paths: { '/{codigoMunicipio}/convenio': operation } };
  const result = await runPreflight(material, { intent, transport: { close() {}, async get(url) {
    return { status: url.includes('swagger') && url.includes('adn.') ? 200 : 404,
      tlsVerified: true, body: JSON.stringify(spec) };
  } } });
  assert.equal(result.municipalParameters[0].diagnostic, 'NOT_FOUND_UNCLASSIFIED');
  assert.equal(result.checks.find(check => check.code === 'MUNICIPALITY_PARAMETERS')?.status, 'UNKNOWN');
  assert.equal(result.checks.find(check => check.code === 'REPRESENTATION')?.status, 'UNKNOWN');
});
