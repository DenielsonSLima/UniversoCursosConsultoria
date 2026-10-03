import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const jsdomPath = process.env.RENEGOCIACAO_JSDOM_PATH;
if (!jsdomPath) {
  throw new Error('Defina RENEGOCIACAO_JSDOM_PATH com o caminho absoluto do pacote jsdom@26.1.0.');
}

const require = createRequire(import.meta.url);
assert.equal(require(join(jsdomPath, 'package.json')).version, '26.1.0', 'o teste exige jsdom@26.1.0');
const { JSDOM } = require(jsdomPath);
const buildDirectory = await mkdtemp(join(tmpdir(), 'universo-renegociacao-focus-'));
const bundlePath = join(buildDirectory, 'focus-stack.fixture.cjs');

after(async () => {
  await rm(buildDirectory, { recursive: true, force: true });
});

const fixture = String.raw`
  import React, { act, useRef, useState } from 'react';
  import { createPortal } from 'react-dom';
  import { createRoot } from 'react-dom/client';
  import { useRenegociacaoDialogFocus } from './useRenegociacaoDialogFocus.ts';

  function Dialog({ name, pending, onClose, children }) {
    const dialogRef = useRef(null);
    const pendingRef = useRef(pending);
    const closeRef = useRef(onClose);
    pendingRef.current = pending;
    closeRef.current = onClose;
    useRenegociacaoDialogFocus({ isOpen: true, dialogRef, submittingRef: pendingRef, closeRef });
    return <div ref={dialogRef} tabIndex={-1} data-dialog={name}>{children}</div>;
  }

  function Harness() {
    const [parentOpen, setParentOpen] = useState(true);
    const [childOpen, setChildOpen] = useState(false);
    const [childPending, setChildPending] = useState(false);
    const [parentCloses, setParentCloses] = useState(0);
    const [childCloses, setChildCloses] = useState(0);
    const closeParent = () => {
      setParentCloses((value) => value + 1);
      setParentOpen(false);
    };
    const closeChild = () => {
      setChildCloses((value) => value + 1);
      setChildOpen(false);
      setChildPending(false);
    };
    return <>
      {parentOpen ? <Dialog name="parent" pending={false} onClose={closeParent}>
        <button id="open-child" type="button" onClick={() => setChildOpen(true)}>Abrir confirmação</button>
        {childOpen ? createPortal(
          <Dialog name="child" pending={childPending} onClose={closeChild}>
            <button id="toggle-pending" type="button" onClick={() => setChildPending((value) => !value)}>
              Alternar processamento
            </button>
          </Dialog>,
          document.body,
        ) : null}
      </Dialog> : null}
      <output id="close-counts" data-parent={parentCloses} data-child={childCloses} />
    </>;
  }

  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  export async function settle() {
    await act(async () => {});
    await nextFrame();
    await act(async () => {});
  }
  export async function mountHarness(container) {
    const root = createRoot(container);
    await act(async () => { root.render(<Harness />); });
    await settle();
    return async () => { await act(async () => { root.unmount(); }); };
  }
  export async function interact(action) {
    await act(async () => { action(); });
    await settle();
  }
`;

buildSync({
  stdin: {
    contents: fixture,
    loader: 'tsx',
    resolveDir: fileURLToPath(new URL('.', import.meta.url)),
    sourcefile: 'focus-stack.fixture.tsx',
  },
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
  define: { 'process.env.NODE_ENV': '"test"' },
});

class TestMessageChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage: () => globalThis.queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
  }
}

test('pilha de diálogos mantém foco, Escape e scroll lock somente na camada superior', async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body style="overflow: clip"><button id="origin">Origem</button><div id="root"></div></body></html>',
    { pretendToBeVisual: true, url: 'https://universo.test/' },
  );
  const globalKeys = [
    'window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'KeyboardEvent', 'FocusEvent',
    'MessageChannel', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'IS_REACT_ACT_ENVIRONMENT',
  ];
  const previousGlobals = new Map(globalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const testGlobals = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
    KeyboardEvent: dom.window.KeyboardEvent,
    FocusEvent: dom.window.FocusEvent,
    MessageChannel: TestMessageChannel,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(testGlobals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }

  const origin = document.getElementById('origin');
  origin.focus();
  const { interact, mountHarness } = require(bundlePath);
  const unmount = await mountHarness(document.getElementById('root'));
  const counters = () => document.getElementById('close-counts').dataset;
  const escape = () => document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Escape', bubbles: true, cancelable: true,
  }));

  try {
    assert.equal(document.activeElement?.dataset.dialog, 'parent');
    assert.equal(document.body.style.overflow, 'hidden');

    const opener = document.getElementById('open-child');
    await interact(() => { opener.focus(); opener.click(); });
    assert.equal(document.activeElement?.dataset.dialog, 'child');
    assert.equal(document.body.style.overflow, 'hidden');

    const pendingButton = document.getElementById('toggle-pending');
    await interact(() => { pendingButton.focus(); pendingButton.click(); });
    await interact(escape);
    assert.ok(document.querySelector('[data-dialog="child"]'), 'pending mantém a confirmação aberta');
    assert.deepEqual({ parent: counters().parent, child: counters().child }, { parent: '0', child: '0' });

    await interact(() => pendingButton.click());
    await interact(escape);
    assert.equal(document.querySelector('[data-dialog="child"]'), null);
    assert.ok(document.querySelector('[data-dialog="parent"]'), 'Escape fecha somente a camada superior');
    assert.deepEqual({ parent: counters().parent, child: counters().child }, { parent: '0', child: '1' });
    assert.equal(document.activeElement, opener, 'desmontar o filho restaura foco no acionador');
    assert.equal(document.body.style.overflow, 'hidden', 'pai aberto mantém o bloqueio de rolagem');

    await interact(escape);
    assert.equal(document.querySelector('[data-dialog="parent"]'), null);
    assert.deepEqual({ parent: counters().parent, child: counters().child }, { parent: '1', child: '1' });
    assert.equal(document.activeElement, origin);
    assert.equal(document.body.style.overflow, 'clip');
  } finally {
    await unmount();
    dom.window.close();
    for (const [key, descriptor] of previousGlobals) {
      if (!descriptor) delete globalThis[key];
      else Object.defineProperty(globalThis, key, descriptor);
    }
    await rm(buildDirectory, { recursive: true, force: true });
  }
});
