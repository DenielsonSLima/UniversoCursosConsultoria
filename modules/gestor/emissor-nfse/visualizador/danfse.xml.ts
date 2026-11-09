import { DANFSE_XML_MAX_BYTES, DANFSE_XML_NAMESPACE, DPS, type DanfseDocument } from './danfse.types';

interface XmlParser { parseFromString(source: string, type: 'application/xml'): Document }
const SIGNATURE_NAMESPACE = 'http://www.w3.org/2000/09/xmldsig#';
const invalidXml = () => new Error('Selecione um XML NFS-e Nacional válido.');
const children = (element: globalThis.Element): globalThis.Element[] => Array.from(element.childNodes)
  .filter((node): node is globalThis.Element => node.nodeType === 1);
const hasInvalidControl = (value: string) => Array.from(value).some(character => {
  const code = character.charCodeAt(0);
  return code < 32 && code !== 9 && code !== 10 && code !== 13;
});

/** Parse locally. DTDs, entities, external instructions and signature wrappers are never resolved. */
export function parseDanfseXml(source: string, parser?: XmlParser): DanfseDocument {
  if (!source.trim() || new TextEncoder().encode(source).length > DANFSE_XML_MAX_BYTES) {
    throw new Error('O XML deve ter até 2 MB.');
  }
  let markupCount = 0;
  for (let offset = source.indexOf('<'); offset >= 0; offset = source.indexOf('<', offset + 1)) {
    if (++markupCount > 30000) throw new Error('O XML excede os limites de leitura.');
  }
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source) || source.includes(String.fromCharCode(0))
    || /<\?(?!xml\s)[\s\S]*?\?>/i.test(source)
    || /<\?xml\s[^?]*encoding\s*=\s*["'](?!utf-8["']|utf-16["'])/i.test(source)) {
    throw new Error('O XML contém uma declaração não permitida.');
  }
  let document: Document;
  try { document = (parser ?? new globalThis.DOMParser()).parseFromString(source, 'application/xml'); }
  catch { throw invalidXml(); }
  if (document.getElementsByTagName('parsererror').length || document.doctype) throw invalidXml();
  const root = document.documentElement;
  if (!root || root.localName !== 'NFSe' || root.namespaceURI !== DANFSE_XML_NAMESPACE) throw invalidXml();
  const stack: { node: globalThis.Element; depth: number }[] = [{ node: root, depth: 0 }];
  let totalElements = 0;
  while (stack.length) {
    const current = stack.pop()!;
    if (++totalElements > 15000 || current.depth > 35) throw new Error('O XML excede os limites de leitura.');
    for (const node of children(current.node)) stack.push({ node, depth: current.depth + 1 });
  }
  const infos = children(root).filter(node => node.localName === 'infNFSe' && node.namespaceURI === DANFSE_XML_NAMESPACE);
  if (infos.length !== 1) throw invalidXml();
  const info = infos[0];
  const declarations = children(info).filter(node => node.localName === 'DPS' && node.namespaceURI === DANFSE_XML_NAMESPACE);
  if (declarations.length !== 1) throw invalidXml();
  const dpsInfos = children(declarations[0]).filter(node => node.localName === 'infDPS' && node.namespaceURI === DANFSE_XML_NAMESPACE);
  if (dpsInfos.length !== 1) throw invalidXml();
  const id = info.getAttribute('Id') ?? '';
  if (!/^NFS\d{50}$/.test(id)) throw new Error('O XML não possui uma chave NFS-e de 50 dígitos.');
  const fields: Record<string, string[]> = Object.create(null);
  let nodeCount = 0;
  const visit = (node: globalThis.Element, path: string, depth: number) => {
    if (++nodeCount > 15000 || depth > 35) throw new Error('O XML excede os limites de leitura.');
    if (node.namespaceURI === SIGNATURE_NAMESPACE && node.localName === 'Signature') return;
    if (node.namespaceURI !== DANFSE_XML_NAMESPACE) throw invalidXml();
    const elements = children(node);
    if (!elements.length) {
      const value = (node.textContent ?? '').trim();
      if (value.length > 6000 || hasInvalidControl(value)) throw invalidXml();
      if (fields[path] && !path.includes('/gItemPed/')) throw new Error('O XML possui campos fiscais duplicados.');
      (fields[path] ??= []).push(value);
      return;
    }
    for (const child of elements) visit(child, path ? `${path}/${child.localName}` : child.localName, depth + 1);
  };
  visit(info, '', 0);
  const number = fields.nNFSe?.[0] ?? '';
  const environment = fields[`${DPS}tpAmb`]?.[0];
  if (!/^\d{1,15}$/.test(number) || (environment !== '1' && environment !== '2')) throw invalidXml();
  if (!fields[`${DPS}nDPS`]?.[0] || !fields[`${DPS}dCompet`]?.[0]
    || !fields[`${DPS}serv/cServ/xDescServ`]?.[0]) throw invalidXml();
  for (const [path, values] of Object.entries(fields)) {
    if (/(?:^|\/)v[A-Z]/.test(path) && !path.endsWith('/verAplic') && !path.endsWith('verAplic')) {
      for (const value of values) if (value && !/^\d{1,18}(?:\.\d{1,4})?$/.test(value)) {
        throw new Error('O XML contém um valor monetário inválido.');
      }
    }
    Object.freeze(values);
  }
  return Object.freeze({ accessKey: id.slice(3), number, environment, fields: Object.freeze(fields) });
}
