import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { contaTransferenciaOption, formatTransferCurrency, poloTransferenciaOption } from './transferencia-options.ts';
import type { ContaBancaria, FinanceiroPolo } from '../../financeiro.types';

const polo: FinanceiroPolo = {
  id: 'polo-a', nome: 'Empresa Universo', cnpj: '12345678000190', cidade: 'Itabaiana', estado: 'SE', is_matriz: false,
};
const account: ContaBancaria = {
  id: 'account-a', banco: 'BANESE', agencia: '03', conta: '100649-0', titular: 'Empresa',
  tipo: 'CORRENTE', poloId: polo.id, polosUso: [polo.id], saldoInicial: 0,
  saldoAtual: 999, saldoContabilConta: 1000, saldoGerencialPolo: 260,
};

test('empresa tem nome separado de CNPJ formatado e cidade/UF', () => {
  assert.deepEqual(poloTransferenciaOption(polo), {
    id: polo.id, label: 'Polo - Empresa Universo', detail: '12.345.678/0001-90 · Itabaiana/SE',
  });
  assert.equal(poloTransferenciaOption({ ...polo, is_matriz: true, cnpj: null, cidade: null, estado: null }).detail,
    'CNPJ não informado · Cidade/UF não informada');
});

test('saldo apresentado pertence exclusivamente ao polo e aceita zero/negativo', () => {
  assert.equal(contaTransferenciaOption(account).detail, 'Saldo deste polo: R$ 260,00 · Ag. 03');
  assert.match(contaTransferenciaOption({ ...account, saldoGerencialPolo: 0 }).detail, /R\$ 0,00/);
  assert.match(contaTransferenciaOption({ ...account, saldoGerencialPolo: -25 }).detail, /R\$ -25,00/);
  for (const saldoGerencialPolo of [undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.match(contaTransferenciaOption({ ...account, saldoGerencialPolo }).detail, /Saldo deste polo: indisponível/);
  }
});

test('estorno mantém centavos ao preencher moeda brasileira a partir do valor canônico', () => {
  assert.equal(formatTransferCurrency(12.34), '12,34');
  assert.equal(formatTransferCurrency(1234.56), '1.234,56');
});

test('modal usa combobox com portal e saldos indisponíveis não podem ser salvos', () => {
  const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
  const picker = read('./TransferenciaPicker.tsx');
  const modal = read('./TransferenciaFormModal.tsx');
  const tab = read('../TransferenciasTab.tsx');
  assert.doesNotMatch(modal, /<select/);
  for (const role of ['combobox', 'listbox', 'option']) assert.ok(picker.includes(`role="${role}"`));
  assert.match(picker, /createPortal/);
  assert.match(picker, /selected && !open && available/);
  assert.match(picker, /event\.key === 'Escape'/);
  assert.match(picker, /event\.key === 'Tab'/);
  assert.match(picker, /event\.key === 'ArrowDown'/);
  assert.match(picker, /event\.key === 'ArrowUp'/);
  assert.match(picker, /event\.key === 'Enter'/);
  assert.match(tab, /originAccountsLoading \|\| originAccountsQuery\.isError\) return/);
  assert.match(tab, /destinationAccountsLoading \|\| destinationAccountsQuery\.isError\) return/);
  assert.match(tab, /valor: formatTransferCurrency\(transfer.valor\)/);
  assert.match(tab, /Number\.isFinite\(numericValue\)/);
  assert.match(modal, /disabled=\{isPending \|\| unavailable\}/);
});
