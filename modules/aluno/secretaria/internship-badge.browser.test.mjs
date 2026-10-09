import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { badgeModel, badgeStudent } from './internship-badge.browser.fixture.mjs';
import { createFixtureImages } from '../../gestor/secretaria/carteirinhas/student-card.browser.fixture.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(directory, '../../..');
const dependencies = process.env.STUDENT_CARD_NODE_MODULES || process.env.EAD_UI_NODE_MODULES;
const requireTool = createRequire(dependencies ? pathToFileURL(resolve(dependencies, '../badge-runner.mjs')) : import.meta.url);
const { build } = requireTool('esbuild');
const { chromium } = requireTool('playwright');
const postcss = requireTool('postcss');
const tailwindcss = requireTool('tailwindcss');
const { createCanvas } = requireTool('@napi-rs/canvas');
const { getDocument, OPS } = await import(pathToFileURL(requireTool.resolve('pdfjs-dist/legacy/build/pdf.mjs')));
const images = createFixtureImages(createCanvas);
const privateModel = process.env.BADGE_RENDER_MODEL ? JSON.parse(await readFile(process.env.BADGE_RENDER_MODEL, 'utf8')) : {};
const fixture = {
  template: { ...badgeModel, bgFrenteUrl: images.front, bgVersoUrl: images.back, ...privateModel },
  aluno: { ...badgeStudent, fotoUrl: images.photo }, code: badgeStudent.validationCode,
  issuedAt: '2026-09-14T12:00:00Z', expiresAt: '2028-11-20',
};
const output = resolve(process.env.BADGE_ARTIFACTS || '/tmp/internship-badge');
let browser, javascript, css;

before(async () => {
  await mkdir(output, { recursive: true });
  const compiled = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import Badge from './components/InternshipBadgeDocument';
      window.__pdfReads = []; window.__blobs = new Map();
      const originalRead=Blob.prototype.arrayBuffer;
      Blob.prototype.arrayBuffer=function(){if(this.type==='application/pdf') window.__pdfReads.push(this);return originalRead.call(this)};
      const originalUrl=URL.createObjectURL.bind(URL);
      URL.createObjectURL=blob=>{const url=originalUrl(blob);window.__blobs.set(url,blob);return url};
      window.__pagePrints=0;window.print=()=>{window.__pagePrints++};
      window.renderBadge=value=>{window.__root ||= createRoot(document.getElementById('root'));window.__root.render(<Badge {...value}/>)};`,
      loader: 'tsx', resolveDir: directory },
    bundle: true, format: 'iife', write: false, nodePaths: dependencies ? [dependencies] : [],
    define: { 'import.meta.env': '{}' }, plugins: [{ name: 'worker', setup(plugin) {
      plugin.onResolve({ filter: /pdf\.worker\.min\.mjs\?url$/ }, () => ({ path: 'pdf-worker', namespace: 'worker' }));
      plugin.onLoad({ filter: /.*/, namespace: 'worker' }, async () => ({ contents:
        'export default URL.createObjectURL(new Blob([' + JSON.stringify(await readFile(requireTool.resolve('pdfjs-dist/build/pdf.worker.min.mjs'), 'utf8')) + '],{type:"application/javascript"}));' }));
    } }],
  });
  javascript = compiled.outputFiles[0].text;
  const styles = (await readFile(resolve(root, 'styles.css'), 'utf8')).replace(/^@import.*$/gm, '');
  const config = requireTool(resolve(root, 'tailwind.config.cjs'));
  css = (await postcss([tailwindcss({ ...config, content: [
    resolve(root, 'modules/aluno/secretaria/**/*.tsx'),
    resolve(root, 'modules/gestor/cadastros/modelos-documentos/cracha/**/*.tsx'),
    resolve(root, 'modules/shared/pdf/**/*.tsx'), resolve(root, 'modules/shared/qrcode/**/*.tsx'),
  ] })]).process(styles, { from: resolve(root, 'styles.css') })).css;
  browser = await chromium.launch({ headless: true,
    // The print action needs Chromium's real PDF viewer. headless-shell does not
    // load PDF iframes, so use full Chromium's new headless mode in CI.
    ...(process.env.STUDENT_CARD_BROWSER_EXECUTABLE
      ? { executablePath: process.env.STUDENT_CARD_BROWSER_EXECUTABLE }
      : { channel: 'chromium' }) });
});
after(async () => { await browser?.close(); });

async function open(overrides = {}) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(() => { document.getElementById('root').style.fontFamily = 'Inter, sans-serif'; });
  await page.evaluate(value => window.renderBadge(value), { ...fixture, ...overrides });
  return page;
}
async function download(page, name) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar PDF', exact: true }).first().click();
  const path = resolve(output, name + '.pdf');
  await (await pending).saveAs(path);
  return new Uint8Array(await readFile(path));
}
async function inspect(bytes, name) {
  const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: false,
    standardFontDataUrl: resolve(requireTool.resolve('pdfjs-dist/package.json'), '../standard_fonts') + '/' }).promise;
  const evidence = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 3 });
      const canvas = createCanvas(viewport.width, viewport.height);
      await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
      await writeFile(resolve(output, `${name}-${i}.png`), canvas.toBuffer('image/png'));
      const text = (await page.getTextContent()).items.filter(item => 'str' in item).map(item => item.str).join(' ');
      const operators = await page.getOperatorList();
      evidence.push({ size: page.view.slice(2), text,
        images: operators.fnArray.filter(op => op === OPS.paintImageXObject).length,
        paths: operators.fnArray.filter(op => op === OPS.constructPath).length });
    }
  } finally { await pdf.destroy(); }
  return evidence;
}

test('configured badge preview, download and print reuse the same PDF with background and native text', async () => {
  const page = await open();
  try {
    const preview = page.locator('[aria-label^="Prévia real de crachá"]');
    await preview.first().waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('[aria-label^="Prévia real de crachá"]')].every(node => node.getAttribute('aria-busy') === 'false'));
    assert.equal(await page.locator('[data-internship-badge-page]').first().evaluate(node => window.getComputedStyle(node).fontFamily),
      'Arial, Helvetica, sans-serif', 'An Inter ancestor must not change the official document font.');
    const bytes = await download(page, 'configured-badge');
    const evidence = await inspect(bytes, 'configured-badge');
    assert.equal(evidence.length, fixture.template.hasVerso === false ? 1 : 2);
    evidence.forEach(side => {
      assert.ok(Math.abs(side.size[0] - 54 * 72 / 25.4) < 0.05);
      assert.ok(Math.abs(side.size[1] - 85.6 * 72 / 25.4) < 0.05);
      assert.ok(side.images >= 2, 'Configured background and isolated QR/photo are embedded.');
      assert.ok(side.paths > 0, 'Borders and fields remain native vector objects.');
    });
    const text = evidence.map(side => side.text).join(' ');
    for (const value of [fixture.aluno.nome, fixture.aluno.matricula, '14/09/2026', '20/11/2028'])
      assert.ok(text.includes(value), `Missing native text from configured data: ${value}`);
    await page.screenshot({ path: resolve(output, 'badge-preview.png'), fullPage: true });
    await page.getByRole('button', { name: 'Imprimir', exact: true }).click();
    const frame = page.getByTitle('Prévia de impressão do crachá');
    await frame.waitFor();
    const printed = await page.evaluate(async () => {
      const frame = document.querySelector('iframe[title="Prévia de impressão do crachá"]');
      const blob = window.__blobs.get(frame.src.split('#')[0]);
      return { bytes: [...new Uint8Array(await blob.arrayBuffer())], same: window.__pdfReads.every(item => item === blob) };
    });
    assert.deepEqual(Uint8Array.from(printed.bytes), bytes);
    assert.equal(printed.same, true, 'All PDF canvas/print reads must consume one Blob instance.');
    await page.getByRole('button', { name: 'Abrir impressão' }).click();
    assert.equal(await page.evaluate(() => window.__pagePrints), 0, 'Never print the parent HTML page.');
  } finally { await page.close(); }
});

test('badge respects one-sided models and invalidates the PDF when saved configuration changes', async () => {
  const page = await open({ template: { ...fixture.template, hasVerso: false } });
  try {
    const before = await download(page, 'badge-front-only');
    assert.equal((await inspect(before, 'badge-front-only')).length, 1);
    const updated = { ...fixture, template: { ...fixture.template, hasVerso: false,
      fields: [...fixture.template.fields, { id: 'new', type: 'text', value: 'MODELO ATUALIZADO', x: 5, y: 95, width: 90, page: 'frente', style: { fontSize: '6px' } }] } };
    await page.evaluate(value => window.renderBadge(value), updated);
    const after = await download(page, 'badge-updated');
    assert.notDeepEqual(after, before);
    assert.match((await inspect(after, 'badge-updated'))[0].text, /MODELO ATUALIZADO/);
  } finally { await page.close(); }
});

test('missing or rejected registration blocks PDF delivery', async () => {
  const page = await open({ code: undefined, issuedAt: undefined, registrationError: true });
  try {
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Baixar PDF' }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Imprimir', exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => window.__pdfReads.length), 0);
  } finally { await page.close(); }
});

test('failed configured background prevents a partial PDF', async () => {
  const page = await open({ template: { ...fixture.template, bgFrenteUrl: 'data:image/png;base64,bad' } });
  try {
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Baixar PDF' }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Imprimir', exact: true }).isDisabled(), true);
  } finally { await page.close(); }
});
