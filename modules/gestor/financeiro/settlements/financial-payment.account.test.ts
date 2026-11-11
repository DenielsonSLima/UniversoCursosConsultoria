import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultPaymentMethodForAccount, selectPaymentAccount } from './financial-payment.account.ts';
import type { ContaBancaria } from '../financeiro.types';
import type { FinancialPaymentComponent } from './financial-payment.types';

const account = (id: string, banco: string, natureza?: ContaBancaria['natureza']): ContaBancaria => ({
  id, banco, natureza, titular: 'Conta sintética', agencia: '', conta: '', tipo: '', poloId: 'polo', polosUso: ['polo'], saldoInicial: 0,
});
const accounts = [account('cash', 'CAIXA DA UNIDADE', 'CAIXA_INTERNO'), account('banese', 'BANESE', 'BANCARIA'),
  account('cef', 'CAIXA ECONÔMICA', 'BANCARIA'), account('other', 'PROESC', 'BANCARIA')];

test('natureza identifica caixa físico e tem precedência sobre o nome do banco', () => {
  assert.equal(defaultPaymentMethodForAccount(accounts[0]), 'DINHEIRO');
  assert.equal(defaultPaymentMethodForAccount(account('cash', 'BANESE', 'CAIXA_INTERNO')), 'DINHEIRO');
  assert.equal(defaultPaymentMethodForAccount(account('ambiguous', 'CAIXA', 'BANCARIA')), undefined);
  assert.equal(defaultPaymentMethodForAccount(account('missing', 'CAIXA DA UNIDADE')), undefined);
});

test('somente bancos reconhecidos sugerem Pix, sem confundir Caixa Econômica com caixa físico', () => {
  for (const banco of ['BANESE', '  banese  ', 'Banco do Estado de Sergipe', 'CAIXA ECONÔMICA', ' Caixa  Econômica Federal ', 'CEF']) {
    assert.equal(defaultPaymentMethodForAccount(account('bank', banco, 'BANCARIA')), 'PIX', banco);
  }
  for (const banco of ['PROESC', 'Banco B', 'Caixa escolar', 'Conta de Banese terceiros', 'CAIXA']) {
    assert.equal(defaultPaymentMethodForAccount(account('other', banco, 'BANCARIA')), undefined, banco);
  }
  assert.equal(defaultPaymentMethodForAccount(undefined), undefined);
});

test('troca aplica sugestão apenas ao componente escolhido, preservando valores e escolha manual na mesma conta', () => {
  const original: FinancialPaymentComponent = { accountId: 'cash', method: 'TED', amount: '120.00' };
  assert.equal(selectPaymentAccount(original, 'cash', accounts), original);
  assert.deepEqual(selectPaymentAccount(original, 'banese', accounts), { ...original, accountId: 'banese', method: 'PIX' });
  assert.deepEqual(selectPaymentAccount(original, 'cef', accounts), { ...original, accountId: 'cef', method: 'PIX' });
  assert.deepEqual(selectPaymentAccount({ ...original, accountId: 'banese' }, 'cash', accounts), { ...original, method: 'DINHEIRO' });
  assert.deepEqual(selectPaymentAccount(original, 'other', accounts), { ...original, accountId: 'other' });
  assert.deepEqual(selectPaymentAccount(original, 'missing', accounts), { ...original, accountId: 'missing' });
  assert.equal(original.method, 'TED');
});
