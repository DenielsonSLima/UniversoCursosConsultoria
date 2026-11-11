import { DOMParser } from 'npm:@xmldom/xmldom@0.8.15';
import { assertSafeFiscalXml, decodeFiscalXml } from './pilot-codec.ts';
import { NFSE_NAMESPACE, NfseContractError, requireContract } from './xml.ts';
import type { HomologationSchemaValidator } from './pilot.types.ts';

type XmlElement = ReturnType<DOMParser['parseFromString']>['documentElement'];

function parse(xml: string) {
  assertSafeFiscalXml(xml);
  const invalid = () => { throw new NfseContractError('INVALID_AUTHORIZED_XML'); };
  const dom = new DOMParser({ errorHandler: { warning: invalid, error: invalid, fatalError: invalid } })
    .parseFromString(xml, 'application/xml');
  requireContract(Array.from(dom.childNodes).filter(node => node.nodeType === 1).length === 1,
    'INVALID_AUTHORIZED_XML');
  return dom;
}

function one(parent: XmlElement, name: string): XmlElement {
  const matches = Array.from(parent.childNodes).filter(node => node.nodeType === 1 &&
    (node as XmlElement).localName === name && (node as XmlElement).namespaceURI === NFSE_NAMESPACE);
  requireContract(matches.length === 1, 'AUTHORIZATION_XML_IDENTITY_MISMATCH');
  return matches[0] as XmlElement;
}

/** Prefix/formatting independent, but every declared attribute, element and value must match. */
function semantic(element: XmlElement): string {
  const attrs = Array.from(element.attributes).filter(attr => attr.namespaceURI !== 'http://www.w3.org/2000/xmlns/')
    .map(attr => `${attr.namespaceURI || ''}|${attr.localName}=${JSON.stringify(attr.value)}`).sort();
  const content = Array.from(element.childNodes).map(node => {
    if (node.nodeType === 1) return semantic(node as XmlElement);
    if (node.nodeType === 3 || node.nodeType === 4) return (node.nodeValue || '').trim()
      ? JSON.stringify(node.nodeValue) : '';
    return '';
  }).join('');
  return `[${element.namespaceURI}|${element.localName}|${attrs.join('|')}]${content}[/]`;
}

export function assertHomologationEnvelope(envelope: Record<string, unknown>, dpsId?: string): void {
  assertNationalEnvelope(envelope, 'HOMOLOGACAO', dpsId);
}

export function assertNationalEnvelope(envelope: Record<string, unknown>,
  environment: 'HOMOLOGACAO' | 'PRODUCAO', dpsId?: string): void {
  requireContract(envelope.tipoAmbiente === (environment === 'HOMOLOGACAO' ? 2 : 1),
    'RESPONSE_ENVIRONMENT_MISMATCH');
  if (dpsId !== undefined) {
    const identifiers = [envelope.idDps, envelope.idDPS].filter(value => value !== undefined);
    requireContract(identifiers.length > 0 && identifiers.every(value => value === dpsId),
      'RESPONSE_DPS_MISMATCH');
  }
}

export function readAccessKey(envelope: Record<string, unknown>): string {
  requireContract(typeof envelope.chaveAcesso === 'string' && /^\d{50}$/.test(envelope.chaveAcesso),
    'INVALID_AUTHORIZED_ACCESS_KEY');
  return envelope.chaveAcesso;
}

export async function readAuthorizedXml(envelope: Record<string, unknown>, expected: {
  dpsId: string; accessKey: string; signedDpsXml: string;
}, schema: HomologationSchemaValidator,
  environment: 'HOMOLOGACAO' | 'PRODUCAO' = 'HOMOLOGACAO'): Promise<{ authorizedXml: string; number: string }> {
  assertNationalEnvelope(envelope, environment);
  const xml = decodeFiscalXml(envelope.nfseXmlGZipB64);
  await schema.validate(xml, 'NFSe_v1.01.xsd', environment);
  const dom = parse(xml);
  const root = dom.documentElement;
  requireContract(root.localName === 'NFSe' && root.namespaceURI === NFSE_NAMESPACE &&
    root.getAttribute('versao') === '1.01', 'AUTHORIZATION_XML_IDENTITY_MISMATCH');
  const info = one(root, 'infNFSe');
  requireContract(info.getAttribute('Id') === `NFS${expected.accessKey}` && one(info, 'cStat').textContent === '100',
    'AUTHORIZATION_XML_IDENTITY_MISMATCH');
  const dps = one(info, 'DPS');
  const dpsInfo = one(dps, 'infDPS');
  requireContract(dpsInfo.getAttribute('Id') === expected.dpsId &&
    one(dpsInfo, 'tpAmb').textContent === (environment === 'HOMOLOGACAO' ? '2' : '1'),
    'AUTHORIZATION_XML_IDENTITY_MISMATCH');
  const sentInfo = one(parse(expected.signedDpsXml).documentElement, 'infDPS');
  requireContract(semantic(dpsInfo) === semantic(sentInfo), 'AUTHORIZED_DPS_PAYLOAD_MISMATCH');
  const number = one(info, 'nNFSe').textContent || '';
  requireContract(/^[1-9]\d{0,12}$/.test(number), 'INVALID_AUTHORIZED_NUMBER');
  const issuer = one(sentInfo, 'prest');
  const issuerCnpj = one(issuer, 'CNPJ').textContent || '';
  requireContract(one(one(info, 'emit'), 'CNPJ').textContent === issuerCnpj &&
    expected.accessKey.slice(0, 7) === one(sentInfo, 'cLocEmi').textContent &&
    expected.accessKey[7] === one(info, 'ambGer').textContent && expected.accessKey[8] === '2' &&
    expected.accessKey.slice(9, 23) === issuerCnpj &&
    expected.accessKey.slice(23, 36) === number.padStart(13, '0'), 'ACCESS_KEY_XML_MISMATCH');
  return { authorizedXml: xml, number };
}

export { parse as parseNationalFiscalXml, one as nationalFiscalChild, semantic as nationalFiscalSemantic };
