import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
const jsdomPath = process.env.NFSE_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath)).href : 'jsdom');
const base = fileURLToPath(new URL('../../../../', import.meta.url));

test('24-hour internal guidance preserves cancellation confirmation and fiscal gates', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-cancellation-guidance-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const bundle = resolve(temp, 'test.mjs');
  const compiled = await build({
    entryPoints: [resolve(base, 'modules/gestor/emissor-nfse/individual/NfseIndividualCancellation.tsx')],
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: bundle,
    plugins: [{ name: 'no-live-cancellation-models', setup(builder) {
      builder.onResolve({ filter: /NfseCancellationTemplatePicker$/ }, () => ({ path: 'picker', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export default function Picker(){return null;}', loader: 'js' }));
    } }],
  });
  await writeFile(bundle, compiled.outputFiles[0].contents);
  const Component = (await import(pathToFileURL(bundle).href)).default;
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  let requested = 0, reviewed = 0;
  const payload = { number: '123', accessKey: '1'.repeat(50), reasonCode: '1', justification: 'Erro sintético para teste local.' };
  const preview = { previewId: 'synthetic', cancelPreviewId: 'synthetic-cancel', state: 'PREVIEWED',
    expiresAt: '2099-01-01T00:00:00Z', payload, capability: { available: true, reason: null } };
  const defaults = { busy: false, sent: false, expired: false, justification: payload.justification, confirmed: false,
    onJustification() {}, onConfirm() {}, onPrepare() { reviewed += 1; }, onCancel() { requested += 1; } };
  const render = async overrides => act(async () => root.render(React.createElement(Component, { ...defaults, ...overrides })));
  const button = text => [...document.querySelectorAll('button')].find(item => item.textContent === text);
  const cancel = () => button('Cancelar esta NFS-e em produção');
  try {
    await render({});
    assert.match(document.body.textContent, /Referência interna: solicitar cancelamento em até 24 horas da emissão/);
    assert.match(document.body.textContent, /Após esse período, a solicitação continua disponível e será validada pelo emissor/);
    assert.equal(cancel(), undefined, 'Guidance must not bypass the review step');
    await act(async () => button('Revisar cancelamento').click());
    assert.equal(reviewed, 1);
    assert.equal(requested, 0);

    await render({ preview });
    assert.equal(cancel().disabled, true, 'User confirmation remains mandatory');
    await render({ preview, confirmed: true });
    assert.equal(cancel().disabled, false, 'Guidance adds no new time-based block');
    await act(async () => cancel().click());
    assert.equal(requested, 1, 'Only the synthetic callback runs on a confirmed click');

    for (const overrides of [{ busy: true }, { sent: true }, { expired: true },
      { preview: { ...preview, capability: { available: false, reason: 'PRODUCTION_EVENT_JSON_CONTRACT_UNVERIFIED' } } }]) {
      await render({ preview, confirmed: true, ...overrides });
      assert.equal(cancel().disabled, true, 'Existing safety gates stay intact');
      await act(async () => cancel().click());
    }
    assert.equal(requested, 1);
    await render({ result: { state: 'CANCELLED', payload, message: 'Cancelamento sintético confirmado.' } });
    assert.equal(cancel(), undefined, 'Confirmed cancellations are read-only');
    assert(!document.body.textContent.includes('24 horas'), 'Completed cancellations need no deadline prompt');
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    await rm(temp, { recursive: true, force: true });
  }
});
