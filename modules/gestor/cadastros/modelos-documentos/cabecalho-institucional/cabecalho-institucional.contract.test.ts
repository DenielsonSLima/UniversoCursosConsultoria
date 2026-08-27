import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const consumerUrls = [
  '../../../relatorios/components/RelatorioShared.tsx',
  '../../../relatorios/components/RelatorioCursos.tsx',
  '../../../relatorios/components/RelatorioTurmas.tsx',
  '../../../relatorios/components/RelatorioInadimplencia.tsx',
  '../../../relatorios/components/RelatorioPolos.tsx',
  '../../../relatorios/components/RelatorioFinanceiro.tsx',
  '../../../relatorios/components/RelatorioEstagios.tsx',
  '../../../relatorios/components/RelatorioDRE.tsx',
  '../../../financeiro/components/FinancialReportPreview.tsx',
  '../../../parceiros/components/export/templates/PdfTemplate.tsx',
  '../../../parceiros/components/viewparceiros/aluno/ficha/FichaAlunoModal.tsx',
].map((relativePath) => new URL(relativePath, import.meta.url));

test('prévia institucional é somente leitura e usa matriz/polos no DocumentHeader real', async () => {
  const [preview, modelsPage] = await Promise.all([
    readFile(new URL('./CabecalhoInstitucionalPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../ModelosDocumentosPage.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(preview, /Promise\.all\(\[/);
  assert.match(preview, /empresasService\.getCompanyPrincipal\(\)/);
  assert.match(preview, /polosService\.getAll\(\)/);
  assert.match(preview, /marcaDaguaService\.getCompaniesWithWatermark\(\)/);
  assert.match(preview, /<ReportWatermark polo=\{selectedUnit\.polo\} orientation=\{orientation\} \/>/);
  assert.match(preview, /if \(!watermark\?\.landscapeWatermarkUrl\) return portraitFields/);
  assert.match(preview, /orientation=\{orientation\}/);
  assert.match(preview, /meta=\{previewMeta\}/);
  assert.match(preview, /previewQuery\.isLoading/);
  assert.match(preview, /previewQuery\.isError/);
  assert.doesNotMatch(preview, /useMutation|\.create\(|\.update\(|\.delete\(|\.save/);

  assert.match(modelsPage, /id: 'cabecalho-institucional'/);
  assert.match(modelsPage, /<CabecalhoInstitucionalPage \/>/);
  assert.match(modelsPage, /id: 'plano-curso'/);
  assert.match(modelsPage, /<PlanoCursoPage \/>/);
});

test('consumidores React usam somente metadados estruturados', async () => {
  const consumers = await Promise.all(consumerUrls.map((url) => readFile(url, 'utf8')));
  const source = consumers.join('\n');
  const overdueReport = consumers[3];
  const classesReport = consumers[2];
  const partnersReport = consumers[9];
  const directReports = [
    consumers[1],
    ...consumers.slice(4, 8),
  ];

  assert.match(source, /meta=\{\{/);
  assert.doesNotMatch(source, /rightContent=|showLegalName/);
  assert.match(consumers[0], /export const A4ReportPrintStyles/);
  assert.match(consumers[0], /#\$\{printAreaId\}\.a4-report-page/);
  assert.match(consumers[0], /display: flex !important/);
  directReports.forEach((report) => {
    assert.match(report, /<A4ReportPrintStyles \/>/);
    assert.match(report, /className="a4-report-page/);
    assert.doesNotMatch(report, /print:p-0/);
  });
  assert.match(classesReport, /<FinancialReportExportButton/);
  assert.doesNotMatch(classesReport, /window\.print|<A4ReportPrintStyles \/>/);
  assert.match(overdueReport, /<FinancialReportExportButton/);
  assert.doesNotMatch(overdueReport, /<A4ReportPrintStyles \/>/);
  assert.match(partnersReport, /CONTINUATION_PAGE_ROW_LIMIT = 16/);
});
