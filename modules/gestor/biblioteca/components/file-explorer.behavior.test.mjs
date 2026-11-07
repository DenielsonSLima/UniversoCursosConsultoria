import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React, { act } from 'react';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { JSDOM } = require(process.env.BIBLIOTECA_JSDOM_PATH || 'jsdom');
const directory = dirname(fileURLToPath(import.meta.url));

async function components() {
  const baseline = process.env.FILE_EXPLORER_BASELINE_PATH;
  const bundle = await build({
    stdin: { contents: `export { default as Explorer } from './FileExplorer';
      export { bibliotecaService } from '../biblioteca.service';
      export { attempts } from '../../../shared/library/library-download';`, resolveDir: directory, loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react-dom', '@tanstack/react-query'], loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'local-test-only' }) },
    plugins: [{ name: 'explorer-deny-io', setup(plugin) {
      if (baseline) plugin.onLoad({ filter: /\/FileExplorer\.tsx$/ }, async () => ({ contents: await readFile(baseline, 'utf8'), loader: 'tsx', resolveDir: directory }));
      plugin.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'denied' }));
      plugin.onResolve({ filter: /shared\/library\/library-download$/ }, () => ({ path: 'downloads', namespace: 'denied' }));
      plugin.onLoad({ filter: /.*/, namespace: 'denied' }, ({ path }) => ({ contents: path === 'downloads'
        ? 'export const attempts=[];export async function downloadSingleLibraryFile(payload){attempts.push({kind:"single",payload});throw Error("Download blocked")};export async function downloadLibrarySelectionAsZip(payload){attempts.push({kind:"zip",payload});throw Error("Download blocked")};'
        : 'const channel={on(){return this},subscribe(){return this}};export const supabase={channel(){return channel},removeChannel(){},from(){throw Error("Database prohibited")},rpc(){throw Error("RPC prohibited")},storage:{from(){throw Error("Storage prohibited")}}};' }));
    } }],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}

test('FileExplorer mantém contratos, públicos e ações com I/O bloqueado', async context => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'navigator', 'fetch', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  const forbidden = [];
  globalThis.fetch = async () => { forbidden.push('fetch'); throw Error('Network prohibited'); };
  dom.window.print = () => { forbidden.push('print'); throw Error('Print prohibited'); };
  dom.window.open = () => { forbidden.push('open'); throw Error('Window prohibited'); };
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.document.addEventListener('click', event => { if (event.target.closest?.('a')) event.preventDefault(); }, true);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  let root;
  const folders = [
    { id: 'students', nome: 'Alunos de exemplo', parentId: null, targetAudience: 'ALUNOS', createdAt: '2026-11-07' },
    { id: 'private', nome: 'Privada de exemplo', parentId: null, targetAudience: 'INTERNO', createdAt: '2026-11-07' },
    { id: 'child', nome: 'Pasta filha', parentId: 'private', targetAudience: 'INTERNO', createdAt: '2026-11-07' },
  ];
  const documentFixture = { id: 'doc', pastaId: null, title: 'Material sintético.txt', fileType: 'OTHER', size: '100 B', sizeBytes: 100, url: '#', targetAudience: 'ALUNOS', scope: 'GLOBAL', acessos: 3, authorName: 'QA', createdAt: '2026-11-07' };
  const documents = [documentFixture, { ...documentFixture, id: 'teacher-doc', title: 'Documento professor.pdf', targetAudience: 'PROFESSORES', fileType: 'PDF' }];
  const writes = [], previews = [], uploads = [], reads = [], counters = [];
  const body = () => dom.window.document.body;
  const button = (label, scope = body()) => [...scope.querySelectorAll('button')].find(item => item.textContent.trim() === label);
  const title = (label, scope = body()) => scope.querySelector(`[title="${label}"]`);
  const click = async element => {
    assert.ok(element && !element.disabled, 'Elemento acionável esperado');
    await act(async () => {
      element.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
      element.click();
    });
  };
  const input = async (element, value) => {
    assert.ok(element);
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(element, value);
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  };
  const wait = async predicate => {
    const deadline = Date.now() + 3000;
    while (!predicate() && Date.now() < deadline) await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
    assert.ok(predicate(), 'Condição DOM esperada não foi alcançada');
  };
  const picker = id => dom.window.document.getElementById(id);
  const options = async element => {
    if (element.tagName === 'SELECT') return [...element.options].map(option => ({ value: option.value, label: option.textContent }));
    await act(async () => element.focus());
    await click(element);
    return [...body().querySelectorAll('[role="option"]')].map(option => ({ value: option.dataset.value, label: option.textContent }));
  };
  const pick = async (element, value, label) => {
    assert.ok(element);
    if (element.tagName === 'SELECT') {
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value').set.call(element, value);
        element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
    } else {
      await options(element);
      const option = [...body().querySelectorAll('[role="option"]')].find(item => item.textContent === label);
      assert.ok(option, label); await click(option);
    }
  };
  const closePicker = async element => {
    if (element.tagName !== 'SELECT') await act(async () => element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  };
  try {
    const { createRoot } = await import('react-dom/client');
    root = createRoot(dom.window.document.getElementById('root'));
    const { Explorer, bibliotecaService, attempts } = await components();
    Object.keys(bibliotecaService).forEach(key => { if (typeof bibliotecaService[key] === 'function') bibliotecaService[key] = async () => { throw Error(`Unexpected library I/O: ${key}`); }; });
    Object.assign(bibliotecaService, {
      getFolders: async (parentId, teacherId) => { reads.push(['folders', parentId, teacherId]); return folders.filter(folder => (folder.parentId || null) === parentId); },
      getDocuments: async filter => { reads.push(['documents', filter]); return filter && Object.hasOwn(filter, 'pastaId') && filter.pastaId !== null ? [] : documents; },
      getFoldersForMove: async teacherId => { reads.push(['targets', teacherId]); return folders.map(folder => ({ id: folder.id, nome: folder.nome, parent_id: folder.parentId })); },
      incrementAcessos: async id => { counters.push(id); },
      getCursos: async () => [], getTurmas: async () => [], getDisciplinas: async () => [], getTeacherActiveTurmas: async () => [],
    });
    for (const method of ['createFolder', 'renameFolder', 'updateFolderAudience', 'deleteFolder', 'deleteDocument', 'moveFolder', 'moveDocument', 'copyDocument']) {
      bibliotecaService[method] = async (...args) => { writes.push([method, ...args]); };
    }
    let renderKey = 0;
    const mount = async props => {
      await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Explorer, {
        key: ++renderKey, onPreviewClick: doc => previews.push(doc.id), onNewUploadClick: id => uploads.push(id), ...props,
      }))));
      await wait(() => !!title('Abrir pasta Privada de exemplo'));
    };
    await context.test('readOnly e allowedAudiences mantêm somente ações e arquivos autorizados', async () => {
      await mount({ readOnly: true, allowedAudiences: ['ALUNOS'] });
      assert.ok(title('Visualizar Material sintético.txt'));
      assert.equal(title('Visualizar Documento professor.pdf'), null);
      for (const name of ['Copiar', 'Mover', 'Apagar', 'Regras de Liberação', 'Compartilhamento']) assert.equal(title(name), null);
      assert.equal(button('Nova Pasta'), undefined);
      await click(title('Visualizar Material sintético.txt'));
      assert.deepEqual(previews, ['doc']); assert.deepEqual(counters, ['doc']);
      await click(body().querySelector('[aria-label="Selecionar arquivo Material sintético.txt"]'));
      await click(button('Baixar arquivo'));
      assert.equal(attempts.length, 1); assert.equal(attempts[0].kind, 'single');
      assert.deepEqual(attempts[0].payload, { id: 'doc', folderId: null, name: 'Material sintético.txt', url: '#', fileType: 'OTHER', sizeBytes: 100 });
      assert.equal(writes.length, 0);
    });
    await context.test('pasta criada conserva nome aparado, parentId, teacherId e público canônico', async () => {
      await mount({}); await click(button('Nova Pasta'));
      await input(body().querySelector('input[placeholder="Nome da pasta..."]'), '  Pasta sintética  ');
      await pick(picker('new-folder-audience'), 'ALUNOS', 'Alunos');
      await click(button('Criar'));
      await wait(() => !body().querySelector('input[placeholder="Nome da pasta..."]'));
      assert.deepEqual(writes.at(-1), ['createFolder', 'Pasta sintética', null, null, 'ALUNOS']);
      await click(button('Enviar Arquivo')); assert.deepEqual(uploads, [null]);
    });
    await context.test('permissão do ancestral privado e nota de herança permanecem', async () => {
      await mount({}); await click(title('Abrir pasta Privada de exemplo'));
      await wait(() => !!title('Abrir pasta Pasta filha'));
      await click(button('Nova Pasta'));
      assert.deepEqual((await options(picker('new-folder-audience'))).map(option => option.label), ['Somente gestão']);
      await closePicker(picker('new-folder-audience')); await click(button('Cancelar'));
      await click(title('Compartilhamento'));
      assert.deepEqual((await options(picker('folder-audience'))).map(option => option.label), ['Somente gestão']);
      await closePicker(picker('folder-audience'));
      assert.match(body().textContent, /respeita a permissão de todas as pastas acima/);
      await click(button('Salvar'));
      await wait(() => !picker('folder-audience'));
      assert.deepEqual(writes.at(-1), ['updateFolderAudience', 'child', 'INTERNO']);
      await click(title('Renomear'));
      await input(body().querySelector('input[placeholder="Novo nome..."]'), '  Novo nome  ');
      await click(button('Renomear'));
      await wait(() => !body().querySelector('input[placeholder="Novo nome..."]'));
      assert.deepEqual(writes.at(-1), ['renameFolder', 'child', 'Novo nome']);
    });
    await context.test('escopo docente conserva opções e IDs sem ampliar visibilidade', async () => {
      await mount({ teacherId: 'teacher-demo', restrictPermissionsToTeacherScope: true });
      await click(button('Nova Pasta'));
      assert.deepEqual((await options(picker('new-folder-audience'))).map(option => option.label), ['Somente gestão', 'Alunos']);
      await closePicker(picker('new-folder-audience'));
      await input(body().querySelector('input[placeholder="Nome da pasta..."]'), 'Pasta docente');
      await pick(picker('new-folder-audience'), 'ALUNOS', 'Alunos'); await click(button('Criar'));
      await wait(() => !body().querySelector('input[placeholder="Nome da pasta..."]'));
      assert.deepEqual(writes.at(-1), ['createFolder', 'Pasta docente', null, 'teacher-demo', 'ALUNOS']);
      assert.ok(reads.some(row => row[0] === 'folders' && row[2] === 'teacher-demo'));
    });
    await context.test('mover/copiar/excluir continuam exigindo a mesma ação e o mesmo ID', async () => {
      await mount({}); const article = title('Visualizar Material sintético.txt').closest('article');
      const before = writes.length; await click(title('Copiar', article));
      assert.equal(writes.length, before); await click(button('Copiar para a Raiz'));
      await wait(() => writes.length === before + 1);
      assert.deepEqual(writes.at(-1), ['copyDocument', 'doc', null]);
      await mount({}); await click(title('Mover', title('Visualizar Material sintético.txt').closest('article')));
      await wait(() => !!button('Alunos de exemplo')); await click(button('Alunos de exemplo'));
      await wait(() => writes.at(-1)?.[0] === 'moveDocument');
      assert.deepEqual(writes.at(-1), ['moveDocument', 'doc', 'students']);
      await mount({}); await click(title('Apagar', title('Visualizar Material sintético.txt').closest('article')));
      const deletionBefore = writes.length;
      assert.match(body().textContent, /Deseja realmente apagar o arquivo “Material sintético.txt”/);
      await click(button('Apagar')); await wait(() => writes.length > deletionBefore);
      assert.deepEqual(writes.at(-1), ['deleteDocument', 'doc']);
    });
    await context.test('filtro global e ZIP usam o público permitido sem alterar o transporte', async () => {
      await mount({ allowedAudiences: ['ALUNOS'] });
      await input(body().querySelector('input[placeholder="Buscar em todas as pastas..."]'), 'Material');
      assert.equal(button('Nova Pasta'), undefined); assert.match(body().textContent, /Busca global ativa/);
      const fileType = body().querySelector('[aria-label="Tipo de arquivo"]') || body().querySelector('select');
      await pick(fileType, 'PDF', 'PDF');
      await wait(() => /Nenhum resultado encontrado/.test(body().textContent));
      await click(button('Limpar'));
      await wait(() => !!title('Visualizar Material sintético.txt'));
      await click(body().querySelector('[aria-label="Selecionar pasta Alunos de exemplo"]'));
      await click(body().querySelector('[aria-label="Selecionar arquivo Material sintético.txt"]'));
      await click(button('Baixar ZIP'));
      await wait(() => attempts.at(-1)?.kind === 'zip');
      const payload = attempts.at(-1).payload;
      assert.deepEqual(payload.selectedFolderIds, ['students']); assert.deepEqual(payload.selectedDocumentIds, ['doc']);
      assert.deepEqual(payload.documents.map(document => document.id), ['doc']);
      assert.equal(payload.archiveName, 'biblioteca');
      if (!process.env.FILE_EXPLORER_BASELINE_PATH) assert.equal(body().querySelectorAll('select,datalist').length, 0);
    });
    assert.deepEqual(forbidden, []);
  } finally {
    if (root) await act(async () => root.unmount());
    client.clear(); dom.window.close();
    previous.forEach((descriptor, name) => descriptor ? Object.defineProperty(globalThis, name, descriptor) : Reflect.deleteProperty(globalThis, name));
  }
});
