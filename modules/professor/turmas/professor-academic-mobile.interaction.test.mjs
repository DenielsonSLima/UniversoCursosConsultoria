import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import React, { act } from 'react';

const base = fileURLToPath(new URL('../../../', import.meta.url));
const jsdomPath = process.env.PROFESSOR_TEST_JSDOM_PATH;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath)).href : 'jsdom');

test('editores móveis reais preservam sessão, zero/vazio, REC, conteúdo e bloqueios', async () => {
  const temporary = await mkdtemp(resolve(base, 'tmp/professor-academic-mobile-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true, url: 'http://localhost/' });
  const globals = new Map();
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'MutationObserver', 'Event', 'MouseEvent', 'FocusEvent', 'Node', 'IS_REACT_ACT_ENVIRONMENT']) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  }
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  let root;
  try {
    const output = resolve(temporary, 'academic.mjs');
    await build({ entryPoints: [resolve(base, 'modules/professor/turmas/testing/academic-mobile.test-fixture.tsx')], outfile: output,
      bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', logLevel: 'silent', loader: { '.css': 'empty' } });
    const { AcademicMobileFixture, TechnicalDataError } = await import(pathToFileURL(output).href);
    const { createRoot } = await import('react-dom/client');
    root = createRoot(document.getElementById('root'));
    const calls = [];
    const mount = async (initialTab, readOnly = false, mobileLayout = true) => {
      calls.length = 0;
      await act(async () => root.render(React.createElement(AcademicMobileFixture, {
        key: `${initialTab}:${readOnly}:${mobileLayout}`, initialTab, readOnly, mobileLayout,
        onAction: (name, values) => calls.push({ name, values }),
      })));
    };
    const mobile = () => document.querySelector('.professor-diary-mobile');
    const change = async (element, value) => {
      const descriptor = Object.getOwnPropertyDescriptor(element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype, 'value');
      await act(async () => { descriptor.set.call(element, value); element.dispatchEvent(new window.Event('input', { bubbles: true })); });
    };
    await mount('frequencia');
    const attendance = mobile().querySelector('button[aria-label^="Alterar frequência de Ana"]');
    await act(async () => attendance.click());
    assert.deepEqual(calls[0], { name: 'frequencia', values: ['aluno-a', 'sessao-m'] });
    assert.equal(mobile().querySelector('button[aria-label^="Alterar frequência de Bruno"]').disabled, true, 'Equivalência não libera frequência');
    const picker = mobile().querySelector('[role="combobox"]');
    await act(async () => picker.click());
    const afternoon = [...document.querySelectorAll('[role="option"]')].find(option => option.textContent.includes('Tarde'));
    assert(afternoon);
    await act(async () => afternoon.click());
    await act(async () => mobile().querySelector('button[aria-label^="Alterar frequência de Ana"]').click());
    assert.deepEqual(calls.at(-1), { name: 'frequencia', values: ['aluno-a', 'sessao-t'] });

    await mount('notas');
    let gradeInputs = [...mobile().querySelectorAll('input[type="number"]')];
    assert.equal(gradeInputs[0].value, '0');
    assert.equal(gradeInputs[1].value, '', 'Nota ausente não aparece como zero');
    const recovery = gradeInputs.find(input => input.getAttribute('aria-label').startsWith('Recuperação (REC) de Ana'));
    assert.equal(recovery.disabled, false);
    assert.equal(recovery.value, '0');
    assert.equal(gradeInputs.find(input => input.getAttribute('aria-label').startsWith('Recuperação (REC) de Bruno')).disabled, true);
    await change(gradeInputs[0], '');
    assert.equal(gradeInputs[0].value, '');
    assert.deepEqual(calls.at(-1), { name: 'nota-alterada', values: ['aluno-a', 'p', ''] });
    await change(gradeInputs[1], '0');
    assert.equal(gradeInputs[1].value, '0');
    await act(async () => gradeInputs[1].dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })));
    assert.deepEqual(calls.at(-1), { name: 'nota-salva', values: ['aluno-a', 'ti'] });
    assert(mobile().textContent.includes('Média final'));
    assert.equal(mobile().querySelector('dd:nth-of-type(1)')?.textContent, '5,0', 'Médias apresentadas continuam canônicas');

    await mount('conteudo');
    const title = mobile().querySelector('textarea[aria-label^="Conteúdo programático"]');
    await change(title, 'Conteúdo preparado para a próxima aula');
    await act(async () => [...mobile().querySelectorAll('button')].find(button => button.textContent === 'Salvar conteúdo').click());
    assert.deepEqual(calls.at(-1), { name: 'conteudo', values: ['encontro-1', 'Conteúdo preparado para a próxima aula'] });
    const practice = mobile().querySelector('textarea[aria-label^="Prática pedagógica"]');
    await change(practice, 'Prática revista');
    await act(async () => practice.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })));
    assert.deepEqual(calls.at(-1), { name: 'pratica', values: ['encontro-1', 'Prática revista'] });
    assert.equal(mobile().querySelector('input[type="date"]'), null, 'Planejamento de datas continua com a Gestão');

    for (const tab of ['frequencia', 'notas', 'conteudo']) {
      await mount(tab, true);
      assert.equal(mobile().querySelectorAll('input[type="number"]:enabled, textarea:not([readonly])').length, 0);
      if (tab === 'frequencia') assert([...mobile().querySelectorAll('button[aria-label^="Alterar frequência"]')].every(button => button.disabled));
      if (tab === 'conteudo') assert(![...mobile().querySelectorAll('button')].some(button => button.textContent.includes('Salvar conteúdo')));
      assert.equal(calls.length, 0);
    }
    await mount('frequencia', false, false);
    assert.equal(mobile(), null, 'Gestor não recebe apresentação móvel de Professor por padrão');
    await act(async () => root.render(React.createElement(TechnicalDataError, {
      title: 'Falha temporária', message: 'Dados protegidos', automaticRecovery: true, onRetry: () => calls.push('retry-manual'),
    })));
    assert.equal(document.querySelectorAll('button').length, 0, 'Professor não depende de botão manual de recuperação');
    await act(async () => root.render(React.createElement(TechnicalDataError, {
      title: 'Falha temporária', message: 'Dados protegidos', onRetry() {},
    })));
    assert.equal(document.querySelector('button').textContent.trim(), 'Tentar novamente', 'Comportamento padrão da Gestão preservado');
  } finally {
    if (root) await act(async () => root.unmount());
    dom.window.close();
    for (const [key, value] of globals) value ? Object.defineProperty(globalThis, key, value) : delete globalThis[key];
    await rm(temporary, { recursive: true, force: true });
  }
});
