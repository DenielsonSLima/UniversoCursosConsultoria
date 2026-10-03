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
const buildDirectory = await mkdtemp(join(tmpdir(), 'universo-renegociacao-filters-'));
const bundlePath = join(buildDirectory, 'filters.fixture.cjs');
after(async () => { await rm(buildDirectory, { recursive: true, force: true }); });

buildSync({
  stdin: {
    contents: String.raw`
      import React, { act, useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import RenegociacaoFilters from './RenegociacaoFilters.tsx';
      import RenegociacaoFilterPicker from './RenegociacaoFilterPicker.tsx';
      import { RenegociacaoViewTabs } from './RenegociacaoPanels.tsx';
      const options = {
        courseTypes: [{ id: 'TECNICO', label: 'Técnico' }, { id: 'LIVRE', label: 'Curso livre' }],
        turmas: [
          { id: 't1', label: 'Enfermagem 2026', courseType: 'TECNICO' },
          { id: 't2', label: 'Primeiros socorros', courseType: 'LIVRE' },
        ],
      };
      function Harness() {
        const [view, setView] = useState('A_NEGOCIAR');
        const [filters, setFilters] = useState({ courseType: '', turmaId: '' });
        const [search, setSearch] = useState('');
        return <>
          <RenegociacaoViewTabs value={view} onChange={setView} />
          <section role="tabpanel" id={'renegociacoes-' + view + '-panel'} aria-labelledby={'renegociacoes-' + view + '-tab'}>
            <RenegociacaoFilters view={view} ongoingStatus="PROPOSED" search={search} filters={filters}
              filterOptions={options} loading={false} error={false} onStatus={() => {}}
              onSearch={setSearch} onFilters={setFilters} onRetry={() => {}} />
          </section>
          <output id="filters" data-course={filters.courseType} data-turma={filters.turmaId} data-search={search} />
        </>;
      }
      export async function mount(container, pickerProps) {
        const root = createRoot(container);
        const render = async (props) => { await act(async () => {
          root.render(props ? <RenegociacaoFilterPicker label="Teste" value="" options={[]} onChange={() => {}} {...props} /> : <Harness />);
        }); };
        await render(pickerProps);
        return { render, unmount: async () => { await act(async () => { root.unmount(); }); } };
      }
      export async function interact(action) { await act(async () => { action(); }); }
    `,
    loader: 'tsx',
    resolveDir: fileURLToPath(new URL('.', import.meta.url)),
    sourcefile: 'filters.fixture.tsx',
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

async function withDom(run, pickerProps) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><button id="outside">Fora</button></body></html>', {
    pretendToBeVisual: true, url: 'https://universo.test/',
  });
  const values = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event,
    KeyboardEvent: dom.window.KeyboardEvent, FocusEvent: dom.window.FocusEvent,
    MessageChannel: TestMessageChannel, IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = new Map(Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const { mount, interact } = require(bundlePath);
  const mounted = await mount(document.getElementById('root'), pickerProps);
  try { await run({ ...mounted, interact, dom }); }
  finally {
    await mounted.unmount();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

const combo = (label) => {
  const fieldLabel = [...document.querySelectorAll('label')].find((node) => node.textContent === label);
  return document.getElementById(fieldLabel.htmlFor);
};
const key = (input, value) => input.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
const type = (input, value) => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const choose = (label) => [...document.querySelectorAll('[role="option"]')].find((node) => node.textContent === label).click();

test('abas internas reutilizam underline e navegação por teclado do Financeiro', async () => {
  await withDom(async ({ interact }) => {
    assert.equal(document.querySelectorAll('[role="tab"]').length, 4);
    assert.equal(document.querySelectorAll('select').length, 0);
    const active = document.querySelector('[role="tab"][aria-selected="true"]');
    assert.equal(active.textContent, 'A negociar');
    assert.ok(active.querySelector('[aria-hidden="true"]').className.includes('h-0.5'));
    await interact(() => key(active, 'ArrowRight'));
    const next = document.querySelector('[role="tab"][aria-selected="true"]');
    assert.equal(next.textContent, 'Em andamento');
    assert.equal(document.activeElement, next);
    assert.equal(next.getAttribute('aria-controls'), document.querySelector('[role="tabpanel"]').id);
    assert.equal(document.querySelectorAll('[role="combobox"]').length, 0, 'não promete filtros não suportados em propostas');
  });
});

test('filtros pesquisam, mantêm IDs canônicos e limpam a turma ao trocar tipo', async () => {
  await withDom(async ({ interact }) => {
    const turma = combo('Turma');
    await interact(() => { turma.focus(); turma.click(); });
    assert.equal(document.querySelectorAll('[role="option"]').length, 3);
    await interact(() => type(turma, 'enfermagem'));
    assert.equal(document.querySelectorAll('[role="option"]').length, 1);
    await interact(() => key(turma, 'Enter'));
    assert.equal(document.getElementById('filters').dataset.turma, 't1');
    assert.equal(turma.value, 'Enfermagem 2026');
    assert.equal(turma.getAttribute('aria-expanded'), 'false');

    const course = combo('Tipo de curso');
    await interact(() => { course.focus(); course.click(); });
    await interact(() => choose('Curso livre'));
    assert.equal(document.getElementById('filters').dataset.course, 'LIVRE');
    assert.equal(document.getElementById('filters').dataset.turma, '');
    await interact(() => { turma.focus(); turma.click(); });
    assert.deepEqual([...document.querySelectorAll('[role="option"]')].map((node) => node.textContent), [
      'Todas as turmas', 'Primeiros socorros',
    ]);
    await interact(() => key(turma, 'ArrowDown'));
    assert.ok(turma.getAttribute('aria-activedescendant'));
    await interact(() => key(turma, 'Enter'));
    assert.equal(document.getElementById('filters').dataset.turma, 't2');
    await interact(() => turma.click());
    await interact(() => type(turma, 'nao-existe'));
    assert.match(document.querySelector('[role="status"]').textContent, /Nenhuma opção encontrada/);
    await interact(() => key(turma, 'Escape'));
    assert.equal(turma.getAttribute('aria-expanded'), 'false');
    assert.equal(turma.value, 'Primeiros socorros');
    await interact(() => turma.click());
    await interact(() => key(turma, 'Tab'));
    assert.equal(turma.getAttribute('aria-expanded'), 'false');
    await interact(() => turma.click());
    await interact(() => document.getElementById('outside').dispatchEvent(new Event('pointerdown', { bubbles: true })));
    assert.equal(turma.getAttribute('aria-expanded'), 'false');
  });
});

test('picker distingue loading, erro recuperável e opções vazias', async () => {
  await withDom(async ({ interact, render }) => {
    const input = document.querySelector('[role="combobox"]');
    await interact(() => input.focus());
    assert.match(document.querySelector('[role="status"]').textContent, /Carregando opções/);
    assert.equal(document.querySelectorAll('[role="option"]').length, 0);
    let retries = 0;
    await render({ loading: false, error: true, onRetry: () => { retries += 1; } });
    assert.match(document.querySelector('[role="alert"]').textContent, /Não foi possível/);
    await interact(() => document.querySelector('[role="alert"] button').click());
    assert.equal(retries, 1);
    await render({ loading: false, error: false });
    assert.match(document.querySelector('[role="status"]').textContent, /Nenhuma opção disponível/);
  }, { loading: true });
});

test('turma mantém o rótulo e permite limpar mesmo com opções ausentes durante loading e erro', async () => {
  const selection = { id: 'canonical-turma-id', label: 'Enfermagem 2026' };
  let changed;
  await withDom(async ({ interact, render }) => {
    const input = document.querySelector('[role="combobox"]');
    assert.equal(input.value, selection.label);
    await render({ value: selection.id, options: [], loading: true, onChange: (value) => { changed = value; } });
    assert.equal(input.value, selection.label, 'não mostra UUID enquanto busca os dados novos');
    await interact(() => document.querySelector('[aria-label="Limpar filtro de teste"]').click());
    assert.equal(changed, '', 'limpeza disponível durante a consulta');
    assert.equal(document.activeElement, input, 'limpeza devolve foco ao campo');
    await render({ value: selection.id, options: [], error: true, onChange: (value) => { changed = value; } });
    assert.equal(input.value, selection.label, 'rótulo permanece legível após falha');
    changed = undefined;
    await interact(() => document.querySelector('[aria-label="Limpar filtro de teste"]').click());
    assert.equal(changed, '', 'erro não impede remover filtro e refazer consulta');
  }, { value: selection.id, options: [selection] });
});
