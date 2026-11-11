import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { RELAY_LIMITS, RelayError, parseProductionRelayCommand } from './contract.js';
import { createRelayNonceGuard, readRelayAuthentication, relaySecret, verifyRelaySignature } from '../nfse-relay/auth.js';
import { createProductionRelayTransport } from './transport.js';

const json = (body, status) => new Response(JSON.stringify(body), { status, headers: {
  'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, max-age=0',
  'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
} });

async function readBody(request) {
  const length = request.headers.get('content-length');
  if ((length !== null && (!/^\d+$/.test(length) || Number(length) > RELAY_LIMITS.requestBytes)) || !request.body) {
    throw new RelayError('RELAY_REQUEST_TOO_LARGE', 413);
  }
  const reader = request.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > RELAY_LIMITS.requestBytes) throw new RelayError('RELAY_REQUEST_TOO_LARGE', 413);
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}

/** Private authenticated transport only. Fiscal authorization and the durable lease stay in Edge. */
export function createProductionRelayHandler({ env = process.env, now = Date.now,
  transport = createProductionRelayTransport(), reserveNonce = createRelayNonceGuard() } = {}) {
  return async request => {
    try {
      if (env.VERCEL_ENV !== 'preview') throw new RelayError('RELAY_PREVIEW_ONLY', 403);
      const secret = relaySecret(env.NFSE_PRODUCTION_RELAY_KEY);
      if (request.method !== 'POST') throw new RelayError('RELAY_METHOD_DENIED', 405);
      if (request.headers.has('origin') || request.headers.has('content-encoding')
        || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')) {
        throw new RelayError('RELAY_INVALID_REQUEST');
      }
      const authentication = readRelayAuthentication(request.headers, now());
      const bytes = await readBody(request);
      verifyRelaySignature(authentication, bytes, secret);
      let value;
      try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { throw new RelayError('RELAY_INVALID_JSON'); }
      const command = parseProductionRelayCommand(value);
      readRelayAuthentication(request.headers, now());
      reserveNonce(authentication, now());
      const result = await transport(command);
      if (Buffer.byteLength(JSON.stringify(result)) > RELAY_LIMITS.responseBytes) throw new RelayError('RELAY_RESPONSE_TOO_LARGE', 502);
      return json(result, 200);
    } catch (error) {
      return json({ error: error instanceof RelayError ? error.code : 'RELAY_UPSTREAM_UNCONFIRMED' },
        error instanceof RelayError ? error.status : 502);
    }
  };
}
