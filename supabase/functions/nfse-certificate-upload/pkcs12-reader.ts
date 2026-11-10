import forge from 'npm:node-forge@1.4.3';
import { assertPfxCost } from './pfx-limits.ts';

export class Pkcs12ReadError extends Error {
  constructor(public code: string) { super(code); }
}

function safeParseError(error: unknown): Pkcs12ReadError {
  const message = error instanceof Error ? error.message : '';
  if (/MAC could not be verified|Failed to decrypt|Unable to decrypt/.test(message)) {
    return new Pkcs12ReadError('INVALID_PFX_PASSWORD_OR_DATA');
  }
  if (/unsupported|Unsupported/.test(message)) {
    return new Pkcs12ReadError('UNSUPPORTED_PFX_ENCRYPTION');
  }
  return new Pkcs12ReadError('INVALID_PFX_FORMAT');
}

/** All parsing is synchronous: never await while the scoped adapter is installed. */
function parseWithEncoding(asn: any, password: string, utf8: boolean) {
  const original = forge.pki.pbe.getCipherForPBES2;
  let usedPbes2 = false;
  // PKCS#12 MAC/legacy PBE use BMP passwords. Only PBES2 consumes UTF-8 bytes.
  // Forge exposes no encoding option; restore its hook even when parsing fails.
  forge.pki.pbe.getCipherForPBES2 = (oid: string, params: any, value: string) => {
    usedPbes2 = true;
    return original(oid, params, utf8 ? forge.util.encodeUtf8(value) : value);
  };
  try {
    return { value: forge.pkcs12.pkcs12FromAsn1(asn, true, password), usedPbes2 };
  } catch (error) {
    return { error, usedPbes2 };
  } finally {
    forge.pki.pbe.getCipherForPBES2 = original;
  }
}

export function readPkcs12(bytes: Uint8Array, password: string) {
  let asn: any;
  try { asn = forge.asn1.fromDer(forge.util.binary.raw.encode(bytes), true); }
  catch { throw new Pkcs12ReadError('INVALID_PFX_FORMAT'); }
  try { assertPfxCost(asn); }
  catch { throw new Pkcs12ReadError('INVALID_PFX_COST'); }

  const unicode = Array.from(password).some(character => character.charCodeAt(0) > 0x7f);
  const parsed = parseWithEncoding(asn, password, unicode);
  if ('value' in parsed) return parsed.value;
  // Older Forge exporters treated PBES2 passwords as raw bytes. Try that only
  // after PBES2 was reached; an invalid MAC must not trigger another attempt.
  if (unicode && parsed.usedPbes2) {
    const legacy = parseWithEncoding(asn, password, false);
    if ('value' in legacy) return legacy.value;
  }
  throw safeParseError(parsed.error);
}
