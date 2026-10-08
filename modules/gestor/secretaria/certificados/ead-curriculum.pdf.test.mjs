import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import { syntheticIdentity, syntheticModel, signatureFixtureModule, measureCertificatePages, certificateIdentityCases, withCertificateIdentityCase } from './ead-curriculum.pdf.fixture.mjs';
import { mockModules as secretariaIo } from './ead-certificates.ui.fixture.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(directory, '../../../..');
const dependencies = process.env.EAD_UI_NODE_MODULES;
const requireTool = createRequire(dependencies
  ? pathToFileURL(resolve(dependencies, '../ead-pdf-runner.mjs')) : import.meta.url);
const { build } = requireTool('esbuild');
const { chromium } = requireTool('playwright');
const postcss = requireTool('postcss');
const tailwindcss = requireTool('tailwindcss');
const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, decodePDFRawStream } = requireTool('pdf-lib');
const { createCanvas } = requireTool('@napi-rs/canvas');
const { getDocument } = await import(pathToFileURL(requireTool.resolve('pdfjs-dist/legacy/build/pdf.mjs')));
const standardFontDataUrl = resolve(requireTool.resolve('pdfjs-dist/package.json'), '../standard_fonts') + '/';
const output = resolve(process.env.EAD_CURRICULUM_ARTIFACTS || '/tmp/ead-curriculum-pdf');
const sourceFile = process.env.EAD_CURRICULUM_FIXTURE_OUT;
assert.ok(sourceFile, 'Run the real SQL suite with EAD_CURRICULUM_FIXTURE_OUT first.');
const source = JSON.parse(await readFile(sourceFile, 'utf8'));
const privateFixture = process.env.EAD_CURRICULUM_RENDER_FIXTURE
  ? JSON.parse(await readFile(process.env.EAD_CURRICULUM_RENDER_FIXTURE, 'utf8')) : null;
const certificate = { ...source.certificate, ...syntheticIdentity, ...(privateFixture?.identity || {}) };
const model = privateFixture?.model || syntheticModel;
const curriculum = source.document.dados_emissao.eadCurriculum;
const curriculumTable = source.document.dados_emissao.eadCurriculumTable;
const fixture = { certificate, model, curriculum, curriculumTable, signatures: {
  diretoriaGeralNome: 'DIRETOR SINTÉTICO', diretoriaGeralCargo: 'Diretor Geral',
  secretariaNome: 'SECRETÁRIA SINTÉTICA', secretariaCargo: 'Secretária Escolar',
  ...privateFixture?.signatures,
} };
let browser;
let javascript;
let css;

before(async () => {
  await mkdir(output, { recursive: true });
  const compiled = await build({
    stdin: { contents: `import React from 'react';
      import {createRoot} from 'react-dom/client';
      import Preview from './components/CertificadoPreview.tsx';
      import Editor from '../../cadastros/modelos-documentos/diploma/components/DiplomaPreview.tsx';
      import Secretaria from './SecretariaCertificadosPage.tsx';
      import {loadEadCertificateFontFaces} from './ead-certificate-pdf-fonts.ts';
      import {buildEadCertificateTemplateVars,replaceEadCertificateVars} from './components/certificado-preview.utils.ts';
      window.prepareCertificateFonts = () => loadEadCertificateFontFaces('Inter');
      window.renderCertificate = (value) => {
        window.__fixture = value;
        window.__certificateRoot ||= createRoot(document.getElementById('root'));
        const previewValues = value.certificate.modalidade === 'EAD' ? buildEadCertificateTemplateVars(value.certificate, {
          curriculumText: value.certificate.metadados.programContent,
          totalHours: value.curriculum?.totalHours, validationCode: value.certificate.codigo_validacao,
          signatureVars: { diretoria_geral_nome:value.signatures.diretoriaGeralNome,
            diretoria_geral_cargo:value.signatures.diretoriaGeralCargo,
            secretaria_nome:value.signatures.secretariaNome, secretaria_cargo:value.signatures.secretariaCargo },
        }) : {};
        const replaceText = (text, extra, strong) => replaceEadCertificateVars(text, value.certificate, {...previewValues,...extra}, strong);
        const emitted = <Preview certificado={value.certificate} modelo={value.model}
          curriculumSnapshot={value.curriculum} curriculumTableSnapshot={value.curriculumTable}
          pdfMode showValidationQrCode />;
        window.__certificateRoot.render(value.secretaria ? <Secretaria/> : value.parity ? <>
          <div id="editor-front"><Editor formData={value.model} page="frente" zoomLevel={100}
            previewValues={previewValues} replaceText={replaceText} programmaticRows={value.curriculumTable.pages[0].rows}/></div>
          <div id="editor-back"><Editor formData={value.model} page="verso" zoomLevel={100}
            previewValues={previewValues} replaceText={replaceText} programmaticRows={value.curriculumTable.pages[0].rows}/></div>
          <div id="issued">{emitted}</div>
        </> : emitted);
      };`, loader: 'tsx', resolveDir: directory },
    bundle: true, format: 'iife', write: false, define: { 'import.meta.env': '{}' },
    nodePaths: dependencies ? [dependencies] : [],
    plugins: [{ name: 'controlled-io-real-renderers', setup(plugin) {
      const io = { ...secretariaIo };
      delete io['./components/CertificadoPreview'];
      delete io['./useEadCertificatePdf'];
      io['./certificados.queries'] = `
        const response = data => ({data,isLoading:false,isError:false,refetch:async()=>({data})});
        export const useCertificadosQuery = filters => response(filters.modalidade==='EAD' && filters.status==='FINALIZADO' ? [window.__fixture.certificate] : []);
        export const useCertificadoTurmasQuery = () => response([]);
        export const useCertificadoTemplatesQuery = () => response([window.__fixture.model]);
        export const useFinalizarCertificadoMutation = () => ({isPending:false,mutateAsync:async()=>{throw Error('Rendering never issues a certificate.')}});`;
      io['./usePersistedEadCertificateTemplates'] = `export const usePersistedEadCertificateTemplates = () => ({
        refetch:async()=> window.__fixture.modelFailure
          ? {isError:true,error:new Error('Persisted model unavailable')}
          : {data:window.__fixture.modelMissing?[]:[window.__fixture.model],isError:false},
      });`;
      plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(io, args.path)
        ? { path: args.path, namespace: 'secretaria-io' } : undefined);
      plugin.onLoad({ filter: /.*/, namespace: 'secretaria-io' }, args => ({ contents: io[args.path], loader: 'tsx', resolveDir: directory }));
      plugin.onResolve({ filter: /assinaturas\.service$/ }, () => ({ path: 'signatures', namespace: 'io' }));
      plugin.onLoad({ filter: /.*/, namespace: 'io' }, () => ({ contents: signatureFixtureModule }));
    } }],
  });
  javascript = compiled.outputFiles[0].text;
  const config = requireTool(resolve(root, 'tailwind.config.cjs'));
  const styles = (await readFile(resolve(root, 'styles.css'), 'utf8')).replace(/^@import.*$/gm, '');
  css = (await postcss([tailwindcss({ ...config,
    content: [resolve(root, 'modules/gestor/secretaria/certificados/**/*.tsx'),
      resolve(root, 'modules/gestor/cadastros/modelos-documentos/diploma/**/*.tsx')],
  })]).process(styles, { from: resolve(root, 'styles.css') })).css;
  browser = await chromium.launch({ headless: true,
    ...(process.env.EAD_UI_BROWSER_EXECUTABLE ? { executablePath: process.env.EAD_UI_BROWSER_EXECUTABLE } : {}) });
});

after(async () => { await browser?.close(); });

async function open(value = fixture, viewport = { width: 1123, height: 900 }) {
  const page = await browser.newPage({ viewport });
  await page.setContent('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(() => window.prepareCertificateFonts());
  await page.evaluate((data) => window.renderCertificate(data), value);
  if (value.secretaria) {
    await page.getByRole('button', { name: 'EAD / Online', exact: true }).click();
    await page.getByTitle('Pré-visualizar', { exact: true }).click();
  }
  if (value.modelFailure || value.modelMissing) return page;
  await page.locator('[data-render-ready="true"]').waitFor();
  if (value.expectPdfError) return page;
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode()));
  });
  return page;
}

test('real SQL snapshot reaches the real configured verso and preserves emission identity', async () => {
  const page = await open();
  try {
    assert.equal(await page.locator('[data-render-error]').count(), 0);
    assert.equal(await page.locator('[data-certificate-pdf-page]').count(), 1 + curriculumTable.pages.length);
    const blocks = page.locator('[data-certificate-curriculum]');
    assert.equal(await blocks.count(), curriculumTable.pages.length);
    const actual = (await blocks.allTextContents()).join('\n');
    let previous = -1;
    for (const item of curriculum.items) {
      const index = actual.indexOf(item.title);
      assert.ok(index > previous, `Missing or reordered curriculum item: ${item.title}`);
      previous = index;
    }
    assert.ok(!actual.includes('Grade curricular conforme histórico'));
    assert.deepEqual(await blocks.first().locator('th').allTextContents(), ['Componente', 'Carga', 'Nota / Status']);
    const cells = await blocks.locator('tbody tr').evaluateAll(rows => rows.map(row =>
      [...row.querySelectorAll('td')].map(cell => cell.textContent)));
    assert.deepEqual(cells, curriculumTable.pages.flatMap(page => page.rows)
      .map(row => [row.nome, row.carga, row.status]));
    assert.ok((await page.locator('body').textContent()).includes(certificate.codigo_validacao));
    assert.ok(!(await page.locator('body').textContent()).includes('999 horas'));
    await writeFile(resolve(output, 'ead-curriculum-evidence.json'), JSON.stringify({
      itemCount: curriculum.items.length, expectedPages: 1 + curriculumTable.pages.length,
      codePreserved: true, completionDate: certificate.data_conclusao,
      realCompositor: true, realSanitizer: true, realQr: true, artifacts: output,
    }, null, 2));
  } finally { await page.close(); }
});

test('real editor and emitted EAD use identical block geometry, table columns, fonts, images and QR', async () => {
  assert.ok(curriculumTable, 'Canonical table snapshot must come from the SQL fixture.');
  const page = await open({ ...fixture, parity: true });
  try {
    const measured = await page.evaluate(measureCertificatePages, [
      '#editor-front > div > div', '#editor-back > div > div',
      '#issued [data-certificate-pdf-page]:nth-child(1)', '#issued [data-certificate-pdf-page]:nth-child(2)',
    ]);
    const backgrounds = await page.evaluate(() => [
      '#editor-front > div > div', '#editor-back > div > div',
      '#issued [data-certificate-pdf-page]:nth-child(1)', '#issued [data-certificate-pdf-page]:nth-child(2)',
    ].map(selector => {
      const style = getComputedStyle(document.querySelector(selector));
      return style.backgroundImage === 'none' ? ['none']
        : [style.backgroundImage, style.backgroundSize, style.backgroundPosition];
    }));
    assert.deepEqual(backgrounds.slice(2), backgrounds.slice(0,2), 'Original front/back backgrounds must be preserved.');
    const comparison = ['front', 'back'].map((side, index) => ({
      side, editor: measured[index], emitted: measured[index + 2],
    }));
    for (const result of comparison) comparePages(result.emitted, result.editor, result.side);
    const metrics = comparison.map(({ side, editor }) => ({ side, blocks: editor.map(({ geometry, text, elements }) => ({
      geometry, text, elements: elements.map(({ image, ...element }) => ({ ...element, imagePresent: Boolean(image) })),
    })) }));
    await writeFile(resolve(output, 'editor-emission-parity.json'), JSON.stringify(metrics, null, 2));
    for (const [side, index] of [['front', 0], ['back', 1]]) {
      await page.locator('#editor-' + side + ' > div').screenshot({ path: resolve(output, 'editor-' + side + '.png') });
      await page.locator('#issued [data-certificate-pdf-page]').nth(index).screenshot({ path: resolve(output, 'emitted-' + side + '.png') });
    }
  } finally { await page.close(); }
});

function comparePages(actual, expected, context) {
  const withoutGeometry = blocks => blocks.map(({geometry, elements, ...block}) => ({...block,
    elements:elements.map(({geometry, ...element}) => element),
  }));
  assert.deepEqual(withoutGeometry(actual), withoutGeometry(expected),
    `${context}: text, fonts, columns, QR or original assets differ from the editor.`);
  const rectangles = blocks => blocks.flatMap(block => [block.geometry, ...block.elements.map(element => element.geometry)]);
  const expectedRectangles = rectangles(expected);
  rectangles(actual).forEach((rectangle, index) => rectangle.forEach((coordinate, axis) => {
    assert.ok(Math.abs(coordinate - expectedRectangles[index][axis]) <= 0.1,
      `${context}: rectangle ${index}, axis ${axis}: ${coordinate} versus ${expectedRectangles[index][axis]}`);
  }));
}

async function renderSavedPdf(pdfPath) {
  const document = await getDocument({ data: new Uint8Array(await readFile(pdfPath)),
    standardFontDataUrl, useSystemFonts: false }).promise;
  try {
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = createCanvas(viewport.width, viewport.height);
      await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
      await writeFile(pdfPath.replace(/\.pdf$/, `-pdfjs-${number}.png`), canvas.toBuffer('image/png'));
    }
  } finally { await document.destroy(); }
}

async function saveProductPdf(page, pdfPath) {
  await page.locator('[data-ead-certificate-pdf-state="ready"]').waitFor();
  const viewer = page.locator('iframe[data-ead-certificate-pdf-preview]');
  const viewerUrl = await viewer.getAttribute('src');
  assert.ok(viewerUrl?.startsWith('blob:'), 'Preview must use the generated PDF Blob.');
  const previewBytes = await page.evaluate(async url => {
    const blob = await (await fetch(url)).blob();
    return new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.readAsDataURL(blob);
    });
  }, viewerUrl);
  const previewHash = createHash('sha256').update(Buffer.from(previewBytes,'base64')).digest('hex');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', {name:'Baixar PDF',exact:true}).click();
  await (await downloaded).saveAs(pdfPath);
  assert.equal(createHash('sha256').update(await readFile(pdfPath)).digest('hex'), previewHash,
    'Downloaded bytes must equal the PDF shown in the preview.');
  await renderSavedPdf(pdfPath);
  const expectedBackgrounds = await page.locator('[data-certificate-pdf-page]').evaluateAll(async pages =>
    Promise.all(pages.map(async (node,index) => {
      const background = getComputedStyle(node).backgroundImage;
      if (background === 'none') return null;
      const source = /^url\(["']?(.*?)["']?\)$/.exec(background)?.[1];
      if (!source) throw Error('Configured background could not be inspected.');
      const image = new Image();
      image.src = source;
      await image.decode();
      return {page:index+1,width:image.naturalWidth,height:image.naturalHeight};
    })));
  const resources = execFileSync('pdfimages', ['-list',pdfPath], {encoding:'utf8'});
  const embeddedImages = resources.split('\n').map(line => line.trim().split(/\s+/))
    .filter(columns => columns[2] === 'image');
  for (const background of expectedBackgrounds.filter(Boolean)) {
    assert.ok(embeddedImages.some(columns => Number(columns[0]) === background.page
      && Number(columns[3]) === background.width && Number(columns[4]) === background.height),
    `Page ${background.page}: the original background must be a PDF image, independent of browser print-background settings.`);
  }
  const fontResources = execFileSync('pdffonts', [pdfPath], {encoding:'utf8'});
  const usesInter900 = await page.locator('[data-certificate-pdf-page]').evaluateAll(pages =>
    pages.some(root => [...root.querySelectorAll('*')].some(node => {
      const style = getComputedStyle(node);
      return /Inter/.test(style.fontFamily) && Number(style.fontWeight) === 900 && node.textContent.trim();
    })));
  assert.ok(usesInter900, 'The real fixture must exercise Inter at weight 900.');
  assert.match(fontResources, /^EadInter900\s+CID TrueType\s+Identity-H\s+yes\s+\S+\s+yes/m,
    'Inter 900 must be embedded with Unicode, not replaced by a core PDF font.');
  const parsedPdf = await PDFDocument.load(await readFile(pdfPath));
  let embeddedWeight;
  for (const pdfPage of parsedPdf.getPages()) {
    const fonts = pdfPage.node.Resources().lookup(PDFName.of('Font'), PDFDict);
    for (const [, reference] of fonts.entries()) {
      const font = parsedPdf.context.lookup(reference, PDFDict);
      if (String(font.get(PDFName.of('BaseFont'))) !== '/EadInter900') continue;
      const descendant = font.lookup(PDFName.of('DescendantFonts'), PDFArray).lookup(0, PDFDict);
      const descriptor = descendant.lookup(PDFName.of('FontDescriptor'), PDFDict);
      const stream = descriptor.lookup(PDFName.of('FontFile2'), PDFRawStream);
      const ttf = Buffer.from(decodePDFRawStream(stream).decode());
      for (let index = 0; index < ttf.readUInt16BE(4); index++) {
        const table = 12 + index * 16;
        if (ttf.toString('ascii', table, table + 4) === 'OS/2') {
          embeddedWeight = ttf.readUInt16BE(ttf.readUInt32BE(table + 8) + 4);
        }
      }
    }
  }
  assert.equal(embeddedWeight, 900, 'The actual embedded TTF must declare weight 900.');
  await writeFile(pdfPath.replace(/\.pdf$/, '-fonts.txt'), fontResources);
  await page.evaluate(() => {
    window.__eadPrintedPdfBytes = [];
    const observed = new Set();
    new MutationObserver(() => {
      document.querySelectorAll('iframe[src^="blob:"]:not([data-ead-certificate-pdf-preview])').forEach(async frame => {
        if (observed.has(frame.src)) return;
        observed.add(frame.src);
        const blob = await (await fetch(frame.src)).blob();
        const reader = new FileReader();
        reader.onload = () => window.__eadPrintedPdfBytes.push(String(reader.result).split(',')[1]);
        reader.readAsDataURL(blob);
      });
    }).observe(document.body,{childList:true,subtree:true});
  });
  await page.getByRole('button', {name:'Imprimir',exact:true}).click();
  await page.waitForFunction(() => window.__eadPrintedPdfBytes.length > 0);
  const printedBytes = await page.evaluate(() => window.__eadPrintedPdfBytes);
  assert.ok(printedBytes.some(bytes => createHash('sha256').update(Buffer.from(bytes,'base64')).digest('hex') === previewHash),
    'Printing must receive the same PDF bytes, even if its object URL differs.');
}

test('the real Secretariat uses the same PDF Blob for preview, download and printing at desktop/mobile sizes', async () => {
  const editor = await open({...fixture, parity:true});
  const expected = await editor.evaluate(measureCertificatePages, ['#editor-front > div > div', '#editor-back > div > div']);
  await editor.close();
  for (const width of [1123, 390]) {
    const page = await open({...fixture, secretaria:true}, {width,height:900});
    try {
      await page.locator('[data-ead-certificate-pdf-state="ready"]').waitFor();
      assert.equal(await page.locator('[data-certificate-pdf-page]').count(), 1 + curriculumTable.pages.length);
      assert.equal(await page.locator('[data-render-error]').count(), 0);
      const actual = await page.evaluate(measureCertificatePages, [
        '[data-certificate-pdf-page]:nth-child(1)', '[data-certificate-pdf-page]:nth-child(2)',
      ]);
      actual.forEach((measured,index) => comparePages(measured, expected[index], `Secretariat ${width}px page ${index+1}`));
      const size = await page.locator('iframe[data-ead-certificate-pdf-preview]').boundingBox();
      assert.ok(size.width <= width, 'The actual PDF preview must fit into the viewport.');
      await page.screenshot({path:resolve(output, `secretariat-${width}.png`),fullPage:true});
      // Capture the actual product Blob. Browser background-print preferences cannot remove PDF assets.
      const pdfPath = resolve(output, `secretariat-${width}.pdf`);
      await saveProductPdf(page, pdfPath);
      const info = execFileSync('pdfinfo', [pdfPath], {encoding:'utf8'});
      assert.equal(Number(/^Pages:\s+(\d+)$/m.exec(info)?.[1]), 1 + curriculumTable.pages.length);
      const text = execFileSync('pdftotext', ['-layout',pdfPath,'-'], {encoding:'utf8'});
      for (const item of curriculum.items) assert.ok(text.includes(item.title), `Portal PDF lacks ${item.title}`);
      assert.ok(text.includes(certificate.codigo_validacao));
      assert.ok(!text.includes('Imprimir') && !text.includes('Central de Certificados'), 'Application UI must not be printed.');
      await writeFile(resolve(output, `secretariat-${width}.txt`), text);
      await writeFile(resolve(output, `secretariat-${width}-info.txt`), info);
      await writeFile(resolve(output, `secretariat-${width}-images.txt`),
        execFileSync('pdfimages', ['-list',pdfPath], {encoding:'utf8'}));
      execFileSync('pdftoppm', ['-f','1','-l','2','-scale-to','2000','-png',pdfPath,resolve(output,`secretariat-${width}`)]);
    } finally { await page.close(); }
  }
});

test('the real Secretariat blocks a failed persisted-model read or missing configured model', async () => {
  for (const failure of ['modelFailure','modelMissing']) {
    const page = await open({...fixture,secretaria:true,[failure]:true,
      certificate:{...certificate,curso:{...certificate.curso,ead_config:{certificacao:{modeloDocumento:model.id}}}},
    });
    try {
      await page.getByRole('button', {name:'Tentar novamente',exact:true}).waitFor();
      assert.equal(await page.locator('[data-certificate-pdf-page]').count(), 0);
      assert.equal(await page.getByRole('button', {name:'Imprimir',exact:true}).isDisabled(), true);
    } finally { await page.close(); }
  }
});

test('EAD missing curriculum fails explicitly; technical remains independent of EAD snapshot', async () => {
  const page = await open({ ...fixture, curriculum: null });
  try { assert.ok(await page.locator('[data-render-error]').count()); }
  finally { await page.close(); }
  const technical = await open({ ...fixture, certificate: { ...certificate, modalidade: 'TECNICO' }, curriculum: null });
  try { assert.equal(await technical.locator('[data-render-error]').count(), 0); }
  finally { await technical.close(); }
});


test('the real certificate renders the individual registered document, formatted and snapshot-safe, into selectable PDF', async () => {
  for (const scenario of certificateIdentityCases) {
    const value = withCertificateIdentityCase(fixture, scenario);
    const page = await open({...value,secretaria:true});
    try {
      const front = page.locator('[data-certificate-pdf-page]').first();
      const text = (await front.textContent()).replace(/\s+/g,' ');
      const pdfPath = resolve(output, `identity-${scenario.id}.pdf`);
      await writeFile(resolve(output, `identity-${scenario.id}-dom.txt`), text);
      await writeFile(resolve(output, `identity-${scenario.id}-dom.html`), await front.innerHTML());
      await saveProductPdf(page, pdfPath);
      const pdfText = execFileSync('pdftotext', ['-layout',pdfPath,'-'], {encoding:'utf8'});
      await writeFile(resolve(output, `identity-${scenario.id}.txt`), pdfText);
      for (const expected of scenario.expected) assert.ok(text.includes(expected), `${scenario.id}: ${expected}`);
      for (const forbidden of scenario.forbidden || []) assert.ok(!text.includes(forbidden), `${scenario.id}: ${forbidden}`);
      assert.ok(!text.includes('LIVE-RESIDUAL'));
      const normalized = pdfText.replace(/\s+/g,' ');
      for (const expected of scenario.expected) assert.ok(normalized.includes(expected), `${scenario.id} PDF: ${expected}`);
      for (const forbidden of scenario.forbidden || []) assert.ok(!normalized.includes(forbidden), `${scenario.id} PDF: ${forbidden}`);
      assert.ok(pdfText.includes(certificate.codigo_validacao));
      for (const item of curriculum.items) assert.ok(pdfText.includes(item.title));
      const info = execFileSync('pdfinfo', [pdfPath], {encoding:'utf8'});
      assert.equal(Number(/^Pages:\s+(\d+)$/m.exec(info)?.[1]), 1 + curriculumTable.pages.length);
      await writeFile(resolve(output, `identity-${scenario.id}.txt`), pdfText);
      await page.screenshot({path:resolve(output, `identity-${scenario.id}.png`),fullPage:true});
    } finally { await page.close(); }
  }
});

test('missing curriculum, an unavailable original image or unsupported font block PDF actions', async () => {
  const withoutCurriculum = {...certificate.metadados};
  delete withoutCurriculum.eadCurriculum;
  const cases = [
    {...fixture,certificate:{...certificate,metadados:withoutCurriculum}},
    {...fixture,model:{...model,blocks:[...model.blocks,{
      id:'required-original-image-test',type:'image',page:'frente',visible:true,
      x:2,y:2,width:40,imageUrl:'data:image/png;base64,AAAA',
    }]}},
    {...fixture,model:{...model,blocks:model.blocks.map(block => block.type === 'text'
      ? {...block,fontFamily:'MissingFontForRegression'} : block)}},
  ];
  for (const value of cases) {
    const page = await open({...value,secretaria:true,expectPdfError:true});
    try {
      await page.locator('[data-ead-certificate-pdf-state="error"]').waitFor();
      assert.equal(await page.locator('iframe[data-ead-certificate-pdf-preview]').count(),0);
      assert.equal(await page.getByRole('button',{name:'Baixar PDF',exact:true}).isDisabled(),true);
      assert.equal(await page.getByRole('button',{name:'Imprimir',exact:true}).isDisabled(),true);
    } finally { await page.close(); }
  }
});
