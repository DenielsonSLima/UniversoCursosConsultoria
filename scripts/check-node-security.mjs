import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MINIMUM_NODE_VERSION = '24.22.1';

// Stay on the project's reviewed Node 24 release line; reject prereleases.
export function isSupportedNodeVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const [major, minor, patch] = match.slice(1).map(Number);
  return major === 24 && (minor > 22 || (minor === 22 && patch >= 1));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.info(`[node-security-build] ${process.version}`);
  if (!isSupportedNodeVersion(process.version)) {
    console.error(`Build bloqueado: use Node ${MINIMUM_NODE_VERSION} ou posterior da linha 24.x.`);
    process.exitCode = 1;
  }
}
