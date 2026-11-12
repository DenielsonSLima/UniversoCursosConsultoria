import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import { build } from 'esbuild';
import React, { act, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const jsdomPath = process.env.NFSE_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath)).href : 'jsdom');
const base = fileURLToPath(new URL('../../../../', import.meta.url));
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope = { contextKey: id(1), poloId: id(2), environment: 'PRODUCAO', month: '2026-11' };
const attempt = { requestId: id(3), previewId: id(4) };
const pending = { previewId: id(4), state: 'AWAITING_CONFIRMATION', payload: {}, number: null, accessKey: null, message: 'Aguardando.' };
const authorized = { ...pending, state: 'AUTHORIZED', number: '1', accessKey: '1'.repeat(50), message: 'Autorizada.' };
const analysis = { previewId: id(4), cancelPreviewId: id(5), state: 'AWAITING_ANALYSIS', payload: {}, message: 'Em análise.' };
const cancelled = { ...analysis, state: 'CANCELLED', message: 'Cancelada.' };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('individual snapshots coalesce Realtime, perform trailing reads, preserve scoped terminal cache and never resend', async () => {
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-observation-ui-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const bundle = resolve(temp, 'test.mjs');
  const compiled = await build({ entryPoints: [resolve(base, 'modules/gestor/emissor-nfse/emissao/useNfseIndividualObservation.ts')],
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', external: ['react'], jsx: 'automatic', outfile: bundle,
    plugins: [{ name: 'realtime-event-fixture', setup(builder) {
      builder.onResolve({ filter: /useNfseBatchRealtime$/ }, () => ({ path: 'events', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: `
        import {useEffect} from 'react';
        export function useNfseOperationRealtime(scope,changed,enabled){useEffect(()=>{
          if(!enabled)return;globalThis.__individualEvent=changed;
          return()=>{if(globalThis.__individualEvent===changed)delete globalThis.__individualEvent;};
        },[scope.contextKey,scope.poloId,scope.environment,scope.month,changed,enabled]);}
      ` }));
    } }] });
  await writeFile(bundle, compiled.outputFiles[0].contents);
  const { useNfseIndividualObservation, nfseIndividualObservationKey } = await import(pathToFileURL(bundle).href);
  const { createRoot } = await import('react-dom/client');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const root = createRoot(document.getElementById('root'));
  const timeouts = [], changes = [];
  const normalTimeout = dom.window.setTimeout.bind(dom.window), realNow = Date.now;
  dom.window.setTimeout = (fn, delay, ...args) => {
    timeouts.push({ fn, delay });
    return normalTimeout(fn, delay >= 3000 ? 300_000 : delay, ...args);
  };
  let reads = 0, cancelReads = 0, nextIssue = authorized, first = deferred();
  const forbidden = () => { assert.fail('Snapshots must never call a fiscal command or fiscal reconciliation.'); };
  const service = { issue: forbidden, cancel: forbidden, retryCancellation: forbidden, reconcile: forbidden, reconcileCancellation: forbidden,
    observe: async () => { reads++; return reads === 1 ? first.promise : nextIssue; },
    observeCancellation: async () => { cancelReads++; return cancelled; } };
  function Probe({ initialIssue = pending, initialCancel, currentScope = scope, currentAttempt = attempt, currentService = service, paused = false }) {
    const [issue, setIssue] = useState(initialIssue), [cancellation, setCancellation] = useState(initialCancel);
    useNfseIndividualObservation({ scope: currentScope, attempt: currentAttempt, service: currentService, paused, issue, cancellation,
      onIssue: value => { changes.push(value.state); setIssue(value); void client.invalidateQueries({ queryKey: ['nfse'] }); },
      onCancellation: value => { changes.push(value.state); setCancellation(value); } });
    return React.createElement('output', null, `${issue?.state ?? ''}/${cancellation?.state ?? ''}`);
  }
  const render = props => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Probe, props)));
  const settle = async (ms = 20) => act(async () => { await wait(ms); });
  const event = async () => { await act(async () => globalThis.__individualEvent(true)); await settle(); };
  try {
    await act(async () => render({}));
    const frozenTime = realNow(); Date.now = () => frozenTime;
    await event(); assert.equal(reads, 1);
    await event(); await event(); assert.equal(reads, 1, 'Only one snapshot read can be in flight.');
    await act(async () => first.resolve(pending)); await settle(40);
    assert.equal(reads, 2, 'An event after the first database snapshot requires one trailing read.');
    assert.equal(document.querySelector('output').textContent, 'AUTHORIZED/');
    Date.now = realNow;
    const issueKey = nfseIndividualObservationKey(scope, attempt, 'issue');
    assert.deepEqual(issueKey.slice(0, 6), ['nfse', 'v1', scope.contextKey, scope.poloId, scope.environment, scope.month]);
    assert.equal(client.getQueryData(issueKey).state, 'AUTHORIZED');
    await settle(); assert.equal(reads, 2, 'Invalidating the parent scope must not create a snapshot loop.');
    nextIssue = pending;
    await event(); assert.equal(reads, 3);
    assert.equal(document.querySelector('output').textContent, 'AUTHORIZED/', 'A late pending result cannot downgrade terminal state.');
    assert.equal(client.getQueryData(issueKey).state, 'AUTHORIZED');

    let cancelFirst = deferred();
    const cancellationService = { ...service, observe: async () => authorized,
      observeCancellation: async () => { cancelReads++; return cancelReads === 1 ? cancelFirst.promise : cancelled; } };
    const cancelAttempt = { ...attempt, requestId: id(6), cancelPreviewId: id(5) };
    await act(async () => render({ key: 'analysis', initialIssue: authorized, initialCancel: analysis, currentAttempt: cancelAttempt, currentService: cancellationService }));
    await event(); await event(); assert.equal(cancelReads, 1);
    await act(async () => cancelFirst.resolve(analysis)); await settle(40);
    assert.equal(cancelReads, 2); assert.equal(document.querySelector('output').textContent, 'AUTHORIZED/CANCELLED');
    assert.equal(client.getQueryData(nfseIndividualObservationKey(scope, cancelAttempt, 'cancel')).state, 'CANCELLED');

    const otherScope = { ...scope, contextKey: id(10), poloId: id(11) };
    let hidden = true;
    Object.defineProperty(dom.window.document, 'hidden', { configurable: true, get: () => hidden });
    await act(async () => render({ key: 'other-scope', currentScope: otherScope }));
    assert.equal(document.querySelector('output').textContent, 'AWAITING_CONFIRMATION/', 'Another context must not inherit the prior terminal snapshot.');
    assert.equal(client.getQueryData(nfseIndividualObservationKey(otherScope, attempt, 'issue')), undefined);
    const beforeVisible = reads;
    await event(); assert.equal(reads, beforeVisible, 'Hidden tabs keep the event queued.');
    hidden = false;
    await act(async () => dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'))); await settle();
    assert.equal(reads, beforeVisible + 1, 'Returning to a visible tab recovers the queued snapshot immediately.');

    let deniedReads = 0;
    const denied = { ...service, observe: async () => { deniedReads++; throw Object.assign(new Error('Denied'), { status: 403 }); } };
    await act(async () => render({ key: 'denied', currentAttempt: { ...attempt, requestId: id(12) }, currentService: denied }));
    await event(); await event(); await event();
    for (const { fn } of timeouts.filter(value => value.delay === 3000).slice(-2)) { await act(async () => fn()); await settle(); }
    assert.equal(deniedReads, 1, 'Denied access pauses observations until a new context/lifecycle.');

    let limitedReads = 0;
    const limited = { ...service, observe: async () => { limitedReads++; if (limitedReads === 1) throw Object.assign(new Error('Limited'), { status: 429, retryAfterMs: 60_000 }); return authorized; } };
    await act(async () => render({ key: 'limited', currentAttempt: { ...attempt, requestId: id(13) }, currentService: limited }));
    await event(); await event();
    dom.window.dispatchEvent(new dom.window.Event('focus')); dom.window.dispatchEvent(new dom.window.Event('online'));
    await event(); assert.equal(limitedReads, 1, 'Events, focus and reconnect must honor Retry-After.');
    assert(timeouts.some(value => value.delay >= 59_000 && value.delay <= 60_000));
    Date.now = () => realNow() + 61_000;
    await event(); assert.equal(limitedReads, 2);
    assert.equal(document.querySelector('output').textContent, 'AUTHORIZED/');
    Date.now = realNow;

    const late = deferred(); let lateReads = 0;
    const lateService = { ...service, observe: async () => { lateReads++; return late.promise; } };
    await act(async () => render({ key: 'unmount', currentAttempt: { ...attempt, requestId: id(14) }, currentService: lateService }));
    await event(); assert.equal(lateReads, 1);
    const before = changes.length;
    await act(async () => root.unmount());
    await act(async () => late.resolve(authorized)); await settle();
    assert.equal(changes.length, before, 'Unmounted observers never apply late results or schedule trailing reads.');
  } finally {
    Date.now = realNow; client.clear(); dom.window.setTimeout = normalTimeout;
    dom.window.close(); delete globalThis.__individualEvent; await rm(temp, { recursive: true, force: true });
  }
});
