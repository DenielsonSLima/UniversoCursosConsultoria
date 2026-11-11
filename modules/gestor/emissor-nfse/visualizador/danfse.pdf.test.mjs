import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const base = new URL('./', import.meta.url);
const fields = {
  nNFSe: ['25'], xLocEmi: ['Cidade fictícia'], ambGer: ['2'], dhProc: ['2026-11-01T00:05:00-03:00'],
  'emit/CNPJ': ['00000000000000'], 'emit/xNome': ['PRESTADOR FICTÍCIO'], 'emit/enderNac/UF': ['SE'],
  'DPS/infDPS/tpAmb': ['2'], 'DPS/infDPS/nDPS': ['10'], 'DPS/infDPS/serie': ['900'],
  'DPS/infDPS/dCompet': ['2026-11-01'], 'DPS/infDPS/dhEmi': ['2026-11-01T00:05:00-03:00'],
  'DPS/infDPS/serv/cServ/xDescServ': ['Treinamento fictício para conferência do compositor.'],
  'DPS/infDPS/serv/cServ/cTribNac': ['080201'], 'DPS/infDPS/valores/vServPrest/vServ': ['1234.56'],
  'valores/vLiq': ['1234.56'],
};

test('DANFSe is one native A4 page with selectable values, fixed official QR and homologation mark', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nfse-danfse-pdf-'));
  try {
    const output = join(directory, 'danfse.cjs');
    await build({ entryPoints: [fileURLToPath(new URL('danfse.pdf.ts', base))], outfile: output,
      bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
    const { createDanfsePdf } = createRequire(import.meta.url)(output);
    const assets = {
      logo: new Uint8Array(await readFile(new URL('assets/nfse-national-logo.png', base))),
      regularFont: (await readFile(new URL('assets/LiberationSans-Regular.ttf', base))).toString('base64'),
      boldFont: (await readFile(new URL('assets/LiberationSans-Bold.ttf', base))).toString('base64'),
    };
    const blob = createDanfsePdf({ accessKey: '1'.repeat(50), number: '25', environment: '2', fields }, assets);
    assert.equal(blob.type, 'application/pdf');
    const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
    try {
      const pdf = await task.promise;
      assert.equal(pdf.numPages, 1);
      const page = await pdf.getPage(1);
      assert.deepEqual(page.view, [0, 0, 595, 842]);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str).join('\n');
      for (const expected of ['DANFSe v2.0', 'NFS-e SEM VALIDADE JURÍDICA', 'PRESTADOR FICTÍCIO']) {
        assert.ok(text.includes(expected), expected);
      }
      assert.match(text, /R\$ 1\.234,56/);
      assert.doesNotMatch(text, /R\$ 0,00/, 'Missing taxes must not become invented zero values');
      assert.doesNotMatch(text, /Universo/i);
      assert.equal((await page.getAnnotations()).length, 0, 'XML links are never embedded as actions');
      const operators = await page.getOperatorList();
      assert.equal(operators.fnArray.filter(operator => operator === OPS.paintImageXObject).length, 1, 'Only the national logo is raster; the QR and document are vectors');
      const fontNames = Object.values(content.styles).map(style => style.fontFamily);
      assert.ok(fontNames.length >= 2);
    } finally { await task.destroy(); }
    const retained = createDanfsePdf({ accessKey: '1'.repeat(50), number: '25', environment: '2', fields: {
      ...fields,
      'DPS/infDPS/valores/trib/tribFed/piscofins/tpRetPisCofins': ['1'],
      'DPS/infDPS/valores/trib/tribFed/piscofins/vPis': ['1.20'],
      'DPS/infDPS/valores/trib/tribFed/piscofins/vCofins': ['2.30'],
      'DPS/infDPS/valores/trib/tribFed/vRetCSLL': ['3.40'],
      'IBSCBS/totCIBS/gIBS/vIBSTot': ['4.50'], 'IBSCBS/totCIBS/gCBS/vCBS': ['5.60'],
    } }, assets, { exclusions: '3.50', totalIBSCBS: '10.10', socialRetentions: '6.90', pisOwn: '0.00', cofinsOwn: '0.00' });
    const retainedTask = getDocument({ data: new Uint8Array(await retained.arrayBuffer()) });
    try {
      const pdf = await retainedTask.promise;
      const content = await (await pdf.getPage(1)).getTextContent();
      const text = content.items.map(item => item.str).join('\n');
      assert.match(text, /R\$ 6,90/);
      assert.match(text, /R\$ 10,10/);
      assert.match(text, /R\$ 3,50/);
      assert.equal((text.match(/R\$ 0,00/g) || []).length, 2, 'Only server-confirmed retained PIS/COFINS have zero own-debit amounts');
      assert.doesNotMatch(text, /R\$ (1,20|2,30)/, 'Retained amounts are not mislabeled as own-debit amounts');
    } finally { await retainedTask.destroy(); }
    for (const [taxFields, expected, forbidden] of [
      [{ 'pTotTribSN': '12.00' }, /alíquota do Simples Nacional: 12,00%\./, /Federais:|R\$ 12,00/],
      [{ 'vTotTrib/vTotTribFed': '1.20', 'vTotTrib/vTotTribEst': '2.30', 'vTotTrib/vTotTribMun': '3.40' },
        /Federais: R\$ 1,20; Estaduais: R\$ 2,30; Municipais: R\$ 3,40;/, /alíquota do Simples Nacional/],
      [{ 'pTotTrib/pTotTribFed': '1.20', 'pTotTrib/pTotTribEst': '2.30', 'pTotTrib/pTotTribMun': '3.40' },
        /Federais: 1,20%; Estaduais: 2,30%; Municipais: 3,40%;/, /alíquota do Simples Nacional/],
    ]) {
      const taxValues = Object.fromEntries(Object.entries(taxFields)
        .map(([path, value]) => [`DPS/infDPS/valores/trib/totTrib/${path}`, [value]]));
      const taxBlob = createDanfsePdf({ accessKey: '1'.repeat(50), number: '25', environment: '2',
        fields: { ...fields, ...taxValues } }, assets);
      const taxTask = getDocument({ data: new Uint8Array(await taxBlob.arrayBuffer()) });
      try {
        const pdf = await taxTask.promise;
        assert.equal(pdf.numPages, 1);
        const content = await (await pdf.getPage(1)).getTextContent();
        const text = content.items.map(item => item.str).join(' ').replace(/\s+/g, ' ');
        assert.match(text, expected);
        assert.doesNotMatch(text, forbidden);
        assert.equal((await (await pdf.getPage(1)).getAnnotations()).length, 0);
      } finally { await taxTask.destroy(); }
    }
    assert.throws(() => createDanfsePdf({ accessKey: '1'.repeat(50), number: '25', environment: '2',
      fields: { ...fields, 'DPS/infDPS/serv/cServ/xDescServ': ['conteúdo '.repeat(10000)] } }, assets), /espaço|uma página/);
    assert.throws(() => createDanfsePdf({ accessKey: '1'.repeat(50), number: '25', environment: '2',
      fields: { ...fields, xLocEmi: ['cidade '.repeat(1000)] } }, assets), /município excede/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
