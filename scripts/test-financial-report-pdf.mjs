import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'financial-report-pdf-tests-'));
const previewPath = resolve(root, 'modules/gestor/financeiro/components/FinancialReportPreview.tsx');
const sharedPreviewPath = resolve(root, 'modules/gestor/relatorios/pdf/ReportPdfPreviewModal.tsx');
const vectorPath = resolve(root, 'modules/gestor/financeiro/components/financial-report.vector-pdf.ts');
const layoutPath = resolve(root, 'modules/gestor/financeiro/components/financial-report.vector-pdf.layout.ts');
const resourcesPath = resolve(root, 'modules/gestor/financeiro/components/financial-report.vector-pdf.resources.ts');
const fallbackPath = resolve(root, 'modules/gestor/financeiro/components/financial-report.vector-pdf.fallback.ts');

try {
  const [preview, sharedPreview, vector, layout, resources, fallback] = await Promise.all([
    readFileSync(previewPath, 'utf8'),
    readFileSync(sharedPreviewPath, 'utf8'),
    readFileSync(vectorPath, 'utf8'),
    readFileSync(layoutPath, 'utf8'),
    readFileSync(resourcesPath, 'utf8'),
    readFileSync(fallbackPath, 'utf8'),
  ]);
  const vectorPipeline = `${vector}\n${layout}\n${resources}\n${fallback}`;
  assert.match(vector, /FINANCIAL_REPORT_PDF_PIPELINE = 'native-vector'/);
  assert.match(vector, /drawCanonicalInstitutionalHeader/);
  assert.match(vector, /scale:\s*watermark\.scale/);
  assert.match(vector, /rotate:\s*watermark\.rotate/);
  assert.match(resources, /\['watermarkScale',\s*'watermark_scale'\]/);
  assert.match(resources, /\['watermarkRotate',\s*'watermark_rotate'\]/);
  assert.match(resources, /opacity:\s*0\.03/);
  assert.match(resources, /component\?\.pdfText/);
  assert.match(resources, /hasValidInlineImageSignature/);
  assert.match(preview, /FinancialReportStatusBadge\.pdfText\s*=/);
  assert.match(vector, /pdf\.setCreationDate\(issuedAt\)/);
  assert.match(vector, /logo institucional configurada/);
  assert.match(vector, /FINANCIAL_REPORT_FALLBACK_WATERMARK/);
  assert.match(vectorPipeline, /pdf\.text\s*\(/);
  assert.match(vectorPipeline, /pdf\.(?:rect|roundedRect|line)\s*\(/);
  assert.match(preview, /<ReportPdfPreviewModal/);
  assert.doesNotMatch(`${preview}\n${sharedPreview}\n${vectorPipeline}`, /html2canvas|dom-to-selectable-pdf|buildSelectablePdfBlobFromElements/i);
  assert.match(sharedPreview, /downloadPdfBlob\(preparedPdf\.blob, preparedPdf\.fileName\)/);
  assert.match(sharedPreview, /await printPdfBlob\(preparedPdf\.blob/);
  assert.match(sharedPreview, /URL\.createObjectURL\(preparedPdf\.blob\)/);
  assert.match(sharedPreview, /<iframe[\s\S]*src=\{previewUrl\}/);

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
