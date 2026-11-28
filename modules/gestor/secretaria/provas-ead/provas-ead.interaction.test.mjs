import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const jsdom = process.env.EAD_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdom ? pathToFileURL(resolve(jsdom)).href : 'jsdom');

test('Provas EAD exige permissão explícita, confirma a antecipação e isola o polo', async () => {
  await mkdir(resolve(repo, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(repo, 'tmp/provas-ead-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  const previous = new Map();
  for (const key of ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true,
      value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  }

  let root, client, deniesRelease = true;
  const calls = [];
  const channels = [];
  const rows = {
    'polo-a': [{ matriculaId: 'matricula-a', alunoNome: 'Aluna fictícia A', cursoNome: 'Curso A', turmaNome: 'Turma A',
      iniciadoEm: '2026-11-25T13:00:00Z', liberaEm: '2026-12-02T13:00:00Z' }],
    'polo-b': [{ matriculaId: 'matricula-b', alunoNome: 'Aluno fictício B', cursoNome: 'Curso B', turmaNome: 'Turma B',
      iniciadoEm: '2026-11-26T13:00:00Z', liberaEm: '2026-12-03T13:00:00Z' }],
  };
  globalThis.__eadExamTransport = {
    rpc(name, args) {
      calls.push({ name, args });
      if (name === 'secretaria_listar_provas_ead_em_carencia') {
        const items = rows[args.p_polo_id].filter(row => row.alunoNome.includes(args.p_busca));
        const request = Promise.resolve({ data: { items, total: items.length, page: args.p_pagina, pageSize: 20 } });
        request.abortSignal = () => request;
        return request;
      }
      assert.equal(name, 'secretaria_liberar_prova_ead_antecipada');
      if (deniesRelease) return Promise.resolve({ error: { code: '42501' } });
      rows[args.p_polo_id] = rows[args.p_polo_id].filter(row => row.matriculaId !== args.p_matricula_id);
      return Promise.resolve({ data: { matriculaId: args.p_matricula_id, liberadoEm: '2026-11-28T12:00:00Z' } });
    },
    channel(name) {
      const channel = {
        name, removed: false,
        on(_type, spec) { channel.spec = spec; return channel; },
        subscribe(callback) { callback('SUBSCRIBED'); return channel; },
      };
      channels.push(channel);
      return channel;
    },
    removeChannel(channel) { channel.removed = true; return Promise.resolve(); },
  };

  try {
    const output = resolve(temp, 'secretaria.mjs');
    await build({
      entryPoints: [resolve(repo, 'modules/gestor/secretaria/SecretariaPage.tsx')],
      outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      jsx: 'automatic', loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ DEV: true }) },
      plugins: [{ name: 'provas-ead-transport', setup(builder) {
        builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'fixture' }));
        builder.onResolve({ filter: /.*/ }, args => {
          if (!args.importer.endsWith('/SecretariaPage.tsx')) return;
          if (args.kind === 'dynamic-import' && !args.path.includes('provas-ead')) return { path: 'other', namespace: 'fixture' };
          if (args.path.endsWith('secretaria-documentos.definitions')) return { path: 'definitions', namespace: 'fixture' };
          if (args.path.endsWith('secretaria-carteirinhas.service')) return { path: 'cards', namespace: 'fixture' };
        });
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents: {
          supabase: 'export const supabase = globalThis.__eadExamTransport;',
          definitions: 'export const secretariaDocumentoDefinitions = {};',
          cards: 'export const secretariaCarteirinhasWorkspaceQueryOptions = () => ({});',
          other: 'export default () => null;',
        }[args.path] }));
      } }],
    });

    const { default: SecretariaPage } = await import(pathToFileURL(output).href);
    const { createRoot } = await import('react-dom/client');
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 }, mutations: { gcTime: 0 } } });
    root = createRoot(document.getElementById('root'));
    const render = props => act(async () => root.render(React.createElement(QueryClientProvider, { client },
      React.createElement(SecretariaPage, { gestorContextId: 'gestor-teste', ...props }),
    )));
    const button = (label) => [...document.querySelectorAll('button')].find(item => item.textContent.includes(label));
    const flush = () => act(async () => { await new Promise(done => setTimeout(done, 25)); });
    const click = async element => { await act(async () => element.click()); await flush(); };
    const base = { modules: ['secretaria'], financeiroTabs: [], allPolos: false };
    const authorized = { ...base, tabs: { secretaria: ['provas-ead'] } };
    await render({ poloId: 'polo-a', gestorPermissions: { ...base, tabs: { secretaria: ['historico'] } } });
    assert.equal(button('Provas EAD'), undefined);
    await render({ poloId: null, gestorPermissions: authorized });
    assert.equal(button('Provas EAD'), undefined);
    assert.equal(calls.length, 0);

    await render({ poloId: 'polo-a', gestorPermissions: authorized });
    await click(button('Provas EAD'));
    assert.match(document.body.textContent, /Aluna fictícia A/);
    assert.equal(channels.at(-1).spec.filter, 'polo_id=eq.polo-a');
    await click(button('Liberar antes do prazo'));
    assert.equal(button('Confirmar liberação').disabled, true);
    const textarea = document.querySelector('textarea');
    assert.equal(document.activeElement, textarea);
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, '  Motivo acadêmico fictício  ');
      textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await click(button('Confirmar liberação'));
    assert.match(document.querySelector('form [role=alert]').textContent, /permissões/);
    assert.equal(textarea.value, '  Motivo acadêmico fictício  ');
    deniesRelease = false;
    await click(button('Confirmar liberação'));
    assert.equal(document.querySelector('textarea'), null);
    assert.match(document.body.textContent, /Nenhuma prova aguardando/);
    assert.deepEqual(calls.filter(call => call.name === 'secretaria_liberar_prova_ead_antecipada').at(-1).args, {
      p_polo_id: 'polo-a', p_matricula_id: 'matricula-a', p_motivo: 'Motivo acadêmico fictício',
    });

    await render({ poloId: 'polo-b', gestorPermissions: authorized });
    await flush();
    assert.match(document.body.textContent, /Aluno fictício B/);
    assert.equal(channels.at(0).removed, true);
    assert.equal(channels.at(-1).spec.filter, 'polo_id=eq.polo-b');
    await render({ poloId: 'polo-b', gestorPermissions: base });
    assert.equal(button('Provas EAD'), undefined);
    assert.doesNotMatch(document.body.textContent, /Aluno fictício B/);
    assert.equal(channels.at(-1).removed, true);
  } finally {
    if (root) await act(async () => root.unmount());
    client?.clear();
    dom.window.close();
    delete globalThis.__eadExamTransport;
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    await rm(temp, { recursive: true, force: true });
  }
});
