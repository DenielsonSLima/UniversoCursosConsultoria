import { request, Agent } from 'node:https';
import { Buffer } from 'node:buffer';
import { RELAY_LIMITS, SEFIN_HOMOLOGATION_BASE, RelayError, parseRelayCommand } from './contract.js';

/** Only secure TLS 1.2 is pinned for the IIS post-request client-certificate renegotiation. */
export function createRelayTransport(httpsRequest = request) {
  return async input => {
    const command = parseRelayCommand(input);
    const agent = new Agent({ cert: `${command.credential.certificatePem}\n${command.credential.chainPem}`,
      key: command.credential.privateKeyPem, rejectUnauthorized: true, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2',
      keepAlive: false, maxCachedSessions: 0 });
    try {
      return await new Promise((resolve, reject) => {
        let completed = false, timer;
        const finish = (error, result) => {
          if (completed) return;
          completed = true;
          clearTimeout(timer);
          if (error) reject(error); else resolve(result);
        };
        const req = httpsRequest(`${SEFIN_HOMOLOGATION_BASE}${command.path}`, {
          method: command.method, agent, headers: { accept: 'application/json', connection: 'close',
            ...(command.fiscalBody === undefined ? {} : { 'content-type': 'application/json',
              'content-length': Buffer.byteLength(command.fiscalBody) }) },
        }, response => {
          let size = 0;
          const chunks = [];
          response.on('data', chunk => {
            const bytes = Buffer.from(chunk); size += bytes.length;
            if (size > RELAY_LIMITS.responseBytes) {
              req.destroy(); finish(new RelayError('RELAY_RESPONSE_TOO_LARGE', 502));
            } else chunks.push(bytes);
          });
          response.on('aborted', () => finish(new RelayError('RELAY_UPSTREAM_UNCONFIRMED', 502)));
          response.on('error', () => finish(new RelayError('RELAY_UPSTREAM_UNCONFIRMED', 502)));
          response.on('end', () => {
            if (!Number.isInteger(response.statusCode) || response.statusCode < 100 || response.statusCode > 599) {
              finish(new RelayError('RELAY_UPSTREAM_UNCONFIRMED', 502)); return;
            }
            finish(null, { status: response.statusCode, bodyBase64: Buffer.concat(chunks).toString('base64') });
          });
        });
        timer = setTimeout(() => { req.destroy(); finish(new RelayError('RELAY_UPSTREAM_TIMEOUT', 504)); }, RELAY_LIMITS.timeoutMs);
        req.on('error', () => finish(new RelayError('RELAY_UPSTREAM_UNCONFIRMED', 502)));
        if (command.fiscalBody !== undefined) req.write(command.fiscalBody);
        req.end();
      });
    } finally { agent.destroy(); }
  };
}
