import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';

const base = fileURLToPath(new URL('../../../', import.meta.url));
const jsdom = process.env.EAD_TEST_JSDOM_MODULE || process.env.NFSE_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdom ? pathToFileURL(resolve(jsdom)).href : 'jsdom');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('EAD certificate delivery rechecks identity and deadline before using any cached PDF', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/ead-certificate-delivery-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  const previous = new Map();
  for (const key of ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true,
      value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  }
  const realNow = Date.now, createUrl = URL.createObjectURL, revokeUrl = URL.revokeObjectURL;
  let now = Date.parse('2026-11-12T12:00:00Z'); Date.now = () => now;
  const timers = new Map(); let sequence = 0;
  window.setTimeout = (callback, delay = 0) => { const id = ++sequence; timers.set(id, { at: now + Number(delay), callback }); return id; };
  window.clearTimeout = id => timers.delete(id);
  const urls = [], revoked = [], deliveries = [], reads = [], filters = [], channels = [];
  URL.createObjectURL = blob => { const url = `blob:synthetic-${urls.length}`; urls.push({ url, blob }); return url; };
  URL.revokeObjectURL = url => revoked.push(url);
  const a = { id: 'certificate-a', codigo_validacao: 'CODE-A' }, b = { id: 'certificate-b', codigo_validacao: 'CODE-B' };
  const records = { [a.id]: a, [b.id]: b };
  let response = { allowed: true, deadline: new Date(now + 60_000).toISOString(), state: 'TEMPORARY', code: a.codigo_validacao };
  let wait = null;
  globalThis.__eadDelivery = {
    rpc(name, payload) {
      assert.equal(name, 'ead_get_certificate_delivery_state'); reads.push(payload.p_certificado_id);
      const request = wait ? wait.promise : Promise.resolve({ data: response, error: null });
      request.abortSignal = () => request; return request;
    },
    from(table) {
      assert.equal(table, 'certificados_academicos');
      const current = {}; filters.push(current);
      return { select() { return this; }, eq(key, value) { current[key] = value; return this; }, not() { return this; },
        order() { return this; }, limit() { return this; }, maybeSingle: async () => ({ data: records[current.id] || null, error: null }) };
    },
    channel(name) {
      const channel = { name, handlers: [], removed: false,
        on(_kind, filter, callback) { this.handlers.push({ filter, callback }); return this; },
        subscribe(callback) { this.status = callback; return this; } };
      channels.push(channel); return channel;
    }, removeChannel(channel) { channel.removed = true; },
  };
  globalThis.__eadDeliveries = deliveries;
  let root, client;
  try {
    const outfile = resolve(temp, 'delivery.mjs');
    const compiled = await build({ stdin: { resolveDir: base, contents: `
      export {useEadCertificateDelivery} from './modules/aluno/cursos/hooks/useEadCertificateDelivery';
      export {useAlunoEadCertificate} from './modules/aluno/cursos/hooks/useAlunoEadCertificate';
      export {useEadCertificatePdf} from './modules/gestor/secretaria/certificados/useEadCertificatePdf';
      export {getAlunoEadCertificate} from './modules/aluno/cursos/ead-certificate.service';
      export {parseEadCertificateDeliveryState} from './modules/aluno/cursos/ead-certificate-delivery.service';` },
      bundle: true, write: false, outfile, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
      loader: { '.css': 'empty' }, plugins: [{ name: 'isolated-delivery-boundaries', setup(builder) {
        for (const [filter, path] of [[/lib\/supabase$/, 'rpc'], [/components\/CertificadoPreview$/, 'preview'],
          [/ead-certificate-pdf$/, 'pdf'], [/download-pdf-blob$/, 'download'], [/pdf-blob-print$/, 'print']]) {
          builder.onResolve({ filter }, () => ({ path, namespace: 'fixture' }));
        }
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', resolveDir: base, contents: {
          rpc: 'export const supabase=globalThis.__eadDelivery;',
          preview: 'import React from "react";export default()=>React.createElement("div",null,"synthetic native PDF source");',
          pdf: 'export const buildEadCertificatePdf=async()=>new Blob(["synthetic PDF"]);',
          download: 'export const downloadPdfBlob=(blob,name)=>globalThis.__eadDeliveries.push({kind:"download",blob,name});',
          print: 'export const printPdfBlob=async blob=>globalThis.__eadDeliveries.push({kind:"print",blob});',
        }[args.path] }));
      } }] });
    await writeFile(outfile, compiled.outputFiles[0].contents);
    const { useEadCertificateDelivery, useAlunoEadCertificate, useEadCertificatePdf, getAlunoEadCertificate, parseEadCertificateDeliveryState } = await import(pathToFileURL(outfile).href);
    const { createRoot } = await import('react-dom/client');
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
    const model = { id: 'model-synthetic' }; let view;
    function Harness({ certificate, enabled = true }) {
      const identity = useAlunoEadCertificate('student-synthetic', 'course-synthetic', certificate.id, enabled);
      const delivery = useEadCertificateDelivery('student-synthetic', identity.data?.id, identity.data?.codigo_validacao, enabled);
      const pdf = useEadCertificatePdf(identity.data || null, model, delivery.allowed);
      view = { delivery, pdf };
      return React.createElement('div', null, pdf.source, React.createElement('output', null, pdf.url));
    }
    root = createRoot(document.getElementById('root'));
    const settle = async (ms = 30) => act(async () => { await new Promise(done => setTimeout(done, ms)); });
    const render = async certificate => { await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Harness, { certificate })))); await settle(); await settle(); };
    const runTimers = async () => act(async () => { for (const [id, timer] of [...timers]) if (timer.at <= now + 1) { timers.delete(id); timer.callback(); } });
    const deliver = async kind => {
      const captured = view;
      let allowed;
      await act(async () => { allowed = await captured.delivery.authorizeFresh();
        if (allowed) { if (kind === 'print') await captured.pdf.print(); else captured.pdf.download(); } });
      await settle(); return allowed;
    };
    await render(a); assert.equal(view.delivery.allowed, true); assert.equal(view.pdf.ready, true);
    const initialUrl = view.pdf.url; let before = reads.length;
    assert.equal(await deliver('download'), true); assert(reads.length > before); assert.equal(deliveries.length, 1);
    assert.equal(await deliver('print'), true); assert.equal(deliveries.length, 2);
    const preClickRead = deferred(); const staleAllowed = response; wait = preClickRead;
    await act(async () => channels.at(-1).status('SUBSCRIBED')); await settle(300);
    wait = null; before = reads.length;
    response = { allowed: false, deadline: null, state: 'REVOKED', code: a.codigo_validacao };
    assert.equal(await deliver('download'), false); assert.equal(deliveries.length, 2);
    assert(reads.length > before, 'A click starts a new canonical read instead of joining a pre-click background request');
    await act(async () => preClickRead.resolve({ data: staleAllowed, error: null })); await settle();
    assert.equal(view.delivery.allowed, false, 'A discarded pre-click allowed response cannot override revocation');
    assert.equal(view.pdf.blob, null); assert.equal(view.pdf.url, ''); assert(revoked.includes(initialUrl));
    response = { allowed: true, deadline: new Date(now + 1000).toISOString(), state: 'TEMPORARY', code: a.codigo_validacao };
    await act(async () => window.dispatchEvent(new dom.window.Event('focus'))); await settle(300); await settle();
    assert.equal(view.pdf.ready, true); const temporaryUrl = view.pdf.url;
    now += 1000; await runTimers(); await settle();
    assert.equal(view.delivery.allowed, false); assert.equal(view.pdf.blob, null); assert(revoked.includes(temporaryUrl));
    assert.equal(await deliver('print'), false); assert.equal(deliveries.length, 2);
    response = { allowed: true, deadline: null, state: 'DEFINITIVE', code: a.codigo_validacao };
    await act(async () => channels.at(-1).status('SUBSCRIBED')); await settle(300); await settle(); assert.equal(view.pdf.ready, true);
    response = { ...response, code: 'REPLACED-CODE' };
    assert.equal(await deliver('download'), false); assert.equal(view.pdf.blob, null); assert.equal(deliveries.length, 2);
    records[a.id] = { ...a, codigo_validacao: 'REPLACED-CODE' };
    await act(async () => channels.findLast(channel => channel.name === `aluno_certificate_identity_student-synthetic_${a.id}`)
      .handlers[0].callback({ new: records[a.id] }));
    await settle(300); await settle(); await settle();
    assert.equal(view.delivery.allowed, true, 'A reissued certificate with the same ID learns its new validation code through canonical identity refresh');
    assert.equal(view.pdf.ready, true);
    records[a.id] = a;
    response = { allowed: true, deadline: null, state: 'DEFINITIVE', code: a.codigo_validacao };
    await act(async () => window.dispatchEvent(new dom.window.Event('focus'))); await settle(300); await settle();
    wait = deferred(); const captured = view;
    let first, second; before = reads.length;
    await act(async () => { first = captured.delivery.authorizeFresh(); second = captured.delivery.authorizeFresh(); });
    assert.equal(reads.length, before + 1, 'Concurrent checks share one canonical read');
    const late = wait; wait = null; response = { allowed: true, deadline: null, state: 'DEFINITIVE', code: b.codigo_validacao };
    await render(b);
    await act(async () => late.resolve({ data: { allowed: true, deadline: null, state: 'DEFINITIVE', code: a.codigo_validacao }, error: null }));
    assert.equal(await first, false); assert.equal(await second, false, 'Old certificate responses cannot authorize the new certificate');
    assert.equal(view.delivery.allowed, true); assert.equal(deliveries.length, 2);
    wait = deferred();
    const expiredReply = wait;
    const expiredDeadline = new Date(now + 1000).toISOString();
    const latestChannel = channels.at(-1);
    await act(async () => latestChannel.status('SUBSCRIBED')); await settle(300);
    now += 1001;
    wait = null;
    await act(async () => expiredReply.resolve({ data: { allowed: true, deadline: expiredDeadline, state: 'TEMPORARY', code: b.codigo_validacao }, error: null }));
    await settle();
    assert.equal(view.delivery.allowed, false, 'A temporary response arriving after its deadline cannot enable the cached PDF preview');
    assert.equal(view.pdf.blob, null); assert.equal(view.pdf.url, '');
    assert.equal(deliveries.length, 2, 'No print or download is needed to enforce a late response deadline');
    await getAlunoEadCertificate('student-synthetic', 'course-synthetic', b.id);
    assert.deepEqual(filters.at(-1), { aluno_id: 'student-synthetic', curso_id: 'course-synthetic', id: b.id, modalidade: 'EAD', status: 'FINALIZADO' });
    assert.equal(await getAlunoEadCertificate('student-synthetic', 'course-synthetic', ''), null);
    for (const invalid of [null, { allowed: true, state: 'TEMPORARY', deadline: null, code: 'x' },
      { allowed: true, state: 'REVOKED', deadline: null, code: 'x' }, { allowed: true, state: 'DEFINITIVE', deadline: 'invalid', code: 'x' }]) {
      assert.throws(() => parseEadCertificateDeliveryState(invalid));
    }
    const channel = channels.at(-1); before = reads.length;
    await act(async () => root.unmount()); root = null;
    channel.status('SUBSCRIBED'); channel.handlers.forEach(item => item.callback({ new: {} }));
    window.dispatchEvent(new dom.window.Event('focus')); await settle(300);
    assert.equal(reads.length, before); assert.equal(channel.removed, true); assert.equal(timers.size, 0);
  } finally {
    if (root) await act(async () => root.unmount()); client?.clear();
    Date.now = realNow; URL.createObjectURL = createUrl; URL.revokeObjectURL = revokeUrl; dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    delete globalThis.__eadDelivery; delete globalThis.__eadDeliveries;
    await rm(temp, { recursive: true, force: true });
  }
});
