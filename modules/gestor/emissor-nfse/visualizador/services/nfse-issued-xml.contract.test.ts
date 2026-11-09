import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { DOMParser as TestDomParser } from '@xmldom/xmldom';
import { NfseContractError, NfseUnavailableError } from '../../services/nfse.errors';
import type { NfseScope } from '../../types/nfse.types';
import { parseDanfseXml } from '../danfse.xml';
import { createNfseIssuedArtifactService, createNfseIssuedXmlService, NFSE_AUTHORIZED_XML_RPC } from './nfse-issued-xml.service-core';

const scope: NfseScope = { contextKey: 'synthetic-context',
  poloId: '00000000-0000-0000-0000-000000000001', environment: 'HOMOLOGACAO', month: '2026-11' };
const selected = { id: 'synthetic-document', status: 'EMITIDA' as const, number: '25', accessKey: '1'.repeat(50) };
const xml = `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS${selected.accessKey}">
  <nNFSe>25</nNFSe><DPS><infDPS><tpAmb>2</tpAmb><nDPS>10</nDPS><dCompet>2026-11-01</dCompet>
  <serv><cServ><xDescServ>Serviço sintético</xDescServ></cServ></serv></infDPS></DPS></infNFSe></NFSe>`;
const artifact = (source = xml) => ({ documentId: selected.id, status: selected.status,
  accessKey: selected.accessKey, number: selected.number, xml: source,
  sha256: createHash('sha256').update(source).digest('hex') });
const envelope = (data: unknown, echoed = scope) => ({ version: 1, scope: echoed, data });
const parse = (source: string) => parseDanfseXml(source, { parseFromString: value => new TestDomParser({
  onError: (level, message) => { if (level === 'error' || level === 'fatalError') throw new Error(message); },
}).parseFromString(value, 'application/xml') as unknown as Document });

test('download artifact preserves exact authorized XML rather than serializing a new document', async () => {
  const original = '<?xml version="1.0"?>\r\n' + xml;
  const read = createNfseIssuedArtifactService(async () => envelope({ ...artifact(original), storagePath: 'ignored' }), true, parse);
  const result = await read(scope, selected);
  assert.equal(result.xml, original);
  assert.equal(result.document.accessKey, selected.accessKey);
  assert.equal('storagePath' in result, false);
});

test('preview stays blocked before deployment of the authorized-document backend', async () => {
  let calls = 0;
  const read = createNfseIssuedXmlService(async () => { calls++; return null; });
  await assert.rejects(read(scope, selected), NfseUnavailableError);
  assert.equal(calls, 0);
});

test('preview requests the selected document in its scope and projects only matching XML', async () => {
  const controller = new AbortController();
  const read = createNfseIssuedXmlService(async (name, args, signal) => {
    assert.equal(name, NFSE_AUTHORIZED_XML_RPC);
    assert.deepEqual(args, { p_context_key: scope.contextKey, p_polo_id: scope.poloId,
      p_environment: scope.environment, p_month: scope.month, p_document_id: selected.id });
    assert.equal(signal, controller.signal);
    return envelope({ ...artifact(), storagePath: 'must-not-be-retained', privateKey: 'must-not-be-retained' });
  }, true, parse);
  const result = await read(scope, selected, controller.signal);
  assert.equal(result.accessKey, selected.accessKey);
  assert.equal(result.number, selected.number);
  for (const key of ['xml', 'storagePath', 'privateKey', 'authorized', 'signatureValid']) assert.equal(key in result, false);
});

test('pending or malformed document identities never reach the transport', async () => {
  let calls = 0;
  const read = createNfseIssuedXmlService(async () => { calls++; return envelope(artifact()); }, true, parse);
  for (const patch of [{ status: 'PENDENTE' }, { status: 'AGUARDANDO_CONFIRMACAO' },
    { accessKey: null }, { accessKey: 'bad' }, { number: null }, { id: '' }]) {
    await assert.rejects(read(scope, { ...selected, ...patch } as never), NfseContractError);
  }
  assert.equal(calls, 0);
});

test('another context, polo, month, environment or response version is rejected', async () => {
  for (const patch of [{ contextKey: 'other' }, { poloId: 'other' }, { month: '2026-10' },
    { environment: 'PRODUCAO' as const }]) {
    const read = createNfseIssuedXmlService(async () => envelope(artifact(), { ...scope, ...patch }), true, parse);
    await assert.rejects(read(scope, selected), NfseContractError);
  }
  const read = createNfseIssuedXmlService(async () => ({ ...envelope(artifact()), version: 2 }), true, parse);
  await assert.rejects(read(scope, selected), NfseContractError);
});

test('document ID, authorization state, number, key and content digest must match', async () => {
  for (const patch of [{ documentId: 'other' }, { status: 'PENDENTE' }, { number: '26' },
    { accessKey: '2'.repeat(50) }, { sha256: '0'.repeat(64) }, { sha256: null },
    { xml: xml.replace('Serviço sintético', 'Alterado') }, { xml: '' }, { xml: 'x'.repeat(2 * 1024 * 1024 + 1) }]) {
    const read = createNfseIssuedXmlService(async () => envelope({ ...artifact(), ...patch }), true, parse);
    await assert.rejects(read(scope, selected), NfseContractError);
  }
});

test('valid digest cannot hide an XML for a different note or environment', async () => {
  for (const source of [xml.replace(selected.accessKey, '2'.repeat(50)),
    xml.replace('<nNFSe>25</nNFSe>', '<nNFSe>26</nNFSe>'), xml.replace('<tpAmb>2</tpAmb>', '<tpAmb>1</tpAmb>')]) {
    const read = createNfseIssuedXmlService(async () => envelope(artifact(source)), true, parse);
    await assert.rejects(read(scope, selected), NfseContractError);
  }
});

test('closing or switching context aborts before transport and ignores a delayed response', async () => {
  const controller = new AbortController();
  let calls = 0;
  const read = createNfseIssuedXmlService(async () => {
    calls++;
    controller.abort();
    return envelope(artifact());
  }, true, parse);
  await assert.rejects(read(scope, selected, controller.signal), { name: 'AbortError' });
  await assert.rejects(read(scope, selected, controller.signal), { name: 'AbortError' });
  assert.equal(calls, 1);
});
