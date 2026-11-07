import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const outputDirectory = resolve('tmp/configuracoes-ui-tests');
const tests = [
  'modules/gestor/configuracoes/usuarios/components/config-access-selections.test.tsx',
  'modules/gestor/configuracoes/impressoras/printer-ui.test.tsx',
];
const outputFiles = tests.map((_, index) => resolve(outputDirectory, `${index}.test.cjs`));
await mkdir(outputDirectory, { recursive: true });

try {
  await Promise.all(tests.map((entry, index) => build({
    entryPoints: [entry],
    outfile: outputFiles[index],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    loader: { '.css': 'empty' },
    define: {
      'process.env.NODE_ENV': '"test"',
      'import.meta.env': JSON.stringify({
        VITE_SUPABASE_URL: 'http://127.0.0.1:9',
        VITE_SUPABASE_ANON_KEY: 'local-test-only',
      }),
    },
  })));
  const jsdomPath = process.env.CONFIG_JSDOM_PATH || process.env.INSTITUTIONAL_SELECT_JSDOM_PATH;
  const result = spawnSync(process.execPath, [
    '--test', '--test-force-exit',
    'modules/gestor/configuracoes/mensageria/configuration-selectors.behavior.test.mjs',
    ...outputFiles,
  ], {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(jsdomPath ? { CONFIG_JSDOM_PATH: jsdomPath, INSTITUTIONAL_SELECT_JSDOM_PATH: jsdomPath } : {}),
    },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(outputDirectory, { recursive: true, force: true });
}
