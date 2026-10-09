import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import { certificate, fixtureHtml, mockModules } from './ead-certificates.ui.fixture.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));
const dependencies = process.env.EAD_UI_NODE_MODULES;
const requireTool = createRequire(dependencies
  ? pathToFileURL(resolve(dependencies, '../ead-ui-runner.mjs'))
  : import.meta.url);
const { build } = requireTool('esbuild');
const { chromium } = requireTool('playwright');
const reactPath = requireTool.resolve('react');
const reactDomPath = requireTool.resolve('react-dom/client');

const fixturePlugin = (modules) => ({
  name: 'synthetic-certificate-data',
  setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, (args) => Object.hasOwn(modules, args.path)
      ? { path: args.path, namespace: 'certificate-fixture' } : undefined);
    plugin.onLoad({ filter: /.*/, namespace: 'certificate-fixture' }, (args) => ({
      contents: modules[args.path], loader: 'tsx', resolveDir: directory,
    }));
  },
});

let server;
let browser;
let origin;

before(async () => {
  const result = await build({
    stdin: {
      contents: `import React from ${JSON.stringify(reactPath)};
        import {createRoot} from ${JSON.stringify(reactDomPath)};
        import Page from './SecretariaCertificadosPage.tsx';
        createRoot(document.getElementById('root')).render(<Page/>);`,
      loader: 'tsx', resolveDir: directory,
    },
    bundle: true, format: 'esm', write: false,
    nodePaths: dependencies ? [dependencies] : [],
    plugins: [fixturePlugin(mockModules)],
  });
  const javascript = result.outputFiles[0].text;
  server = createServer((request, response) => {
    const isScript = request.url === '/bundle.js';
    response.writeHead(200, { 'Content-Type': isScript ? 'text/javascript' : 'text/html' });
    response.end(isScript ? javascript : fixtureHtml);
  });
  await new Promise((accept) => server.listen(0, '127.0.0.1', accept));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.EAD_UI_BROWSER_EXECUTABLE || undefined,
  });
});

after(async () => {
  await browser?.close();
  await new Promise((accept) => server ? server.close(accept) : accept());
});

test('technical preparation preserves book, page, certificate number and required validation', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    const dialogs = [];
    page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.accept(); });
    await page.goto(origin);
    await page.getByRole('button', { name: 'Preparar', exact: true }).click();
    for (const placeholder of ['Certificado expedido Nº', 'Página', 'Livro', 'Validação do SISTEC']) {
      assert.equal(await page.getByPlaceholder(placeholder, { exact: true }).count(), 1);
    }
    await page.getByRole('button', { name: 'Emitir certificado', exact: true }).click();
    assert.equal(dialogs[0], 'Preencha número do certificado, página e livro.');
    assert.deepEqual(await page.evaluate(() => window.testIssuances), []);
  } finally { await page.close(); }
});

test('EAD defaults to finalized; pending records remain visible without technical preparation', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(origin);
    await page.getByRole('button', { name: 'EAD / Online', exact: true }).click();
    await page.getByText('Aluno sintético ead-finalizado', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Preparar', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Pendentes', exact: true }).click();
    await page.getByText('Aluno sintético ead-pendente', { exact: true }).waitFor();
    assert.equal(await page.getByText('Aguardando liberação automática', { exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Preparar', exact: true }).count(), 0);
    assert.equal(await page.getByPlaceholder('Livro', { exact: true }).count(), 0);
    assert.deepEqual(await page.evaluate(() => window.testIssuances), []);
    await page.getByRole('button', { name: 'Cursos Livres', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Preparar', exact: true }).count(), 1);
  } finally { await page.close(); }
});

test('EAD preview covers the real desktop/mobile viewport and restores focus after Escape', async () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    try {
      await page.goto(origin);
      await page.getByRole('button', { name: 'EAD / Online', exact: true }).click();
      const trigger = page.getByTitle('Pré-visualizar', { exact: true });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Certificado EAD', exact: true });
      await dialog.waitFor();
      const box = await dialog.boundingBox();
      assert.deepEqual(box, { x: 0, y: 0, ...viewport });
      assert.equal(await dialog.evaluate((element) => element.parentElement === document.body), true);
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
      const close = page.getByRole('button', { name: 'Fechar prévia do certificado', exact: true });
      await close.waitFor();
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Fechar prévia do certificado');
      assert.equal(await page.getByTestId('certificate-document').getAttribute('data-model'), 'modelo-ead-configurado');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Imprimir');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await close.evaluate((element) => document.activeElement === element), true);
      await page.keyboard.press('Escape');
      assert.equal(await dialog.count(), 0);
      assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      assert.equal(await trigger.evaluate((element) => document.activeElement === element), true);
    } finally { await page.close(); }
  }
});

test('EAD preview keeps printing blocked when the backend emission snapshot is unavailable', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(origin);
    await page.evaluate(() => { window.testValidationUnavailable = true; });
    await page.getByRole('button', { name: 'EAD / Online', exact: true }).click();
    await page.getByTitle('Pré-visualizar', { exact: true }).click();
    await page.getByText('Emissão não confirmada', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Imprimir', exact: true }).isDisabled(), true);
    assert.equal(await page.getByTestId('certificate-document').count(), 0);
    assert.equal(await page.evaluate(() => window.testPrints), 0);
  } finally { await page.close(); }
});

test('EAD reopens with the freshly saved model and hides the cached document during refresh', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(origin);
    await page.getByRole('button', { name: 'EAD / Online', exact: true }).click();
    await page.getByTitle('Pré-visualizar', { exact: true }).click();
    await page.getByTestId('certificate-document').waitFor();
    assert.equal(await page.getByTestId('certificate-document').getAttribute('data-model'), 'modelo-ead-configurado');
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      window.testDelayTemplateFetch = true;
      window.testPersistedModels = [{id:'ead-persisted',tipoCurso:'Educação a Distância (EAD)',testModel:'modelo-salvo-agora'}];
    });
    await page.getByTitle('Pré-visualizar', { exact: true }).click();
    await page.getByText('Atualizando o modelo do certificado...', { exact: true }).waitFor();
    assert.equal(await page.getByTestId('certificate-document').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Imprimir', exact: true }).isDisabled(), true);
    await page.evaluate(() => window.testResolveTemplateFetch());
    await page.getByTestId('certificate-document').waitFor();
    assert.equal(await page.getByTestId('certificate-document').getAttribute('data-model'), 'modelo-salvo-agora');
    assert.equal(await page.evaluate(() => window.testTemplateFetches), 2);
  } finally { await page.close(); }
});

test('EAD blocks unavailable configured or default models and failed persisted-template reads', async () => {
  for (const failure of ['configured-model-missing', 'empty-catalog', 'no-ead-model', 'fetch-error']) {
    const page = await browser.newPage();
    try {
      await page.goto(origin);
      await page.evaluate((value) => {
        window.testConfiguredModelId = value === 'configured-model-missing' ? 'modelo-removido' : undefined;
        window.testTemplateError = value === 'fetch-error';
        if (value === 'empty-catalog') window.testPersistedModels = [];
        if (value === 'no-ead-model') window.testPersistedModels = [{id:'technical',tipoCurso:'Cursos Técnicos'}];
      }, failure);
      await page.getByRole('button', { name: 'EAD / Online', exact: true }).click();
      await page.getByTitle('Pré-visualizar', { exact: true }).click();
      await page.getByRole('alert').waitFor();
      assert.equal(await page.getByTestId('certificate-document').count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Imprimir', exact: true }).isDisabled(), true);
      assert.equal(await page.evaluate(() => window.testPrints), 0);
    } finally { await page.close(); }
  }
});

test('EAD exposes the ready PDF and its download/print controls on desktop and mobile', async () => {
  for (const viewport of [{width:1440,height:900}, {width:390,height:844}]) {
    const page = await browser.newPage({viewport});
    try {
      await page.goto(origin);
      await page.getByRole('button', { name: 'EAD / Online', exact: true }).click();
      await page.getByTitle('Pré-visualizar', { exact: true }).click();
      const document = page.getByTestId('certificate-document');
      await document.waitFor();
      assert.equal(await document.getAttribute('data-pdf-viewer'), 'true');
      const displayed = await document.boundingBox();
      assert.ok(displayed.width <= viewport.width && displayed.x >= 0);
      await page.getByRole('button', {name:'Baixar PDF',exact:true}).click();
      await page.getByRole('button', {name:'Imprimir',exact:true}).click();
      assert.equal(await page.evaluate(() => window.testDownloads), 1);
      assert.equal(await page.evaluate(() => window.testPrints), 1);
      assert.deepEqual(await page.evaluate(() => window.testIssuances), []);
    } finally { await page.close(); }
  }
});

test('list service trusts backend certificate status and does not query or filter student progress', async () => {
  const calls = [];
  const sourceRows = [certificate('canonical-final', 'EAD', 'FINALIZADO'), certificate('canonical-pending', 'EAD', 'PENDENTE')];
  globalThis.__eadCertificateClient = {
    from(table) {
      calls.push({ method: 'from', table });
      assert.equal(table, 'certificados_academicos', 'eligibility stays on the backend');
      const request = {
        select(columns) { calls.push({ method: 'select', columns }); return request; },
        eq(column, value) { calls.push({ method: 'eq', column, value }); return request; },
        order() { return request; },
        then(accept) { return Promise.resolve({ data: sourceRows, error: null }).then(accept); },
      };
      return request;
    },
  };
  try {
    const result = await build({
      entryPoints: [resolve(directory, 'certificados.service.ts')], bundle: true,
      platform: 'node', format: 'esm', write: false,
      plugins: [fixturePlugin({
        '../../../../lib/supabase': 'export const supabase = globalThis.__eadCertificateClient;',
        '../secretaria-search': mockModules['../secretaria-search'],
      })],
    });
    const { certificadosService } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
    const resultRows = await certificadosService.list({ modalidade: 'EAD', turmaId: 'class-fixture', poloId: 'polo-fixture' });
    assert.deepEqual(resultRows, sourceRows, 'canonical certificates survive absent client progress');
    assert.equal(calls.filter((call) => call.method === 'from').length, 1);
    for (const [column, value] of [['modalidade', 'EAD'], ['turma_id', 'class-fixture'], ['polo_id', 'polo-fixture']]) {
      assert.ok(calls.some((call) => call.column === column && call.value === value));
    }
  } finally { delete globalThis.__eadCertificateClient; }
});
