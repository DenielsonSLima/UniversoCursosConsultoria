import assert from 'node:assert/strict';
import { Blob, Buffer } from 'node:buffer';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createAlunoBulletinFixture } from './aluno-bulletin.fixture.mjs';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
const source = createAlunoBulletinFixture(createCanvas);
const dialogPath = fileURLToPath(new URL('./components/AlunoBulletinDialog.tsx', import.meta.url));
const resultsPath = fileURLToPath(new URL('../../shared/secretaria/AcademicResultsModal.tsx', import.meta.url));
const compositorPath = fileURLToPath(new URL('../../gestor/secretaria/historico-emissoes/emission-document.pdf.ts', import.meta.url));
const bundle = await build({
  stdin: {
    loader: 'tsx', resolveDir: process.cwd(), sourcefile: 'student-bulletin-ui.tsx',
    contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import Results from ${JSON.stringify(resultsPath)};
      import Dialog from ${JSON.stringify(dialogPath)};
      import { fixture } from 'bulletin-ui-fixture';
      export { fixture };
      export { createEmissionDocumentsPdf } from ${JSON.stringify(compositorPath)};
      const module = { periodId: 'test-period', moduleId: 'test-module', name: 'Módulo I',
        order: 1, status: 'ABERTO', disciplines: [{ id: 'discipline', name: 'Disciplina' }] };
      const resetRender = () => { fixture.buttons = []; fixture.effects = []; fixture.activeKey = ''; };
      export const renderResults = (options = {}) => {
        resetRender();
        return renderToStaticMarkup(<Results open onClose={() => {}} results={[]}
          modules={[module]} selectedPeriodId="test-period" onEmitPdf={() => { fixture.emissions += 1; }}
          {...options} />);
      };
      export const renderPdf = (options = {}) => {
        resetRender();
        return renderToStaticMarkup(<Dialog open onClose={() => {}}
          alunoId="test-student" enrollmentId="test-enrollment" moduleId="test-module"
          contextId="test-context" {...options} />);
      };
    `,
  },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'transform', logLevel: 'silent',
  tsconfigRaw: { compilerOptions: { jsx: 'react' } },
  define: { 'document.body': '{}' },
  banner: { js: `import { createRequire } from 'node:module'; const require = createRequire(${JSON.stringify(import.meta.url)});` },
  plugins: [{ name: 'controlled-student-bulletin-ui', setup(plugin) {
    plugin.onResolve({ filter: /^bulletin-ui-fixture$/ }, () => ({ path: 'react', namespace: 'bulletin-fixture' }));
    plugin.onResolve({ filter: /^react$/ }, args => [dialogPath, resultsPath].includes(args.importer)
      ? { path: 'react', namespace: 'bulletin-fixture' } : undefined);
    plugin.onResolve({ filter: /^react-dom$/ }, args => [dialogPath, resultsPath].includes(args.importer)
      ? { path: 'portal', namespace: 'bulletin-fixture' } : undefined);
    plugin.onResolve({ filter: /(?:aluno-bulletin\.service|download-pdf-blob|pdf-blob-print|useMediaQuery)$/ }, args => ({
      path: args.path.split('/').at(-1), namespace: 'bulletin-fixture',
    }));
    plugin.onLoad({ filter: /.*/, namespace: 'bulletin-fixture' }, args => {
      const contents = {
        react: `
          import React, { useState as useRealState } from 'react';
          export { useRef } from 'react';
          export const fixture = { buttons: [], effects: [], pdfState: null, activeKey: '',
            downloads: [], prints: [], requests: [], pending: null, printingPending: null,
            stateWrites: 0, emissions: 0 };
          export const useEffect = (setup, deps) => { fixture.effects.push({ setup, deps }); };
          export const useState = (initial) => {
            const isPdf = initial && typeof initial === 'object' && 'revision' in initial;
            const [value, setValue] = useRealState(isPdf && fixture.pdfState ? fixture.pdfState : initial);
            return [value, (next) => {
              if (isPdf) { fixture.pdfState = typeof next === 'function' ? next(value) : next; fixture.stateWrites += 1; }
              setValue(next);
            }];
          };
          export default { ...React, createElement(type, props, ...children) {
            if (type === 'button') fixture.buttons.push({ ...props, children });
            if (typeof type === 'function' && type.name === 'ActiveBulletinDialog') fixture.activeKey = props.key;
            return React.createElement(type, props, ...children);
          } };
        `,
        portal: 'export const createPortal = children => children;',
        useMediaQuery: 'export default () => false;',
        'download-pdf-blob': "import {fixture} from 'bulletin-ui-fixture'; export const downloadPdfBlob=(blob,fileName)=>fixture.downloads.push({blob,fileName});",
        'pdf-blob-print': "import {fixture} from 'bulletin-ui-fixture'; export const printPdfBlob=async(blob,options)=>{fixture.prints.push({blob,options});await fixture.printingPending;};",
        'aluno-bulletin.service': `
          import { fixture } from 'bulletin-ui-fixture';
          export const loadAlunoBulletinPdf = (enrollmentId, alunoId, moduleId, signal) => {
            fixture.requests.push({ enrollmentId, alunoId, moduleId, signal });
            return fixture.pending || Promise.reject(new Error('Vínculo não autorizado para emissão.'));
          };
        `,
      }[args.path];
      if (!contents) throw new Error('Fixture ausente: ' + args.path);
      return { contents, loader: 'js', resolveDir: process.cwd() };
    });
  } }],
});
const ui = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const { fixture } = ui;
const findButton = text => fixture.buttons.find(button => button.children.includes(text));
const loadEffect = moduleId => fixture.effects.find(effect => effect.deps?.includes(moduleId));
const pdf = { blob: new Blob(['%PDF-synthetic-fixture'], { type: 'application/pdf' }), fileName: 'boletim.pdf', code: 'BOL-TEST' };

test('pipeline do gestor compõe o boletim aluno com modelo, marca e tabela selecionável canônicos', async () => {
  const result = await ui.createEmissionDocumentsPdf([source]);
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  await writeFile('/tmp/universo-boletim-aluno-local.pdf', bytes);
  const document = await getDocument({ data: bytes, useSystemFonts: false,
    standardFontDataUrl: fileURLToPath(new URL('node_modules/pdfjs-dist/standard_fonts/', `file://${process.cwd()}/`)) }).promise;
  try {
    assert.equal(document.numPages, 1);
    const page = await document.getPage(1);
    const items = (await page.getTextContent()).items.filter(item => 'str' in item);
    const text = items.map(item => item.str).join(' ');
    for (const expected of ['ALUNA SINTÉTICA DE TESTE', 'UNIV-TEST123', 'REGISTRO DO MODELO CADASTRADO',
      'Relações Humanas no Trabalho', 'Noções de Primeiros Socorros', 'Secretaria Acadêmica']) assert.ok(text.includes(expected), expected);
    assert.doesNotMatch(text, /\{\{/);
    const operators = await page.getOperatorList();
    assert.ok(operators.fnArray.filter(operator => operator === OPS.paintImageXObject).length >= 3);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = createCanvas(viewport.width, viewport.height);
    await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
    await writeFile('/tmp/universo-boletim-aluno-local.png', canvas.toBuffer('image/png'));
  } finally { await document.destroy(); }
});

test('modal oferece emissão imediata do módulo iniciado sem registrar solicitação genérica', () => {
  const html = ui.renderResults();
  assert.match(html, /Emitir boletim em PDF/);
  const button = findButton(' Emitir boletim em PDF');
  assert.ok(button);
  assert.equal(button.disabled, false);
  button.onClick();
  assert.equal(fixture.emissions, 1);
  assert.equal(fixture.requests.length, 0);
});

test('emissão permanece bloqueada enquanto módulos ou notas carregam, em erro ou sem módulo válido', () => {
  for (const options of [{ isLoading: true }, { isError: true }, { modules: [] },
    { selectedPeriodId: 'another-period' }, { emitPdfDisabled: true }]) {
    ui.renderResults(options);
    assert.equal(findButton(' Emitir boletim em PDF').disabled, true);
  }
});

test('prévia, download e impressão consomem o mesmo Blob oficial sem imprimir a página do portal', async () => {
  fixture.pdfState = { revision: 0, result: pdf, url: 'blob:official-bulletin', error: null };
  const html = ui.renderPdf();
  assert.match(html, /src="blob:official-bulletin#toolbar=0&amp;navpanes=0&amp;view=FitH"/);
  assert.equal(findButton('Baixar PDF').disabled, false);
  findButton('Baixar PDF').onClick();
  await findButton('Imprimir').onClick();
  await setImmediate();
  assert.equal(fixture.downloads.at(-1).blob, pdf.blob);
  assert.equal(fixture.prints.at(-1).blob, pdf.blob);
  assert.equal(fixture.downloads.at(-1).fileName, pdf.fileName);
});

test('RPC recusada mostra erro e mantém download e impressão bloqueados sem prévia genérica', async () => {
  fixture.pdfState = null;
  fixture.pending = null;
  ui.renderPdf();
  assert.equal(findButton('Baixar PDF').disabled, true);
  assert.equal(findButton('Imprimir').disabled, true);
  const cleanup = loadEffect('test-module').setup();
  await setImmediate();
  const html = ui.renderPdf();
  assert.match(html, /Não foi possível emitir o boletim/);
  assert.match(html, /Vínculo não autorizado para emissão/);
  assert.doesNotMatch(html, /<iframe/);
  assert.equal(findButton('Baixar PDF').disabled, true);
  assert.equal(findButton('Imprimir').disabled, true);
  cleanup();
});

test('fechar ou trocar o contexto aborta a preparação da impressão da instância anterior', async () => {
  fixture.pdfState = { revision: 0, result: pdf, url: 'blob:official-bulletin', error: null };
  let finishPrint;
  fixture.printingPending = new Promise(resolve => { finishPrint = resolve; });
  ui.renderPdf();
  const cleanup = fixture.effects.find(effect => effect.deps?.length === 0).setup();
  findButton('Imprimir').onClick();
  const { blob, options } = fixture.prints.at(-1);
  assert.equal(blob, pdf.blob);
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(options.signal.aborted, false);
  cleanup();
  assert.equal(options.signal.aborted, true);
  finishPrint();
  await setImmediate();
  fixture.printingPending = null;
});

test('troca de matrícula, módulo ou contexto troca a identidade do dialog e cancela resposta antiga', async () => {
  let resolveOld;
  fixture.pending = new Promise(resolve => { resolveOld = resolve; });
  fixture.pdfState = null;
  fixture.stateWrites = 0;
  ui.renderPdf();
  const firstKey = fixture.activeKey;
  const cleanup = loadEffect('test-module').setup();
  const request = fixture.requests.at(-1);
  assert.equal(request.enrollmentId, 'test-enrollment');
  assert.equal(request.alunoId, 'test-student');
  assert.equal(request.moduleId, 'test-module');
  cleanup();
  assert.equal(request.signal.aborted, true);
  for (const options of [{ enrollmentId: 'new-enrollment' }, { moduleId: 'new-module' }, { contextId: 'new-context' }]) {
    ui.renderPdf(options);
    assert.notEqual(fixture.activeKey, firstKey);
  }
  resolveOld(pdf);
  await setImmediate();
  assert.equal(fixture.stateWrites, 0);
  fixture.pending = null;
});

test('portal transporta matrícula do boletim, moduleId e contexto autenticado, sem usar período como módulo', async () => {
  const page = await readFile(new URL('./SecretariaPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /enrollmentId: bulletinEnrollment\.id, moduleId: selectedBulletinModule\.moduleId/);
  assert.match(page, /bulletinPdfRequest\.contextId === contextId && bulletinPdfRequest\.alunoId === alunoId/);
  assert.match(page, /setBulletinPdfRequest\(null\);\s*setBulletinOpen\(false\);\s*}, \[alunoId, contextId\]/);
});
