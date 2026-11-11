import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const base = new URL('./', import.meta.url);
const dir = await mkdtemp(join(tmpdir(), 'nfse-issued-report-'));
const require = createRequire(import.meta.url);
async function load(name, plugins = []) {
  const output = join(dir, name.replace('.ts', '.cjs'));
  await build({ entryPoints: [fileURLToPath(new URL(name, base))], outfile: output, bundle: true,
    platform: 'node', format: 'cjs', logLevel: 'silent', plugins });
  return require(output);
}
const { createNfseIssuedExportPdf } = await load('nfse-issued-export.pdf.ts');
const { assertNfseIssuedExportReport, formatNfseIssuedReportAmount } = await load('nfse-issued-export.types.ts');
const assets = { logo: null, watermark: null, institution: {
  name: 'INSTITUIÇÃO DE TESTE', legalName: '', cnpj: '00.000.000/0001-00',
  address: 'Rua Fictícia', number: '100', complement: '', neighborhood: 'Bairro de Teste',
  city: 'Cidade Exemplo', state: 'SE', postalCode: '00000-000', phone: '(00) 0000-0000',
  email: '', isHeadquarters: true,
} };
const scope = { poloId: '00000000-0000-0000-0000-000000000001', contextKey: 'fixture-context', environment: 'PRODUCAO', month: '2026-11' };
const row = (index = 0) => ({
  id: `synthetic-document-${index}`, status: 'EMITIDA', state: 'AUTHORIZED', number: String(index + 1001),
  studentName: `Tomador de Teste ${String(index + 1).padStart(2, '0')}`, classLabel: 'TURMA SINTÉTICA',
  modelLabel: 'Modelo acadêmico de teste', amount: '125.05', origin: index % 2 ? 'SERVICO' : 'ALUNO',
  emittedAt: '2026-11-10T02:30:00Z', courseTypeLabel: 'Técnico', accessKey: null,
  errorCode: null, errorMessage: null, retryable: false,
});
const report = (count = 1) => ({
  scope, filters: { dateFrom: '2026-11-01', dateTo: '2026-11-30' }, generatedAt: '2026-11-11T12:00:00Z',
  rows: Array.from({ length: count }, (_, i) => row(i)), totalItems: count,
  totalAmount: count === 0 ? '0.00' : count === 37 ? '4626.85' : '125.05',
});
async function inspect(blob) {
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  const pdf = await task.promise;
  const pages = [];
  for (let index = 1; index <= pdf.numPages; index++) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    const operators = await page.getOperatorList();
    pages.push({ items: content.items, text: content.items.map(item => item.str).join(' '), view: page.view,
      images: operators.fnArray.filter(op => op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject).length });
  }
  await task.destroy();
  return pages;
}

test('canonical report rejects partial, duplicate, cancelled and invalid amounts without computing a local total', () => {
  assert.throws(() => assertNfseIssuedExportReport({ ...report(), totalItems: 2 }), /incompleto/);
  assert.throws(() => assertNfseIssuedExportReport({ ...report(2), rows: [row(), row()] }), /duplicada/);
  assert.throws(() => assertNfseIssuedExportReport({ ...report(), rows: [{ ...row(), state: 'CANCELLED' }] }), /cancelada/);
  assert.throws(() => assertNfseIssuedExportReport({ ...report(), rows: [{ ...row(), status: 'ERRO' }] }), /incompatível/);
  for (const amount of ['NaN', '-1', '1,00', '1.001', undefined]) {
    assert.throws(() => assertNfseIssuedExportReport({ ...report(), totalAmount: amount }), /incompleto/);
  }
  assert.throws(() => assertNfseIssuedExportReport({ ...report(), filters: { dateFrom: '2026-02-30' } }), /incompleto/);
  assert.throws(() => assertNfseIssuedExportReport({ ...report(), filters: { dateFrom: '2026-11-30', dateTo: '2026-11-01' } }), /incompleto/);
  assert.equal(formatNfseIssuedReportAmount('123456789012345.67'), 'R$ 123.456.789.012.345,67');
  assert.equal(formatNfseIssuedReportAmount(null), 'Não informado');
  assert.equal(formatNfseIssuedReportAmount('1.2'), 'R$ 1,20');
});

test('portrait PDF keeps two physical lines per invoice, native text, canonical total and page order', async () => {
  const snapshot = report(37); const before = JSON.stringify(snapshot);
  const { blob, fileName } = createNfseIssuedExportPdf(snapshot, assets);
  assert.equal(JSON.stringify(snapshot), before);
  assert.equal(blob.type, 'application/pdf');
  assert.equal(fileName, 'nfse-emitidas-2026-11-01-a-2026-11-30-interno.pdf');
  if (process.env.NFSE_ISSUED_REPORT_TEST_PDF) await writeFile(process.env.NFSE_ISSUED_REPORT_TEST_PDF, new Uint8Array(await blob.arrayBuffer()));
  const pages = await inspect(blob); assert.equal(pages.length, 3);
  const allText = pages.map(page => page.text).join('\n');
  for (const expected of ['NOTAS FISCAIS EMITIDAS', 'MODELO INTERNO', 'R$ 4.626,85', 'MATRIZ', '01/11/2026 a 30/11/2026', '09/11/2026', 'Página 3 de 3']) {
    assert.ok(allText.includes(expected), expected);
  }
  assert.equal(allText.split('TOTAL EMITIDO NO PERÍODO').length - 1, 1);
  for (const page of pages) {
    assert.ok(page.view[2] < page.view[3], 'A4 portrait');
    assert.equal(page.images, 0, 'No rasterized pages');
    assert.ok(page.items.every(item => item.transform[5] >= 20 && item.transform[5] < 810), 'Text stays in page margins');
    for (const numberItem of page.items.filter(item => /^10\d{2}$/.test(item.str))) {
      const top = numberItem.transform[5];
      const rowItems = page.items.filter(item => item.str.trim() && item.transform[5] <= top + 0.1 && item.transform[5] > top - 23);
      assert.equal(new Set(rowItems.map(item => item.transform[5].toFixed(1))).size, 2, `Invoice ${numberItem.str} uses two lines`);
    }
  }
  snapshot.rows.forEach(item => assert.equal(allText.split(item.studentName).length - 1, 1, item.studentName));
});

test('empty and unknown amounts remain distinct, and long descriptions do not change row height', async () => {
  const empty = createNfseIssuedExportPdf(report(0), assets);
  const emptyPages = await inspect(empty.blob);
  assert.equal(emptyPages.length, 1); assert.match(emptyPages[0].text, /R\$ 0,00/);
  assert.match(emptyPages[0].text, /Nenhuma nota emitida neste período/);
  const unknown = report(); unknown.totalAmount = null; unknown.rows[0].amount = null;
  unknown.rows[0].studentName = 'NOME MUITO LONGO '.repeat(20);
  unknown.rows[0].classLabel = 'TURMA LONGA '.repeat(20);
  unknown.rows[0].modelLabel = 'MODELO LONGO '.repeat(20);
  const unknownPages = await inspect(createNfseIssuedExportPdf(unknown, assets).blob);
  assert.equal(unknownPages.length, 1); assert.match(unknownPages[0].text, /Total não informado/);
  assert.doesNotMatch(unknownPages[0].text, /R\$ 0,00/);
  if (process.env.NFSE_ISSUED_REPORT_TEST_EMPTY_PDF) await writeFile(process.env.NFSE_ISSUED_REPORT_TEST_EMPTY_PDF, new Uint8Array(await empty.blob.arrayBuffer()));
});

test('cleared dates retain the server month fallback and single dates describe open intervals', async () => {
  const snapshot = report(0);
  for (const [filters, expected] of [
    [{}, 'Mês de referência: 11/2026'],
    [{ dateFrom: '2026-11-01' }, 'A partir de 01/11/2026'],
    [{ dateTo: '2026-11-30' }, 'Até 30/11/2026'],
  ]) {
    snapshot.filters = filters;
    const pages = await inspect(createNfseIssuedExportPdf(snapshot, assets).blob);
    assert.ok(pages[0].text.includes(expected), expected);
    assert.doesNotMatch(pages[0].text, /Todo o período/);
  }
});

test('unit resources preserve the configured portrait watermark and fail rather than replace missing assets', async () => {
  const image = { dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNQCCgAAAF0AOHgi5XaAAAAAElFTkSuQmCC', format: 'PNG' };
  globalThis.__nfseIssuedAssetFixture = {
    polo: { id: scope.poloId, nome: 'INSTITUIÇÃO DE TESTE', cnpj: '00.000.000/0001-00', is_matriz: true,
      logoUrl: 'test-logo', watermark_url: 'test-watermark', watermark_opacity: 0.12, watermark_scale: 42, watermark_rotate: false },
    image,
  };
  const plugins = [{ name: 'isolated-institutional-assets', setup(build) {
    build.onResolve({ filter: /configuracoes\/polos\/polos.service$/ }, () => ({ path: 'polo', namespace: 'fixture' }));
    build.onResolve({ filter: /shared\/canonical-document-vector-pdf$/ }, () => ({ path: 'image', namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'polo'
      ? 'export const polosService = { getById: async () => globalThis.__nfseIssuedAssetFixture.polo };'
      : 'export const resolveCanonicalPdfPhoto = async () => globalThis.__nfseIssuedAssetFixture.image;' }));
  } }];
  const { prepareNfseIssuedExportPdf } = await load('nfse-issued-export.resources.ts', plugins);
  const prepared = await prepareNfseIssuedExportPdf(report());
  const pages = await inspect(prepared.blob);
  assert.equal(pages[0].images, 2, 'Logo and watermark are isolated resources');
  const source = await readFile(new URL('nfse-issued-export.resources.ts', base), 'utf8');
  for (const field of ['watermark_opacity', 'watermark_scale', 'watermark_rotate', 'watermark_url']) assert.ok(source.includes(field));
  globalThis.__nfseIssuedAssetFixture.image = null;
  await assert.rejects(() => prepareNfseIssuedExportPdf(report()), /recursos institucionais/);
  globalThis.__nfseIssuedAssetFixture.polo.id = 'different-unit';
  await assert.rejects(() => prepareNfseIssuedExportPdf(report()), /dados institucionais/);
  delete globalThis.__nfseIssuedAssetFixture;
});

test('internal template uses the shared institutional compositor and no page capture', async () => {
  const source = await readFile(new URL('nfse-issued-export.pdf.ts', base), 'utf8');
  assert.match(source, /drawCanonicalInstitutionalHeader\(pdf/);
  assert.match(source, /drawCanonicalPdfWatermark\(pdf/);
  assert.doesNotMatch(source, /html2canvas|toDataURL|drawImage|addImage|\.cnpj|\.address/);
});

test.after(async () => { await rm(dir, { recursive: true, force: true }); });
