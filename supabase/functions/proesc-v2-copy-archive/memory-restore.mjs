import { Buffer } from 'node:buffer';

// Per-request, bounded isolated restore target. Never exposes payload bytes in the HTTP response.
export function createMemoryRestoreStore() {
  let saved;
  const validate = (name, maximum) => {
    if (name !== 'restored.json' || !Number.isSafeInteger(maximum) || maximum < 1 || maximum > 1048576) {
      throw new Error('INVALID_MEMORY_RESTORE');
    }
  };
  return Object.freeze({
    kind: 'proesc-v2-copy-memory-restore',
    async putImmutable(name, bytes) {
      if (!Buffer.isBuffer(bytes)) throw new Error('INVALID_MEMORY_RESTORE');
      validate(name, bytes.length);
      if (saved && !saved.equals(bytes)) throw new Error('IMMUTABLE_MEMORY_RESTORE');
      const reused = saved !== undefined;
      saved ??= Buffer.from(bytes);
      return { name, reused };
    },
    async read(name, maximum) {
      validate(name, maximum);
      if (!saved || saved.length > maximum) throw new Error('INVALID_MEMORY_RESTORE');
      return Buffer.from(saved);
    },
  });
}
