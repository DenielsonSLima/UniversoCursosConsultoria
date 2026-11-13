import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
if (args.length > 1 || (args[0] && args[0] !== '--performance')) {
  throw new Error('Uso: node scripts/test-caixa-report.mjs [--performance]');
}
const performanceOnly = args[0] === '--performance';
const modalDomConfigured = Boolean(process.env.CAIXA_JSDOM_PATH || process.env.CAIXA_UI_JSDOM_PATH);
const testEnvironment = { ...process.env };
if (performanceOnly || modalDomConfigured) {
  const require = createRequire(import.meta.url);
  let jsdomPath;
  try {
    jsdomPath = resolve(process.env.CAIXA_JSDOM_PATH || process.env.CAIXA_UI_JSDOM_PATH || require.resolve('jsdom'));
    require.resolve(jsdomPath);
  } catch {
    throw new Error('Regressões do Caixa exigem jsdom. Defina CAIXA_JSDOM_PATH para a instalação temporária.');
  }
  testEnvironment.CAIXA_JSDOM_PATH = jsdomPath;
  testEnvironment.CAIXA_UI_JSDOM_PATH = jsdomPath;
}
const outputDirectory = mkdtempSync(join(tmpdir(), 'caixa-report-tests-'));
const reportTests = [
  'modules/gestor/caixa/composition-review/caixa-composition-review.test.ts',
  'modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoRecebimentoRows.test.tsx',
  'modules/gestor/caixa/caixa-data-scope.test.ts',
  'modules/gestor/caixa/caixa-request-orchestration.test.tsx',
  'modules/gestor/caixa/caixa-read-queue.test.ts',
  'modules/gestor/caixa/caixa-composicao.test.ts',
  'modules/gestor/caixa/components/CaixaCompositionCards.test.tsx',
  'modules/gestor/caixa/components/CaixaImmersiveLayout.test.tsx',
  'modules/gestor/caixa/review-pending/caixa-review-pending.test.tsx',
  'modules/gestor/caixa/components/CaixaLowerNarratives.test.tsx',
  'modules/gestor/caixa/components/CaixaMovimentacaoChart.test.tsx',
  'modules/gestor/caixa/caixa-contas-pagar-resumo.test.tsx',
  'modules/gestor/caixa/caixa-financiamento-resumo.test.ts',
  'modules/gestor/caixa/caixa-linha-corte.test.ts',
  'modules/gestor/caixa/components/CaixaLinhaCorteCard.test.tsx',
  'modules/gestor/caixa/caixa-patrimonio-resumo.test.ts',
  'modules/gestor/caixa/caixa-posicao-liquida-resumo.test.ts',
  'modules/gestor/caixa/caixa-posicao-total-resumo.test.ts',
  'modules/gestor/caixa/caixa-convenios-resumo.test.ts',
  'modules/gestor/caixa/caixa-polos.test.ts',
  'modules/gestor/caixa/report/caixa-report.layout.test.ts',
  'modules/gestor/caixa/report/caixa-report.mapper.test.ts',
  'modules/gestor/caixa/report/caixa-report.service.test.ts',
  'modules/gestor/caixa/report/caixa-report.pagination.test.ts',
  'modules/gestor/caixa/report/caixa-report.vector-pdf.test.ts',
  'modules/gestor/caixa/report/caixa-report.concise-pdf.test.ts',
  'modules/gestor/caixa/report/caixa-report.fechamento-implantacao.test.tsx',
  'modules/gestor/caixa/report/caixa-report.composicao-parcial.test.tsx',
];

const tests = performanceOnly
  ? ['modules/gestor/caixa/caixa-linha-corte.realtime.test.tsx']
  : reportTests;

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

  // This test bundles its real page itself; preserve its source-relative URLs.
  if (performanceOnly) outputs.push(resolve(root, 'modules/gestor/caixa/caixa-first-summary.behavior.test.mjs'));
  else if (modalDomConfigured) outputs.push(resolve(root, 'modules/gestor/caixa/report/CaixaReportPreviewModal.interaction.test.mjs'));
  else console.info('SKIP smoke DOM do modal: CAIXA_JSDOM_PATH ausente; o workflow dedicado do Caixa configura e exige esse smoke.');

  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'data:text/javascript,globalThis.WebSocket=class%7B%7D',
      '--test',
      ...outputs,
    ],
    { cwd: root, encoding: 'utf8', stdio: 'inherit', env: testEnvironment },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}

