import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React, { act } from 'react';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { JSDOM } = require(process.env.INSTITUTIONAL_SELECT_JSDOM_PATH || 'jsdom');

async function component(entry) {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react-dom', '@tanstack/react-query'], loader: { '.css': 'empty' },
    plugins: [{ name: 'configuration-controlled-io', setup(plugin) {
      const stubs = {
        supabase: 'const channel={on(){return this},subscribe(){return this}};export const supabase={channel(){return channel},removeChannel(){}};',
        whatsapp: 'export const whatsappService=new Proxy({}, {get(){return ()=>{throw new Error("Operação Meta inesperada")}}});',
        messages: 'export const mensageriaService={getTemplates:async()=>[],updateTemplate:async(id,data)=>{globalThis.__configurationSaved={id,data}},createTemplate:async()=>{throw new Error("Criação inesperada")},deleteTemplate:async()=>{throw new Error("Exclusão inesperada")}};',
      };
      for (const [filter, name] of [[/lib\/supabase$/, 'supabase'], [/whatsapp\.service$/, 'whatsapp'], [/mensageria\.service$/, 'messages']]) {
        plugin.onResolve({ filter }, () => ({ path: name, namespace: 'controlled-io' }));
      }
      plugin.onLoad({ filter: /.*/, namespace: 'controlled-io' }, ({ path }) => ({ contents: stubs[path] }));
    } }],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, module, module.exports);
  return module.exports.default;
}

test('seletores de configuração preservam IDs, booleanos e só salvam após confirmação explícita', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
  const names = ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'navigator', 'fetch', 'alert', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  let root;
  let requests = 0;
  const saved = [];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  globalThis.fetch = async () => { requests++; throw Error('Rede bloqueada'); };
  globalThis.alert = message => { throw Error(`Alerta inesperado: ${message}`); };
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const pick = async (label, value) => {
    const field = dom.window.document.querySelector(`input[aria-label="${label}"]`);
    assert.ok(field, label);
    await act(async () => field.focus());
    const option = [...dom.window.document.querySelectorAll('[role="option"]')].find(item => item.textContent === value);
    assert.ok(option, value);
    await act(async () => option.click());
  };
  const click = async label => {
    const button = [...dom.window.document.querySelectorAll('button')].find(item => item.textContent.trim() === label);
    assert.ok(button && !button.disabled, label);
    await act(async () => button.click());
  };
  try {
    const { createRoot } = await import('react-dom/client');
    root = createRoot(dom.window.document.getElementById('root'));
    const Form = await component('./components/WhatsAppLineConfigForm.tsx');
    const line = { id: 'demo', nome: 'Linha sintética', instituicao: 'universo', telefone: '', status: 'ativo', is_matriz_financeira: false, connection_mode: 'cloud_api', updated_at: '2026-11-07T12:00:00Z' };
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Form, { conexao: line, isSaving: false, onSave: async data => saved.push(data) }))));
    assert.equal(dom.window.document.querySelectorAll('select').length, 0);
    await pick('Função da linha', 'Matriz financeira principal');
    await pick('Operação', 'Linha inativa');
    assert.equal(saved.length, 0);
    await click('Salvar');
    assert.equal(saved.length, 1);
    assert.equal(saved[0].id, line.id);
    assert.equal(saved[0].is_matriz_financeira, true);
    assert.equal(saved[0].status, 'inativo');
    assert.equal(saved[0].connection_mode, 'cloud_api');
    assert.equal(saved[0].tokenInput, undefined);
    assert.equal(saved[0].appSecretInput, undefined);
    assert.equal(saved[0].verifyTokenInput, undefined);

    const template = { id: 'template-demo', nome: 'Lembrete', gatilho: 'Manual', conteudo: 'Texto sintético {{nome_parceiro}}' };
    client.setQueryData(['templates_mensagens'], [template]);
    const Templates = await component('../templates-mensagens/TemplatesMensagensConfig.tsx');
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Templates))));
    const card = [...dom.window.document.querySelectorAll('h4')].find(item => item.textContent === 'Lembrete');
    await act(async () => card.click());
    await pick('Gatilho de Disparo', '3 dias após o vencimento (Atraso)');
    assert.equal(globalThis.__configurationSaved, undefined);
    await click('Salvar Template');
    assert.equal(globalThis.__configurationSaved.id, template.id);
    assert.deepEqual(globalThis.__configurationSaved.data, { nome: template.nome, gatilho: 'Post-vencido (3 dias)', conteudo: template.conteudo });
    assert.equal(requests, 0);
  } finally {
    if (root) await act(async () => root.unmount());
    client.clear(); dom.window.close(); delete globalThis.__configurationSaved;
    previous.forEach((descriptor, name) => descriptor ? Object.defineProperty(globalThis, name, descriptor) : Reflect.deleteProperty(globalThis, name));
  }
});
