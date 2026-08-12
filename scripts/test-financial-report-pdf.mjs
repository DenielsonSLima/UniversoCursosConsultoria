import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'financial-report-pdf-tests-'));
const previewPath = resolve(root, 'modules/gestor/financeiro/components/FinancialReportPreview.tsx');
const vectorPath = resolve(root, 'modules/gestor/financeiro/components/financial-report.vector-pdf.ts');

try {
  const [preview, vector] = await Promise.all([
    readFileSync(previewPath, 'utf8'),
    readFileSync(vectorPath, 'utf8'),
  ]);
  assert.match(vector, /FINANCIAL_REPORT_PDF_PIPELINE = 'native-vector'/);
  assert.match(vector, /drawCanonicalInstitutionalHeader/);
  assert.doesNotMatch(`${preview}\n${vector}`, /html2canvas|dom-to-selectable-pdf|buildSelectablePdfBlobFromElements/i);
  assert.match(preview, /downloadPdfBlob\(preparedPdf\.blob, preparedPdf\.fileName\)/);
  assert.match(preview, /await printPdfBlob\(preparedPdf\.blob/);
  assert.match(preview, /<iframe[\s\S]*src=\{previewUrl\}/);

  const output = join(temporaryDirectory, 'financial-report.vector-pdf.test.mjs');
  await build({
    entryPoints: [resolve(root, 'modules/gestor/financeiro/components/financial-report.vector-pdf.test.ts')],
    outfile: output,
    bundle: true,
    platform: 'node',
    format: 'esm',
    define: {
      'import.meta.env': JSON.stringify({
        VITE_SUPABASE_URL: 'http://localhost',
        VITE_SUPABASE_ANON_KEY: 'test',
      }),
    },
  });
  const result = spawnSync(process.execPath, ['--test', output], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
