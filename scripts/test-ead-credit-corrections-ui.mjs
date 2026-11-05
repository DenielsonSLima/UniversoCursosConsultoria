import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const jsdom = process.env.OTHER_CREDIT_JSDOM_PATH
  ? resolve(process.env.OTHER_CREDIT_JSDOM_PATH) : require.resolve('jsdom');
const temporary = await mkdtemp(join(tmpdir(), 'ead-credit-corrections-ui-'));
try {
  const output = join(temporary, 'other-credit-actions.test.cjs');
  await build({
    absWorkingDir: root,
    entryPoints: ['modules/gestor/financeiro/outros-creditos/other-credit-actions.test.tsx'],
    outfile: output, bundle: true, platform: 'node', format: 'cjs',
    define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'isolated-jsdom', setup(builder) {
      builder.onResolve({ filter: /^jsdom$/ }, () => ({ path: jsdom, external: true }));
    } }],
  });
  const result = spawnSync(process.execPath, ['--test', '--test-force-exit', output], { cwd: root, stdio: 'inherit', env: { ...process.env, OTHER_CREDIT_JSDOM_PATH: jsdom } });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
