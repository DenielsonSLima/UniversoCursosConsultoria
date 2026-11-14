import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React, { act } from 'react';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const { JSDOM } = require(process.env.BIBLIOTECA_JSDOM_PATH || process.env.INSTITUTIONAL_SELECT_JSDOM_PATH || 'jsdom');
const directory = dirname(fileURLToPath(import.meta.url));

async function components() {
  const bundle = await build({
    stdin: { contents: `export { default as Upload } from './UploadModal';
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

test('Publicação em quatro etapas conserva validações, escopo e payload sem I/O', async context => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root" class="biblioteca-workspace"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'navigator', 'fetch', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  let network = 0;
  globalThis.fetch = async () => { network++; throw Error('Network prohibited'); };
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const oldCreate = URL.createObjectURL;
  const oldRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => 'blob:local-upload-preview';
  URL.revokeObjectURL = () => {};
  let root;
  let uploads = [];
  let closes = 0;
  const courses = [{ id: 'course-demo', nome: 'Curso sintético', modalidade: 'TECNICO' }];
  const classes = [{ id: 'class-demo', nome: 'Turma sintética', codigo: 'DEMO', curso_id: 'course-demo' }];
  const polos = [{ id: 'polo-demo', nome: 'Polo sintético', cidade: 'Cidade sintética', uf: 'SE' }];
  const button = text => [...dom.window.document.querySelectorAll('button')].find(item => item.textContent.trim() === text);
  const visibleValidationMessage = () => {
    const message = dom.window.document.querySelector('[role="alert"]');
    assert.ok(message?.isConnected, 'A validação deve aparecer no formulário com role="alert"');
    assert.equal(message.hidden, false);
    assert.notEqual(dom.window.getComputedStyle(message).display, 'none');
    assert.notEqual(dom.window.getComputedStyle(message).visibility, 'hidden');
    return message.textContent;
  };
  const click = async element => { assert.ok(element && !element.disabled); await act(async () => element.click()); };
  const change = async (element, value) => {
    assert.ok(element);
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(element, value);
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  };
  const file = async (name = 'Documento sintético.png', size = 10) => {
    const input = dom.window.document.querySelector('input[type="file"]');
    const selected = new dom.window.File([new Uint8Array(size)], name, { type: 'image/png' });
    await act(async () => {
      Object.defineProperty(input, 'files', { configurable: true, value: [selected] });
      input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    return selected;
  };
  const pick = async (label, text) => {
    const input = dom.window.document.querySelector(`input[aria-label="${label}"]`);
    assert.ok(input);
    await act(async () => input.focus());
    const option = [...dom.window.document.querySelectorAll('[role="option"]')].find(item => item.textContent === text);
    await click(option);
  };
  try {
    const { createRoot } = await import('react-dom/client');
    root = createRoot(dom.window.document.getElementById('root'));
    const { Upload, bibliotecaService, polosService } = await components();
    Object.keys(bibliotecaService).forEach(key => { if (typeof bibliotecaService[key] === 'function') bibliotecaService[key] = async () => { throw Error(`Unexpected library I/O: ${key}`); }; });
    Object.assign(bibliotecaService, { getCursos: async () => courses, getTurmas: async () => classes, getTeacherActiveTurmas: async () => classes });
    polosService.getAll = async () => polos;
    let renderKey = 0;
    const render = async (teacher = false) => {
      uploads = []; closes = 0;
      await act(async () => root.render(React.createElement(Upload, { key: ++renderKey, isOpen: true,
        onClose: () => { closes++; }, onUpload: async payload => { uploads.push(payload); },
        pastaId: 'folder-demo', teacherId: teacher ? 'teacher-demo' : null, restrictToTeacherScope: teacher })));
    };
    const next = () => click(button('Avancar'));
    const submit = async () => {
      const form = dom.window.document.querySelector('form');
      await act(async () => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    };
    await context.test('arquivo obrigatório e limites rejeitam publicação antes de criar payload', async () => {
      await render();
      await next();
      assert.match(visibleValidationMessage(), /arquivo/);
      await file('arquivo.exe');
      assert.match(visibleValidationMessage(), /formato|permitido|suportad/i);
      await file('grande.png', 10 * 1024 * 1024 + 1);
      assert.match(visibleValidationMessage(), /10MB/);
      assert.equal(uploads.length, 0);
    });
    await context.test('combobox de abrangência e período mantêm IDs, dias inclusivos e revisão sem envio', async () => {
      await render();
      const selected = await file();
      await next();
      assert.equal(dom.window.document.querySelectorAll('select').length, 0);
      await pick('Abrangencia', 'Polo especifico');
      await next();
      assert.match(visibleValidationMessage(), /polo/i);
      await click([...dom.window.document.querySelectorAll('button')].find(item => item.textContent.includes('Polo sintético')));
      await next();
      await click([...dom.window.document.querySelectorAll('button')].find(item => item.textContent.includes('Periodo definido')));
      const dates = dom.window.document.querySelectorAll('input[type="date"]');
      await change(dates[0], '2026-11-07'); await change(dates[1], '2026-11-09');
      await next();
      assert.equal(uploads.length, 0, 'Entrar em Revisao não publica o arquivo');
      assert.match(dom.window.document.body.textContent, /3 dia\(s\) de acesso/);
      await submit();
      assert.equal(uploads.length, 1);
      assert.deepEqual({ ...uploads[0], file: undefined }, {
        title: 'Documento sintético', description: '', fileType: 'IMG', size: '0.00 MB', sizeBytes: 10,
        url: '', file: undefined, targetAudience: 'ALUNOS', scope: 'POLO_ESPECIFICO', poloId: 'polo-demo',
        poloName: 'Polo sintético', pastaId: 'folder-demo', teacherId: null, cursoIds: [], turmaIds: [],
        disciplinaIds: [], enforceTeacherScope: false, liberacaoTipo: 'POR_DATA',
        liberacaoData: new Date('2026-11-07T00:00:00').toISOString(), liberacaoDisciplinaId: null, liberacaoDiasValidade: 3
      });
      assert.equal(uploads[0].file, selected); assert.equal(closes, 1);
    });
    await context.test('professor só vê turmas vinculadas e deriva curso sem ampliar abrangência', async () => {
      await render(true); await file(); await next();
      assert.equal(dom.window.document.querySelector('input[aria-label="Abrangencia"]'), null);
      assert.ok(button('Turmas vinculadasLibere para alunos das turmas ativas em que você leciona.'));
      await click([...dom.window.document.querySelectorAll('button')].find(item => item.textContent.includes('Turmas vinculadas')));
      await next(); assert.match(visibleValidationMessage(), /turma/i);
      await click([...dom.window.document.querySelectorAll('button')].find(item => item.textContent.includes('Turma sintética')));
      await next(); await next(); assert.equal(uploads.length, 0);
      await submit();
      assert.equal(uploads.length, 1);
      const payload = uploads[0];
      assert.deepEqual(payload.cursoIds, ['course-demo']); assert.deepEqual(payload.turmaIds, ['class-demo']);
      assert.equal(payload.scope, 'GLOBAL'); assert.equal(payload.poloId, null);
      assert.equal(payload.enforceTeacherScope, true); assert.equal(payload.teacherId, 'teacher-demo');
      assert.equal(payload.liberacaoTipo, 'IMEDIATO'); assert.equal(payload.liberacaoDiasValidade, null);
    });
    assert.equal(network, 0);
  } finally {
    if (root) await act(async () => root.unmount());
    URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke;
    dom.window.close();
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
});
