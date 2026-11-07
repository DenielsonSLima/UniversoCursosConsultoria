import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import React, { act, useState } from 'react';
import type { Root } from 'react-dom/client';
import SecretariaDocumentoBatchSelection from './SecretariaDocumentoBatchSelection';
import type { SecretariaDocumentoWorkspace } from './useSecretariaDocumentoWorkspace';

const requireForTest = createRequire(resolve(process.cwd(), 'package.json'));
const { JSDOM } = requireForTest(process.env.INSTITUTIONAL_SELECT_JSDOM_PATH || 'jsdom');

class TestMessageChannel {
  port1 = { onmessage: null as null | ((event: { data: undefined }) => void) };
  port2 = { postMessage: () => globalThis.queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
}

test('seleção documental preserva IDs de turma, modalidade e estados do lote', async (context) => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost' });
  const globals = ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'MessageChannel', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globals.forEach((key) => Object.defineProperty(globalThis, key, {
    configurable: true, writable: true,
    value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : key === 'MessageChannel' ? TestMessageChannel : dom.window[key],
  }));
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import('react-dom/client');
  let root: Root | undefined;
  const changes: string[] = [];
  const input = (label: string) => dom.window.document.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
  const key = async (element: HTMLInputElement, value: string) => {
    await act(async () => element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true })));
  };
  const type = async (element: HTMLInputElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  };
  const mount = async (element: React.ReactElement) => {
    if (root) await act(async () => root?.unmount());
    dom.window.document.body.innerHTML = '<div id="root"></div>';
    root = createRoot(dom.window.document.getElementById('root')!);
    await act(async () => root?.render(element));
  };

  function BatchHarness() {
    const [turmaId, setTurmaId] = useState('todos');
    const [modalidade, setModalidade] = useState('TECNICO');
    const turmas = [
      { id: 'turma-manha-id', nome: 'Enfermagem Manhã', codigo: 'ENF-M', totalAlunos: 12 },
      { id: 'turma-noite-id', nome: 'Enfermagem Noite', codigo: 'ENF-N', totalAlunos: 8 },
    ];
    return <SecretariaDocumentoBatchSelection workspace={{
      step: 1, mode: 'lote', definition: { singularLabel: 'Pasta' },
      supportsAllStudentsBatch: true, supportsBatchModalidadeFilter: true,
      loteModalidades: [{ value: 'TECNICO', label: 'Técnico' }, { value: 'LIVRE', label: 'Livre' }],
      selectedBatchModalidade: modalidade, setSelectedBatchModalidade: (value: string) => { changes.push(`modalidade:${value}`); setModalidade(value); },
      selectedTurmaId: turmaId, setSelectedTurmaId: (value: string) => { changes.push(`turma:${value}`); setTurmaId(value); },
      isLoadingTurmas: false, hasBatchModalitySelected: true,
      pastaBatchTurmas: turmas, turmas, selectedTurma: turmas.find((turma) => turma.id === turmaId),
      isBoletim: false, usesDirectDocumentViewer: false,
    } as unknown as SecretariaDocumentoWorkspace} />;
  }

  try {
    await context.test('lote lista opções autorizadas, filtra acentos e envia o ID canônico', async () => {
      await mount(<BatchHarness />);
      assert.equal(dom.window.document.querySelector('select'), null);
      const turma = input('Selecione a turma');
      await act(async () => turma.focus());
      assert.equal(dom.window.document.querySelectorAll('[role="option"]').length, 3);
      await type(turma, 'manha');
      assert.equal(dom.window.document.querySelectorAll('[role="option"]').length, 1);
      await key(turma, 'ArrowDown'); await key(turma, 'Enter');
      assert.equal(changes.at(-1), 'turma:turma-manha-id');
      assert.equal(turma.value, 'Enfermagem Manhã (ENF-M)');
      assert.equal(dom.window.document.querySelector('[role="listbox"]'), null);
      assert.match(dom.window.document.body.textContent || '', /12 alunos ativos na turma/);
    });

    await context.test('mudar modalidade mantém o contrato de limpar a turma anterior', async () => {
      const modalidade = input('Tipo de modalidade');
      await act(async () => modalidade.focus());
      await type(modalidade, 'Livre');
      await key(modalidade, 'ArrowDown'); await key(modalidade, 'Enter');
      assert.deepEqual(changes.slice(-2), ['modalidade:LIVRE', 'turma:']);
      assert.equal(input('Selecione a turma').value, '');
    });

    await context.test('sem modalidade o campo de turma permanece bloqueado', async () => {
      await mount(<SecretariaDocumentoBatchSelection workspace={{
        step: 1, mode: 'lote', definition: { singularLabel: 'Pasta' },
        supportsAllStudentsBatch: true, supportsBatchModalidadeFilter: false,
        selectedTurmaId: '', setSelectedTurmaId: () => { throw new Error('Não pode selecionar turma sem modalidade'); },
        isLoadingTurmas: false, hasBatchModalitySelected: false,
        pastaBatchTurmas: [], turmas: [], isBoletim: false, usesDirectDocumentViewer: false,
      } as unknown as SecretariaDocumentoWorkspace} />);
      const turma = input('Selecione a turma');
      assert.equal(turma.disabled, true);
      await act(async () => turma.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
      assert.equal(dom.window.document.querySelector('[role="listbox"]'), null);
    });

  } finally {
    if (root) await act(async () => root?.unmount());
    globals.forEach((key) => {
      const descriptor = previous.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    });
    dom.window.close();
  }
});
