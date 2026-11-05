import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const requireForTest = createRequire(resolve(process.cwd(), 'package.json'));
const { JSDOM } = requireForTest(process.env.OTHER_CREDIT_JSDOM_PATH || 'jsdom');
import { OtherCreditRow } from './OtherCreditRow';
import type { ContasReceber } from '../financeiro.types';

test('linha avulsa permite selecionar/cancelar e recebido local abre estorno', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  const testDocument = dom.window.document as Document;
  const previous = Object.fromEntries(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true },
    document: { value: dom.window.document, configurable: true },
    IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true },
  });
  const root = createRoot(testDocument.getElementById('root')!);
  const calls: string[] = [];
  const item = {
    id: 'standalone', categoria: 'OUTROS_CREDITOS', status: 'PENDENTE', descricao: 'Crédito avulso',
    valor: 129.9, dataVencimento: '2026-11-10', poloId: 'polo', origemPagamento: 'BANESE',
    gatewayProvider: 'banese_card', gatewayPaymentMethod: 'BOLETO', formaPagamento: 'BOLETO',
    asaasPaymentId: '000000001', asaasStatus: 'PENDING', otherCreditCancellationEligible: true,
  } as ContasReceber;
  const model = { syncMutation: { mutate() {}, isPending: false }, copyLink() {}, openReceiveModal() {}, openPaymentModal() {} } as any;
  const cancellation = {
    selectedIds: new Set<string>(), pending: false, selectionLocked: false, reservedIds: new Set<string>(),
    toggle: (items: ContasReceber[]) => calls.push(`select:${items[0].id}`),
    open: (selected?: ContasReceber) => calls.push(`cancel:${selected?.id}`),
  };
  const render = (row: ContasReceber) => <table><tbody><OtherCreditRow item={row} index={0} model={model}
    cancellation={cancellation} onReverse={selected => calls.push(`reverse:${selected.id}`)} /></tbody></table>;
  try {
    await act(async () => root.render(render(item)));
    const checkbox = testDocument.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    assert.equal(checkbox.disabled, false);
    await act(async () => checkbox.click());
    const button = (text: string) => Array.from(testDocument.querySelectorAll('button')).find(node => node.textContent?.trim() === text);
    await act(async () => button('Cancelar')!.click());
    assert.deepEqual(calls, ['select:standalone', 'cancel:standalone']);
    const paid = { ...item, status: 'PAGO', origemPagamento: 'PRESENCIAL', gatewayProvider: undefined,
      gatewayPaymentMethod: undefined, asaasPaymentId: undefined, asaasStatus: undefined,
      dataPagamento: '2026-11-05', valorPago: 129.9, contaBancariaId: 'account' } as ContasReceber;
    await act(async () => root.render(render(paid)));
    assert.ok(button('Estornar recebimento'));
    await act(async () => button('Estornar recebimento')!.click());
    assert.equal(calls.at(-1), 'reverse:standalone');
    await act(async () => root.render(render({ ...paid, gatewayProvider: 'banese_card' })));
    assert.equal(button('Estornar recebimento'), undefined);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
