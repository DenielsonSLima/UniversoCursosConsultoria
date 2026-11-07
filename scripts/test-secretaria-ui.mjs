import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const directory = resolve('tmp/secretaria-ui-tests');
const output = resolve(directory, 'document-selection.test.cjs');
await mkdir(directory, { recursive: true });
try {
  await build({
    entryPoints: ['modules/gestor/secretaria/shared/secretaria-document-selection.behavior.test.tsx'],
    outfile: output,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    loader: { '.css': 'empty' },
  });
  const result = spawnSync(process.execPath, [
    '--test', '--test-force-exit', output,
    'modules/gestor/secretaria/shared/registration-batch.behavior.test.mjs',
    'modules/gestor/secretaria/carteirinhas/secretaria-carteirinhas-workspace.test.mjs',
    'modules/gestor/secretaria/pasta-identificacao/pasta-identificacao-batch.contract.test.ts',
  ], { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
