import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import { jsPDF } from 'jspdf';
import { PDFDocument, PDFDict, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

const directory = fileURLToPath(new URL('.', import.meta.url));
const weights = [400, 600, 700, 900];
const assets = new Map(await Promise.all(weights.map(async weight => [
  weight, await readFile(resolve(directory, `pdf-assets/Inter-${weight}.ttf`)),
])));
const compiled = await build({
  stdin: { contents: `export * from './ead-certificate-pdf-fonts';
    export * from './pdf-assets/inter-fonts';`, resolveDir: directory },
  bundle: true, format: 'esm', platform: 'node', write: false,
  plugins: [{ name: 'font-url-io', setup(plugin) {
    plugin.onResolve({ filter: /\.ttf\?url$/ }, args => ({
      path: args.path.replace(/\?url$/, ''), namespace: 'font-url',
    }));
    plugin.onLoad({ filter: /.*/, namespace: 'font-url' }, args => ({
      contents: `export default ${JSON.stringify(`https://fonts.test/${args.path.split('/').at(-1)}`)};`,
      loader: 'js',
    }));
  } }],
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`;
let instance = 0;
const freshLoader = () => import(`${moduleUrl}#${++instance}`);
const arrayBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

function installEnvironment(t, failResponse = () => null) {
  const original = { fetch: globalThis.fetch, window: globalThis.window, document: globalThis.document };
  const requests = [];
  const faces = [];
  const added = [];
  globalThis.fetch = async url => {
    const weight = Number(/Inter-(\d+)\.ttf$/.exec(String(url))?.[1]);
    assert.ok(assets.has(weight), `Unexpected font URL: ${url}`);
    requests.push(weight);
    const failure = failResponse(weight, requests.length);
    if (failure === 'network') throw new TypeError('Transient font request failure');
    const bytes = failure === 'invalid' ? Buffer.from('<html>temporary fallback</html>')
      : failure === 'empty' ? Buffer.alloc(0) : assets.get(weight);
    return { ok: failure !== 'http', arrayBuffer: async () => arrayBuffer(bytes) };
  };
  globalThis.window = {
    FontFace: class {
      constructor(family, source, descriptors) {
        this.family = family;
        this.source = source;
        this.weight = Number(descriptors.weight);
        this.style = descriptors.style;
        faces.push(this);
      }
      async load() {
        // The browser parses TTF bytes; this boundary rejects the same non-font response.
        if (new DataView(this.source).getUint32(0) !== 0x00010000) {
          throw new Error('Invalid TrueType font response');
        }
        return this;
      }
    },
    getComputedStyle: node => ({ fontFamily: node.style.fontFamily }),
  };
  globalThis.document = { fonts: { add: face => added.push(face), ready: Promise.resolve() } };
  t.after(() => {
    globalThis.fetch = original.fetch;
    if (original.window === undefined) delete globalThis.window;
    else globalThis.window = original.window;
    if (original.document === undefined) delete globalThis.document;
    else globalThis.document = original.document;
  });
  return { requests, faces, added };
}

test('the four external TTF assets preserve every byte of the original fonts', async () => {
  const original = await readFile(resolve(directory, 'pdf-assets/inter-ttf.ts'), 'utf8');
  for (const weight of weights) {
    const encoded = new RegExp(`${weight}:\\s*["']([^"']+)["']`).exec(original)?.[1];
    assert.ok(encoded, `Missing original Inter ${weight}`);
    assert.deepEqual(assets.get(weight), Buffer.from(encoded, 'base64'));
  }
});

test('DOM and real jsPDF share one fetch and preserve fonts, aliases and source bytes', async t => {
  const loader = await freshLoader();
  const io = installEnvironment(t);
  const first = loader.loadInterFontData();
  assert.equal(loader.loadInterFontData(), first, 'Concurrent loads must share one promise.');
  const fonts = await first;
  await Promise.all([loader.loadEadCertificateFontFaces(), loader.loadEadCertificateFontFaces()]);
  assert.equal(io.faces.length, 4, 'The default family must register once.');
  const child = { style: { fontFamily: '"Inter", serif' } };
  const other = { style: { fontFamily: 'Arial, sans-serif' } };
  const root = { style: { fontFamily: 'Inter, sans-serif' }, querySelectorAll: () => [child, other] };
  const pdf = new jsPDF({ putOnlyUsedFonts: true });
  const aliases = await loader.prepareEadCertificateFonts(pdf, root);
  assert.deepEqual(io.requests, weights);
  assert.deepEqual(io.added.map(face => [face.family, face.weight, face.style]),
    weights.map(weight => [loader.EAD_INTER_FAMILY, weight, 'normal']));
  assert.equal(root.style.fontFamily, `'${loader.EAD_INTER_FAMILY}', sans-serif`);
  assert.equal(child.style.fontFamily, `'${loader.EAD_INTER_FAMILY}', serif`);
  assert.equal(other.style.fontFamily, 'Arial, sans-serif');
  for (const weight of weights) {
    const alias = `EadInter${weight}`;
    assert.equal(aliases[`${loader.EAD_INTER_FAMILY}:${weight}`], alias);
    assert.ok(pdf.getFontList()[alias].includes('normal'));
    assert.deepEqual(Buffer.from(pdf.getFileFromVFS(`${alias}.ttf`), 'base64'), assets.get(weight));
    assert.equal(io.faces.find(face => face.weight === weight).source, fonts[weight].buffer);
    assert.deepEqual(Buffer.from(fonts[weight].buffer), assets.get(weight), 'FontFace/jsPDF must not consume cached bytes.');
    pdf.setFont(alias, 'normal');
    pdf.text(`Identificação áçõ — Inter ${weight}`, 10, 20 + weights.indexOf(weight) * 10);
  }
  const document = await PDFDocument.load(pdf.output('arraybuffer'));
  const resources = document.getPages()[0].node.Resources().lookup(PDFName.of('Font'), PDFDict);
  const embedded = new Set();
  for (const [, reference] of resources.entries()) {
    const font = document.context.lookup(reference, PDFDict);
    const name = String(font.get(PDFName.of('BaseFont'))).slice(1);
    if (!name.startsWith('EadInter')) continue;
    const descendant = font.lookup(PDFName.of('DescendantFonts')).lookup(0, PDFDict);
    const descriptor = descendant.lookup(PDFName.of('FontDescriptor'), PDFDict);
    const stream = descriptor.lookup(PDFName.of('FontFile2'), PDFRawStream);
    assert.ok(decodePDFRawStream(stream).decode().length > 0);
    assert.ok(font.has(PDFName.of('ToUnicode')), `${name} must retain selectable Unicode text.`);
    embedded.add(name);
  }
  assert.deepEqual(embedded, new Set(weights.map(weight => `EadInter${weight}`)));
  await loader.prepareEadCertificateFonts(new jsPDF(), root);
  assert.deepEqual(io.requests, weights, 'A second PDF must reuse font data.');
});

for (const failure of ['network', 'http', 'empty']) {
  test(`font ${failure} failure permits a new fetch and DOM load on retry`, async t => {
    const loader = await freshLoader();
    let failed = false;
    const io = installEnvironment(t, weight => {
      if (weight === 400 && !failed) { failed = true; return failure; }
      return null;
    });
    await assert.rejects(loader.loadEadCertificateFontFaces());
    await loader.loadEadCertificateFontFaces();
    assert.deepEqual(io.requests, [...weights, ...weights]);
    assert.equal(io.added.length, 4);
  });
}

for (const family of [undefined, 'Inter']) {
  test(`nonempty HTTP 200 font parse failure refetches on retry for ${family || 'the default family'}`, async t => {
    const loader = await freshLoader();
    let failed = false;
    const io = installEnvironment(t, weight => {
      if (weight === 400 && !failed) { failed = true; return 'invalid'; }
      return null;
    });
    await assert.rejects(loader.loadEadCertificateFontFaces(family), /Invalid TrueType font/);
    await loader.loadEadCertificateFontFaces(family);
    assert.deepEqual(io.requests, [...weights, ...weights]);
    const fonts = await loader.loadInterFontData();
    for (const weight of weights) {
      assert.deepEqual(Buffer.from(fonts[weight].buffer), assets.get(weight));
    }
  });
}
