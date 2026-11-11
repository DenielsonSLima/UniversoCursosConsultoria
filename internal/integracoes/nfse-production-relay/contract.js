import { Buffer } from 'node:buffer';
import { RELAY_LIMITS, RelayError, parseRelayCommand } from '../nfse-relay/contract.js';

export { RELAY_LIMITS, RelayError };
export const SEFIN_PRODUCTION_BASE = 'https://sefin.nfse.gov.br/SefinNacional';
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);

/** Production has its own endpoint/key. The caller cannot supply an origin or headers. */
export function parseProductionRelayCommand(value) {
  if (!object(value) || Object.keys(value).some(key => !['method', 'path', 'fiscalBody', 'credential'].includes(key))
    || !['GET', 'POST'].includes(value.method) || typeof value.path !== 'string') {
    throw new RelayError('RELAY_INVALID_COMMAND');
  }
  const read = ['/swagger/docs/v1', '/swagger/v1/swagger.json'].includes(value.path)
    || /^\/dps\/DPS\d{42}$/.test(value.path)
    || /^\/nfse\/\d{50}(?:\/eventos(?:\/\d{6}(?:\/\d{1,3})?)?)?$/.test(value.path);
  const write = value.path === '/nfse' || /^\/nfse\/\d{50}\/eventos$/.test(value.path);
  if (!(value.method === 'GET' && read) && !(value.method === 'POST' && write)) {
    throw new RelayError('RELAY_ROUTE_DENIED');
  }
  if ((value.method === 'GET' && Object.hasOwn(value, 'fiscalBody')) || (value.method === 'POST'
    && (typeof value.fiscalBody !== 'string' || !value.fiscalBody.length
      || Buffer.byteLength(value.fiscalBody) > RELAY_LIMITS.requestBytes))) {
    throw new RelayError('RELAY_INVALID_FISCAL_BODY');
  }
  const { credential } = parseRelayCommand({ method: 'GET', path: '/swagger/docs/v1', credential: value.credential });
  return { method: value.method, path: value.path, credential,
    ...(value.method === 'POST' ? { fiscalBody: value.fiscalBody } : {}) };
}
