import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const sources = [
  'modules/gestor/financeiro/outros-creditos/OtherCreditRow.test.tsx',
  'modules/gestor/financeiro/outros-creditos/other-credit-cancellation.test.tsx',
  'modules/gestor/financeiro/outros-creditos/other-credit-plan.test.tsx',
];
await mkdir('tmp/other-credit-tests', { recursive: true });
const files = [];
for (const [index, source] of sources.entries()) {
  const outfile = `tmp/other-credit-tests/ui-${index}.test.mjs`;
  await build({ entryPoints: [source], outfile, bundle: true, packages: 'external',
    platform: 'node', format: 'esm', logLevel: 'warning' });
  files.push(outfile);
}
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
