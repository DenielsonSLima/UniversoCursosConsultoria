import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const base = new URL('./', import.meta.url);
const dir = await mkdtemp(join(tmpdir(), 'nfse-preset-report-'));
const require = createRequire(import.meta.url);
async function load(name) {
  const output = join(dir, name.replace(/[/\\]/g, '_').replace('.ts', '.cjs'));
  await build({ entryPoints: [fileURLToPath(new URL(name, base))], outfile: output, bundle: true,
    platform: 'node', format: 'cjs', logLevel: 'silent' });
  return require(output);
}
const [{ createNfseModelExportReport }, { createNfseModelExportPdf }, fixture, catalog] = await Promise.all([
  load('nfse-model-export.projection.ts'), load('nfse-model-export.pdf.ts'), load('nfse-model-export.fixture.ts'),
  load('../catalogs/nfse-ibscbs.catalog.ts'),
]);
const catalogs = { fiscal: fixture.exportCatalogs, profile: 'PRODUCTION_20260209',
  values: { classifications: catalog.nfseIbsCbsClassifications, credits: catalog.nfsePresumedCredits } };
const project = (model) => createNfseModelExportReport(model, fixture.exportScope, fixture.exportIssuer, catalogs, '2026-11-10T20:00:00Z');
function leaves(value, path = '') {
  if (Array.isArray(value) && value.length) return value.flatMap((entry, index) => leaves(entry, `${path}.${index}`));
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length)
    return Object.entries(value).flatMap(([key, entry]) => leaves(entry, path ? `${path}.${key}` : key));
  return [path];
}

test('report covers every model leaf, empty fields and execution origins without mutating stored data', () => {
  const model = fixture.exportModelFixture(); const before = JSON.stringify(model);
  const report = project(model); const rows = report.sections.flatMap(section => section.rows);
  const paths = new Set(rows.map(row => row.path));
  for (const path of leaves(model)) assert.ok(paths.has(path), `Missing report field ${path}`);
  assert.equal(JSON.stringify(model), before);
  assert.equal(rows.find(row => row.path === 'peopleOptions.simpleNationalAssessment').origin, 'Configuração da unidade');
  assert.match(rows.find(row => row.path === 'peopleOptions.simpleNationalAssessment').value, /Atual: 1/);
  assert.match(rows.find(row => row.path === 'valuesOptions.ibscbs.classificationCode').value, /000001.*Situações tributadas/);
  assert.match(rows.find(row => row.path === 'valuesOptions.transparency.municipal.value').value, /3,88%/);
  assert.equal(rows.find(row => row.path === 'referenceDocument').value, 'Sem valor definido');
  assert.equal(rows.find(row => row.path === 'serviceDescription').origin, 'Modelo + dados da emissão');
  assert.equal(rows.find(row => row.path === 'additionalOptions.service.operationReferences.source').origin, 'Na emissão');
  const legacy = fixture.exportModelFixture(); legacy.peopleOptions = legacy.serviceOptions = legacy.valuesOptions = legacy.additionalOptions = null;
  assert.ok(project(legacy).sections.flatMap(section => section.rows).filter(row => row.value === 'Sem valor definido').length >= 4);
  const unsafe = fixture.exportModelFixture(); unsafe.valuesOptions.password = 'NEVER_EXPORT_SECRET';
  assert.doesNotMatch(JSON.stringify(project(unsafe)), /NEVER_EXPORT_SECRET/);
});

test('document rules and nested property references remain complete human-readable report rows', () => {
  const model = fixture.exportModelFixture();
  model.valuesOptions.deduction = { mode: 'DOCUMENTS', value: null, documents: [{ source: 'LINKED_OPERATION_DOCUMENTS',
    documentType: 'NATIONAL_NFSE', categoryCode: '99', categoryDescription: 'CATEGORIA SINTÉTICA', documentDescription: null,
    allocationMode: 'PERCENTAGE', allocationValue: '12.5', supplierSource: 'DOCUMENT', supplierPartnerId: null }] };
  model.additionalOptions.service.property = { municipality: { source: 'AT_ISSUANCE', value: null },
    units: { source: 'FIXED', value: [{ unitKey: '00000000-0000-0000-0000-000000000077', propertyTaxRegistration: null,
      identification: { kind: 'CIB', cib: 'CODIGO_SINTETICO', address: null } }] }, originalDueDate: { source: 'AT_ISSUANCE', value: null } };
  model.additionalOptions.people.providerPartner = { source: 'FIXED', value: '00000000-0000-0000-0000-000000000078' };
  const report = project(model); const rows = report.sections.flatMap(group => group.rows);
  const paths = new Set(rows.map(row => row.path));
  for (const path of leaves(model)) assert.ok(paths.has(path), path);
  assert.match(rows.find(row => row.path.endsWith('.documents.0.documentType')).value, /NFS-e nacional/);
  assert.equal(rows.find(row => row.path.endsWith('.property.units.value.0.unitKey')).value, '00000000-0000-0000-0000-000000000077');
  assert.equal(rows.find(row => row.path.endsWith('.property.originalDueDate.value')).value, 'A definir na emissão');
  assert.equal(rows.find(row => row.path.endsWith('.property.units.value.0.identification.cib')).value, 'CODIGO_SINTETICO');
  assert.equal(rows.find(row => row.path === 'additionalOptions.people.providerPartner.value').value, '00000000-0000-0000-0000-000000000078');
});

test('report enforces unit identity and the canonical header receives the resolved headquarters status', async () => {
  assert.throws(() => createNfseModelExportReport(fixture.exportModelFixture(), fixture.exportScope,
    { ...fixture.exportIssuer, poloId: '00000000-0000-0000-0000-000000000088' }, catalogs, '2026-11-10T20:00:00Z'), /mesma revisão/);
  const { blob } = createNfseModelExportPdf(project(fixture.exportModelFixture()), { isHeadquarters: true, logo: null, watermark: null });
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  try { const pdf = await task.promise; const content = await (await pdf.getPage(1)).getTextContent();
    assert.match(content.items.map(item => item.str).join(' '), /MATRIZ/); }
  finally { await task.destroy(); }
});

test('native report paginates complete long content, retains selectable text and contains no fiscal marks or page raster', async () => {
  const model = fixture.exportModelFixture();
  model.serviceDescription = 'Descrição longa de conferência. '.repeat(60) + 'SENTINELA_FINAL_DA_DESCRICAO';
  model.additionalOptions.service.orderItems.value = Array.from({ length: 35 }, (_, i) => `ITEM_DE_TESTE_${i + 1}`);
  const report = project(model); const { blob, fileName } = createNfseModelExportPdf(report);
  assert.equal(blob.type, 'application/pdf'); assert.match(fileName, /pre-modelo-nfse-curso-tecnico-sintetico-v3\.pdf$/);
  const data = new Uint8Array(await blob.arrayBuffer());
  if (process.env.NFSE_MODEL_REPORT_TEST_PDF) await writeFile(process.env.NFSE_MODEL_REPORT_TEST_PDF, data);
  const task = getDocument({ data });
  try {
    const pdf = await task.promise; assert.ok(pdf.numPages > 2);
    const all = []; let images = 0;
    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
      const page = await pdf.getPage(pageIndex);
      const content = await page.getTextContent(); all.push(content.items.map(item => item.str).join(' '));
      const operators = await page.getOperatorList();
      images += operators.fnArray.filter(op => op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject).length;
      assert.ok(content.items.every(item => item.transform[5] >= 15 && item.transform[5] <= 810), 'Text stays within A4 page');
      assert.equal((await page.getAnnotations()).length, 0);
    }
    const text = all.join('\n');
    for (const expected of ['Relatório de configuração', 'Configuração e regras da emissão', 'Valores, tributos', 'SENTINELA_FINAL_DA_DESCRICAO', 'ITEM_DE_TESTE_35', '3,88%', '000001', 'Na emissão'])
      assert.ok(text.includes(expected), expected);
    assert.doesNotMatch(text, /DANFSe|CHAVE DE ACESSO|Receita Federal|QR Code/);
    assert.equal(images, 0, 'All report content is native text and geometry');
  } finally { await task.destroy(); }
});

test.after(async () => { await rm(dir, { recursive: true, force: true }); });
