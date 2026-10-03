import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const jsdomPath = process.env.RENEGOCIACAO_JSDOM_PATH;
if (!jsdomPath) throw new Error('Defina RENEGOCIACAO_JSDOM_PATH para jsdom@26.1.0.');
assert.equal(require(join(jsdomPath, 'package.json')).version, '26.1.0');
const { JSDOM } = require(jsdomPath);
const directory = await mkdtemp(join(tmpdir(), 'universo-floating-summary-'));
const bundlePath = join(directory, 'floating-summary.cjs');
after(async () => { await rm(directory, { recursive: true, force: true }); });

await build({
  stdin: {
    contents: String.raw`
      import React, { act } from 'react';
      import { createRoot } from 'react-dom/client';
      import FloatingSelectionSummary from './FloatingSelectionSummary.tsx';
      export async function mount(container, initialProps) {
        const root = createRoot(container);
        const render = async (props) => { await act(async () => {
          root.render(<div id="clipped" style={{ overflow: 'hidden' }}>
            <div id="scroller" style={{ overflow: 'auto' }}><FloatingSelectionSummary {...props} /></div>
          </div>);
        }); };
        await render(initialProps);
        return { render, unmount: async () => { await act(async () => { root.unmount(); }); } };
      }
      export async function interact(fn) { await act(async () => { fn(); }); }
    `,
    loader: 'tsx', resolveDir: fileURLToPath(new URL('.', import.meta.url)), sourcefile: 'floating-summary.fixture.tsx',
  },
  outfile: bundlePath, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
  define: { 'process.env.NODE_ENV': '"test"' },
  plugins: [{ name: 'summary-hook-fixture', setup(api) {
    api.onResolve({ filter: /useRenegociacaoSelectionSummary$/ }, () => ({ path: 'summary-hook', namespace: 'fixture' }));
    api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: `
      export const useRenegociacaoSelectionSummary = () => globalThis.__floatingSummaryResult;
    ` }));
  } }],
});

class TestMessageChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage: () => globalThis.queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
  }
}

const group = {
  poloId: 'polo-a', alunoId: 'student-a', matriculaId: 'enrollment-a', turmaId: 'class-a',
  alunoNome: 'Aluna Sintética', turmaNome: 'Turma Sintética',
};
const summary = {
  version: 1, asOf: '2026-10-03', identity: group, receivableIds: ['r1', 'r2'], count: 2,
  totals: { principalCents: 50000, punctualDiscountCents: 5000, discountedPrincipalCents: 45000,
    interestCents: 1200, penaltyCents: 500, grossDebtCents: 51700, payableCents: 46700 },
  discount: { status: 'KNOWN', message: 'Desconto comprovado.', appliedToProposal: false },
  payableStatus: 'KNOWN', payableMessage: 'Referência dos títulos originais.',
};
const region = () => document.querySelector('[role="region"][aria-label="Resumo flutuante da seleção"]');
const rect = (left, width, height = 10) => ({ left, right: left + width, top: 100, bottom: 100 + height, width, height });

async function withFixture(run, props = {}) {
  const dom = new JSDOM('<!doctype html><html><body style="overflow: clip"><button id="origin">Origem</button><div id="root"></div></body></html>', {
    pretendToBeVisual: true, url: 'https://universo.test/',
  });
  const metrics = { anchor: rect(320, 800), panelHeight: 260, viewportWidth: 1280 };
  const observers = [];
  const frames = new Map();
  const listeners = new Set();
  const removedListeners = [];
  let frameId = 0;
  let canceledFrames = 0;
  class TestResizeObserver {
    constructor(callback) { this.callback = callback; this.observed = new Set(); this.disconnected = false; observers.push(this); }
    observe(element) { this.observed.add(element); }
    disconnect() { this.disconnected = true; this.observed.clear(); }
    emit() { this.callback([]); }
  }
  const values = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event,
    MessageChannel: TestMessageChannel, ResizeObserver: TestResizeObserver, IS_REACT_ACT_ENVIRONMENT: true,
    __floatingSummaryResult: { data: summary, loading: false, error: null, refetch: () => {} },
  };
  const previous = new Map(Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  dom.window.ResizeObserver = TestResizeObserver;
  const originalRect = dom.window.HTMLElement.prototype.getBoundingClientRect;
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.getAttribute('aria-label') === 'Resumo flutuante da seleção') return rect(0, 800, metrics.panelHeight);
    if (this.parentElement?.id === 'scroller' && this.getAttribute('aria-hidden') === 'true') return metrics.anchor;
    return originalRect.call(this);
  };
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => metrics.viewportWidth });
  window.requestAnimationFrame = (callback) => { const id = ++frameId; frames.set(id, callback); return id; };
  window.cancelAnimationFrame = (id) => { canceledFrames += 1; frames.delete(id); };
  const originalAdd = window.addEventListener.bind(window);
  const originalRemove = window.removeEventListener.bind(window);
  window.addEventListener = (type, callback, options) => {
    if (type === 'scroll' || type === 'resize') listeners.add({ type, callback, options });
    originalAdd(type, callback, options);
  };
  window.removeEventListener = (type, callback, options) => {
    if (type === 'scroll' || type === 'resize') {
      for (const entry of listeners) if (entry.type === type && entry.callback === callback && entry.options === options) {
        listeners.delete(entry);
        removedListeners.push(entry);
      }
    }
    originalRemove(type, callback, options);
  };
  const { mount, interact } = require(bundlePath);
  const origin = document.getElementById('origin');
  origin.focus();
  const baseProps = { group, selectedIds: ['r1', 'r2'], asOf: '2026-10-03', canContinue: true,
    onContinue: () => {}, onClear: () => {}, ...props };
  const mounted = await mount(document.getElementById('root'), baseProps);
  let unmounted = false;
  const unmount = async () => { if (!unmounted) { await mounted.unmount(); unmounted = true; } };
  const flushFrames = async () => { await interact(() => {
    const scheduled = [...frames.values()];
    frames.clear();
    for (const callback of scheduled) callback(0);
  }); };
  try { await run({ render: mounted.render, unmount, interact, flushFrames, metrics, observers, frames,
    listeners, removedListeners, origin, baseProps, canceledFrames: () => canceledFrames }); }
  finally {
    await unmount();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('barra usa portal fora dos recortes, acompanha scroll interno/resize e reserva espaço inferior', async () => {
  await withFixture(async ({ metrics, observers, interact, flushFrames, origin }) => {
    const panel = region();
    assert.equal(panel.parentElement, document.body);
    assert.equal(document.getElementById('clipped').contains(panel), false);
    assert.ok(panel.classList.contains('fixed'));
    assert.ok(panel.classList.contains('z-20'), 'permanece abaixo do cabeçalho e menu');
    assert.equal(panel.style.left, '320px');
    assert.equal(panel.style.width, '800px');
    const spacer = document.querySelector('#scroller > [aria-hidden="true"]');
    assert.equal(spacer.style.height, '284px');
    assert.equal(document.activeElement, origin, 'abrir a barra não sequestra foco');
    assert.equal(document.body.style.overflow, 'clip', 'não ativa scroll lock de modal');
    assert.equal(panel.getAttribute('aria-modal'), null);

    metrics.anchor = rect(340, 800);
    await interact(() => document.getElementById('scroller').dispatchEvent(new Event('scroll', { bubbles: false })));
    await flushFrames();
    assert.equal(panel.style.left, '340px', 'scroll não-bubbling do container é capturado');
    metrics.viewportWidth = 640;
    metrics.anchor = rect(20, 600);
    await interact(() => window.dispatchEvent(new Event('resize')));
    await flushFrames();
    assert.equal(panel.style.left, '20px');
    assert.equal(panel.style.width, '600px');

    assert.equal(observers.length, 1);
    assert.equal(observers[0].observed.has(panel), true);
    assert.equal(observers[0].observed.has(spacer), true);
    metrics.anchor = rect(60, 480);
    metrics.panelHeight = 350;
    await interact(() => observers[0].emit());
    await flushFrames();
    assert.equal(panel.style.left, '60px');
    assert.equal(panel.style.width, '480px');
    assert.equal(spacer.style.height, '374px', 'conteúdo não fica coberto quando a barra aumenta');

    metrics.viewportWidth = 340;
    metrics.anchor = rect(-40, 1500);
    await interact(() => window.dispatchEvent(new Event('resize')));
    await flushFrames();
    assert.equal(panel.style.left, '8px');
    assert.equal(panel.style.width, '324px', 'largura respeita viewport estreita');
  });
});

test('detalhes começam recolhidos, ações respeitam disabled e desmontagem limpa portal/observers/eventos', async () => {
  let continues = 0;
  let clears = 0;
  await withFixture(async ({ render, interact, baseProps, listeners, observers, frames, unmount, canceledFrames }) => {
    const panel = region();
    assert.match(panel.textContent, /Aluna Sintética/);
    assert.match(panel.textContent, /Turma Sintética/);
    assert.equal(panel.querySelector('dl').children.length, 3, 'compacto conserva os três valores financeiros');
    const details = panel.querySelector('details');
    assert.equal(details.open, false);
    await interact(() => details.querySelector('summary').click());
    assert.equal(details.open, true);
    await interact(() => details.querySelector('summary').click());
    assert.equal(details.open, false);
    const button = (prefix) => [...panel.querySelectorAll('button')].find((node) => node.textContent.startsWith(prefix));
    await interact(() => button('Continuar').click());
    assert.equal(continues, 0, 'ação desabilitada não executa');
    await render({ ...baseProps, canContinue: true });
    await interact(() => button('Continuar').click());
    assert.equal(continues, 1);
    await interact(() => button('Limpar').click());
    assert.equal(clears, 1);
    assert.ok([...listeners].some((entry) => entry.type === 'scroll' && entry.options === true));
    await interact(() => window.dispatchEvent(new Event('resize')));
    assert.equal(frames.size, 1);
    await unmount();
    assert.equal(region(), null);
    assert.equal(listeners.size, 0);
    assert.equal(observers[0].disconnected, true);
    assert.equal(frames.size, 0);
    assert.equal(canceledFrames(), 1);
    assert.equal(document.body.style.overflow, 'clip');
  }, { canContinue: false, onContinue: () => { continues += 1; }, onClear: () => { clears += 1; } });
});
