import { assessNationalProductionContract, assertNationalProductionContract,
  type ProductionContractEvidence } from './production-live-contract.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
const object = (types: Record<string, string>, required: string[] = []) => ({ type: 'object', required,
  properties: Object.fromEntries(Object.entries(types).map(([name, type]) => [name, { type }])) });
function evidence(): ProductionContractEvidence {
  const schemas = {
    IssueRequest: object({ dpsXmlGZipB64: 'string' }, ['dpsXmlGZipB64']),
    IssueResponse: object({ tipoAmbiente: 'integer', idDps: 'string', chaveAcesso: 'string', nfseXmlGZipB64: 'string' }),
    NoteResponse: object({ tipoAmbiente: 'integer', nfseXmlGZipB64: 'string' }),
    DpsResponse: object({ tipoAmbiente: 'integer', idDps: 'string', chaveAcesso: 'string' }),
    EventRequest: object({ pedidoRegistroEventoXmlGZipB64: 'string' }, ['pedidoRegistroEventoXmlGZipB64']),
    EventItem: object({ idEvento: 'string', eventoXmlGZipB64: 'string' }),
    EventsResponse: { type: 'object', properties: { tipoAmbiente: { type: 'integer' },
      eventos: { type: 'array', items: { $ref: '#/definitions/EventItem' } } } },
  };
  const response = (name: string) => ({ schema: { $ref: `#/definitions/${name}` } });
  const body = (name: string) => [{ in: 'body', required: true, schema: { $ref: `#/definitions/${name}` } }];
  return { environment: 'PRODUCAO', checkedAt: '2026-11-11T01:00:00Z', status: 200,
    url: 'https://sefin.nfse.gov.br/SefinNacional/swagger/docs/v1', tlsVerified: true, certificateValid: true,
    specification: { swagger: '2.0', definitions: schemas, paths: {
      '/nfse': { post: { parameters: body('IssueRequest'), responses: { 201: response('IssueResponse') } } },
      '/dps/{id}': { get: { responses: { 200: response('DpsResponse') } } },
      '/nfse/{chaveAcesso}': { get: { responses: { 200: response('NoteResponse') } } },
      '/nfse/{chaveAcesso}/eventos': {
        get: { responses: { 200: response('EventsResponse') } },
        post: { parameters: body('EventRequest'), responses: {} },
      },
    } } };
}
const now = Date.parse('2026-11-11T01:00:00Z');

Deno.test('production gate requires verified fresh Swagger and records the validated authorized XML profile', () => {
  const assessment = assessNationalProductionContract(evidence(), now);
  assert(assessment.transportAvailable && assessment.cancellationAvailable);
  assert(assessment.issueAvailable && assessment.issueReason === null);
  assert(assessment.source.schemaProfile === 'PRODUCTION_NUMERIC_SERIES_COMPATIBILITY_20260209' &&
    assessment.source.authorizedReference.derivedFullXsdValid === true);
  assert(assessment.eventContract?.requestProperty === 'pedidoRegistroEventoXmlGZipB64' &&
    assessment.eventContract.listProperty === 'eventos' && assessment.eventContract.xmlProperty === 'eventoXmlGZipB64');
  assertNationalProductionContract(evidence(), 'CANCEL', now);
  assertNationalProductionContract(evidence(), 'ISSUE', now);
});

Deno.test('production contract rejects stale, unverified, HOMO, missing issue and unverified event contracts', () => {
  for (const change of [
    { checkedAt: '2026-11-11T00:54:59Z' }, { checkedAt: '2026-11-11T01:00:06Z' },
    { tlsVerified: false }, { certificateValid: false }, { status: 403 },
    { url: 'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/swagger/docs/v1' },
    { specification: {} },
  ]) assert(!assessNationalProductionContract({ ...evidence(), ...change }, now).transportAvailable);
  const missing = evidence();
  const spec = missing.specification as { paths: Record<string, unknown> };
  delete spec.paths['/nfse/{chaveAcesso}/eventos'];
  const assessment = assessNationalProductionContract(missing, now);
  assert(assessment.transportAvailable && !assessment.cancellationAvailable && assessment.eventContract === null);
  const changedSignature = evidence();
  (changedSignature.specification as Record<string, unknown>).description = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
  assert(assessNationalProductionContract(changedSignature, now).issueReason === 'PRODUCTION_SIGNATURE_PROFILE_CHANGED');
});

Deno.test('production cancellation uses the authenticated detail GET and single-event success schema',()=>{
  const live=evidence();
  const spec=live.specification as {paths:Record<string,unknown>;definitions:Record<string,unknown>};
  spec.definitions.EventSuccess=object({tipoAmbiente:'integer',versaoAplicativo:'string',dataHoraProcessamento:'string',eventoXmlGZipB64:'string'},
    ['tipoAmbiente','versaoAplicativo','dataHoraProcessamento','eventoXmlGZipB64']);
  const response={schema:{$ref:'#/definitions/EventSuccess'}};
  spec.paths['/nfse/{chaveAcesso}/eventos']={post:{parameters:[{in:'body',required:true,schema:{$ref:'#/definitions/EventRequest'}}],responses:{201:response}}};
  spec.paths['/nfse/{chaveAcesso}/eventos/{tipoEvento}/{numSeqEvento}']={get:{responses:{200:response}}};
  const assessed=assessNationalProductionContract(live,now);
  assert(assessed.cancellationAvailable&&assessed.eventContract?.responseMode==='ARCHIVE_DOUBLE_BASE64_GZIP'&&assessed.eventContract.lookupSequence==='001');
  assert(assessed.eventContract.listProperty==='eventos'&&assessed.eventContract.xmlProperty==='arquivoXml');
  spec.definitions.EventSuccess=object({tipoAmbiente:'integer',eventoXmlGZipB64:'integer'});
  assert(!assessNationalProductionContract(live,now).cancellationAvailable);
});
