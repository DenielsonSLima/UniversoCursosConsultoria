import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
const coursePaths = ['/cursos-livres', '/ead', '/especializacao', '/cursos-tecnicos', '/ensino-superior'];

class TestMessageChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage: () => globalThis.queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
  }
}

test('links públicos reais preservam SPA, navegação nativa, seções e menu móvel', async t => {
  const { JSDOM } = require(process.env.PUBLIC_NAVIGATION_JSDOM_PATH || 'jsdom');
  const temporary = await mkdtemp(join(tmpdir(), 'universo-public-navigation-'));
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://universo.test/', pretendToBeVisual: true });
  const globals = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent, MessageChannel: TestMessageChannel, IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const scrolled = [];
  dom.window.HTMLElement.prototype.scrollIntoView = function () { scrolled.push(this.id); };
  dom.window.scrollTo = () => {};
  let root;
  let act;
  try {
    const bundle = join(temporary, 'navigation.cjs');
    await build({
      stdin: { contents: `
        import React from 'react';
        import { MemoryRouter, useLocation } from 'react-router';
        import Header from './modules/public/components/Header';
        import CategoriesSection from './modules/public/components/CategoriesSection';
        import Footer from './modules/public/components/Footer';
        export { act, default as React } from 'react';
        export { createRoot } from 'react-dom/client';
        function Contents(){const location=useLocation();return <><Header/><output data-location>{location.pathname+location.hash}</output><div id="quem-somos"/><div id="consultoria"/><div id="cursos"/><CategoriesSection/><Footer/></>}
        export function Harness({initialPath}){return <MemoryRouter initialEntries={[initialPath]}><Contents/></MemoryRouter>}
      `, loader: 'tsx', resolveDir: projectRoot },
      outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
      loader: { '.css': 'empty', '.png': 'dataurl' },
      plugins: [{ name: 'public-ticker-boundary', setup(builder) {
        builder.onResolve({ filter: /PublicTickerBar$/ }, () => ({ path: 'ticker', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export default function Ticker(){return null;}', loader: 'js' }));
      } }],
    });
    const components = require(bundle);
    act = components.act;
    const { React, createRoot, Harness } = components;
    const mount = async (initialPath = '/contato') => {
      if (root) await act(async () => root.unmount());
      root = createRoot(document.getElementById('root'));
      scrolled.length = 0;
      await act(async () => root.render(React.createElement(Harness, { initialPath })));
    };
    const current = () => document.querySelector('[data-location]').textContent;
    const desktop = () => document.querySelector('nav[aria-label="Navegação principal"]');
    const mobile = () => document.querySelector('nav[aria-label="Navegação móvel"]');
    const menuButton = () => document.querySelector('button[aria-controls="public-mobile-navigation"]');
    const linkNamed = (container, name) => [...container.querySelectorAll('a')].find(node => node.textContent.trim() === name);
    const click = async (node, eventOptions = {}, eventName = 'click') => {
      let preventedByApp;
      const observe = event => { preventedByApp = event.defaultPrevented; event.preventDefault(); };
      document.addEventListener(eventName, observe, { once: true });
      await act(async () => node.dispatchEvent(new dom.window.MouseEvent(eventName, {
        bubbles: true, cancelable: true, button: 0, ...eventOptions,
      })));
      document.removeEventListener(eventName, observe);
      return preventedByApp;
    };

    await t.test('cinco cards e menu possuem href próprio antes de abrir o menu', async () => {
      await mount();
      const cards = document.querySelectorAll('section a');
      assert.deepEqual([...cards].map(node => node.getAttribute('href')), coursePaths);
      for (const path of coursePaths) assert.ok(desktop().querySelector(`a[href="${path}"]`));
      assert.equal(document.querySelector('a[aria-label="Página inicial da Universo"]').getAttribute('href'), '/');
      assert.equal(linkNamed(desktop(), 'Login').getAttribute('href'), '/login');
      assert.equal(document.querySelectorAll('a a').length, 0);
    });

    await t.test('clique comum do card e menu navega na SPA e fecha disclosure', async () => {
      await mount();
      assert.equal(await click(document.querySelector('section a[href="/cursos-tecnicos"]')), true);
      assert.equal(current(), '/cursos-tecnicos');
      const details = desktop().querySelector('details');
      await act(async () => details.querySelector('summary').click());
      assert.equal(details.open, true);
      assert.equal(await click(linkNamed(desktop(), 'Cursos EAD')), true);
      assert.equal(current(), '/ead');
      assert.equal(details.open, false);
    });

    await t.test('Ctrl, Cmd, Shift, Alt e botão do meio mantêm o comportamento nativo', async () => {
      for (const options of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }]) {
        await mount();
        const cards = document.querySelector('section a[href="/cursos-livres"]');
        assert.equal(await click(cards, options), false);
        assert.equal(await click(linkNamed(desktop(), 'Cursos Técnicos'), options), false);
        assert.equal(await click(linkNamed(desktop(), 'Quem somos'), options), false);
        assert.equal(current(), '/contato');
        assert.deepEqual(scrolled, []);
      }
      const card = document.querySelector('section a[href="/ead"]');
      assert.equal(await click(card, { button: 1 }, 'auxclick'), false);
      assert.equal(current(), '/contato');
    });

    await t.test('seções sempre apontam para a home e repetição na home mantém scroll', async () => {
      await mount('/ead');
      const about = linkNamed(desktop(), 'Quem somos');
      assert.equal(about.getAttribute('href'), '/#quem-somos');
      assert.equal(linkNamed(desktop(), 'Consultoria').getAttribute('href'), '/#consultoria');
      await click(about);
      assert.equal(current(), '/#quem-somos');
      await click(about);
      assert.deepEqual(scrolled, ['quem-somos']);
      await click(linkNamed(desktop(), 'Ver todos os cursos'));
      assert.equal(current(), '/#cursos');
      assert.deepEqual(scrolled, ['quem-somos', 'cursos']);
    });

    await t.test('menu móvel oferece os mesmos destinos e fecha após navegação', async () => {
      await mount();
      assert.equal(menuButton().getAttribute('aria-expanded'), 'false');
      await act(async () => menuButton().click());
      assert.equal(menuButton().getAttribute('aria-expanded'), 'true');
      for (const path of coursePaths) assert.ok(mobile().querySelector(`a[href="${path}"]`));
      assert.equal(linkNamed(mobile(), 'Quem somos').getAttribute('href'), '/#quem-somos');
      assert.equal(linkNamed(mobile(), 'Área de Login').getAttribute('href'), '/login');
      const details = mobile().querySelector('details');
      await act(async () => details.querySelector('summary').click());
      assert.equal(details.open, true);
      await click(linkNamed(mobile(), 'Cursos EAD'));
      assert.equal(current(), '/ead');
      assert.equal(mobile(), null);
      assert.equal(menuButton().getAttribute('aria-expanded'), 'false');
    });

    await t.test('Safari sem foco no link mantém menu aberto até o clique navegar', async () => {
      await mount('/');
      const details = desktop().querySelector('details');
      const summary = details.querySelector('summary');
      await act(async () => { summary.focus(); summary.click(); });
      assert.equal(details.open, true);
      await act(async () => summary.dispatchEvent(new dom.window.FocusEvent('focusout', {
        bubbles: true, relatedTarget: null,
      })));
      assert.equal(details.open, true, 'Safari não informa novo foco ao clicar em links; não ocultar o alvo antes do click');
      await click(linkNamed(desktop(), 'Cursos Técnicos'));
      assert.equal(current(), '/cursos-tecnicos');
      assert.equal(details.open, false);
    });

    await t.test('Escape e clique externo fecham o disclosure acessível', async () => {
      await mount();
      const details = desktop().querySelector('details');
      const summary = details.querySelector('summary');
      await act(async () => summary.click());
      await act(async () => details.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
      assert.equal(details.open, false);
      assert.equal(document.activeElement, summary);
      await act(async () => summary.click());
      assert.equal(details.open, true);
      await act(async () => document.body.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true })));
      assert.equal(details.open, false);
    });

    await t.test('rodapé expõe destinos ausentes e mantém logo e validador como links', async () => {
      await mount();
      const footer = document.querySelector('footer');
      for (const [name, path] of [['Cursos Livres', '/cursos-livres'], ['Especializações', '/especializacao'], ['Nossos polos', '/polos']]) {
        assert.equal(linkNamed(footer, name).getAttribute('href'), path);
      }
      assert.equal(footer.querySelector('a[aria-label="Página inicial da Universo"]').getAttribute('href'), '/');
      const validator = linkNamed(footer, 'Validador de Docs');
      assert.equal(validator.getAttribute('href'), '/validador');
      await click(validator);
      assert.equal(current(), '/validador');
      assert.equal(document.querySelectorAll('a a').length, 0);
    });
  } finally {
    if (root) await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    await rm(temporary, { recursive: true, force: true });
  }
});
