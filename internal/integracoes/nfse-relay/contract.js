import { Buffer } from 'node:buffer';

export const RELAY_LIMITS = Object.freeze({ requestBytes: 2 * 1024 * 1024,
  responseBytes: 4 * 1024 * 1024, timeoutMs: 25_000, ttlSeconds: 60 });
export const SEFIN_HOMOLOGATION_BASE = 'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional';

export class RelayError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
const certificate = value => typeof value === 'string' && value.length <= 128 * 1024
  && /^(?:\s*-----BEGIN CERTIFICATE-----\s+[A-Za-z0-9+/=\s]+\s+-----END CERTIFICATE-----\s*)+$/.test(value);

/** The caller cannot choose an origin, query, event, production route or HTTP header. */
export function parseRelayCommand(value) {
  if (!keys(value, ['method', 'path', 'fiscalBody', 'credential']) || !['GET', 'POST'].includes(value.method)
    || typeof value.path !== 'string' || !keys(value.credential, ['certificatePem', 'chainPem', 'privateKeyPem'])) {
    throw new RelayError('RELAY_INVALID_COMMAND');
  }
  const readable = ['/swagger/docs/v1', '/swagger/v1/swagger.json'].includes(value.path)
    || /^\/dps\/DPS\d{42}$/.test(value.path) || /^\/nfse\/\d{50}$/.test(value.path);
  if (!(value.method === 'GET' && readable) && !(value.method === 'POST' && value.path === '/nfse')) {
    throw new RelayError('RELAY_ROUTE_DENIED');
  }
  if ((value.method === 'POST' && (typeof value.fiscalBody !== 'string' || !value.fiscalBody.length
    || Buffer.byteLength(value.fiscalBody) > RELAY_LIMITS.requestBytes))
    || (value.method === 'GET' && Object.hasOwn(value, 'fiscalBody'))) throw new RelayError('RELAY_INVALID_FISCAL_BODY');
  const credential = value.credential;
  if (!certificate(credential.certificatePem) || !(credential.chainPem === '' || certificate(credential.chainPem))
    || typeof credential.privateKeyPem !== 'string' || credential.privateKeyPem.length > 64 * 1024
    || !/^\s*-----BEGIN (?:RSA )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\s]+\s+-----END (?:RSA )?PRIVATE KEY-----\s*$/.test(credential.privateKeyPem)) {
    throw new RelayError('RELAY_INVALID_CREDENTIAL');
  }
  return { method: value.method, path: value.path,
    ...(value.method === 'POST' ? { fiscalBody: value.fiscalBody } : {}),
    credential: { certificatePem: credential.certificatePem, chainPem: credential.chainPem,
      privateKeyPem: credential.privateKeyPem } };
}
