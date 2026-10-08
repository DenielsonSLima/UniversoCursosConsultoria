import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import { syntheticIdentity, syntheticModel, signatureFixtureModule } from './ead-curriculum.pdf.fixture.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(directory, '../../../..');
const dependencies = process.env.EAD_UI_NODE_MODULES;
const requireTool = createRequire(dependencies
  ? pathToFileURL(resolve(dependencies, '../ead-pdf-runner.mjs')) : import.meta.url);
const { build } = requireTool('esbuild');
const { chromium } = requireTool('playwright');
const postcss = requireTool('postcss');
const tailwindcss = requireTool('tailwindcss');
const output = resolve(process.env.EAD_CURRICULUM_ARTIFACTS || '/tmp/ead-curriculum-pdf');
const sourceFile = process.env.EAD_CURRICULUM_FIXTURE_OUT;
assert.ok(sourceFile, 'Run the real SQL suite with EAD_CURRICULUM_FIXTURE_OUT first.');
const source = JSON.parse(await readFile(sourceFile, 'utf8'));
const privateFixture = process.env.EAD_CURRICULUM_RENDER_FIXTURE
  ? JSON.parse(await readFile(process.env.EAD_CURRICULUM_RENDER_FIXTURE, 'utf8')) : null;
const certificate = { ...source.certificate, ...syntheticIdentity, ...(privateFixture?.identity || {}) };
const model = privateFixture?.model || syntheticModel;
const curriculum = source.document.dados_emissao.eadCurriculum;
const fixture = { certificate, model, curriculum, signatures: privateFixture?.signatures || {} };
let browser;
let javascript;
let css;

before(async () => {
  await mkdir(output, { recursive: true });
  const compiled = await build({
    stdin: { contents: `import React from 'react';
      import {createRoot} from 'react-dom/client';
      import Preview from './components/CertificadoPreview.tsx';
      window.renderCertificate = (value) => {
        window.__fixture = value;
        window.__certificateRoot ||= createRoot(document.getElementById('root'));
        window.__certificateRoot.render(<Preview certificado={value.certificate}
          modelo={value.model} curriculumSnapshot={value.curriculum} pdfMode showValidationQrCode />);
      };`, loader: 'tsx', resolveDir: directory },
    bundle: true, format: 'iife', write: false, define: { 'import.meta.env': '{}' },
    nodePaths: dependencies ? [dependencies] : [],
    plugins: [{ name: 'signature-io-only', setup(plugin) {
      plugin.onResolve({ filter: /assinaturas\.service$/ }, () => ({ path: 'signatures', namespace: 'io' }));
      plugin.onLoad({ filter: /.*/, namespace: 'io' }, () => ({ contents: signatureFixtureModule }));
    } }],
  });
  javascript = compiled.outputFiles[0].text;
  const config = requireTool(resolve(root, 'tailwind.config.cjs'));
  const styles = (await readFile(resolve(root, 'styles.css'), 'utf8')).replace(/^@import.*$/gm, '');
  css = (await postcss([tailwindcss({ ...config,
    content: [resolve(root, 'modules/gestor/secretaria/certificados/**/*.tsx')],
  })]).process(styles, { from: resolve(root, 'styles.css') })).css;
  browser = await chromium.launch({ headless: true,
    ...(process.env.EAD_UI_BROWSER_EXECUTABLE ? { executablePath: process.env.EAD_UI_BROWSER_EXECUTABLE } : {}) });
});

after(async () => { await browser?.close(); });

async function open(value = fixture) {
  const page = await browser.newPage({ viewport: { width: 1123, height: 900 } });
  await page.setContent('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: javascript });
  await page.evaluate((data) => window.renderCertificate(data), value);
  await page.locator('[data-render-ready="true"]').waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode()));
  });
  return page;
}

test('real SQL snapshot reaches the real configured verso, selectable PDF and preserved emission identity', async () => {
  const page = await open();
  try {
    assert.equal(await page.locator('[data-render-error]').count(), 0);
    assert.equal(await page.locator('[data-certificate-pdf-page]').count(), 1 + curriculum.pages.length);
    const blocks = page.locator('[data-certificate-curriculum]');
    assert.equal(await blocks.count(), curriculum.pages.length);
    const actual = (await blocks.allTextContents()).join('\n');
    let previous = -1;
    for (const item of curriculum.items) {
      const index = actual.indexOf(item.title);
      assert.ok(index > previous, `Missing or reordered curriculum item: ${item.title}`);
      previous = index;
    }
    assert.ok(!actual.includes('Grade curricular conforme histórico'));
    assert.ok(!actual.includes('Nota / Status'));
    assert.ok((await page.locator('body').textContent()).includes(certificate.codigo_validacao));
    assert.ok(!(await page.locator('body').textContent()).includes('999 horas'));
    // Existing pdfMode gives each official page its A4 geometry. Print only adds page breaks.
    await page.addStyleTag({ content: '@page{size:A4 landscape;margin:0} [data-certificate-pdf-page]{break-after:page!important;break-inside:avoid!important;margin:0!important} #root>div{margin:0!important}' });
    const pdfPath = resolve(output, 'ead-curriculum.pdf');
    await page.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true });
    const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
    assert.equal(Number(/^Pages:\s+(\d+)$/m.exec(info)?.[1]), 1 + curriculum.pages.length);
    const text = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' });
    for (const item of curriculum.items) assert.ok(text.includes(item.title), `PDF lacks ${item.title}`);
    assert.ok(text.includes(certificate.codigo_validacao));
    const resources = execFileSync('pdfimages', ['-list', pdfPath], { encoding: 'utf8' });
    await writeFile(resolve(output, 'ead-curriculum.txt'), text);
    await writeFile(resolve(output, 'ead-curriculum-images.txt'), resources);
    await writeFile(resolve(output, 'ead-curriculum-info.txt'), info);
    execFileSync('pdftoppm', ['-f', '1', '-l', '2', '-scale-to', '2000', '-png', pdfPath, resolve(output, 'ead-curriculum')]);
    await writeFile(resolve(output, 'ead-curriculum-evidence.json'), JSON.stringify({
      itemCount: curriculum.items.length, expectedPages: 1 + curriculum.pages.length,
      codePreserved: true, completionDate: certificate.data_conclusao,
      realCompositor: true, realSanitizer: true, realQr: true, artifacts: output,
    }, null, 2));
  } finally { await page.close(); }
});

test('EAD missing curriculum fails explicitly; technical remains independent of EAD snapshot', async () => {
  const page = await open({ ...fixture, curriculum: null });
  try { assert.ok(await page.locator('[data-render-error]').count()); }
  finally { await page.close(); }
  const technical = await open({ ...fixture, certificate: { ...certificate, modalidade: 'TECNICO' }, curriculum: null });
  try { assert.equal(await technical.locator('[data-render-error]').count(), 0); }
  finally { await technical.close(); }
});
