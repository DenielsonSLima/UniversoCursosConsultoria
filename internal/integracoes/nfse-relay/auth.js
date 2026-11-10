import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { RELAY_LIMITS, RelayError } from './contract.js';

export const relaySigningText = (timestamp, nonce, bytes) => `${timestamp}\n${nonce}\n${createHash('sha256').update(bytes).digest('hex')}`;

export function relaySecret(value) {
  if (typeof value !== 'string' || !/^(?:[a-f0-9]{2}){32,64}$/i.test(value)) throw new RelayError('RELAY_NOT_CONFIGURED', 503);
  return Buffer.from(value, 'hex');
}

export function readRelayAuthentication(headers, nowMs = Date.now()) {
  const timestamp = headers.get('x-nfse-relay-timestamp') || '';
  const nonce = headers.get('x-nfse-relay-nonce') || '';
  const signature = headers.get('x-nfse-relay-signature') || '';
  if (!/^\d{10,12}$/.test(timestamp) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(nonce)
    || !/^[a-f0-9]{64}$/.test(signature) || Math.abs(Math.floor(nowMs / 1000) - Number(timestamp)) > RELAY_LIMITS.ttlSeconds) {
    throw new RelayError('RELAY_AUTHENTICATION_FAILED', 401);
  }
  return { timestamp, nonce, signature };
}

export function verifyRelaySignature(authentication, bytes, secret) {
  const expected = createHmac('sha256', secret).update(relaySigningText(authentication.timestamp, authentication.nonce, bytes)).digest();
  const supplied = Buffer.from(authentication.signature, 'hex');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new RelayError('RELAY_AUTHENTICATION_FAILED', 401);
}

/** Best-effort instance replay marker. The fiscal Edge ledger remains the durable POST lease. */
export function createRelayNonceGuard() {
  const used = new Map();
  return (authentication, nowMs = Date.now()) => {
    for (const [nonce, expiresAt] of used) if (expiresAt < nowMs) used.delete(nonce);
    if (used.has(authentication.nonce)) throw new RelayError('RELAY_REPLAY_DENIED', 409);
    if (used.size >= 10_000) throw new RelayError('RELAY_RATE_LIMITED', 429);
    used.set(authentication.nonce, (Number(authentication.timestamp) + RELAY_LIMITS.ttlSeconds) * 1000);
  };
}
