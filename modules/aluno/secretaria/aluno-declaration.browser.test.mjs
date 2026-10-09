import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { alunoDeclarationRpcStub, createAlunoDeclarationFixture } from './aluno-declaration.browser.fixture.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(directory, '../../..');
const dependencies = process.env.EAD_UI_NODE_MODULES || process.env.STUDENT_CARD_NODE_MODULES;
const requireTool = createRequire(dependencies ? pathToFileURL(resolve(dependencies, '../aluno-declaration-runner.mjs')) : import.meta.url);
const { build } = requireTool('esbuild');
const { chromium } = requireTool('playwright');
const postcss = requireTool('postcss');
const tailwindcss = requireTool('tailwindcss');
const { createCanvas } = requireTool('@napi-rs/canvas');
const { getDocument, OPS } = await import(pathToFileURL(requireTool.resolve('pdfjs-dist/legacy/build/pdf.mjs')));
const fixture = createAlunoDeclarationFixture(createCanvas);
const output = resolve(process.env.ALUNO_DECLARATION_ARTIFACTS || '/tmp/aluno-declaration');
let browser, javascript, css;

before(async () => {
  await mkdir(output, { recursive: true });
  const bundle = await build({
    stdin: { contents: `import React, {useState} from 'react';import {createRoot} from 'react-dom/client';
      import Dialog from './components/AlunoDeclarationDialog';
      window.rpcCalls=[];window.rpcReplies=[];window.createdPdfBlobs=[];window.pagePrints=0;
      window.print=()=>{window.pagePrints++};
      const originalUrl=URL.createObjectURL.bind(URL);
      URL.createObjectURL=blob=>{const url=originalUrl(blob);if(blob.type==='application/pdf') window.createdPdfBlobs.push({blob,url});return url};
      function Harness(){const [open,setOpen]=useState(false);return <>
        <button onClick={()=>setOpen(true)}>Emitir declaração</button>
        <Dialog open={open} onClose={()=>setOpen(false)} alunoId="test-student" enrollmentId="test-enrollment" contextId="test-context" />
      </>}
      window.mount=()=>createRoot(document.getElementById('root')).render(<Harness/>);`,
      loader: 'tsx', resolveDir: directory },
    bundle: true, format: 'iife', write: false, nodePaths: dependencies ? [dependencies] : [],
    define: { 'import.meta.env': '{}' }, plugins: [{ name: 'declaration-controlled-io', setup(plugin) {
      plugin.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'rpc', namespace: 'test-io' }));
      plugin.onLoad({ filter: /^rpc$/, namespace: 'test-io' }, () => ({ contents: alunoDeclarationRpcStub }));
      plugin.onResolve({ filter: /empresas\/empresas\.service$/ }, () => ({ path: 'company', namespace: 'test-io' }));
      plugin.onLoad({ filter: /^company$/, namespace: 'test-io' }, () => ({ contents: 'export const empresasService={getCompanyPrincipal:async()=>null};' }));
      // These sibling document kinds are unreachable in this declaration-only flow.
      plugin.onResolve({ filter: /components\/(CertificadoPreview|CarteirinhaPreview|CrachaPreview)$/ },
        () => ({ path: 'other-document', namespace: 'test-io' }));
      plugin.onLoad({ filter: /^other-document$/, namespace: 'test-io' }, () => ({
        contents: 'export default function OtherDocument(){throw Error("Unexpected document renderer")} ',
      }));
    } }],
  });
  javascript = bundle.outputFiles[0].text;
  const styles = (await readFile(resolve(root, 'styles.css'), 'utf8')).replace(/^@import.*$/gm, '');
  const config = requireTool(resolve(root, 'tailwind.config.cjs'));
  css = (await postcss([tailwindcss({ ...config, content: [
    resolve(root, 'modules/aluno/secretaria/**/*.tsx'),
    resolve(root, 'modules/gestor/secretaria/historico-emissoes/**/*.tsx'),
    resolve(root, 'modules/gestor/components/DocumentHeader.tsx'),
  ] })]).process(styles, { from: resolve(root, 'styles.css') })).css;
  browser = await chromium.launch({ headless: true,
    ...(process.env.EAD_UI_BROWSER_EXECUTABLE
      ? { executablePath: process.env.EAD_UI_BROWSER_EXECUTABLE } : { channel: 'chromium' }) });
});
after(async () => { await browser?.close(); });

async function open(replies = [{ data: fixture, error: null }], width = 1100) {
  const page = await browser.newPage({ viewport: { width, height: 820 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url() === 'https://documents.test/'
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><body><div id="root"></div></body></html>' })
    : route.abort('blockedbyclient'));
  await page.goto('https://documents.test/');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(values => { window.rpcReplies=values;window.mount(); }, replies);
  await page.getByRole('button', { name: 'Emitir declaração', exact: true }).click();
  return { page, errors };
}
const preview = page => page.getByTitle('Prévia da declaração de matrícula');
async function previewBytes(page) {
  await preview(page).waitFor();
  const url = await preview(page).getAttribute('src');
  return Buffer.from(await page.evaluate(async value => [...new Uint8Array(await (await fetch(value)).arrayBuffer())], url));
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function inspect(bytes, name, render = false) {
  await writeFile(resolve(output, name + '.pdf'), bytes);
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false,
    standardFontDataUrl: resolve(requireTool.resolve('pdfjs-dist/package.json'), '../standard_fonts') + '/' }).promise;
  try {
    assert.equal(pdf.numPages, 1);
    const page = await pdf.getPage(1);
    const items = (await page.getTextContent()).items.filter(item => 'str' in item);
    const operators = await page.getOperatorList();
    if (render) {
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(viewport.width, viewport.height);
      await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
      await writeFile(resolve(output, name + '.png'), canvas.toBuffer('image/png'));
    }
    return { text: items.map(item => item.str).join(' ').replace(/\s+/g, ' '), items,
      size: page.view.slice(2), images: operators.fnArray.filter(op => op === OPS.paintImageXObject).length };
  } finally { await pdf.destroy(); }
}

test('student receives the complete configured declaration with birth date, one CIN, signature and QR positions', async () => {
  const { page, errors } = await open();
  try {
    const evidence = await inspect(await previewBytes(page), 'configured-student-declaration', true);
    assert.ok(Math.abs(evidence.size[0] - 595.28) < 0.1 && Math.abs(evidence.size[1] - 841.89) < 0.1);
    for (const value of ['ALUNA SINTÉTICA DE TESTE', '07/02/2000', 'UNIV-TEST123',
      'O referido curso é realizado', 'Atestamos que o aluno apresenta frequência regular',
      'REGISTRO DO MODELO CADASTRADO', 'SECRETARIA ACADÊMICA']) {
      assert.ok(evidence.text.includes(value), `Missing configured field: ${value}`);
    }
    // The narrow QR label intentionally wraps; PDF.js inserts whitespace between its text runs.
    assert.ok(evidence.text.replace(/\s+/g, '').includes(fixture.emission.codigo),
      'The complete official validation code must remain selectable beside its QR.');
    assert.match(evidence.text, /CIN/);
    assert.equal(evidence.text.match(/123\.456\.789-09/g)?.length, 1);
    assert.doesNotMatch(evidence.text, /CPF nº|RG nº|Não informado|\{\{/);
    assert.ok(evidence.images >= 4, 'Logo, configured watermark, signature and QR remain embedded isolated assets.');
    const marker = evidence.items.find(item => item.str.includes('REGISTRO DO MODELO CADASTRADO'));
    assert.ok(marker.transform[4] > 66 && marker.transform[4] < 73, 'Configured x=92px survives the A4 adapter.');
    assert.ok(marker.transform[5] > 278 && marker.transform[5] < 298, 'Configured y=730px survives the A4 adapter.');
    assert.deepEqual(await page.evaluate(() => window.rpcCalls), [{
      name: 'obter_declaracao_matricula_aluno_pdf', parameters: { p_matricula_id: 'test-enrollment' },
    }]);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('preview, download and print reuse the same PDF without printing the portal page', async () => {
  const { page, errors } = await open();
  try {
    const original = hash(await previewBytes(page));
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar PDF', exact: true }).click();
    const path = resolve(output, 'student-declaration-download.pdf');
    await (await pending).saveAs(path);
    assert.equal(hash(await readFile(path)), original);
    await page.getByRole('button', { name: 'Imprimir', exact: true }).click();
    await page.waitForFunction(() => window.createdPdfBlobs.length >= 3);
    await page.waitForFunction(() => document.querySelector('[role="dialog"][aria-busy="false"]'));
    assert.equal(await page.getByRole('dialog').getByRole('alert').count(), 0);
    assert.equal(hash(await previewBytes(page)), original);
    const blobs = await page.evaluate(async () => Promise.all(window.createdPdfBlobs.map(async ({blob}) => [...new Uint8Array(await blob.arrayBuffer())])));
    assert.ok(blobs.length >= 3, 'Preview, download and print each consume the official PDF.');
    blobs.forEach(bytes => assert.equal(hash(Buffer.from(bytes)), original));
    assert.equal(await page.evaluate(() => window.createdPdfBlobs.every(({blob}) => blob === window.createdPdfBlobs[0].blob)), true);
    assert.equal(await page.evaluate(() => window.pagePrints), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('closing and reopening requests the newly saved model, including changed absolute fields', async () => {
  const changed = globalThis.structuredClone(fixture);
  changed.preview.template.textContent = changed.preview.template.textContent.replace(
    'Atestamos que o aluno apresenta frequência regular e está em dia com suas obrigações acadêmicas.',
    'MODELO ATUALIZADO PELA SECRETARIA.',
  );
  changed.preview.template.absoluteFields.find(field => field.id === 'configured-marker').value = 'POSIÇÃO DO MODELO NOVO';
  const { page, errors } = await open([{ data: fixture, error: null }, { data: changed, error: null }]);
  try {
    const first = await previewBytes(page);
    await page.getByRole('button', { name: 'Fechar declaração', exact: true }).click();
    assert.equal(await preview(page).count(), 0);
    await page.getByRole('button', { name: 'Emitir declaração', exact: true }).click();
    const second = await previewBytes(page);
    const evidence = await inspect(second, 'student-declaration-updated');
    assert.notEqual(hash(first), hash(second));
    assert.match(evidence.text, /MODELO ATUALIZADO PELA SECRETARIA/);
    assert.match(evidence.text, /POSIÇÃO DO MODELO NOVO/);
    assert.doesNotMatch(evidence.text, /REGISTRO DO MODELO CADASTRADO/);
    assert.equal(await page.evaluate(() => window.rpcCalls.length), 2);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('RPC rejection and foreign enrollment never produce a generic or unauthorized declaration', async () => {
  const foreign = globalThis.structuredClone(fixture);
  foreign.emission.matricula_id = 'another-enrollment';
  const absentModel = globalThis.structuredClone(fixture);
  absentModel.preview.template = null;
  for (const reply of [{ data: null, error: { message: 'Vínculo não autorizado para emissão.' } },
    { data: foreign, error: null }, { data: absentModel, error: null }]) {
    const { page } = await open([reply]);
    try {
      await page.getByText('Não foi possível emitir a declaração', { exact: true }).waitFor();
      assert.equal(await preview(page).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Baixar PDF', exact: true }).isEnabled(), false);
      assert.equal(await page.getByRole('button', { name: 'Imprimir', exact: true }).isEnabled(), false);
      assert.equal(await page.evaluate(() => window.createdPdfBlobs.length), 0);
      assert.equal(await page.evaluate(() => window.rpcCalls.length), 1);
    } finally { await page.close(); }
  }
});

test('mobile declaration keeps download and print reachable and restores focus when closed', async () => {
  const { page, errors } = await open(undefined, 390);
  try {
    await previewBytes(page);
    const dialog = page.getByRole('dialog');
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390.5);
    for (const name of ['Baixar PDF', 'Imprimir', 'Fechar declaração']) {
      const button = page.getByRole('button', { name, exact: true });
      assert.equal(await button.isVisible(), true);
      const rect = await button.boundingBox();
      assert.ok(rect.x >= 0 && rect.x + rect.width <= 390.5);
    }
    await page.screenshot({ path: resolve(output, 'student-declaration-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Fechar declaração', exact: true }).click();
    assert.equal(await dialog.count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Emitir declaração', exact: true }).evaluate(node => node === document.activeElement), true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
