import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const outputDirectory = mkdtempSync(join(tmpdir(), 'caixa-report-tests-'));
const tests = [
  'modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoRecebimentoRows.test.tsx',
  'modules/gestor/caixa/caixa-data-scope.test.ts',
  'modules/gestor/caixa/caixa-financiamento-resumo.test.ts',
  'modules/gestor/caixa/caixa-linha-corte.test.ts',
  'modules/gestor/caixa/caixa-patrimonio-resumo.test.ts',
  'modules/gestor/caixa/caixa-posicao-liquida-resumo.test.ts',
  'modules/gestor/caixa/caixa-posicao-total-resumo.test.ts',
  'modules/gestor/caixa/caixa-polos.test.ts',
  'modules/gestor/caixa/report/caixa-report.layout.test.ts',
  'modules/gestor/caixa/report/caixa-report.mapper.test.ts',
  'modules/gestor/caixa/report/caixa-report.pagination.test.ts',
  'modules/gestor/caixa/report/caixa-report.vector-pdf.test.ts',
];

try {
  const outputs = [];
  for (const [index, entry] of tests.entries()) {
    const format = entry.endsWith('.tsx') ? 'cjs' : 'esm';
    const output = join(outputDirectory, `test-${index}.${format === 'cjs' ? 'cjs' : 'mjs'}`);
    await build({
      entryPoints: [resolve(root, entry)],
      outfile: output,
      bundle: true,
      platform: 'node',
      format,
      define: {
        'import.meta.env': JSON.stringify({
          VITE_SUPABASE_URL: 'http://localhost',
          VITE_SUPABASE_ANON_KEY: 'test',
        }),
      },
    });
    outputs.push(output);
  }

  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'data:text/javascript,globalThis.WebSocket=class%7B%7D',
      '--test',
      ...outputs,
    ],
    { cwd: root, encoding: 'utf8', stdio: 'inherit' },
  );
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
