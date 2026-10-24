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
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.info(`[node-security-build] ${process.version}`);
    if (!isSupportedNodeVersion(process.version)) {
      console.error(`Build bloqueado: use Node ${MINIMUM_NODE_VERSION} ou posterior da linha 24.x.`);
      process.exitCode = 1;
    }
  } else if (args.length === 2 && args[0] === '--runtime-version') {
    // This value must come from a private Function log on the deployment under review.
    // Vercel controls runtime patches; passing the build gate never validates the Function.
    const version = args[1];
    const supported = isSupportedNodeVersion(version);
    console.info(`[node-security-runtime-check] ${JSON.stringify(version)} ${supported ? 'PASS' : 'FAIL'}`);
    if (!supported) {
      console.error(`Runtime não validado: exige Node ${MINIMUM_NODE_VERSION}+ da linha 24.x. Confirme o rollout da plataforma e observe novamente a Function.`);
      process.exitCode = 1;
    }
  } else {
    console.error('Uso: node scripts/check-node-security.mjs [--runtime-version v24.22.1]');
    process.exitCode = 1;
  }
}
