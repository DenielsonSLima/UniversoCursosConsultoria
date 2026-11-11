import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { gzipSync, gunzipSync } from 'node:zlib';
import { NfseContractError, requireContract } from './xml.ts';

export const MAX_FISCAL_XML_BYTES = 4 * 1024 * 1024;
export const MAX_FISCAL_JSON_BYTES = 8 * 1024 * 1024;

function hasForbiddenXmlControl(xml: string): boolean {
  for (let index = 0; index < xml.length; index++) {
    const code = xml.charCodeAt(index);
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) return true;
  }
  return false;
}

export function assertSafeFiscalXml(xml: string): void {
  requireContract(typeof xml === 'string' && Buffer.byteLength(xml) > 0 &&
    Buffer.byteLength(xml) <= MAX_FISCAL_XML_BYTES && !/<!DOCTYPE|<!ENTITY/i.test(xml) &&
    !hasForbiddenXmlControl(xml), 'UNSAFE_FISCAL_XML');
  const encoding = xml.match(/^\s*<\?xml[^?]*encoding\s*=\s*['"]([^'"]+)['"]/i)?.[1];
  requireContract(!encoding || /^utf-8$/i.test(encoding), 'UNSUPPORTED_XML_ENCODING');
}

export function encodeFiscalXml(xml: string): string {
  assertSafeFiscalXml(xml);
  return gzipSync(Buffer.from(xml, 'utf8')).toString('base64');
}

/** Size checked before allocation and while inflating; never expands an unbounded archive. */
export function decodeFiscalXml(value: unknown): string {
  requireContract(typeof value === 'string' && value.length > 0 &&
    value.length <= Math.ceil(MAX_FISCAL_XML_BYTES / 3) * 4 && value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]*={0,2}$/.test(value),
    'INVALID_GZIP_BASE64');
  const compressed = Buffer.from(value, 'base64');
  requireContract(compressed.length >= 18 && compressed[0] === 0x1f && compressed[1] === 0x8b &&
    compressed[2] === 8 && compressed.toString('base64') === value, 'INVALID_GZIP_BASE64');
  let bytes: Uint8Array;
  try { bytes = gunzipSync(compressed, { maxOutputLength: MAX_FISCAL_XML_BYTES }); }
  catch { throw new NfseContractError('INVALID_OR_OVERSIZED_GZIP'); }
  let xml: string;
  try { xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new NfseContractError('INVALID_XML_UTF8'); }
  assertSafeFiscalXml(xml);
  return xml;
}

export function parseFiscalJson(bytes: Uint8Array): Record<string, unknown> {
  requireContract(bytes.byteLength > 0 && bytes.byteLength <= MAX_FISCAL_JSON_BYTES, 'INVALID_RESPONSE_SIZE');
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    requireContract(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_RESPONSE_JSON');
    return value;
  } catch { throw new NfseContractError('INVALID_RESPONSE_JSON'); }
}
