import { TextDecoder } from 'node:util';
import type { NationalHttpResponse } from './mtls.ts';

/** Fill only with the exact reviewed Preview URL returned by the Universo deployment. */
export const APPROVED_PRODUCTION_RELAY_URLS: readonly string[] = Object.freeze([
  'https://universo-cursos-consultoria-6w67gc985-denielson-limas-projects.vercel.app/api/nfse-production-relay',
  'https://universo-cursos-consultoria-qsnk8l1zn-denielson-limas-projects.vercel.app/api/nfse-production-relay',
]);
export interface ProductionRelayConfig { url: string; key: string; protectionBypass?: string }
interface Credential { certificatePem: string; chainPem: string; privateKeyPem: string }
interface RelayOptions {
  assertPostAllowed?: () => void;
  fetch?: typeof fetch;
  now?: () => number;
  nonce?: () => string;
  /** Test-only dependency; production callers use the reviewed static allowlist. */
  approvedUrls?: readonly string[];
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxRequestBytes = 2 * 1024 * 1024;
const maxResponseBytes = 4 * 1024 * 1024;
const textEncoder = new TextEncoder();
const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(bytes))
  .map((value) => value.toString(16).padStart(2, '0')).join('');

export function assertProductionRelayConfig(config: ProductionRelayConfig,
  approvedUrls = APPROVED_PRODUCTION_RELAY_URLS): void {
  let parsed: URL;
  try { parsed = new URL(config.url); } catch { throw new Error('RELAY_CONFIGURATION_UNAVAILABLE'); }
  if (!approvedUrls.includes(config.url) || parsed.href !== config.url || parsed.username || parsed.password
    || parsed.search || parsed.hash || parsed.protocol !== 'https:'
    || !/^universo-cursos-consultoria-[a-z0-9-]+\.vercel\.app$/.test(parsed.hostname)
    || parsed.pathname !== '/api/nfse-production-relay'
    || !/^(?:[0-9a-f]{2}){32,64}$/i.test(config.key)
    || (config.protectionBypass !== undefined && !/^[A-Za-z0-9_.-]{1,4096}$/.test(config.protectionBypass))) {
    throw new Error('RELAY_CONFIGURATION_UNAVAILABLE');
  }
}

function assertRoute(method: string, path: string, body?: string) {
  const readable = /^\/(?:swagger\/(?:docs\/v1|v1\/swagger.json)|dps\/DPS\d{42}|nfse\/\d{50}(?:\/eventos(?:\/\d{6}(?:\/\d{1,3})?)?)?)$/.test(path);
  const writable = path === '/nfse' || /^\/nfse\/\d{50}\/eventos$/.test(path);
  if (!((method === 'GET' && readable && body === undefined)
    || (method === 'POST' && writable && typeof body === 'string' && body.length > 0))) {
    throw new Error('UNSUPPORTED_RELAY_ROUTE');
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
  return value;
}

async function readEnvelope(response: Response): Promise<{ status: number; bodyBase64: string }> {
  if (response.status !== 200 || Number(response.headers.get('content-length')) > maxResponseBytes || !response.body) {
    await response.body?.cancel(); throw new Error('RELAY_RESPONSE_UNAVAILABLE');
  }
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > maxResponseBytes) throw new Error('RELAY_RESPONSE_TOO_LARGE');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error('INVALID_RELAY_RESPONSE'); }
  finally { bytes.fill(0); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    || Object.keys(parsed).some((key) => !['status', 'bodyBase64'].includes(key))) throw new Error('INVALID_RELAY_RESPONSE');
  const result = parsed as { status: number; bodyBase64: string };
  if (!Number.isInteger(result.status) || result.status < 100 || result.status > 599
    || typeof result.bodyBase64 !== 'string' || result.bodyBase64.length > maxResponseBytes
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(result.bodyBase64)) {
    throw new Error('INVALID_RELAY_RESPONSE');
  }
  return result;
}

/** A1 is sent only over verified HTTPS to the pinned server executor, never to a browser. */
export function createNationalProductionRelayTransport(config: ProductionRelayConfig, credential: Credential,
  options: RelayOptions = {}) {
  assertProductionRelayConfig(config, options.approvedUrls);
  const keyBytes = Uint8Array.from(config.key.match(/../g)!, (pair) => parseInt(pair, 16));
  const signingKey = crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  keyBytes.fill(0);
  const controllers = new Set<AbortController>(); let closed = false;
  return {
    close() { closed = true; for (const controller of controllers) controller.abort(); controllers.clear(); },
    async request(method: 'GET' | 'POST', path: string, fiscalBody?: string): Promise<NationalHttpResponse> {
      assertRoute(method, path, fiscalBody);
      if (closed) throw new Error('RELAY_TRANSPORT_CLOSED');
      if (method === 'POST') {
        if (!options.assertPostAllowed) throw new Error('RELAY_POST_NOT_AUTHORIZED');
        options.assertPostAllowed();
      }
      const rawBody = textEncoder.encode(JSON.stringify(canonical({ method, path, credential,
        ...(fiscalBody === undefined ? {} : { fiscalBody }) })));
      if (rawBody.length > maxRequestBytes) { rawBody.fill(0); throw new Error('RELAY_REQUEST_TOO_LARGE'); }
      const timestamp = String(Math.floor((options.now || Date.now)() / 1000));
      const nonce = (options.nonce || (() => crypto.randomUUID()))();
      if (!uuid.test(nonce)) { rawBody.fill(0); throw new Error('RELAY_NONCE_UNAVAILABLE'); }
      const bodyHash = hex(await crypto.subtle.digest('SHA-256', rawBody));
      const signature = hex(await crypto.subtle.sign('HMAC', await signingKey,
        textEncoder.encode(`${timestamp}\n${nonce}\n${bodyHash}`)));
      if (closed) { rawBody.fill(0); throw new Error('RELAY_TRANSPORT_CLOSED'); }
      const controller = new AbortController(); controllers.add(controller);
      const timer = setTimeout(() => controller.abort(), 40_000);
      try {
        const response = await (options.fetch || fetch)(config.url, {
          method: 'POST', redirect: 'error', cache: 'no-store', signal: controller.signal,
          headers: { 'content-type': 'application/json', 'x-nfse-relay-timestamp': timestamp,
            'x-nfse-relay-nonce': nonce, 'x-nfse-relay-signature': signature,
            ...(config.protectionBypass ? { 'x-vercel-protection-bypass': config.protectionBypass } : {}) },
          body: rawBody,
        });
        const envelope = await readEnvelope(response);
        return { status: envelope.status, body: Uint8Array.from(atob(envelope.bodyBase64), (char) => char.charCodeAt(0)) };
      } catch {
        throw new Error(controller.signal.aborted ? 'RELAY_TIMEOUT_OR_CLOSED' : 'RELAY_REQUEST_UNAVAILABLE');
      } finally { clearTimeout(timer); controllers.delete(controller); rawBody.fill(0); }
    },
  };
}
