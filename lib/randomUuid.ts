const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface CryptoUuidSource {
  randomUUID?: () => string;
  getRandomValues?: (
    array: Uint8Array<ArrayBuffer>,
  ) => Uint8Array<ArrayBuffer>;
}

const formatUuidV4 = (bytes: Uint8Array) => {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const generateSafeUuid = (
  cryptoSource: CryptoUuidSource | null | undefined = globalThis.crypto,
  random: () => number = Math.random,
): string => {
  try {
    const nativeUuid = cryptoSource?.randomUUID?.();
    if (nativeUuid && UUID_RE.test(nativeUuid)) return nativeUuid;
  } catch {
    // Safari may expose randomUUID without allowing it outside a secure context.
  }

  const bytes = new Uint8Array(16);
  let generatedWithCrypto = false;

  try {
    if (cryptoSource?.getRandomValues) {
      cryptoSource.getRandomValues(bytes);
      generatedWithCrypto = true;
    }
  } catch {
    // Fall back below when the browser also blocks getRandomValues.
  }

  if (!generatedWithCrypto) {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(random() * 256);
    }
  }

  return formatUuidV4(bytes);
};
