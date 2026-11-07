import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import React, { act, useState } from 'react';
import type { Root } from 'react-dom/client';
import InstitutionalSelect, { type InstitutionalSelectOption } from './InstitutionalSelect';

const requireForTest = createRequire(resolve(process.cwd(), 'package.json'));
const { JSDOM } = requireForTest(process.env.INSTITUTIONAL_SELECT_JSDOM_PATH || process.env.FINANCIAL_SELECT_JSDOM_PATH || 'jsdom');
const options: InstitutionalSelectOption[] = [
  { value: 'alpha-id', label: 'Alpha', keywords: '000111' },
  { value: 'beta-id', label: 'Beta', keywords: '000222' },
  { value: 'gamma-id', label: 'Gamma', keywords: '000333' },
];

interface HarnessProps {
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  required?: boolean;
  items?: InstitutionalSelectOption[];
}

class TestMessageChannel {
  port1 = { onmessage: null as null | ((event: { data: undefined }) => void) };
  port2 = { postMessage: () => globalThis.queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
}

test('combobox institucional preserva IDs, teclado, estados e bloqueio do fieldset', async (context) => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  const testWindow = dom.window;
  const globals = ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'MessageChannel', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globals.forEach((key) => Object.defineProperty(globalThis, key, {
    configurable: true, writable: true,
    value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : key === 'MessageChannel' ? TestMessageChannel : testWindow[key],
  }));
  testWindow.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import('react-dom/client');
  let root: Root | undefined;
  let calls: string[] = [];

  function Harness({ disabled, loading, error, required, items = options }: HarnessProps) {
    const [value, setValue] = useState('');
    return <form><fieldset disabled={disabled}>
      <InstitutionalSelect value={value} options={items} ariaLabel="Conta de teste" required={required}
        loading={loading} error={error} onValueChange={(nextValue) => { calls.push(nextValue); setValue(nextValue); }} />
    </fieldset><button type="button" id="outside">Fora</button></form>;
  }

  const input = () => testWindow.document.querySelector('input[role="combobox"]') as HTMLInputElement;
  const panel = () => testWindow.document.querySelector('[role="listbox"]') as HTMLElement | null;
  const reset = async (props: HarnessProps = {}) => {
    if (root) await act(async () => root?.unmount());
    testWindow.document.body.innerHTML = '<div id="root"></div>';
    calls = [];
    root = createRoot(testWindow.document.getElementById('root')!);
    await act(async () => root?.render(<Harness {...props} />));
  };
  const focus = async () => { await act(async () => input().focus()); };
  const key = async (value: string) => {
    await act(async () => input().dispatchEvent(new testWindow.KeyboardEvent('keydown', { key: value, bubbles: true })));
  };
  const type = async (value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(testWindow.HTMLInputElement.prototype, 'value')!.set!.call(input(), value);
      input().dispatchEvent(new testWindow.Event('input', { bubbles: true }));
    });
  };

  try {
    await context.test('foco lista tudo, busca identificador e seleção preserva o ID canônico', async () => {
      await reset(); await focus();
      assert.equal(panel()?.querySelectorAll('[role="option"]').length, 3);
      assert.equal(testWindow.document.querySelector('fieldset')?.contains(panel()), false, 'o painel usa portal');
      await type('000333');
      assert.equal(panel()?.querySelectorAll('[role="option"]').length, 1);
      await key('ArrowDown'); await key('Enter');
      assert.deepEqual(calls, ['gamma-id']);
      assert.equal(input().value, 'Gamma');
      assert.equal(panel(), null);
    });

    await context.test('texto livre não altera o vínculo e blur restaura o rótulo selecionado', async () => {
      await reset(); await focus(); await key('ArrowDown'); await key('Enter');
      await act(async () => input().blur()); await focus(); await type('texto não cadastrado');
      assert.deepEqual(calls, ['alpha-id']);
      await act(async () => input().blur());
      assert.equal(input().value, 'Alpha');
      assert.deepEqual(calls, ['alpha-id']);
    });

    await context.test('ArrowUp começa na última opção e navegação pula opções desabilitadas', async () => {
      await reset(); await focus(); await key('ArrowUp'); await key('Enter');
      assert.deepEqual(calls, ['gamma-id']);
      await reset({ items: options.map((option) => ({ ...option, disabled: option.value === 'beta-id' })) });
      await focus(); await key('ArrowDown'); await key('ArrowDown'); await key('Enter');
      assert.deepEqual(calls, ['gamma-id']);
    });

    await context.test('Escape, Tab e clique fora fecham sem alterar o valor', async () => {
      for (const action of ['Escape', 'Tab', 'outside']) {
        await reset(); await focus();
        if (action === 'outside') {
          await act(async () => testWindow.document.getElementById('outside')!.dispatchEvent(new testWindow.Event('pointerdown', { bubbles: true })));
        } else await key(action);
        assert.equal(panel(), null);
        assert.deepEqual(calls, []);
      }
    });

    await context.test('loading, erro, vazio e busca sem resultado não oferecem seleção', async () => {
      for (const props of [{ loading: true }, { error: 'Falha sintética' }, { items: [] }]) {
        await reset(props); await focus();
        assert.equal(panel()?.querySelectorAll('[role="option"]').length, 0);
        await key('ArrowDown'); await key('Enter');
        assert.deepEqual(calls, []);
        if (props.error) assert.equal(testWindow.document.querySelector('[role="alert"]')?.textContent, props.error);
      }
      await reset(); await focus(); await type('sem correspondência');
      assert.equal(panel()?.querySelectorAll('[role="option"]').length, 0);
      assert.match(testWindow.document.body.textContent || '', /Nenhum resultado/);
    });

    await context.test('required vazio permanece inválido após digitação sem seleção', async () => {
      await reset({ required: true });
      assert.equal(input().checkValidity(), false);
      await focus(); await type('Alpha');
      assert.equal(input().checkValidity(), false);
      await key('ArrowDown'); await key('Enter');
      assert.equal(input().checkValidity(), true);
      assert.deepEqual(calls, ['alpha-id']);
    });

    await context.test('required com ID selecionado continua válido ao reabrir a busca vazia', async () => {
      await reset({ required: true }); await focus(); await key('ArrowDown'); await key('Enter');
      assert.equal(input().checkValidity(), true);
      await act(async () => input().blur()); await focus();
      assert.equal(input().getAttribute('aria-expanded'), 'true');
      assert.equal(input().value, '');
      assert.equal(input().checkValidity(), true, 'o vínculo canônico selecionado continua presente');
      assert.deepEqual(calls, ['alpha-id']);
    });

    await context.test('busy no fieldset bloqueia a seleção imediatamente e fecha o portal', async () => {
      await reset(); await focus();
      const firstOption = panel()!.querySelector('[role="option"]')!;
      await act(async () => {
        testWindow.document.querySelector('fieldset')!.setAttribute('disabled', '');
        firstOption.dispatchEvent(new testWindow.MouseEvent('click', { bubbles: true }));
      });
      assert.equal(input().matches(':disabled'), true);
      assert.deepEqual(calls, [], 'nem o clique antes do observer pode trocar o vínculo');
      assert.equal(panel(), null);
      assert.equal(input().getAttribute('aria-expanded'), 'false');
      await act(async () => testWindow.document.querySelector('fieldset')!.removeAttribute('disabled'));
      await act(async () => input().blur()); await focus();
      assert.equal(panel()?.querySelectorAll('[role="option"]').length, 3);
    });
  } finally {
    if (root) await act(async () => root?.unmount());
    dom.window.close();
    previous.forEach((descriptor, key) => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
});
