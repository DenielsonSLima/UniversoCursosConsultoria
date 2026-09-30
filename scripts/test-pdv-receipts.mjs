import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const lucideEntry = join(dirname(require.resolve('lucide-react/package.json')), 'dist/esm/lucide-react.js');
const tests = [
  'modules/gestor/financeiro/outros-creditos/other-credit-create-modal.test.ts',
  'modules/gestor/financeiro/outros-creditos/pdv-receipt.test.ts',
  'modules/gestor/financeiro/outros-creditos/pdv-receipt-identity.test.ts',
  'modules/gestor/financeiro/outros-creditos/pdv-confirmation-loop.test.ts',
  'modules/gestor/configuracoes/impressoras/printer-ui.test.tsx',
];
// Mantém resolução dos pacotes do projeto; cada execução tem seu diretório descartável.
await mkdir(resolve('tmp'), { recursive: true });
const outputDirectory = await mkdtemp(resolve('tmp/pdv-receipts-tests-'));
const outputFiles = tests.map((_, index) => join(outputDirectory, `${index}.test.mjs`));

try {
  await Promise.all(tests.map((entry, index) => build({
    entryPoints: [entry], outfile: outputFiles[index],
    bundle: true, platform: 'node', format: 'esm', packages: 'external',
    jsx: 'automatic', logLevel: 'silent',
    define: {
      'import.meta.env': JSON.stringify({
        VITE_SUPABASE_URL: 'https://example.invalid',
        VITE_SUPABASE_ANON_KEY: 'synthetic-test-key',
      }),
    },
    plugins: [{
      name: 'lucide-real-esm-exports',
      setup(builder) {
        builder.onResolve({ filter: /^lucide-react$/ }, () => ({ path: lucideEntry }));
      },
    }],
  })));
  const result = spawnSync(process.execPath, ['--test', ...outputFiles,
    'modules/gestor/financeiro/outros-creditos/pdv-confirmation-cache.test.mjs'], {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(outputDirectory, { recursive: true, force: true });
}
