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
import { syntheticIdentity, syntheticModel, signatureFixtureModule } from '../certificados/ead-curriculum.pdf.fixture.mjs';
import { withOpaqueSignature, measureDirectorLine, assertNativeSignatureLine,
  assertVisibleSignatureLine } from '../certificados/ead-signature-pdf.assertions.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(directory, '../../../..');
const dependencies = process.env.EAD_UI_NODE_MODULES;
const requireTool = createRequire(dependencies
  ? pathToFileURL(resolve(dependencies, '../history-runner.mjs')) : import.meta.url);
const { build } = requireTool('esbuild');
const { chromium } = requireTool('playwright');
const postcss = requireTool('postcss');
const tailwindcss = requireTool('tailwindcss');
const pdfTypes = requireTool('pdf-lib');
const { createCanvas, loadImage } = requireTool('@napi-rs/canvas');
const output = process.env.EAD_HISTORY_ARTIFACTS || '/tmp/ead-history-print';
const fixturePath = process.env.EAD_CURRICULUM_FIXTURE_OUT;
assert.ok(fixturePath, 'Run the SQL certificate table suite and provide EAD_CURRICULUM_FIXTURE_OUT.');
const source = JSON.parse(await readFile(fixturePath, 'utf8'));
const certificate = { ...source.certificate, ...syntheticIdentity };
const fixture = {
  emission: { ...source.document, id: 'history-emission', documento: 'certificado_ead',
    codigo: certificate.codigo_validacao, aluno_id: 'synthetic-student', polo_id: 'test-polo',
    matricula_id: 'test-enrollment', quantidade_emissoes: 1,
    ultima_emissao_em: '2026-10-08T12:00:00.000Z',
  },
  resources: { certificate, template: syntheticModel, watermark: null, polo: null, academicData: null },
};
let browser;
let javascript;
let css;

before(async () => {
  await mkdir(output, { recursive: true });
  const result = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';
      import History from './SecretariaHistoricoEmissoesPage';
      window.renderHistory=value=>{
        window.historyFixture=value;window.historyEvents=[];window.historyErrors=[];window.historyKeyCounter=0;
        window.__fixture={signatures:value.signatures||{}};
        createRoot(document.getElementById('root')).render(<History/>);
      };`, loader: 'tsx', resolveDir: directory },
    bundle: true, format: 'iife', write: false, define: { 'import.meta.env': '{}' },
    loader: { '.ttf': 'dataurl' },
    nodePaths: dependencies ? [dependencies] : [],
    plugins: [{ name: 'history-controlled-io', setup(plugin) {
      plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(historyPrintIo, args.path)
        ? { path: args.path, namespace: 'history-io' } : undefined);
      plugin.onLoad({ filter: /.*/, namespace: 'history-io' }, args => ({
        contents: historyPrintIo[args.path], loader: 'tsx', resolveDir: directory,
      }));
      plugin.onResolve({ filter: /assinaturas\.service$/ }, () => ({ path: 'signatures', namespace: 'signatures' }));
      plugin.onLoad({ filter: /.*/, namespace: 'signatures' }, () => ({ contents: signatureFixtureModule }));
    } }],
  });
  javascript = result.outputFiles[0].text;
  const config = requireTool(resolve(root, 'tailwind.config.cjs'));
  const styles = (await readFile(resolve(root, 'styles.css'), 'utf8')).replace(/^@import.*$/gm, '');
  css = (await postcss([tailwindcss({ ...config, content: [
    resolve(root, 'modules/gestor/secretaria/historico-emissoes/**/*.tsx'),
    resolve(root, 'modules/gestor/secretaria/certificados/**/*.tsx'),
    resolve(root, 'modules/gestor/cadastros/modelos-documentos/diploma/**/*.tsx'),
  ] })]).process(styles, { from: resolve(root, 'styles.css') })).css;
  if (!process.env.EAD_HISTORY_COMPILE_ONLY) browser = await chromium.launch({ headless: true,
    ...(process.env.EAD_UI_BROWSER_EXECUTABLE
      ? { executablePath: process.env.EAD_UI_BROWSER_EXECUTABLE } : { channel: 'chromium' }) });
});
after(async () => { await browser?.close(); });

async function open(value = fixture) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.route('https://documents.test/**', route => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><html lang="pt-BR"><body><div id="root"></div></body></html>' }));
  await page.goto('https://documents.test/');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(data => window.renderHistory(data), value);
  await page.getByRole('button', { name: 'Abrir segunda via' }).click();
  await page.locator('#reprint-modal iframe').waitFor();
  await page.waitForFunction(() => !document.querySelector('#reprint-modal [aria-busy="true"]')
    && !document.querySelector('#reprint-modal button:disabled'));
  return page;
}

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function previewBytes(page) {
  const url = await page.locator('#reprint-modal iframe').getAttribute('src');
  return Buffer.from(await page.evaluate(async value =>
    Array.from(new Uint8Array(await (await fetch(value)).arrayBuffer())), url));
}

const run = (name, fn) => test(name, { skip: Boolean(process.env.EAD_HISTORY_COMPILE_ONLY) }, fn);
test('controlled history fixture compiles the real page, modal and EAD PDF compositor', () => assert.ok(javascript));

run('second-copy preview, download and print use identical two-page A4 PDF bytes', async () => {
  const page = await open();
  try {
    const before = await previewBytes(page);
    const path = resolve(output, 'history-preview.pdf');
    await writeFile(path, before);
    const info = execFileSync('pdfinfo', [path], { encoding: 'utf8' });
    assert.match(info, /Pages:\s+2/);
    assert.match(info, /Page size:\s+841\.89 x 595\.28 pts \(A4\)/);
    const text = execFileSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8' });
    assert.ok(text.includes('CONTEÚDO PROGRAMÁTICO'));
    assert.ok(text.includes(certificate.codigo_validacao));
    assert.ok(!text.includes('Segunda Via de Documento'));
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
    const downloadedPath = resolve(output, 'history-downloaded.pdf');
    await (await download).saveAs(downloadedPath);
    assert.equal(hash(await readFile(downloadedPath)), hash(before));
    assert.equal(hash(await previewBytes(page)), hash(before));
    await page.evaluate(() => {
      window.historyPrintBytes = [];
      new window.MutationObserver(() => {
        document.querySelectorAll('body > iframe[src^="blob:"]').forEach(async frame => {
          if (frame.dataset.observed) return;
          frame.dataset.observed = 'true';
          const bytes = Array.from(new Uint8Array(await (await fetch(frame.src)).arrayBuffer()));
          window.historyPrintBytes.push(bytes);
        });
      }).observe(document.body, { childList: true });
    });
    // The native PDF frame is observed; window.print and its OS dialog are not mocked.
    await page.getByRole('button', { name: 'Imprimir (Registrar 2ª Via)', exact: true }).click();
    await page.waitForFunction(() => window.historyPrintBytes.length === 1);
    assert.equal(hash(Buffer.from(await page.evaluate(() => window.historyPrintBytes[0]))), hash(before));
    await page.waitForFunction(() => document.querySelector('#reprint-modal[aria-busy="false"]'));
    assert.equal(await page.getByRole('button', { name: 'Imprimir (Registrar 2ª Via)', exact: true }).isEnabled(), true);
    const events = await page.evaluate(() => window.historyEvents);
    assert.deepEqual(events.map(event => event.type), ['prepare', 'confirm', 'prepare', 'confirm']);
    assert.equal(events[0].request.idempotencyKey, events[1].request.idempotencyKey);
    assert.equal(events[2].request.idempotencyKey, events[3].request.idempotencyKey);
    assert.notEqual(events[0].request.idempotencyKey, events[2].request.idempotencyKey);
    assert.deepEqual(await page.evaluate(() => window.historyErrors), []);
    await page.screenshot({ path: resolve(output, 'history-preview.png') });
    execFileSync('pdftoppm', ['-f', '1', '-l', '2', '-scale-to', '1600', '-png', path, resolve(output, 'history-page')]);
  } finally { await page.close(); }
});

run('changed official model replaces cached PDF and delivers the newly displayed bytes', async () => {
  const page = await open();
  try {
    const original = hash(await previewBytes(page));
    await page.evaluate(() => {
      window.historyFixture.resources.template.blocks.find(block => block.id === 'titulo').content = 'CERTIFICADO ATUALIZADO';
    });
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
    const path = resolve(output, 'history-updated.pdf');
    await (await pending).saveAs(path);
    const delivered = hash(await readFile(path));
    assert.notEqual(delivered, original);
    assert.equal(hash(await previewBytes(page)), delivered);
    assert.ok(execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' }).includes('CERTIFICADO ATUALIZADO'));
    assert.deepEqual(await page.evaluate(() => window.historyEvents.map(event => event.type)), ['prepare', 'confirm']);
  } finally { await page.close(); }
});

run('backend rejection prevents delivery and never bypasses the second-copy confirmation', async () => {
  for (const stage of ['Prepare', 'Confirm']) {
    const page = await open();
    try {
      const downloads = [];
      page.on('download', download => downloads.push(download));
      await page.evaluate(value => { window['historyFail' + value] = true; }, stage);
      await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
      await page.waitForFunction(() => window.historyErrors.length > 0);
      assert.equal(downloads.length, 0);
      assert.deepEqual(await page.evaluate(() => window.historyEvents.map(event => event.type)),
        stage === 'Prepare' ? ['prepare'] : ['prepare', 'confirm']);
      assert.equal(await page.locator('body > iframe[src^="blob:"]').count(), 0);
    } finally { await page.close(); }
  }
});

run('second-copy PDF preserves the director line under an opaque overlapping signature', async () => {
  const opaque = withOpaqueSignature({ model: syntheticModel, signatures: {} }, createCanvas);
  const page = await open({ ...fixture, signatures: opaque.signatures,
    resources: { ...fixture.resources, template: opaque.model } });
  try {
    const geometry = await page.evaluate(measureDirectorLine);
    const bytes = await previewBytes(page);
    const path = resolve(output, 'history-director-line.pdf');
    await writeFile(path, bytes);
    assertNativeSignatureLine(await pdfTypes.PDFDocument.load(bytes), geometry, pdfTypes);
    execFileSync('pdftoppm', ['-f', '1', '-singlefile', '-scale-to', '2000', '-png', path,
      resolve(output, 'history-director-line')]);
    const evidence = assertVisibleSignatureLine(
      await loadImage(resolve(output, 'history-director-line.png')), geometry, createCanvas,
    );
    await writeFile(resolve(output, 'history-director-line.json'), JSON.stringify(evidence));
  } finally { await page.close(); }
});
