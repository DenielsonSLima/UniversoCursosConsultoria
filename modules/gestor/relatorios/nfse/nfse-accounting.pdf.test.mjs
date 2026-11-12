import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
const dir = await mkdtemp(join(tmpdir(), 'nfse-accounting-'));
const require = createRequire(import.meta.url);
async function load(file) {
  const output = join(dir, file.replace('.ts', '.cjs'));
  await build({ entryPoints: [fileURLToPath(new URL(file, import.meta.url))], outfile: output, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  return require(output);
}
const { createNfseAccountingPdf } = await load('nfse-accounting.pdf.ts');
const { parseNfseAccountingReport } = await load('nfse-accounting.types.ts');
const { accountingFixture, accountingFixtureAssets } = await load('nfse-accounting.fixture.ts');
async function inspect(blob) {
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }); const doc = await task.promise; const pages = [];
  for (let n = 1; n <= doc.numPages; n++) { const p = await doc.getPage(n); const content = await p.getTextContent();
    const ops = await p.getOperatorList(); pages.push({ view: p.view, items: content.items,
      text: content.items.map(i => i.str).join(' '), images: ops.fnArray.filter(o => o === OPS.paintImageXObject || o === OPS.paintInlineImageXObject).length }); }
  await task.destroy(); return pages;
}

test('paisagem selecionável, duas linhas por nota, chave completa e total canônico no final', async () => {
  const report = accountingFixture(); const before = JSON.stringify(report);
  const result = createNfseAccountingPdf(report, accountingFixtureAssets); const pages = await inspect(result.blob);
  assert.equal(JSON.stringify(report), before); assert.equal(pages.length, 2);
  const allText = pages.map(p => p.text).join('\n');
  for (const expected of ['TRIBUTAÇÃO NAC.', 'ITEM NBS', 'DATA DO SERVIÇO', 'R$ 3.680,00', '080201', 'Aquidabã', 'COMPETÊNCIA']) assert(allText.includes(expected), expected);
  assert(pages[1].text.includes('TOTAL GERAL DO PERÍODO'));
  for (const row of report.pages[0]) assert(pages[0].text.includes(row.accessKey));
  for (const p of pages) {
    assert(p.view[2] > p.view[3]); assert.equal(p.images, 0);
    for (const item of p.items.filter(i => i.str.trim())) assert(item.transform[5] > 20 && item.transform[5] < 565, item.str);
  }
  const items = pages[0].items;
  for (const number of items.filter(i => /^10[1-5]$/.test(i.str))) {
    const y = number.transform[5]; const rowItems = items.filter(i => i.str.trim() && i.transform[5] <= y + .1 && i.transform[5] > y - 23);
    assert.equal(new Set(rowItems.map(i => i.transform[5].toFixed(1))).size, 2, number.str);
  }
});

test('por polo não inclui outras unidades; desconhecidos não viram zero e canceladas são recusadas', async () => {
  const report = accountingFixture('POLO');
  const pages = await inspect(createNfseAccountingPdf(report, accountingFixtureAssets).blob);
  assert(!pages.map(p => p.text).join(' ').includes('Aquidabã')); assert(pages[1].text.includes('R$ 500,00'));
  report.pages[0][0].poloId = 'foreign'; assert.throws(() => parseNfseAccountingReport(report, report.scope));
  const unknown = accountingFixture('POLO'); unknown.pages[0][0].amount = null; unknown.totalAmount = null;
  const unknownPages = await inspect(createNfseAccountingPdf(unknown, accountingFixtureAssets).blob);
  assert(unknownPages[1].text.includes('Há valores desconhecidos'));
  const cancelled = accountingFixture(); cancelled.pages[0][0].state = 'CANCELLED';
  assert.throws(() => createNfseAccountingPdf(cancelled, accountingFixtureAssets));
});

test('rejeita paginação parcial, duplicação, data inválida e resumos divergentes', () => {
  for (const change of [r => r.totalItems++, r => r.pages[0].push(r.pages[0][0]), r => r.dateFrom='2026-02-30',
    r => r.summaryPages[0][0].amount='999.00', r => r.pages[0][0].amount='1,00']) {
    const r=accountingFixture(); change(r); assert.throws(() => parseNfseAccountingReport(r,r.scope));
  }
});

test('páginas cheias, resumos cheios e relatório vazio preservam margens e rodapé', async () => {
  const r=accountingFixture(); const prototype=r.pages[0][0];
  r.pages=[Array.from({length:8},(_,i)=>({...prototype,id:`full-${i}`,number:String(201+i),accessKey:String(201+i).padStart(50,'0')}))];
  r.totalItems=8;
  r.byCode=Array.from({length:12},(_,i)=>({code:String(i+100000),count:1,amount:'1.00'})); r.byNbs=[];r.byPolo=[r.byPolo[1]];
  r.summaryPages=[r.byCode.map(c=>({kind:'CODE',...c})),r.byPolo.map(p=>({kind:'POLO',...p}))];
  const pages=await inspect(createNfseAccountingPdf(r,accountingFixtureAssets).blob);
  assert.equal(pages.length,3);
  for(const p of pages)for(const i of p.items.filter(i=>i.str.trim()))assert(i.transform[5]>20,i.str);
  const empty=accountingFixture('POLO');empty.pages=[];empty.totalItems=0;empty.totalAmount='0.00';empty.byCode=[];empty.byNbs=[];empty.summaryPages=[];
  empty.byPolo=[{...empty.byPolo[0],count:0,amount:'0.00'}];
  const e=await inspect(createNfseAccountingPdf(empty,accountingFixtureAssets).blob);
  assert(e[0].text.includes('Nenhuma NFS-e'));assert(e[1].text.includes('R$ 0,00'));
});

test('prévia usa o mesmo compositor com logo isolada e dados explicitamente fictícios', async () => {
  if (!process.env.NFSE_ACCOUNTING_PREVIEW_DIR) return;
  await mkdir(process.env.NFSE_ACCOUNTING_PREVIEW_DIR,{recursive:true});
  const logo = await readFile(new URL('../../../../public/logos/universo-logo.png', import.meta.url));
  for (const mode of ['POLO','GERAL']) {
    const assets = structuredClone(accountingFixtureAssets);
    assets.logo = { dataUrl:`data:image/png;base64,${logo.toString('base64')}`,format:'PNG' };
    assets.institution.isHeadquarters = mode==='GERAL';
    assets.institution.name += ' · PRÉVIA';
    if(mode==='POLO') assets.institution.city='Propriá';
    const result = createNfseAccountingPdf(accountingFixture(mode), assets);
    await writeFile(join(process.env.NFSE_ACCOUNTING_PREVIEW_DIR,`previa-nfse-${mode.toLowerCase()}.pdf`),new Uint8Array(await result.blob.arrayBuffer()));
  }
});

test('mantém compositor institucional canônico e não rasteriza tabelas ou página', async () => {
  const source = await readFile(new URL('nfse-accounting.pdf.ts',import.meta.url),'utf8');
  assert.match(source,/drawCanonicalInstitutionalHeader/); assert.match(source,/drawCanonicalPdfWatermark/);
  assert.doesNotMatch(source,/html2canvas|toDataURL|addImage|\.cnpj|\.address/);
});

test.after(async()=>{await rm(dir,{recursive:true,force:true});});
