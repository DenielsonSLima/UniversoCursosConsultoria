import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React, { act } from 'react';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const { JSDOM } = require(process.env.PARTNER_FORM_JSDOM_PATH || process.env.INSTITUTIONAL_SELECT_JSDOM_PATH || 'jsdom');

class TestMessageChannel {
  port1 = { onmessage: null };
  port2 = { postMessage: () => globalThis.queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
}

test('Próximo da etapa 4 abre contato e só o clique explícito em Salvar envia o cadastro', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
  const globals = ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'MessageChannel', 'navigator', 'fetch', 'alert', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let requests = 0;
  let root;
  const saved = [];
  let submissions = 0;

  globals.forEach((key) => Object.defineProperty(globalThis, key, {
    configurable: true, writable: true,
    value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : key === 'MessageChannel' ? TestMessageChannel : dom.window[key],
  }));
  globalThis.fetch = async () => { requests++; throw new Error('I/O não permitido neste teste'); };
  globalThis.alert = (message) => { throw new Error(`Validação inesperada: ${message}`); };
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};

  try {
    const bundle = await build({
      entryPoints: [fileURLToPath(new URL('./ParceiroAlunoForm.tsx', import.meta.url))],
      bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
      external: ['react', 'react-dom'], loader: { '.css': 'empty' },
      plugins: [{ name: 'registration-controlled-io', setup(plugin) {
        const stubs = {
          photo: 'export default function Photo(){return null}',
          companies: 'export const empresasService={uploadLogo(){throw new Error("Upload inesperado")}}',
          supabase: 'export const supabase=new Proxy({}, {get(){throw new Error("Acesso remoto inesperado")}});',
          catalog: 'export const MUNICIPALITY_FALLBACK_OPTIONS=[];export const NATIONALITY_FALLBACK_OPTIONS=[];export const searchMunicipalityCatalog=async()=>[];export const searchNationalityCatalog=async()=>[];',
        };
        for (const [filter, name] of [
          [/ProfilePhotoAdjustModal$/, 'photo'], [/empresas\.service$/, 'companies'],
          [/person-reference-catalog\.service$/, 'catalog'], [/lib\/supabase$/, 'supabase'],
        ]) plugin.onResolve({ filter }, () => ({ path: name, namespace: 'controlled-io' }));
        plugin.onLoad({ filter: /.*/, namespace: 'controlled-io' }, ({ path }) => ({ contents: stubs[path] }));
      } }],
    });
    const componentModule = { exports: {} };
    new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, componentModule, componentModule.exports);
    const Form = componentModule.exports.default;
    const { createRoot } = await import('react-dom/client');
    root = createRoot(dom.window.document.getElementById('root'));
    await act(async () => root.render(React.createElement(Form, {
      defaultPoloId: '11111111-1111-4111-8111-111111111111',
      onSave: async (data) => { saved.push(data); },
    })));

    const input = (name) => dom.window.document.querySelector(`input[name="${name}"]`);
    const enter = async (name, value) => {
      assert.ok(input(name), name);
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input(name), value);
        input(name).dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });
    };
    const button = (label) => [...dom.window.document.querySelectorAll('button')].find((item) => item.textContent.includes(label));
    const click = async (element) => { assert.ok(element && !element.disabled); await act(async () => element.click()); };
    const pick = async (label, optionLabel) => {
      const field = dom.window.document.querySelector(`input[aria-label="${label}"]`);
      await act(async () => field.focus());
      const option = [...dom.window.document.querySelectorAll('[role="option"]')].find((item) => item.textContent === optionLabel);
      await click(option);
    };

    await enter('nomeCompleto', 'ALUNO SINTÉTICO');
    await enter('cpf', '52998224725');
    await enter('dataNascimento', '01012000');
    for (let step = 1; step < 5; step++) await click(button('Próximo'));
    for (const [name, value] of Object.entries({
      cep: '00000000', endereco: 'RUA DE TESTE', numero: '1', bairro: 'BAIRRO', cidade: 'CIDADE', contato1: '79999999999',
    })) await enter(name, value);
    await pick('UF', 'SE');
    const form = dom.window.document.querySelector('form');
    form.addEventListener('submit', () => { submissions++; });
    assert.equal(form.checkValidity(), true, 'os campos finais estão preenchidos; um submit indevido não seria bloqueado');

    await click(dom.window.document.querySelector('button[aria-label="Etapa 4: Escolaridade"]'));
    const nextButton = button('Próximo');
    assert.equal(nextButton.type, 'button');
    await click(nextButton);
    assert.ok(input('cep'), 'etapa 5 deve aparecer');
    assert.equal(input('cep').value, '00000-000');
    const saveButton = button('Salvar Cadastro');
    assert.notEqual(saveButton, nextButton, 'não reutilizar o botão clicado como submit durante sua ativação padrão');
    assert.equal(nextButton.isConnected, false);
    assert.equal(nextButton.type, 'button');
    assert.equal(submissions, 0);
    assert.equal(saved.length, 0);

    await enter('numero', '   ');
    await click(saveButton);
    assert.equal(saved.length, 0, 'número só com espaços não deve salvar');
    assert.match(dom.window.document.querySelector('[role="alert"]').textContent, /número do endereço/);
    await enter('numero', ' 123 ');
    await click(saveButton);
    assert.equal(saved[0].numero, '123');
    assert.equal(submissions, 2);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].matricularAgora, false);
    assert.equal(saved[0].cep, '00000-000');
    assert.equal(requests, 0);
  } finally {
    if (root) await act(async () => root.unmount());
    dom.window.close();
    previous.forEach((descriptor, key) => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
});
