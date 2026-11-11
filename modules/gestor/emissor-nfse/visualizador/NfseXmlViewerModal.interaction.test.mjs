import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';

const jsdomPath = process.env.NFSE_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath)).href : 'jsdom');
const base = fileURLToPath(new URL('../../../../', import.meta.url));

test('issued preview keeps download, print and close in its header without a redundant toolbar', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-viewer-toolbar-'));
  const dom = new JSDOM('<!doctype html><div id="root"><button id="opener">Abrir nota</button></div>', {
    url: 'http://localhost/', pretendToBeVisual: true,
  });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { createRoot } = await import('react-dom/client');
  const output = resolve(temp, 'test.mjs');
  const fixture = {
    scope: { contextKey: 'synthetic-context', poloId: 'synthetic-polo', environment: 'PRODUCAO', month: '2026-11' },
    query: { data: undefined, error: null, isFetching: true },
    downloads: [], prints: [], closed: 0, prepares: 0,
  };
  globalThis.__nfseViewerFixture = fixture;
  const compiled = await build({
    entryPoints: [resolve(base, 'modules/gestor/emissor-nfse/visualizador/NfseXmlViewerModal.tsx')],
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external',
    jsx: 'automatic', outfile: output, loader: { '.css': 'empty' },
    plugins: [{ name: 'viewer-isolated-fixture', setup(builder) {
      builder.onResolve({ filter: /NfseTabContext$/ }, () => ({ path: 'context', namespace: 'fixture' }));
      builder.onResolve({ filter: /useNfseIssuedXml$/ }, () => ({ path: 'query', namespace: 'fixture' }));
      builder.onResolve({ filter: /nfse-issued-pdf\.service$/ }, () => ({ path: 'pdf', namespace: 'fixture' }));
      builder.onResolve({ filter: /download-pdf-blob$/ }, () => ({ path: 'download', namespace: 'fixture' }));
      builder.onResolve({ filter: /pdf-blob-print$/ }, () => ({ path: 'print', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
        contents: ({
          context: 'export const useNfseTabContext=()=>({scope:globalThis.__nfseViewerFixture.scope});',
          query: 'export const useNfseIssuedXml=()=>globalThis.__nfseViewerFixture.query;',
          pdf: 'export const prepareIssuedDanfsePdf=async()=>{globalThis.__nfseViewerFixture.prepares++;return new Blob(["synthetic PDF"],{type:"application/pdf"});};',
          download: 'export const downloadPdfBlob=(...args)=>globalThis.__nfseViewerFixture.downloads.push(args);',
          print: 'export const printPdfBlob=(...args)=>{const f=globalThis.__nfseViewerFixture;f.prints.push(args);return new Promise(resolve=>{f.finishPrint=resolve;});};',
        })[args.path],
        loader: 'js',
      }));
    } }],
  });
  await writeFile(output, compiled.outputFiles[0].contents);
  const { default: Modal } = await import(pathToFileURL(output).href);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const opener = document.getElementById('opener');
  opener.focus();
  const note = { id: 'synthetic-note', number: '3', studentName: 'PARCEIRO SINTÉTICO' };
  const render = () => act(async () => root.render(React.createElement(Modal, {
    document: note, onClose: () => { fixture.closed++; },
  })));
  const settle = () => act(async () => { await setTimeout(30); });
  const button = label => [...document.querySelectorAll('.nfse-xml-dialog button')]
    .find(item => item.textContent.trim() === label || item.getAttribute('aria-label') === label);
  const click = item => act(async () => item.click());

  try {
    await render(); await settle();
    const header = document.querySelector('.nfse-xml-heading');
    assert(header.querySelector('h2').textContent.includes('NFS-e 3'));
    assert.equal(document.querySelector('.nfse-xml-toolbar'), null);
    assert(!document.querySelector('.nfse-xml-dialog').textContent.includes('DANFSe da nota emitida'));
    for (const label of ['Baixar PDF', 'Imprimir', 'Fechar visualizador']) assert(header.contains(button(label)));
    assert.equal(button('Baixar PDF').disabled, true);
    assert.equal(button('Imprimir').disabled, true);
    assert.equal(document.activeElement, button('Fechar visualizador'));

    fixture.query = { data: { number: '3', accessKey: '3'.repeat(50) }, error: null, isFetching: false };
    await render(); await settle();
    assert.equal(button('Baixar PDF').disabled, false);
    assert.equal(button('Imprimir').disabled, false);
    assert(document.querySelector('iframe[title="DANFSe 3"]').src.startsWith('blob:'));
    await click(button('Baixar PDF')); await click(button('Baixar PDF'));
    assert.equal(fixture.downloads.length, 2);
    assert.equal(fixture.downloads[0][1], `DANFSe-${'3'.repeat(50)}.pdf`);
    await click(button('Imprimir')); await click(button('Imprimir'));
    assert.equal(fixture.prints.length, 1, 'Repeated print is disabled while opening');
    assert.equal(button('Imprimir').disabled, true);
    await act(async () => fixture.finishPrint()); await settle();
    assert.equal(button('Imprimir').disabled, false);

    fixture.query = { ...fixture.query, isFetching: true };
    await render(); await settle();
    assert.equal(button('Baixar PDF').disabled, true);
    assert.equal(button('Imprimir').disabled, true);
    fixture.query = { data: undefined, error: new Error('Falha sintética'), isFetching: false };
    await render(); await settle();
    assert(document.querySelector('[role="alert"]').textContent.includes('Falha sintética'));
    assert.equal(document.querySelector('iframe'), null);
    assert.equal(button('Baixar PDF').disabled, true);
    assert.equal(button('Imprimir').disabled, true);

    await click(button('Fechar visualizador'));
    assert.equal(fixture.closed, 1);
    await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(fixture.closed, 2);
    await click(document.querySelector('.nfse-xml-dialog'));
    assert.equal(fixture.closed, 2);
    await act(async () => document.querySelector('.nfse-xml-overlay')
      .dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true })));
    assert.equal(fixture.closed, 3);

    await act(async () => root.render(null));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.body.style.overflow, '');
    assert.equal(document.activeElement, opener);
    assert.equal(opener.closest('#root').getAttribute('aria-hidden'), null);
    fixture.query = { data: { number: '3', accessKey: '3'.repeat(50) }, error: null, isFetching: false };
    await render(); await settle();
    assert.equal(document.querySelectorAll('[role="dialog"]').length, 1);
    await click(button('Imprimir'));
    const signal = fixture.prints.at(-1)[1].signal;
    await act(async () => root.render(null));
    assert.equal(signal.aborted, true);
    await act(async () => fixture.finishPrint());
    assert.equal(fixture.prepares, 2);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.__nfseViewerFixture;
    await rm(temp, { recursive: true, force: true });
  }
});
