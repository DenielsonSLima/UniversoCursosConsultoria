import { createPrivateKey } from 'node:crypto';
import type { PreflightMaterial, PreflightTransport } from './types.ts';

const origins = new Set(['https://sefin.producaorestrita.nfse.gov.br',
  'https://adn.producaorestrita.nfse.gov.br']);

const safeCodes = ['TLS_SERVER_CERTIFICATE_UNTRUSTED', 'TLS_CLIENT_CERTIFICATE_REJECTED',
  'DNS_FAILURE', 'TIMEOUT', 'EGRESS_FAILURE', 'UNKNOWN_TRANSPORT_FAILURE',
  'TLS_RENEGOTIATION_UNSUPPORTED', 'TLS_PROTOCOL_UNSUPPORTED', 'TLS_ALPN_NEGOTIATION_FAILED',
  'TLS_SIGNATURE_ALGORITHM_UNSUPPORTED', 'TLS_HANDSHAKE_FAILED',
  'RESPONSE_TOO_LARGE', 'REDIRECT_REJECTED', 'UNSUPPORTED_PREFLIGHT_ROUTE',
  'MTLS_CLIENT_UNAVAILABLE', 'PREFLIGHT_CLIENT_CLOSED'] as const;
export type PreflightTransportCode = typeof safeCodes[number];
export class PreflightTransportError extends Error {
  constructor(public readonly code: PreflightTransportCode) { super(code); this.name = 'PreflightTransportError'; }
}

/** Inspect native error text internally, but emit a fixed code only. Never echo message/cause/URL. */
export function safeTransportCode(error: unknown, aborted = false): PreflightTransportCode {
  if (error instanceof PreflightTransportError && safeCodes.includes(error.code)) return error.code;
  const parts: string[] = []; let current = error;
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth++) {
    const value = current as { name?: unknown; message?: unknown; code?: unknown; cause?: unknown };
    for (const key of ['name', 'message', 'code'] as const) {
      if (typeof value[key] === 'string') parts.push(value[key].slice(0, 2000));
    }
    current = value.cause;
  }
  const internal = parts.join(' ');
  if (aborted || /AbortError|TimeoutError|timed?\s*out|ETIMEDOUT|PREFLIGHT_TIMEOUT/i.test(internal)) return 'TIMEOUT';
  if (/dns\s*(?:error|failure)|failed.*(?:dns|lookup)|name or service not known|nodename nor servname|ENOTFOUND|EAI_AGAIN/i.test(internal)) return 'DNS_FAILURE';
  if (/invalid peer certificate|UnknownIssuer|CaUsedAsEndEntity|NotValidForName|certificate verify failed|CERT_HAS_EXPIRED|UNABLE_TO_(?:GET|VERIFY)|ERR_TLS_CERT_ALTNAME_INVALID/i.test(internal)) return 'TLS_SERVER_CERTIFICATE_UNTRUSTED';
  if (/certificate[_ ]required|bad[_ ]certificate|(?:received|fatal).*alert.*(?:certificate|unknown[_ ]?ca)|alert.*(?:certificate|unknown[_ ]?ca)/i.test(internal)) return 'TLS_CLIENT_CERTIFICATE_REJECTED';
  if (/renegotiat|HelloRequest/i.test(internal)) return 'TLS_RENEGOTIATION_UNSUPPORTED';
  if (/ALPN|NoApplicationProtocol|no application protocol/i.test(internal)) return 'TLS_ALPN_NEGOTIATION_FAILED';
  if (/SignatureAlgorithm|no.*signature.*schem|unsupported.*signature/i.test(internal)) return 'TLS_SIGNATURE_ALGORITHM_UNSUPPORTED';
  if (/peer incompatible|protocol[_ ]?version|unsupported.*(?:protocol|cipher)|no.*cipher|NoCipherSuitesInCommon/i.test(internal)) return 'TLS_PROTOCOL_UNSUPPORTED';
  if (/invalid.*message|UnexpectedMessage|unexpected.*handshake|inappropriate.*message|handshake|rustls/i.test(internal)) return 'TLS_HANDSHAKE_FAILED';
  if (/network.*unreachable|connection (?:refused|reset|closed|aborted)|unexpected (?:end of file|eof)|ECONN(?:REFUSED|RESET|ABORTED)|ENETUNREACH|EHOSTUNREACH|tcp connect|connection error|os error (?:9|54|60|61|101|110|111)/i.test(internal)) return 'EGRESS_FAILURE';
  return 'UNKNOWN_TRANSPORT_FAILURE';
}

export function assertPreflightUrl(raw: string) {
  const url = new URL(raw);
  if (!origins.has(url.origin) || url.username || url.password || url.hash
    || !/^\/(?:API\/SefinNacional\/(?:docs\/index|swagger\/(?:docs\/v1|v1\/swagger.json))|parametrizacao\/(?:swagger\/(?:docs\/v1|v1\/swagger.json)|(?:ParametrosMunicipais\/)?[0-9]{7}(?:\/[0-9]{6})?(?:\/20[0-9]{2}-[0-9]{2}-[0-9]{2})?\/(?:convenio|aliquota|aliquotas|retencoes|beneficiomunicipal|regimes_especiais|regimesespeciais|parametros)))$/i.test(url.pathname)
    || [...url.searchParams.keys()].some((key) => !/^(dataCompetencia|dataInicial|dataFinal)$/i.test(key))
    || [...url.searchParams.values()].some((value) => !/^\d{4}-\d{2}-\d{2}$/.test(value))) {
    throw new PreflightTransportError('UNSUPPORTED_PREFLIGHT_ROUTE');
  }
  return url;
}

interface HttpClient { close(): void }
export interface PreflightHttpRuntime {
  createClient(options: { cert: string; key: string; http1: true; http2: false }): HttpClient;
  fetch(url: URL, options: RequestInit & { client: HttpClient }): Promise<Response>;
}
const nativeRuntime: PreflightHttpRuntime = {
  createClient(options) {
    if (typeof Deno.createHttpClient !== 'function') throw new PreflightTransportError('MTLS_CLIENT_UNAVAILABLE');
    return Deno.createHttpClient(options);
  },
  fetch(url, options) { return fetch(url, { ...options, client: options.client as Deno.HttpClient }); },
};

/** Normalize in server memory only. Old certChain/privateKey options are not used. */
export function privateKeyAsPkcs8(privateKeyPem: string): string {
  try {
    const key = createPrivateKey(privateKeyPem);
    if (key.asymmetricKeyType !== 'rsa') throw new Error('INVALID_KEY_TYPE');
    return key.export({ type: 'pkcs8', format: 'pem' }).toString();
  } catch { throw new Error('PREFLIGHT_CLIENT_KEY_UNAVAILABLE'); }
}

async function boundedText(response: Response): Promise<string> {
  if (Number(response.headers.get('content-length')) > 1024 * 1024) {
    await response.body?.cancel(); throw new PreflightTransportError('RESPONSE_TOO_LARGE');
  }
  if (!response.body) return '';
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 1024 * 1024) throw new PreflightTransportError('RESPONSE_TOO_LARGE');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new globalThis.TextDecoder().decode(bytes);
}

/** Native Deno HTTP avoids Edge's node:https socket adapter. TLS verification stays enabled. */
export function createPreflightTransport(credential: PreflightMaterial['material'],
  runtime: PreflightHttpRuntime = nativeRuntime): PreflightTransport {
  const client = runtime.createClient({ cert: credential.certificatePem + '\n' + credential.chainPem,
    key: privateKeyAsPkcs8(credential.privateKeyPem), http1: true, http2: false });
  let closed = false;
  return {
    close() { if (!closed) { closed = true; client.close(); } },
    async get(raw) {
      const url = assertPreflightUrl(raw);
      if (closed) throw new PreflightTransportError('PREFLIGHT_CLIENT_CLOSED');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      try {
        const response = await runtime.fetch(url, { method: 'GET', client, redirect: 'error',
          headers: { accept: 'application/json,text/html;q=0.5' }, signal: controller.signal });
        if (response.status >= 300 && response.status < 400) {
          await response.body?.cancel(); throw new PreflightTransportError('REDIRECT_REJECTED');
        }
        return { status: response.status, body: await boundedText(response), tlsVerified: true };
      } catch (error) {
        throw new PreflightTransportError(safeTransportCode(error, controller.signal.aborted));
      } finally { clearTimeout(timer); }
    },
  };
}
