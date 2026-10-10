import { Buffer } from 'node:buffer';
import { createGunzip } from 'node:zlib';

const MAX_INPUT = 4 * 1024 * 1024;
const MAX_OUTPUT = 1024 * 1024;
const failure = (code) => Object.assign(new Error(`Bounded gzip: ${code}`), { code });

// Do not rely on zlib's maxOutputLength: older Deno versions silently ignore it.
// Count streaming output before retaining each chunk and stop the inflater on overflow.
export function boundedGunzip(input, maximum) {
  if (!Buffer.isBuffer(input) || input.length < 1 || input.length > MAX_INPUT
    || !Number.isSafeInteger(maximum) || maximum < 1 || maximum > MAX_OUTPUT) {
    return Promise.reject(failure('INVALID_GUNZIP_LIMIT'));
  }
  const compressed = Buffer.from(input);
  return new Promise((resolve, reject) => {
    const inflater = createGunzip({ chunkSize: 16 * 1024 });
    const chunks = [];
    let total = 0, settled = false;
    const stop = (error) => {
      if (settled) return;
      settled = true;
      chunks.length = 0;
      inflater.destroy();
      reject(error);
    };
    inflater.on('data', (chunk) => {
      if (settled) return;
      const next = total + chunk.byteLength;
      if (next > maximum) {
        stop(failure('ERR_BUFFER_TOO_LARGE'));
        return;
      }
      total = next;
      chunks.push(Buffer.from(chunk));
    });
    // Keep the error listener installed through destroy/close; never leave an unhandled stream error.
    inflater.on('error', stop);
    inflater.on('end', () => {
      if (settled) return;
      settled = true;
      const output = Buffer.concat(chunks, total);
      chunks.length = 0;
      resolve(output);
    });
    inflater.on('close', () => {
      if (!settled) stop(failure('GUNZIP_CLOSED_BEFORE_END'));
    });
    try { inflater.end(compressed); }
    catch (error) { stop(error); }
  });
}
