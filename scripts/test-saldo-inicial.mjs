import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const outputDirectory = mkdtempSync(join(tmpdir(), 'saldo-inicial-tests-'));
const output = join(outputDirectory, 'saldo-inicial.currency.test.mjs');

try {
  await build({
    entryPoints: [
      resolve(
        root,
        'modules/gestor/configuracoes/saldo-inicial/saldo-inicial.currency.test.ts',
      ),
    ],
    outfile: output,
    bundle: true,
    platform: 'node',
    format: 'esm',
  });

  const result = spawnSync(process.execPath, ['--test', output], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
