import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';

const { JSDOM } = await import(pathToFileURL(resolve(process.env.NFSE_TEST_JSDOM_MODULE || 'tmp/lgpd-test-runtime/node_modules/jsdom/lib/api.js')).href);

test('cadastro compacto mantém polos, validação, seleção Pix, etapas e bloqueio durante gravação', async () => {
  await mkdir('tmp', { recursive: true });
  const temp = await mkdtemp(resolve('tmp/professor-form-interaction-'));
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const output = resolve(temp, 'ui.mjs');
  const compiled = await build({ entryPoints: [resolve('modules/gestor/parceiros/components/formularioparceiros/professor/ParceiroProfessorForm.tsx')],
    outfile: output, bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic',
    plugins: [{ name: 'no-live-services', setup(builder) {
      builder.onResolve({ filter: /(?:parceiros|empresas)\.service$/ }, args => ({ path: args.path.includes('parceiros') ? 'parceiros' : 'empresas', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents: args.path === 'parceiros'
        ? `export const parceirosService={getPolos:async()=>[{id:'11111111-1111-4111-8111-111111111111',nome:'Unidade de teste',cidade:'JAPOATÃ',uf:'SE'}]};`
        : 'export const empresasService={uploadLogo:async()=>"photo-test"};' }));
    } }] });
  await writeFile(output, compiled.outputFiles.find(file => file.path.endsWith('.mjs')).contents);
  const { default: ProfessorForm } = await import(pathToFileURL(output).href);
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  const saves = [];
  const props = { onSave: value => saves.push(value) };
  const render = values => act(async () => root.render(React.createElement(ProfessorForm, { ...props, ...values })));
  const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
  const fill = async (name, value) => act(async () => {
    const input = document.querySelector(`input[name="${name}"]`);
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  try {
    await render({});
    assert.equal(document.querySelectorAll('select').length, 0);
    await act(async () => button('Próximo').click());
    assert.match(document.querySelector('[role="alert"]').textContent, /polo/i);
    await act(async () => document.querySelector('button[aria-pressed]').click());
    await fill('nomeCompleto', 'Professora de teste');
    await fill('cpf', '52998224725');
    await act(async () => button('Próximo').click());
    assert.equal(document.querySelector('[aria-current="step"]').textContent.trim(), 'Formação');
    await act(async () => button('Próximo').click());
    const pix = document.querySelector('[aria-label="Tipo de chave Pix"]');
    await act(async () => pix.focus());
    await act(async () => [...document.querySelectorAll('[role="option"]')].find(node => node.textContent === 'E-mail').click());
    await fill('chavePix', 'DOCENTE@EXAMPLE.INVALID');
    await act(async () => button('Próximo').click());
    assert.equal(saves.length, 0, 'Avançar para a última etapa não deve submeter');
    await act(async () => document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(saves.length, 1);
    assert.deepEqual(saves[0].poloIds, ['11111111-1111-4111-8111-111111111111']);
    assert.equal(saves[0].cpf, '529.982.247-25');
    assert.equal(saves[0].tipoChavePix, 'EMAIL');
    assert.equal(saves[0].chavePix, 'docente@example.invalid');
    await render({ isSaving: true });
    assert(document.querySelector('form fieldset').disabled);
    assert(button('Salvando...').disabled);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    await rm(temp, { recursive: true, force: true });
  }
});
