import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';

const jsdomPath = process.env.NFSE_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath)).href : 'jsdom');
const base = fileURLToPath(new URL('../../../../', import.meta.url));

test('expanded students show CPF and location beside the name without changing selection', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-student-registration-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import('react-dom/client');
  const output = resolve(temp, 'test.mjs');
  const compiled = await build({ entryPoints: [resolve(base, 'modules/gestor/emissor-nfse/preparar/NfseStudentGroups.tsx')],
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: output });
  await writeFile(output, compiled.outputFiles[0].contents);
  const { default: Groups } = await import(pathToFileURL(output).href);
  const root = createRoot(document.getElementById('root'));
  const selected = [];
  const groups = [{ id: 'class', label: 'Turma sintética', studentCount: 2, receivedAmount: '22.34', students: [
    { id: 'student-a', studentName: 'Aluno sintético', studentCpf: '00100200300',
      studentCity: 'Cidade sintética', studentState: 'se', receivedAmount: '12.34' },
    { id: 'student-b', studentName: 'Aluno sem cadastro completo', studentCpf: null,
      studentCity: null, studentState: null, receivedAmount: '10.00' },
  ] }];
  const props = { groups, selectedIds: selected, onToggleStudent: id => {
    const index = selected.indexOf(id); if (index < 0) selected.push(id); else selected.splice(index, 1);
  }, onToggleGroup: ids => selected.push(...ids) };
  const render = async changes => act(() => root.render(React.createElement(Groups, { ...props, ...changes })));
  const click = async element => act(() => element.click());
  try {
    await render();
    assert.equal(document.querySelectorAll('.nfse-student-row').length, 0);
    const toggle = document.querySelector('.nfse-student-group-toggle');
    await click(toggle);
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    const rows = [...document.querySelectorAll('.nfse-student-row')];
    assert.equal(rows.length, 2);
    assert.match(rows[0].textContent, /Aluno sintéticoCPF 001\.002\.003-00Cidade sintética \/ SER\$ 12,34/);
    assert.match(rows[1].textContent, /CPF não informadoCidade\/UF não informadas/);
    assert.equal(rows[0].querySelector('.nfse-student-name').children.length, 3);
    await click(rows[0].querySelector('input')); await render();
    assert.deepEqual(selected, ['student-a']);
    assert.equal(document.querySelector('.nfse-student-row input').checked, true);
    await click(toggle); await click(toggle);
    assert.equal(document.querySelector('.nfse-student-row input').checked, true);
    assert.match(document.querySelector('.nfse-student-cpf').textContent, /001\.002\.003-00/);
    await render({ disabled: true });
    await click(document.querySelectorAll('.nfse-student-row input')[1]);
    assert.deepEqual(selected, ['student-a']);
    await render();
    await click(document.querySelector('.nfse-student-row input')); await render();
    assert.deepEqual(selected, []);
  } finally {
    await act(() => root.unmount()); dom.window.close(); delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    await rm(temp, { recursive: true, force: true });
  }
});
