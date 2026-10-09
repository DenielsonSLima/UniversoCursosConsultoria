import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import { historyPrintIo } from './ead-history-print.fixture.mjs';
import { declarationModel } from './declaration-pdf.fixture.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(directory, '../../../..');
const dependencies = process.env.EAD_UI_NODE_MODULES;
const requireTool = createRequire(dependencies ? pathToFileURL(resolve(dependencies, '../declaration-runner.mjs')) : import.meta.url);
const { build } = requireTool('esbuild');
const { chromium } = requireTool('playwright');
const postcss = requireTool('postcss');
const tailwindcss = requireTool('tailwindcss');
const { createCanvas } = requireTool('@napi-rs/canvas');
const output = process.env.DECLARATION_PDF_ARTIFACTS || '/tmp/declaration-pdf';
const icon = (kind) => {
  const canvas = createCanvas(400, 200); const context = canvas.getContext('2d');
  context.fillStyle = kind === 'watermark' ? '#0891b2'
    : kind === 'second-watermark' ? '#16a34a' : kind === 'second-logo' ? '#be123c' : '#1e3a8a';
  context.fillRect(10, 10, 380, 180);
  context.clearRect(40, 40, 320, 120);
  return canvas.toDataURL('image/png');
};
const source = {
  emission: { id: 'synthetic-declaration', codigo: 'DEC-MAT-TEST-1234-5678', documento: 'declaracao_matricula',
    aluno_id: 'synthetic-student', matricula_id: 'test-enrollment', polo_id: 'test-polo',
    status: 'ATIVO', quantidade_emissoes: 1, emitido_em: '2026-10-09T12:00:00.000Z',
    ultima_emissao_em: '2026-10-09T12:00:00.000Z', validade_ate: '2026-11-08T12:00:00.000Z', validacao_publica: true,
    dados_emissao: { studentName: 'ALUNA SINTÉTICA DE TESTE', studentCpf: '12345678909', studentRg: '12.345.678',
      studentDocumentType: 'RG', studentRgIssuer: 'SSP', studentRgState: 'SE', studentBirthDate: '2000-02-07',
      studentMatricula: 'UNIV-TEST123', courseName: 'Curso de Teste', className: 'Turma de Teste',
      unitName: 'Instituição de Teste' },
  },
  resources: { template: { ...declarationModel, absoluteFields: declarationModel.absoluteFields.map(field => (
    field.type === 'image' ? { ...field, value: icon('signature') } : field
  )) }, polo: { nome: 'Instituição de Teste', nomeFantasia: 'Instituição de Teste', logoUrl: icon('logo'),
    cnpj: '12345678000199', cidade: 'Cidade Teste', estado: 'SE', endereco: 'Rua Teste', numero: '10',
    telefone: '(79) 3000-0000', bairro: 'Bairro Teste', cep: '49000-000', email: 'instituicao@example.test' },
    watermark: { watermarkUrl: icon('watermark'), watermarkOpacity: 0.15, watermarkScale: 60, watermarkRotate: true },
    certificate: null, academicData: null },
};
const io = { ...historyPrintIo };
delete io['./emission-browser-pdf'];
delete io['../template-parser'];
delete io['../../../components/DocumentHeader'];
io['../configuracoes/empresas/empresas.service'] = 'export const empresasService={getCompanyPrincipal:async()=>null};';
io['./ead-history-pdf'] = 'export const isEadCertificateEmission=()=>false;export const prepareEadHistoryPdf=()=>{throw Error("Not EAD")};';
let browser; let javascript; let css;

before(async () => {
  await mkdir(output, { recursive: true });
  const bundle = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';
      import History from './SecretariaHistoricoEmissoesPage';
      import {createDeclarationDocumentsPdf} from './declaration-document.pdf';
      window.buildDeclaration=createDeclarationDocumentsPdf;
      window.renderHistory=value=>{window.historyFixture=value;window.historyEvents=[];window.historyErrors=[];
      window.historyKeyCounter=0;createRoot(document.getElementById('root')).render(<History/>);};`,
    loader: 'tsx', resolveDir: directory },
    bundle: true, format: 'iife', write: false, define: { 'import.meta.env': '{}' },
    nodePaths: dependencies ? [dependencies] : [],
    plugins: [{ name: 'declaration-controlled-io', setup(plugin) {
      plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(io, args.path) ? { path: args.path, namespace: 'test-io' } : undefined);
      plugin.onLoad({ filter: /.*/, namespace: 'test-io' }, args => ({ contents: io[args.path], loader: 'tsx', resolveDir: directory }));
      plugin.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'no-remote-io' }));
      plugin.onLoad({ filter: /.*/, namespace: 'no-remote-io' }, () => ({
        contents: `export const supabase=new Proxy({}, {get(){throw Error('Unexpected remote database access in declaration PDF test')}});`,
      }));
    } }],
  });
  javascript = bundle.outputFiles[0].text;
  const config = requireTool(resolve(root, 'tailwind.config.cjs'));
  const styles = (await readFile(resolve(root, 'styles.css'), 'utf8')).replace(/^@import.*$/gm, '');
  css = (await postcss([tailwindcss({ ...config, content: [
    resolve(root, 'modules/gestor/secretaria/historico-emissoes/**/*.tsx'),
    resolve(root, 'modules/gestor/components/DocumentHeader.tsx'),
  ] })]).process(styles, { from: resolve(root, 'styles.css') })).css;
  browser = await chromium.launch({ headless: true,
    ...(process.env.EAD_UI_BROWSER_EXECUTABLE
      ? { executablePath: process.env.EAD_UI_BROWSER_EXECUTABLE } : { channel: 'chromium' }) });
});
after(async () => { await browser?.close(); });

async function open(value = source, width = 640) {
  const page = await browser.newPage({ viewport: { width, height: 850 } });
  await page.route('https://documents.test/**', route => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><html lang="pt-BR"><body><div id="root"></div></body></html>' }));
  await page.goto('https://documents.test/');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(value => window.renderHistory(value), value);
  await page.getByRole('button', { name: 'Abrir segunda via' }).click();
  await page.waitForFunction(() => document.querySelector('#reprint-modal iframe') || window.historyErrors.length > 0);
  assert.deepEqual(await page.evaluate(() => window.historyErrors), []);
  return page;
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function bytesFromPreview(page) {
  const url = await page.locator('#reprint-modal iframe').getAttribute('src');
  return Buffer.from(await page.evaluate(async value => Array.from(new Uint8Array(await (await fetch(value)).arrayBuffer())), url));
}

test('legacy declaration opens in a narrow viewport, preserving native text, configured fields and original assets', async () => {
  const page = await open();
  try {
    const bytes = await bytesFromPreview(page);
    const path = resolve(output, 'declaration-preview.pdf');
    await writeFile(path, bytes);
    const info = execFileSync('pdfinfo', [path], { encoding: 'utf8' });
    assert.match(info, /Pages:\s+1/); assert.match(info, /Page size:\s+595\.28 x 841\.89 pts \(A4\)/);
    const text = execFileSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8' });
    assert.match(text, /ALUNA SINTÉTICA DE TESTE/);
    assert.match(text, /123\.456\.789-09/);
    assert.match(text, /12\.345\.678/);
    assert.match(text, /SECRETARIA ACADÊMICA/);
    assert.match(text, /VERIFICAR A AUTENTICIDADE/);
    assert.doesNotMatch(text, /Não informado|\{\{/);
    const images = execFileSync('pdfimages', ['-list', path], { encoding: 'utf8' });
    const dimensions = images.split('\n').filter(line => /^\s*1\s+\d+\s+image\s/.test(line))
      .map(line => line.trim().split(/\s+/).slice(3, 5).map(Number));
    assert.ok(dimensions.length >= 3);
    assert.ok(dimensions.every(([width, height]) => width <= 400 && height <= 400), 'Only original logo/watermark/signature/QR assets');
    execFileSync('pdftoppm', ['-f', '1', '-singlefile', '-scale-to', '1800', '-png', path, resolve(output, 'declaration-page')]);
    await page.screenshot({ path: resolve(output, 'declaration-narrow-preview.png') });
  } finally { await page.close(); }
});

test('preview, download and print reuse the same complete declaration PDF', async () => {
  const page = await open();
  try {
    const original = hash(await bytesFromPreview(page));
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
    const path = resolve(output, 'declaration-download.pdf'); await (await pending).saveAs(path);
    assert.equal(hash(await readFile(path)), original);
    await page.evaluate(() => {
      window.printBytes = [];
      new window.MutationObserver(() => document.querySelectorAll('body > iframe[src^="blob:"]').forEach(async frame => {
        if (frame.dataset.observed) return; frame.dataset.observed = 'true';
        window.printBytes.push(Array.from(new Uint8Array(await (await fetch(frame.src)).arrayBuffer())));
      })).observe(document.body, { childList: true });
    });
    await page.getByRole('button', { name: 'Imprimir (Registrar 2ª Via)', exact: true }).click();
    await page.waitForFunction(() => window.printBytes.length === 1);
    assert.equal(hash(Buffer.from(await page.evaluate(() => window.printBytes[0]))), original);
    await page.waitForFunction(() => document.querySelector('#reprint-modal[aria-busy="false"]'));
    assert.equal(await page.getByRole('button', { name: 'Imprimir (Registrar 2ª Via)', exact: true }).isEnabled(), true);
    assert.deepEqual(await page.evaluate(() => window.historyErrors), []);
    assert.deepEqual(await page.evaluate(() => window.historyEvents.map(event => event.type)), ['prepare', 'confirm', 'prepare', 'confirm']);
  } finally { await page.close(); }
});

test('CIN declaration emits one labeled formatted identity and rejects actual overflowing content', async () => {
  const value = globalThis.structuredClone(source);
  value.emission.documento = 'declaracao_frequencia';
  Object.assign(value.emission.dados_emissao, { studentDocumentType: 'CIN', studentRg: '12345678909' });
  const page = await open(value, 390);
  try {
    const path = resolve(output, 'declaration-cin.pdf'); await writeFile(path, await bytesFromPreview(page));
    const text = execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' });
    assert.match(text, /CIN/); assert.doesNotMatch(text, /CPF nº|RG nº/);
    assert.equal(text.match(/123\.456\.789-09/g)?.length, 1);
    const error = await page.evaluate(async value => {
      value.resources.template.textContent = '<p>' + 'Texto muito longo. '.repeat(2000) + '</p>';
      try { await window.buildDeclaration([{ emission: value.emission, preview: value.resources }]); return null; }
      catch (error) { return error.message; }
    }, value);
    assert.match(error, /excede a página|cortaria o texto/);
  } finally { await page.close(); }
});

test('batch rendering remounts each declaration and retains both distinct institution assets', async () => {
  const second = globalThis.structuredClone(source);
  second.emission.id = 'second-synthetic-declaration';
  second.emission.codigo = 'DEC-MAT-TEST-2345-6789';
  second.emission.dados_emissao.studentName = 'SEGUNDA ALUNA SINTÉTICA';
  second.resources.polo.logoUrl = icon('second-logo');
  second.resources.watermark.watermarkUrl = icon('second-watermark');
  const page = await open();
  try {
    const bytes = await page.evaluate(async values => {
      const result = await window.buildDeclaration(values.map(value => ({ emission: value.emission, preview: value.resources })));
      return Array.from(new Uint8Array(await result.blob.arrayBuffer()));
    }, [source, second]);
    const path = resolve(output, 'declaration-batch.pdf');
    await writeFile(path, Buffer.from(bytes));
    assert.match(execFileSync('pdfinfo', [path], { encoding: 'utf8' }), /Pages:\s+2/);
    const firstText = execFileSync('pdftotext', ['-f', '1', '-l', '1', path, '-'], { encoding: 'utf8' });
    const secondText = execFileSync('pdftotext', ['-f', '2', '-l', '2', path, '-'], { encoding: 'utf8' });
    assert.match(firstText, /ALUNA SINTÉTICA DE TESTE/);
    assert.match(secondText, /SEGUNDA ALUNA SINTÉTICA/);
    const images = execFileSync('pdfimages', ['-list', path], { encoding: 'utf8' });
    assert.ok(images.split('\n').filter(line => /^\s*1\s+\d+\s+image\s/.test(line)).length >= 3);
    assert.ok(images.split('\n').filter(line => /^\s*2\s+\d+\s+image\s/.test(line)).length >= 3);
    execFileSync('pdftoppm', ['-f', '1', '-l', '2', '-scale-to', '1600', '-png', path, resolve(output, 'declaration-batch-page')]);
  } finally { await page.close(); }
});
