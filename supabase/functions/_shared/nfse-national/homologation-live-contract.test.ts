import { assessHomologationPilotContract, assertNationalHomologationPilotContract,
  type HomologationProbeEvidence } from './homologation-live-contract.ts';

function assert(value: unknown): asserts value { if (!value) throw new Error('Assertion failed'); }
function fixture(): HomologationProbeEvidence {
  const url = 'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/swagger/docs/v1';
  const fields = (names: string[]) => ({ type: 'object', properties: Object.fromEntries(names.map(name =>
    [name, { type: name === 'tipoAmbiente' ? 'integer' : 'string' }])) });
  return { checkedAt: new Date().toISOString(), environment: 'HOMOLOGACAO',
    checks: [{ code: 'CERTIFICATE_VALID', status: 'PASSED' }],
    endpoints: [{ url, status: 200, tlsVerified: true, error: null }],
    contracts: [{ kind: 'SEFIN', url, summary: { version: '2.0', signatureAlgorithmReferences: [],
      paths: [{ path: '/nfse', operations: [{ method: 'POST', requestBody: null,
        parameters: [{ in: 'body', required: true, schema: { $ref: '#/definitions/NFSePostRequest' } }] }] },
      { path: '/dps/{id}', operations: [{ method: 'GET', parameters: [], requestBody: null }] },
      { path: '/nfse/{chaveAcesso}', operations: [{ method: 'GET', parameters: [], requestBody: null }] }],
      schemas: { NFSePostRequest: { ...fields(['dpsXmlGZipB64']), required: ['dpsXmlGZipB64'] },
        NFSePostResponseSucesso: fields(['tipoAmbiente', 'idDps', 'chaveAcesso', 'nfseXmlGZipB64']),
        NFSeGetResponseSucesso: fields(['tipoAmbiente', 'nfseXmlGZipB64']),
        DpsGetResponse: fields(['tipoAmbiente', 'idDps', 'chaveAcesso']) } } }],
  };
}

Deno.test('documentary gate permits fresh mTLS-backed synthetic experiment without claiming acceptance', () => {
  const result = assessHomologationPilotContract(fixture());
  assert(result.available && result.profile === 'RSA_SHA1_LEGACY' && result.acceptance === 'TO_BE_TESTED');
  assert(result.source.schemaValidator === 'libxml2-wasm@0.7.2');
  assertNationalHomologationPilotContract(fixture());
});

Deno.test('pilot gate rejects production, stale preflight, missing TLS and changed required contract', () => {
  for (const scenario of ['PRODUCTION', 'STALE', 'TLS', 'ENVELOPE', 'PROFILE']) {
    const probe = fixture();
    if (scenario === 'PRODUCTION') probe.environment = 'PRODUCAO';
    if (scenario === 'STALE') probe.checkedAt = new Date(Date.now() - 300_001).toISOString();
    if (scenario === 'TLS') probe.endpoints[0].tlsVerified = false;
    if (scenario === 'ENVELOPE') probe.contracts[0].summary.schemas.NFSePostRequest = {};
    if (scenario === 'PROFILE') probe.contracts[0].summary.signatureAlgorithmReferences =
      ['http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'];
    assert(!assessHomologationPilotContract(probe).available);
  }
});
