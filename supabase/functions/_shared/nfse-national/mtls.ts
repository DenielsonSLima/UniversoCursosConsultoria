import { request, Agent } from 'node:https';
import { Buffer } from 'node:buffer';
import { requireContract } from './xml.ts';
import { assertNationalLiveContract } from './live-contract.ts';

const SEFIN = {
  HOMOLOGACAO: 'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional',
  PRODUCAO: 'https://sefin.nfse.gov.br/SefinNacional',
} as const;

export interface NationalHttpResponse { status: number; body: Uint8Array }
export interface NationalMtlsTransport {
  request(method: 'GET' | 'HEAD' | 'POST', path: string, body?: string): Promise<NationalHttpResponse>;
  close(): void;
}

/** No request is made while creating this adapter. Certificates remain server memory only. */
export function createNationalMtlsTransport(environment: keyof typeof SEFIN,
  credential: { certificateChainPem: string; privateKeyPem: string },
  limits: { timeoutMs?: number; maxResponseBytes?: number } = {}): NationalMtlsTransport {
  requireContract(Object.hasOwn(SEFIN, environment), 'INVALID_ENVIRONMENT');
  const timeout = limits.timeoutMs ?? 30_000;
  const maxBytes = limits.maxResponseBytes ?? 4 * 1024 * 1024;
  requireContract(Number.isInteger(timeout) && Number.isInteger(maxBytes) &&
    timeout > 0 && timeout <= 60_000 && maxBytes > 0 && maxBytes <= 16 * 1024 * 1024,
    'INVALID_TRANSPORT_LIMITS');
  const agent = new Agent({ cert: credential.certificateChainPem, key: credential.privateKeyPem,
    rejectUnauthorized: true, minVersion: 'TLSv1.2', keepAlive: false });
  return {
    close() { agent.destroy(); },
    request(method, path, body) {
      const dpsRoute = /^\/dps\/DPS\d{42}$/.test(path);
      const readable = /^\/nfse\/\d{50}(?:\/eventos(?:\/\d{6}(?:\/\d{3})?)?)?$/.test(path);
      const writable = /^\/nfse(?:\/\d{50}\/eventos)?$/.test(path);
      requireContract((method === 'GET' && (dpsRoute || readable)) ||
        (method === 'HEAD' && dpsRoute) || (method === 'POST' && writable), 'UNSUPPORTED_FISCAL_ROUTE');
      requireContract((method === 'POST') === (body !== undefined), 'INVALID_REQUEST_BODY');
      if (body !== undefined) requireContract(Buffer.byteLength(body) <= maxBytes, 'REQUEST_TOO_LARGE');
      if (method === 'POST') assertNationalLiveContract();
      return new Promise((resolve, reject) => {
        const req = request(`${SEFIN[environment]}${path}`, { method, agent, headers: {
          accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json',
            'content-length': Buffer.byteLength(body) }),
        } }, (res) => {
          let size = 0;
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) req.destroy(new Error('RESPONSE_TOO_LARGE'));
            else chunks.push(chunk);
          });
          res.on('error', () => reject(new Error('NATIONAL_TRANSPORT_FAILED')));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }));
        });
        const timer = setTimeout(() => req.destroy(new Error('TIMEOUT')), timeout);
        req.on('close', () => clearTimeout(timer));
        req.on('error', () => reject(new Error('NATIONAL_TRANSPORT_FAILED')));
        if (body !== undefined) req.write(body);
        req.end();
      });
    },
  };
}
