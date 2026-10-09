import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';

// This adapter has no network, database, overwrite or deletion capability.
export async function createLocalStore(directory) {
  if (typeof directory !== 'string' || !directory) throw new Error('Local directory required');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await lstat(directory)).isSymbolicLink()) throw new Error('Symlink root rejected');
  const root = await realpath(directory);
  const pathFor = (name) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,220}$/.test(name)) {
      throw new Error('Unsafe local object name');
    }
    return join(root, name);
  };

  async function read(name, maxBytes) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Invalid read limit');
    const handle = await open(pathFor(name), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > maxBytes) throw new Error('Object exceeds read limit');
      const chunks = [];
      let total = 0;
      for await (const chunk of handle.createReadStream({ autoClose: false })) {
        total += chunk.length;
        if (total > maxBytes) throw new Error('Object exceeds read limit');
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } finally {
      await handle.close();
    }
  }

  async function putImmutable(name, bytes) {
    if (!Buffer.isBuffer(bytes)) throw new Error('Buffer required');
    let handle;
    try {
      handle = await open(pathFor(name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = await read(name, Math.max(1, bytes.length));
      if (!existing.equals(bytes)) throw new Error('Immutable object conflict');
      return { name, reused: true };
    }
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return { name, reused: false };
  }

  return Object.freeze({ kind: 'synthetic-filesystem-only', root, read, putImmutable });
}
