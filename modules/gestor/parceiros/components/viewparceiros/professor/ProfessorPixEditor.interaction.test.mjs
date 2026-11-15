import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const rootDirectory = fileURLToPath(new URL('../../../../../../', import.meta.url));

class TestMessageChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage: () => globalThis.queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
  }
}

test('editor Pix real mantém cadastro opcional, validação, edição e estados de gravação', async t => {
  const jsdomPath = process.env.FINANCIAL_PAYMENT_JSDOM_PATH;
  const { JSDOM } = require(jsdomPath ? resolve(jsdomPath) : 'jsdom');
  const temporary = await mkdtemp(join(tmpdir(), 'professor-pix-editor-'));
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
  };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let root;
  let act;
  try {
    const bundle = join(temporary, 'editor.cjs');
    await build({
      stdin: { contents: `
        export { default as ProfessorPixEditor } from './modules/gestor/parceiros/components/viewparceiros/professor/ProfessorPixEditor';
        export { act, default as React } from 'react';
        export { createRoot } from 'react-dom/client';
      `, loader: 'tsx', resolveDir: rootDirectory },
      outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
      loader: { '.css': 'empty' },
    });
    const components = require(bundle);
    act = components.act;
    const { React, createRoot, ProfessorPixEditor } = components;
    const button = label => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === label);
    const input = () => document.querySelector('input[name="chavePix"]');
    let props;
    let saved;
    const render = async updates => {
      props = { ...props, ...updates };
      await act(async () => root.render(React.createElement(ProfessorPixEditor, { ...props, key: props.professor.id })));
    };
    const mount = async updates => {
      if (root) await act(async () => root.unmount());
      saved = [];
      root = createRoot(document.getElementById('root'));
      props = { professor: { id: 'teacher-a' }, onSave: async value => { saved.push(value); } };
      await render(updates);
    };
    const close = async () => { await act(async () => root.unmount()); root = undefined; };
    const click = async label => {
      assert.ok(button(label), `botão ${label} disponível`);
      await act(async () => button(label).click());
    };
    const choose = async label => {
      await act(async () => document.querySelector('[aria-label="Tipo de chave Pix"]').click());
      const option = [...document.querySelectorAll('[role="option"]')].find(node => node.textContent.trim() === label);
      assert.ok(option, `tipo ${label} disponível`);
      await act(async () => option.click());
    };
    const fill = async value => act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input(), value);
      input().dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });

    await t.test('sem chave é opcional e pode salvar o par vazio', async () => {
      await mount();
      assert.match(document.body.textContent, /Nenhuma chave Pix informada/);
      await click('Adicionar Pix');
      assert.equal(document.querySelectorAll('select,datalist,input[type="file"]').length, 0);
      assert.equal(input().required, false);
      assert.equal(input().disabled, true);
      await click('Salvar Pix');
      assert.deepEqual(saved, [{ tipoChavePix: '', chavePix: '' }]);
      assert.match(document.querySelector('[role="status"]').textContent, /salvos sem chave/);
      await close();
    });

    await t.test('legado sem tipo permanece explícito e não é inferido pela chave', async () => {
      await mount({ professor: { id: 'teacher-a', tipoChavePix: 'LEGADO', chavePix: 'pix@example.test' } });
      assert.match(document.body.textContent, /Tipo não informado/);
      assert.match(document.body.textContent, /pix@example.test/);
      await click('Editar Pix');
      assert.equal(input().value, 'pix@example.test');
      assert.equal(input().disabled, true);
      assert.equal(document.querySelector('[aria-label="Tipo de chave Pix"]').value, 'Sem chave Pix');
      await click('Salvar Pix');
      assert.deepEqual(saved, []);
      assert.match(document.querySelector('[role="alert"]').textContent, /Selecione o tipo/);
      await click('Cancelar');
      assert.match(document.body.textContent, /Tipo não informado/);
      await close();
    });

    await t.test('todos os tipos usam a máscara e normalização existentes', async () => {
      const samples = [
        { label: 'CPF', type: 'CPF', raw: '52998224725', masked: '529.982.247-25', normalized: '52998224725' },
        { label: 'CNPJ', type: 'CNPJ', raw: '12abc34501de35', masked: '12.ABC.345/01DE-35', normalized: '12ABC34501DE35' },
        { label: 'Telefone celular', type: 'PHONE', raw: '79999999999', masked: '(79) 99999-9999', normalized: '+5579999999999' },
        { label: 'E-mail', type: 'EMAIL', raw: '  DOCENTE@EXAMPLE.TEST  ', masked: 'docente@example.test', normalized: 'docente@example.test' },
        { label: 'Chave aleatória', type: 'EVP', raw: '123E4567-E89B-42D3-A456-426614174000', masked: '123e4567-e89b-42d3-a456-426614174000', normalized: '123e4567-e89b-42d3-a456-426614174000' },
      ];
      for (const sample of samples) {
        await mount();
        await click('Adicionar Pix');
        await choose(sample.label);
        await fill(sample.raw);
        assert.equal(input().value, sample.masked, sample.type);
        await click('Salvar Pix');
        assert.deepEqual(saved, [{ tipoChavePix: sample.type, chavePix: sample.normalized }], sample.type);
        assert.equal(document.querySelector('form'), null);
        await close();
      }
    });

    await t.test('chave inválida e tipo sem chave bloqueiam apenas a gravação Pix', async () => {
      await mount();
      await click('Adicionar Pix');
      await choose('CPF');
      await click('Salvar Pix');
      assert.match(document.querySelector('[role="alert"]').textContent, /Informe a chave Pix/);
      await fill('11111111111');
      await click('Salvar Pix');
      assert.match(document.querySelector('[role="alert"]').textContent, /CPF válido/);
      assert.deepEqual(saved, []);
      await choose('Sem chave Pix');
      await click('Salvar Pix');
      assert.deepEqual(saved, [{ tipoChavePix: '', chavePix: '' }]);
      await close();
    });

    await t.test('cancelar preserva o registro e remover limpa chave e tipo', async () => {
      await mount({ professor: { id: 'teacher-a', tipoChavePix: 'EMAIL', chavePix: 'atual@example.test' } });
      await click('Editar Pix');
      await fill('alterado@example.test');
      await click('Cancelar');
      assert.match(document.body.textContent, /atual@example.test/);
      assert.doesNotMatch(document.body.textContent, /alterado@example.test/);
      assert.deepEqual(saved, []);
      await click('Editar Pix');
      await click('Remover chave Pix');
      assert.equal(input().value, '');
      await click('Salvar Pix');
      assert.deepEqual(saved, [{ tipoChavePix: '', chavePix: '' }]);
      assert.match(document.body.textContent, /Nenhuma chave Pix informada/);
      await close();
    });

    await t.test('atualização do mesmo professor preserva o rascunho até cancelar', async () => {
      await mount({ professor: { id: 'teacher-a', tipoChavePix: 'EMAIL', chavePix: 'antes@example.test' } });
      await click('Editar Pix');
      await fill('rascunho@example.test');
      await render({ professor: { id: 'teacher-a', tipoChavePix: 'PHONE', chavePix: '+5579999999999' } });
      assert.equal(input().value, 'rascunho@example.test');
      assert.equal(document.querySelector('[aria-label="Tipo de chave Pix"]').value, 'E-mail');
      await click('Cancelar');
      assert.match(document.body.textContent, /Telefone celular/);
      assert.match(document.body.textContent, /\+5579999999999/);
      await close();
    });

    await t.test('falha mantém o rascunho e exibe a mensagem do salvamento', async () => {
      await mount({ onSave: async () => { throw new Error('Não foi possível salvar neste polo.'); } });
      await click('Adicionar Pix');
      await choose('E-mail');
      await fill('docente@example.test');
      await click('Salvar Pix');
      assert.match(document.querySelector('[role="alert"]').textContent, /neste polo/);
      assert.equal(input().value, 'docente@example.test');
      assert.equal(button('Salvar Pix').disabled, false);
      await close();
    });

    await t.test('pendente bloqueia controles e dupla submissão até sucesso', async () => {
      let complete;
      await mount({ onSave: value => { saved.push(value); return new Promise(done => { complete = done; }); } });
      await click('Adicionar Pix');
      await choose('E-mail');
      await fill('docente@example.test');
      await click('Salvar Pix');
      assert.equal(button('Salvando Pix…').disabled, true);
      assert.equal(button('Cancelar').disabled, true);
      assert.equal(input().disabled, true);
      assert.equal(document.querySelector('[aria-label="Tipo de chave Pix"]').disabled, true);
      await act(async () => document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
      assert.equal(saved.length, 1);
      await act(async () => complete());
      assert.match(document.querySelector('[role="status"]').textContent, /Dados Pix salvos/);
      assert.equal(document.querySelector('form'), null);
      assert.match(document.body.textContent, /docente@example.test/);
      await close();
    });

    await t.test('modo de consulta exibe chave sem ações de edição', async () => {
      await mount({ canEdit: false, professor: { id: 'teacher-a', tipoChavePix: 'EMAIL', chavePix: 'consulta@example.test' } });
      assert.match(document.body.textContent, /consulta@example.test/);
      assert.equal(document.querySelectorAll('button,input,form').length, 0);
      await close();
    });

    await t.test('troca de professor pela key descarta o rascunho da pessoa anterior', async () => {
      await mount();
      await click('Adicionar Pix');
      await choose('E-mail');
      await fill('rascunho@example.test');
      await render({ professor: { id: 'teacher-b', tipoChavePix: 'EMAIL', chavePix: 'outro@example.test' } });
      assert.equal(document.querySelector('form'), null);
      assert.match(document.body.textContent, /outro@example.test/);
      assert.deepEqual(saved, []);
      await close();
    });
  } finally {
    if (root && act) await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    await rm(temporary, { recursive: true, force: true });
  }
});
