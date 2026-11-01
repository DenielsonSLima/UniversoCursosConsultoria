import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const jsdomPath = process.env.LGPD_JSDOM_PATH;
const { JSDOM } = await import(jsdomPath
  ? pathToFileURL(resolve(jsdomPath, 'lib/api.js')).href : 'jsdom');
const directory = fileURLToPath(new URL('./', import.meta.url));
const { outputFiles } = await build({
  entryPoints: [resolve(directory, 'MediaMessageActions.tsx')],
  bundle: true, format: 'cjs', platform: 'node', write: false, packages: 'external',
  plugins: [{ name: 'isolated-media-services', setup(builder) {
    builder.onResolve({ filter: /^\.\.\/whatsapp\.service$/ }, () => ({ path: 'download', namespace: 'privacy-test' }));
    builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'privacy-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'privacy-test' }, ({ path }) => ({
      contents: path === 'download'
        ? 'export const whatsappService = { downloadMessageMedia: (...args) => globalThis.__lgpdMedia.download(...args) };'
        : 'export const supabase = { functions: { invoke: (...args) => globalThis.__lgpdMedia.invoke(...args) } };',
    }));
  } }],
});
const compiled = { exports: {} };
new Function('require', 'module', 'exports', outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
const MediaMessageActions = compiled.exports.default;
const message = {
  id: 'synthetic-message', message_type: 'audio', conteudo: '[áudio]',
  raw_payload: { audio: { id: 'synthetic-media', mime_type: 'audio/ogg' } },
};

test('transcrição exige confirmar aviso, não envia ao cancelar e texto não persiste nem vira HTML', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://synthetic.invalid' });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  dom.window.IntersectionObserver = class { observe() {} disconnect() {} };
  const calls = [];
  let downloads = 0;
  let response = { data: { ok: true, transcription: '<img src=x onerror="synthetic()">' }, error: null };
  globalThis.__lgpdMedia = {
    invoke: (...args) => { calls.push(args); return Promise.resolve(response); },
    download: () => { downloads++; throw new Error('download inesperado no teste de aviso'); },
  };
  const container = dom.window.document.getElementById('root');
  let root = createRoot(container);
  const button = label => [...container.querySelectorAll('button')].find(item => item.textContent.trim() === label);
  const click = async label => {
    const element = button(label);
    assert.ok(element, `Botão ${label} ausente`);
    await act(async () => { element.click(); });
  };
  try {
    await act(async () => root.render(React.createElement(MediaMessageActions, { message, outgoing: false })));
    assert.equal(calls.length, 0);
    await click('Transcrever');
    assert.match(container.textContent, /áudio completo será enviado à OpenAI/);
    assert.equal(calls.length, 0);
    assert.equal(downloads, 0);
    await click('Cancelar');
    assert.equal(container.querySelector('[aria-label="Envio de áudio para transcrição"]'), null);
    assert.equal(calls.length, 0);
    await click('Transcrever');
    await click('Enviar áudio para transcrição');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], ['whatsapp-media', { body: {
      action: 'transcribe', messageId: 'synthetic-message',
      noticeAccepted: true, noticeVersion: 'whatsapp-transcription-privacy-v1',
    } }]);
    assert.match(container.textContent, /<img src=x onerror="synthetic\(\)">/);
    assert.equal(container.querySelector('img'), null, 'retorno do fornecedor não pode criar HTML');
    assert.equal(dom.window.localStorage.length, 0);
    assert.equal(dom.window.sessionStorage.length, 0);

    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(React.createElement(MediaMessageActions, { message, outgoing: false })));
    assert.doesNotMatch(container.textContent, /<img/);
    response = { data: null, error: { context: Response.json({
      code: 'transcription_disabled', error: 'synthetic-private-provider-detail',
    }, { status: 403 }) } };
    await click('Transcrever');
    await click('Enviar áudio para transcrição');
    assert.match(container.textContent, /desativada pela instituição/);
    assert.doesNotMatch(container.textContent, /private-provider-detail/);
    assert.equal(calls.length, 2);
    assert.equal(downloads, 0);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.__lgpdMedia;
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
