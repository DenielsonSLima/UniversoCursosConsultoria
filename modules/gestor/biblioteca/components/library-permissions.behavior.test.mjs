import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React, { act } from 'react';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { JSDOM } = require(process.env.BIBLIOTECA_JSDOM_PATH || process.env.INSTITUTIONAL_SELECT_JSDOM_PATH || 'jsdom');
const directory = dirname(fileURLToPath(import.meta.url));

async function components() {
  const bundle = await build({
    stdin: { contents: `export { default as Page } from '../BibliotecaPage';
      export { default as Permissions } from './DocumentPermissionsModal';
      export { bibliotecaService } from '../biblioteca.service';
      export { polosService } from '../../configuracoes/polos/polos.service';`, resolveDir: directory, loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react-dom', '@tanstack/react-query'], loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'local-test-only' }) },
    plugins: [{ name: 'library-deny-remote', setup(plugin) {
      plugin.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'library-denied' }));
      plugin.onResolve({ filter: /pdf\.worker\.min\.mjs\?url$/ }, () => ({ path: 'worker', namespace: 'library-denied' }));
      plugin.onLoad({ filter: /.*/, namespace: 'library-denied' }, ({ path }) => ({ contents: path === 'worker'
        ? 'export default "http://127.0.0.1:9/blocked-worker.mjs";'
        : 'const channel={on(){return this},subscribe(){return this}};export const supabase={channel(){return channel},removeChannel(){},from(){throw Error("Database prohibited")},rpc(){throw Error("RPC prohibited")},storage:{from(){throw Error("Storage prohibited")}}};' }));
    } }],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}

test('Biblioteca conserva navegação e payloads de liberação após migrar seletores', async context => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'navigator', 'fetch', 'alert', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  let network = 0;
  globalThis.fetch = async () => { network++; throw Error('Network prohibited'); };
  globalThis.alert = message => { throw Error(`Unexpected validation: ${message}`); };
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  let root;
  const courses = [{ id: 'course-demo', nome: 'Curso sintético', modalidade: 'TECNICO' }];
  const classes = [{ id: 'class-demo', nome: 'Turma sintética', codigo: 'DEMO', curso_id: 'course-demo' }];
  const disciplines = [{ id: 'discipline-demo', nome: 'Disciplina sintética', cursoId: 'course-demo' }];
  const doc = { id: 'document-demo', title: 'Documento sintético.txt', fileType: 'OTHER', size: '0,1 KB', url: '#', targetAudience: 'ALUNOS', scope: 'GLOBAL', acessos: 1, authorName: 'QA', createdAt: '2026-11-07T12:00:00Z', cursoIds: ['course-demo'], turmaIds: ['class-demo'], disciplinaIds: ['discipline-demo'], liberacaoTipo: 'IMEDIATO' };
  const saved = [];
  const click = async element => { assert.ok(element && !element.disabled); await act(async () => element.click()); };
  const button = label => [...dom.window.document.querySelectorAll('button')].find(item => item.textContent.trim() === label);
  const pick = async (label, text) => {
    const input = dom.window.document.querySelector(`input[aria-label="${label}"]`); assert.ok(input, label);
    await act(async () => input.focus());
    const option = [...dom.window.document.querySelectorAll('[role="option"]')].find(item => item.textContent === text);
    assert.ok(option, text); await click(option);
  };
  try {
    const { createRoot } = await import('react-dom/client');
    root = createRoot(dom.window.document.getElementById('root'));
    const { Page, Permissions, bibliotecaService, polosService } = await components();
    Object.keys(bibliotecaService).forEach(key => { if (typeof bibliotecaService[key] === 'function') bibliotecaService[key] = async () => { throw Error(`Unexpected library I/O: ${key}`); }; });
    Object.assign(bibliotecaService, { getCursos: async () => courses, getTurmas: async () => classes, getDisciplinas: async () => disciplines, getTeacherActiveTurmas: async () => classes,
      updateDocumentPermissions: async (...args) => { saved.push(args); } });
    polosService.getAll = async () => [];
    const seed = (key, value) => client.setQueryData(key, value, { updatedAt: Date.now() + 86400000 });
    for (const [key, value] of [[['library-cursos-list'], courses], [['library-turmas-list'], classes], [['library-disciplinas-list'], disciplines], [['library-all-documents-rules'], [doc]], [['library-top-accessed'], [doc]], [['library-top-recent'], [doc]], [['library-teacher-repositories'], []], [['library-teacher-storage-configs'], []], [['library-folders', null, null], []], [['library-documents', null, null], [doc]]]) seed(key, value);
    const render = async element => act(async () => root.render(React.createElement(QueryClientProvider, { client }, element)));
    await context.test('cinco abas reais mantêm o conteúdo e não disparam operações', async () => {
      await render(React.createElement(Page));
      assert.match(dom.window.document.body.textContent, /Mais Acessados \(Top 10\)/);
      for (const label of ['Gerenciador de Arquivos', 'Bibliotecas dos Professores', 'Regras de Liberação', 'Configuração', 'Destaques']) await click(button(label));
      assert.match(dom.window.document.body.textContent, /Últimos Enviados \(Top 10\)/);
      assert.equal(saved.length, 0);
    });
    const callbacks = { closed: 0, saved: 0 };
    const props = { isOpen: true, document: doc, onClose: () => { callbacks.closed++; }, onSave: () => { callbacks.saved++; } };
    await context.test('regra e disciplina usam IDs canônicos, required e o mesmo payload', async () => {
      await render(React.createElement(Permissions, props));
      await pick('Regra de Liberação', 'Ao Iniciar uma Disciplina');
      assert.equal(dom.window.document.querySelectorAll('select').length, 0);
      const trigger = dom.window.document.querySelector('input[aria-label="Disciplina Gatilho"]');
      assert.equal(trigger.checkValidity(), false);
      await click(button('Salvar Configurações'));
      assert.equal(saved.length, 0);
      await pick('Disciplina Gatilho', 'Disciplina sintética');
      assert.equal(trigger.checkValidity(), true);
      const days = dom.window.document.querySelector('input[type="number"]');
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(days, '15');
        days.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });
      assert.equal(saved.length, 0);
      await click(button('Salvar Configurações'));
      assert.deepEqual(saved[0], ['document-demo', { targetAudience: 'ALUNOS', scope: 'GLOBAL', poloId: null, cursoIds: ['course-demo'], turmaIds: ['class-demo'], disciplinaIds: ['discipline-demo'], liberacaoTipo: 'DISCIPLINA_INICIO', liberacaoData: null, liberacaoDisciplinaId: 'discipline-demo', liberacaoDiasValidade: 15 }, { teacherScopeOnly: false }]);
      assert.deepEqual(callbacks, { closed: 1, saved: 1 });
    });
    await context.test('escopo docente conserva turmas vinculadas, público derivado e bloqueio do gatilho', async () => {
      await render(React.createElement(Permissions, { ...props, teacherScopeOnly: true, document: { ...doc, teacherId: 'teacher-demo', scope: 'POLO_ESPECIFICO', poloId: 'foreign-polo', cursoIds: ['foreign-course'], liberacaoTipo: 'DISCIPLINA_INICIO' } }));
      const rule = dom.window.document.querySelector('input[aria-label="Regra de Liberação"]');
      assert.equal(rule.value, 'Disponibilidade Imediata');
      await act(async () => rule.focus());
      assert.ok(![...dom.window.document.querySelectorAll('[role="option"]')].some(item => item.textContent === 'Ao Iniciar uma Disciplina'));
      await act(async () => rule.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
      await click(button('Salvar Configurações'));
      assert.equal(saved.length, 2);
      assert.equal(saved[1][1].scope, 'GLOBAL');
      assert.equal(saved[1][1].poloId, null);
      assert.equal(saved[1][1].targetAudience, 'ALUNOS');
      assert.deepEqual(saved[1][1].cursoIds, ['course-demo']);
      assert.equal(saved[1][1].liberacaoTipo, 'IMEDIATO');
      assert.deepEqual(saved[1][2], { teacherScopeOnly: true });
    });
    assert.equal(network, 0);
  } finally {
    if (root) await act(async () => root.unmount());
    client.clear(); dom.window.close();
    previous.forEach((descriptor, name) => descriptor ? Object.defineProperty(globalThis, name, descriptor) : Reflect.deleteProperty(globalThis, name));
  }
});
