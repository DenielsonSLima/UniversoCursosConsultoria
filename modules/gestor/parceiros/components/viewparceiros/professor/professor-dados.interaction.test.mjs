import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';

const { JSDOM } = await import(pathToFileURL(resolve(process.env.NFSE_TEST_JSDOM_MODULE || 'tmp/lgpd-test-runtime/node_modules/jsdom/lib/api.js')).href);

test('edição de professor entrega nome, contato, UF e unidades canônicos sem aliases antigos', async () => {
  await mkdir('tmp', { recursive: true });
  const temp = await mkdtemp(resolve('tmp/professor-dados-interaction-'));
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  const output = resolve(temp, 'ui.mjs');
  const compiled = await build({ stdin: { contents: `export {default as Dados} from './modules/gestor/parceiros/components/viewparceiros/professor/ParceiroProfessorDados';
    export {toSnake} from './modules/gestor/parceiros/utils/parceiro-mappers';`, resolveDir: process.cwd(), loader: 'tsx' },
    outfile: output, bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic',
    plugins: [{ name: 'no-live-services', setup(builder) {
      builder.onResolve({ filter: /parceiros\.service$/ }, () => ({ path: 'parceiros', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: `export const parceirosService={getPolos:async()=>[
        {id:'11111111-1111-4111-8111-111111111111',nome:'Unidade de teste',cidade:'JAPOATÃ',uf:'SE'},
        {id:'22222222-2222-4222-8222-222222222222',nome:'Unidade de teste',cidade:'PROPRIÁ',uf:'SE'}]};` }));
    } }] });
  await writeFile(output, compiled.outputFiles.find(file => file.path.endsWith('.mjs')).contents);
  const { Dados, toSnake } = await import(pathToFileURL(output).href);
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  let saved;
  const data = { id: 'teacher-test', tipo: 'Professor', nome: 'ANTIGO', nomeCompleto: 'ANTIGO', telefone: '(79) 99999-0000', contato1: '(79) 99999-0000',
    poloId: '11111111-1111-4111-8111-111111111111', poloIds: ['11111111-1111-4111-8111-111111111111'], uf: 'SE' };
  const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
  const fill = async (name, value) => act(async () => {
    const input = document.querySelector(`input[name="${name}"]`);
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  try {
    await act(async () => root.render(React.createElement(Dados, { data, onChange: async value => { saved = value; } })));
    await act(async () => button('Editar').click());
    assert.equal(document.querySelectorAll('select').length, 0);
    await fill('nome', 'Nome alterado');
    await fill('telefone', '79912345678');
    const polos = [...document.querySelectorAll('button[aria-pressed]')];
    await act(async () => polos[1].click());
    await act(async () => polos[0].click());
    const state = document.querySelector('[aria-label="Estado"]');
    await act(async () => state.focus());
    await act(async () => [...document.querySelectorAll('[role="option"]')].find(node => node.textContent === 'AL').click());
    await act(async () => button('Salvar Alterações').click());
    const canonical = toSnake(saved);
    assert.equal(canonical.nome, 'NOME ALTERADO');
    assert.equal(canonical.telefone, '(79) 91234-5678');
    assert.equal(canonical.uf, 'AL');
    assert.equal(canonical.polo_id, '22222222-2222-4222-8222-222222222222');
    assert.deepEqual(canonical.polo_ids, ['22222222-2222-4222-8222-222222222222']);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    await rm(temp, { recursive: true, force: true });
  }
});
