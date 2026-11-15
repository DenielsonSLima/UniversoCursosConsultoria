import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const rootDirectory = fileURLToPath(new URL('../../../../../', import.meta.url));
const turmas = [
  { id: 'tecnico-a', nome: 'Técnico A', codigo: 'T-A', modalidade: 'TECNICO' },
  { id: 'livre-b', nome: 'Livre B', codigo: 'L-B', modalidade: 'LIVRE' },
  { id: 'ead-c', nome: 'EAD C', codigo: 'E-C', cursos: [{ modalidade: 'EAD' }] },
];

class TestMessageChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage: () => globalThis.queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
  }
}

test('sugestão real de turma do professor preserva a escolha opcional do usuário', async t => {
  const jsdomPath = process.env.FINANCIAL_PAYMENT_JSDOM_PATH;
  const { JSDOM } = require(jsdomPath ? resolve(jsdomPath) : 'jsdom');
  const temporary = await mkdtemp(join(tmpdir(), 'despesa-professor-turma-'));
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://universo.test/', pretendToBeVisual: true,
  });
  const globals = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent, MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    MessageChannel: TestMessageChannel, IS_REACT_ACT_ENVIRONMENT: true,
    __teacherClassLookup: undefined, __teacherClassValue: undefined,
  };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let root;
  let client;
  let act;
  try {
    const bundle = join(temporary, 'hook.cjs');
    await build({
      stdin: { contents: `
        import React from 'react';
        import { useDespesaProfessorTurma } from './modules/gestor/financeiro/despesas/hooks/useDespesaProfessorTurma';
        import DespesaFormAssociations from './modules/gestor/financeiro/despesas/components/DespesaFormAssociations';
        import { getTurmaModalidade } from './modules/gestor/financeiro/despesas/components/despesa-form.utils';
        export { act, default as React } from 'react';
        export { createRoot } from 'react-dom/client';
        export { QueryClient, QueryClientProvider } from '@tanstack/react-query';
        export function Harness({ poloId, professorId, isProfessor, turmas }) {
          const turma = useDespesaProfessorTurma(poloId, professorId, isProfessor, turmas);
          globalThis.__teacherClassValue = turma;
          return <DespesaFormAssociations mode="pendente" convenioMesId="" setConvenioMesId={() => {}}
            convenios={[]} conveniosLoading={false} conveniosError={false} isPoloMatriz={false}
            rateioSelection="DESLIGADO" setRateioSelection={() => {}} polosRateio={[]}
            polosSelecionados={new Set()} togglePoloRateio={() => {}} rateioSelecionadosInvalido={false}
            {...turma} filteredTurmas={turmas.filter(item => getTurmaModalidade(item) === turma.turmaModalidade)} />;
        }
      `, loader: 'tsx', resolveDir: rootDirectory },
      outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
      loader: { '.css': 'empty' },
      plugins: [{ name: 'last-class-only', setup(builder) {
        builder.onResolve({ filter: /despesas-sugestoes\.service(?:\.ts)?$/ }, () => ({ path: 'suggestion', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
          contents: 'export const getUltimaTurmaDoProfessor = (...args) => globalThis.__teacherClassLookup(...args);',
        }));
      } }],
    });
    const components = require(bundle);
    act = components.act;
    const { React, createRoot, QueryClient, QueryClientProvider, Harness } = components;
    const tick = () => new Promise(done => setTimeout(done, 0));
    const settle = async () => { await act(async () => { await tick(); await tick(); }); };
    let props;
    let pending;
    let calls;
    const current = () => globalThis.__teacherClassValue;
    const render = async updates => {
      props = { ...props, ...updates };
      await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Harness, props))));
      await settle();
    };
    const mount = async (updates = {}) => {
      pending = new Map(); calls = [];
      globalThis.__teacherClassLookup = (polo, professor) => {
        const key = `${polo}:${professor}`;
        calls.push([polo, professor]);
        if (!pending.has(key)) {
          let resolve;
          const promise = new Promise(done => { resolve = done; });
          pending.set(key, { promise, resolve });
        }
        return pending.get(key).promise;
      };
      client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, refetchOnWindowFocus: false } } });
      root = createRoot(document.getElementById('root'));
      props = { poloId: 'polo-a', professorId: 'prof-a', isProfessor: true, turmas };
      await render(updates);
    };
    const close = async () => {
      if (root) await act(async () => root.unmount());
      root = null;
      client?.clear();
      client = null;
    };
    t.afterEach(close);
    const resolveClass = async (professor, turmaId, polo = 'polo-a') => {
      const request = pending.get(`${polo}:${professor}`);
      assert.ok(request, `consulta esperada para ${professor}`);
      await act(async () => { request.resolve(turmaId); await tick(); });
      await settle();
    };
    const click = async label => {
      const button = [...document.querySelectorAll('button')].find(element => element.getAttribute('aria-label') === label);
      assert.ok(button, `botão esperado: ${label}`);
      await act(async () => button.click());
      await settle();
    };
    const assertToggle = enabled => assert.equal(
      document.querySelector('[aria-label="Sim: Vincular a uma turma"]').getAttribute('aria-pressed'), String(enabled),
    );
    const edit = async (modalidade, turmaId) => {
      await act(async () => { current().setTurmaModalidade(modalidade); current().setTurmaId(turmaId); });
      await settle();
    };

    await t.test('selecionar professor ativa Sim imediatamente e sugere a turma autorizada', async () => {
      await mount({ professorId: '', isProfessor: false });
      assertToggle(false);
      assert.equal(calls.length, 0);
      await render({ professorId: 'prof-a', isProfessor: true });
      assertToggle(true);
      assert.equal(current().turmaId, '');
      await resolveClass('prof-a', 'tecnico-a');
      assert.equal(current().turmaId, 'tecnico-a');
      assert.equal(current().turmaModalidade, 'TECNICO');
    });
    await t.test('Não durante a consulta permanece desativado após a resposta', async () => {
      await mount();
      await click('Não: Vincular a uma turma');
      assertToggle(false);
      await resolveClass('prof-a', 'tecnico-a');
      assertToggle(false);
      assert.equal(current().turmaId, '');
      assert.equal(current().turmaModalidade, '');
    });
    await t.test('edição manual durante a consulta não é sobrescrita pela sugestão', async () => {
      await mount();
      await edit('EAD', 'ead-c');
      await resolveClass('prof-a', 'tecnico-a');
      assertToggle(true);
      assert.equal(current().turmaId, 'ead-c');
      assert.equal(current().turmaModalidade, 'EAD');
    });
    await t.test('trocar ou desativar a turma sugerida sobrevive a atualizações da consulta', async () => {
      await mount();
      await resolveClass('prof-a', 'tecnico-a');
      await edit('LIVRE', 'livre-b');
      await act(async () => { await client.invalidateQueries(); });
      await settle();
      assert.equal(current().turmaId, 'livre-b');
      await click('Não: Vincular a uma turma');
      await act(async () => { await client.invalidateQueries(); });
      await settle();
      assertToggle(false);
      assert.equal(current().turmaId, '');
    });
    await t.test('resposta atrasada de outro professor não invade o professor atual', async () => {
      await mount();
      await render({ professorId: 'prof-b' });
      assertToggle(true);
      await resolveClass('prof-b', 'livre-b');
      await resolveClass('prof-a', 'tecnico-a');
      assert.equal(current().turmaId, 'livre-b');
      assert.equal(current().turmaModalidade, 'LIVRE');
    });
    await t.test('sem histórico ou turma indisponível mantém Sim opcional e turma vazia', async () => {
      await mount();
      await resolveClass('prof-a', null);
      assertToggle(true);
      assert.equal(current().turmaId, '');
      await render({ professorId: 'prof-b' });
      await resolveClass('prof-b', 'turma-de-outro-polo');
      assertToggle(true);
      assert.equal(current().turmaId, '');
      await click('Não: Vincular a uma turma');
      assertToggle(false);
    });
    await t.test('novo professor reaplica o padrão após desativação anterior', async () => {
      await mount();
      await resolveClass('prof-a', 'tecnico-a');
      await click('Não: Vincular a uma turma');
      await render({ professorId: 'prof-b' });
      assertToggle(true);
      await resolveClass('prof-b', 'livre-b');
      assert.equal(current().turmaId, 'livre-b');
    });
    await t.test('outro tipo de parceiro conserva o vínculo manual sem consultar professor', async () => {
      await mount({ professorId: 'empresa-a', isProfessor: false });
      assertToggle(false);
      assert.equal(calls.length, 0);
      await click('Sim: Vincular a uma turma');
      await edit('TECNICO', 'tecnico-a');
      await render({ professorId: 'empresa-b', turmas: [...turmas] });
      assertToggle(true);
      assert.equal(current().turmaId, 'tecnico-a');
      assert.equal(calls.length, 0);
    });
  } finally {
    if (root && act) await act(async () => root.unmount());
    client?.clear();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    await rm(temporary, { recursive: true, force: true });
  }
});
