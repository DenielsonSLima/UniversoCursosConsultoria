import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const jsdomPath = process.env.RENEGOCIACAO_JSDOM_PATH;
if (!jsdomPath) throw new Error('Defina RENEGOCIACAO_JSDOM_PATH para jsdom@26.1.0.');
const require = createRequire(import.meta.url);
assert.equal(require(join(jsdomPath, 'package.json')).version, '26.1.0');
const { JSDOM } = require(jsdomPath);
const buildDirectory = await mkdtemp(join(tmpdir(), 'universo-selection-summary-'));
const bundlePath = join(buildDirectory, 'summary.fixture.cjs');
after(async () => { await rm(buildDirectory, { recursive: true, force: true }); });

buildSync({
  stdin: {
    contents: String.raw`
      import React, { act } from 'react';
      import { createRoot } from 'react-dom/client';
      import SelectionSummaryPanel from './SelectionSummaryPanel.tsx';
      export async function mount(container, initialProps) {
        const root = createRoot(container);
        const render = async (props) => { await act(async () => { root.render(<SelectionSummaryPanel {...props} />); }); };
        await render(initialProps);
        return { render, unmount: async () => { await act(async () => { root.unmount(); }); } };
      }
      export async function interact(action) { await act(async () => { action(); }); }
    `,
    loader: 'tsx', resolveDir: fileURLToPath(new URL('.', import.meta.url)), sourcefile: 'summary.fixture.tsx',
  },
  outfile: bundlePath, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
  define: { 'process.env.NODE_ENV': '"test"' },
});

class TestMessageChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage: () => globalThis.queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
  }
}

const summary = {
  version: 1, asOf: '2026-10-03', count: 2, receivableIds: ['source-a', 'source-b'],
  identity: { poloId: 'polo-a', alunoId: 'student-a', matriculaId: 'enrollment-a', turmaId: 'class-a' },
  totals: {
    principalCents: 12345, punctualDiscountCents: 345, discountedPrincipalCents: 12000,
    interestCents: 99, penaltyCents: 246, grossDebtCents: 12690, payableCents: 12345,
  },
  discount: { status: 'KNOWN', message: 'Desconto apurado a partir dos títulos originais.', appliedToProposal: false },
  payableStatus: 'KNOWN', payableMessage: '',
};
const baseProps = { summary, count: 2, loading: false, error: null, onRetry: () => {} };

async function withDom(run, props = baseProps) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true, url: 'https://universo.test/',
  });
  const values = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event,
    MessageChannel: TestMessageChannel, IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = new Map(Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { mount, interact } = require(bundlePath);
  const mounted = await mount(document.getElementById('root'), props);
  try { await run({ ...mounted, interact }); }
  finally {
    await mounted.unmount();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

const text = () => document.getElementById('root').textContent.replaceAll('\u00a0', ' ');
const valueFor = (label) => [...document.querySelectorAll('dt')]
  .find((node) => node.textContent === label)?.nextElementSibling.textContent.replaceAll('\u00a0', ' ');

test('resumo mostra contagem e valores canônicos separados em quatro cards', async () => {
  await withDom(async () => {
    assert.equal(document.querySelector('dl').children.length, 4);
    assert.equal(valueFor('Parcelas selecionadas'), '2');
    assert.equal(valueFor('Valor normal'), 'R$ 123,45');
    assert.equal(valueFor('Com desconto de pontualidade'), 'R$ 120,00');
    assert.equal(valueFor('Com multa e juros'), 'R$ 126,90');
    assert.equal(valueFor('Desconto de pontualidade deduzido'), 'R$ 3,45');
    assert.equal(valueFor('Juros apurados'), 'R$ 0,99');
    assert.equal(valueFor('Multa apurada'), 'R$ 2,46');
    assert.match(text(), /03\/10\/2026/);
    assert.match(text(), /títulos originais/);
    assert.match(text(), /não é concedido automaticamente à proposta/);
    assert.match(text(), /não substituem a conferência da cobrança para pagamento/);
    assert.doesNotMatch(text(), /Valor a pagar|Total a pagar|Boleto/i);
  });
});

test('loading, erro e ausência de resumo nunca reutilizam totais anteriores nem inventam zero', async () => {
  await withDom(async ({ render, interact }) => {
    await render({ ...baseProps, loading: true });
    assert.match(document.querySelector('[role="status"]').textContent, /Conferindo valores/);
    assert.doesNotMatch(text(), /R\$/);
    assert.equal(document.querySelector('dl'), null);
    let retries = 0;
    await render({ ...baseProps, error: new Error('Falha de consulta'), onRetry: () => { retries += 1; } });
    assert.match(document.querySelector('[role="alert"]').textContent, /Falha de consulta/);
    assert.doesNotMatch(text(), /R\$/);
    await interact(() => document.querySelector('button').click());
    assert.equal(retries, 1);
    await render({ ...baseProps, summary: undefined });
    assert.match(document.querySelector('[role="status"]').textContent, /Aguardando a conferência/);
    assert.doesNotMatch(text(), /R\$/);
    await render({ ...baseProps, count: 0 });
    assert.match(document.querySelector('[role="status"]').textContent, /Selecione as parcelas/);
    assert.doesNotMatch(text(), /R\$/);
  });
});

test('desconto desconhecido fica a conferir sem contaminar principal e encargos conhecidos', async () => {
  await withDom(async ({ render }) => {
    await render({
      ...baseProps,
      summary: {
        ...summary,
        totals: { ...summary.totals, punctualDiscountCents: null, discountedPrincipalCents: null, payableCents: null },
        discount: { status: 'UNAVAILABLE', message: 'Política de desconto não comprovada.', appliedToProposal: false },
        payableStatus: 'UNAVAILABLE', payableMessage: 'Confira a condição original antes do pagamento.',
      },
    });
    assert.equal(valueFor('Valor normal'), 'R$ 123,45');
    assert.equal(valueFor('Com desconto de pontualidade'), 'A conferir');
    assert.equal(valueFor('Desconto de pontualidade deduzido'), 'A conferir');
    assert.equal(valueFor('Com multa e juros'), 'R$ 126,90');
    assert.match(text(), /Política de desconto não comprovada/);
    assert.match(text(), /Confira a condição original/);
    await render({
      ...baseProps,
      summary: { ...summary, totals: { ...summary.totals, punctualDiscountCents: 0, discountedPrincipalCents: 12345 } },
    });
    assert.equal(valueFor('Desconto de pontualidade deduzido'), 'R$ 0,00', 'zero só é mostrado quando explícito no servidor');
    assert.equal(valueFor('Com desconto de pontualidade'), 'R$ 123,45');
  });
});
