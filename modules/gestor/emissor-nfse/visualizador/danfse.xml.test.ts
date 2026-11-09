import assert from 'node:assert/strict';
import test from 'node:test';
import { DOMParser as TestDomParser } from '@xmldom/xmldom';
import { parseDanfseXml } from './danfse.xml';
import { DANFSE_XML_MAX_BYTES, danfseConsultationUrl, dpsValue } from './danfse.types';
import { danfseDate, danfseMoney } from './danfse.presentation';

const KEY = '1'.repeat(50);
const xml = `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS${KEY}">
  <nNFSe>25</nNFSe><valores><vLiq>1234567890123456.78</vLiq></valores>
  <DPS><infDPS><tpAmb>2</tpAmb><nDPS>10</nDPS><dCompet>2026-11-01</dCompet>
    <serv><cServ><xDescServ>Serviço fictício &amp; treinamento</xDescServ></cServ></serv>
  </infDPS></DPS></infNFSe></NFSe>`;
const parser = { parseFromString: (source: string) => new TestDomParser({
  onError: (level, message) => { if (level === 'error' || level === 'fatalError') throw new Error(message); },
}).parseFromString(source, 'application/xml') as unknown as Document };
const parse = (source: string) => parseDanfseXml(source, parser);

test('national XML accepts namespace prefixes and preserves canonical decimal strings', () => {
  const plain = parse(xml);
  const prefixed = xml.replace('xmlns=', 'xmlns:n=').replace(/<(\/?)([A-Za-z][A-Za-z0-9]*)(?=[\s>])/g, '<$1n:$2');
  assert.deepEqual(parse(prefixed), plain);
  assert.equal(plain.number, '25');
  assert.equal(plain.environment, '2');
  assert.equal(plain.fields['valores/vLiq'][0], '1234567890123456.78');
  assert.equal(dpsValue(plain, 'serv/cServ/xDescServ'), 'Serviço fictício & treinamento');
  assert.ok(Object.isFrozen(plain.fields));
  assert.equal('authorized' in plain, false);
  assert.equal('signatureValid' in plain, false);
});

test('DTD, entities, external stylesheets and foreign namespaces are rejected before rendering', () => {
  for (const declaration of [
    '<!DOCTYPE NFSe SYSTEM "https://example.invalid/secret">',
    '<!DOCTYPE NFSe [<!ENTITY name SYSTEM "file:///etc/passwd">]>',
    '<?xml-stylesheet href="https://example.invalid/style.xsl" type="text/xsl"?>',
  ]) assert.throws(() => parse(declaration + xml), /declaração não permitida/);
  assert.throws(() => parse(xml.replace('www.sped.fazenda.gov.br/nfse', 'example.invalid/nfse')), /NFS-e Nacional válido/);
  assert.throws(() => parse(xml.replace('<nNFSe>', '<nNFSe xmlns="https://example.invalid">')), /NFS-e Nacional válido/);
  assert.throws(() => parse(xml.replace('<nNFSe>25</nNFSe>', '<nNFSe>25</nNFSe><nNFSe>26</nNFSe>')), /duplicados/);
});

test('malformed, oversized, deeply nested and invalid key/value inputs fail closed', () => {
  assert.throws(() => parse(xml.replace('</infNFSe>', '')), /NFS-e Nacional válido/);
  assert.throws(() => parse(xml.replace(`NFS${KEY}`, 'NFS123')), /50 dígitos/);
  assert.throws(() => parse(' '.repeat(DANFSE_XML_MAX_BYTES + 1)), /2 MB/);
  assert.throws(() => parse(xml.replace('1234567890123456.78', 'NaN')), /monetário inválido/);
  assert.throws(() => parse(xml.replace('<nNFSe>', '<a>'.repeat(36) + '</a>'.repeat(36) + '<nNFSe>')), /limites/);
  assert.throws(() => parse(xml.replace('</NFSe>', '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">' + '<a>'.repeat(36) + '</a>'.repeat(36) + '</Signature></NFSe>')), /limites/);
  assert.throws(() => parse(xml.replace('</NFSe>', xml.match(/<infNFSe[\s\S]*<\/infNFSe>/)![0] + '</NFSe>')), /NFS-e Nacional válido/);
  assert.throws(() => parse(xml.replace('<tpAmb>2</tpAmb>', '').replace('<DPS>', '<DPS><infDPS><tpAmb>2</tpAmb></infDPS></DPS><DPS>')), /NFS-e Nacional válido/);
});

test('signature and arbitrary XML URL content are never treated as authority or QR targets', () => {
  const source = xml.replace('</infNFSe>', `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><Reference URI="https://example.invalid/signature" /></Signature><xOutInf>https://example.invalid/anything</xOutInf></infNFSe>`);
  const parsed = parse(source);
  assert.equal(Object.keys(parsed.fields).some(key => key.includes('Signature')), false);
  assert.equal(parsed.fields.xOutInf[0], 'https://example.invalid/anything');
  assert.equal(danfseConsultationUrl(parsed.accessKey), `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${KEY}`);
  assert.throws(() => danfseConsultationUrl('https://example.invalid'), /Chave de acesso inválida/);
});

test('presentation preserves precision, absence and the issued local date without recalculating', () => {
  assert.equal(danfseMoney('1234567890123456.78'), 'R$ 1.234.567.890.123.456,78');
  assert.equal(danfseMoney('0'), 'R$ 0,00');
  assert.equal(danfseMoney('1.2345'), 'R$ 1,2345');
  assert.equal(danfseMoney(''), '-');
  assert.equal(danfseDate('2026-11-01T00:05:00-03:00'), '01/11/2026 00:05:00');
  assert.equal(danfseDate('2026-11-01'), '01/11/2026');
  for (const invalid of ['2026-02-29', '2026-99-40T99:99:99+99:99', '2026-11-01T00:00:00+14:30']) {
    assert.throws(() => danfseDate(invalid), /Data inválida/);
  }
  assert.equal(danfseDate('2024-02-29'), '29/02/2024');
});
