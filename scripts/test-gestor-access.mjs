import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const outputDirectory = mkdtempSync(join(tmpdir(), 'gestor-access-tests-'));
const tests = [
  'modules/gestor/access-control.test.ts',
  'modules/gestor/gestor-navigation.config.test.ts',
  'modules/login/gestor-polo-scope.test.ts',
];

try {
  const outputs = [];
  for (const [index, entry] of tests.entries()) {
    const output = join(outputDirectory, `test-${index}.mjs`);
    await build({
      entryPoints: [resolve(root, entry)],
      outfile: output,
      bundle: true,
      platform: 'node',
      format: 'esm',
    });
    outputs.push(output);
  }

  const result = spawnSync(
    process.execPath,
    ['--test', ...outputs],
    { cwd: root, encoding: 'utf8', stdio: 'inherit' },
  );
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
