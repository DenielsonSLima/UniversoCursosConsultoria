import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const outputFile = join(tmpdir(), 'universo-banese-payment-utils.test.mjs');
const testFile = 'modules/aluno/financeiro/banese/banese-payment.utils.test.ts';

try {
  await build({
    entryPoints: [testFile],
    outfile: outputFile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });

  const result = spawnSync(process.execPath, ['--test', outputFile], {
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(outputFile, { force: true });
}
