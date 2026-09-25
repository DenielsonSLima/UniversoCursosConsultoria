import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { QueryClient } from '@tanstack/query-core';
import type { ContaBancaria } from '../../../../../financeiro/financeiro.types';
import type { GestorPermissions } from '../../../../../access-control';
import { canUseManualEnrollmentSettlement, isManualEnrollmentSettlementAccount, manualEnrollmentAccountsErrorMessage } from './ciclo-manual-settlement-account';

const account = (patch: Partial<ContaBancaria> = {}): ContaBancaria => ({
  id: 'conta-local', banco: 'Banco de teste', titular: 'Instituição', agencia: '1', conta: '1',
  tipo: 'CORRENTE', poloId: 'polo-local', polosUso: ['polo-local'], ativo: true, saldoInicial: 0,
  ...patch,
});

test('permissão cruza leitura de contas e baixa sem ampliar nenhum endpoint', () => {
  const permissions = (modules: GestorPermissions['modules'], receive: boolean): GestorPermissions => ({
    modules, financeiroTabs: receive ? ['receber'] : [], allPolos: false,
    tabs: { secretaria: ['consulta-financeira'], financeiro: receive ? ['receber'] : [] },
  });
  assert.equal(canUseManualEnrollmentSettlement(permissions(['gestao', 'secretaria'], false)), false);
  assert.equal(canUseManualEnrollmentSettlement(permissions(['gestao', 'caixa', 'secretaria'], false)), true);
  assert.equal(canUseManualEnrollmentSettlement(permissions(['gestao', 'caixa'], false)), false);
  assert.equal(canUseManualEnrollmentSettlement(permissions(['gestao', 'financeiro'], true)), true);
  assert.equal(canUseManualEnrollmentSettlement(permissions(['gestao', 'financeiro'], false)), false);
});

test('baixa de matrícula oferece conta ativa do próprio polo ou global com vínculo disponível', () => {
  assert.equal(isManualEnrollmentSettlementAccount(account(), 'polo-local'), true);
  assert.equal(isManualEnrollmentSettlementAccount(account({ poloId: '' }), 'polo-local'), true);
  assert.equal(isManualEnrollmentSettlementAccount(account({ polosUso: ['polo-local', 'polo-outro'] }), 'polo-local'), true);
});

test('conta compartilhada de outro polo é excluída sem ampliar autorização da baixa', () => {
  assert.equal(isManualEnrollmentSettlementAccount(account({
    poloId: 'matriz', polosUso: ['matriz', 'polo-local'], compartilhada: true,
  }), 'polo-local'), false);
});

test('conta inativa, sem ID ou sem disponibilidade no polo não pode ser selecionada', () => {
  for (const patch of [
    { ativo: false }, { ativo: undefined }, { id: undefined },
    { polosUso: ['outro-polo'] }, { poloId: '', polosUso: [] },
  ]) assert.equal(isManualEnrollmentSettlementAccount(account(patch), 'polo-local'), false);
});

test('erro PostgREST de recarga mantém contas em cache, mas desabilita confirmação e exibe mensagem', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = ['contas-teste'];
  client.setQueryData(key, [account()]);
  try {
    const failure = { message: 'Falha de acesso às contas', code: '42501' };
    await assert.rejects(client.fetchQuery({ queryKey: key, queryFn: () => Promise.reject(failure) }));
    const state = client.getQueryState(key)!;
    assert.equal(state.status, 'error');
    assert.deepEqual(state.data, [account()]);
    assert.equal(manualEnrollmentAccountsErrorMessage(state.error), failure.message);
    const controller = {
      accounts: state.data, accountsLoading: state.fetchStatus === 'fetching', accountsUnavailable: state.status === 'error',
    };
    const modal = readFileSync(new URL('./FinanceiroCicloManualSettlement.tsx', import.meta.url), 'utf8');
    const expression = modal.match(/submitDisabled=\{([^}]+)\}/)?.[1];
    assert.ok(expression, 'prop submitDisabled ausente');
    assert.equal(new Function('controller', `return (${expression});`)(controller), true);
    const hook = readFileSync(new URL('./hooks/useCicloManualEnrollmentSettlement.ts', import.meta.url), 'utf8');
    assert.match(hook, /accountsUnavailable: accountsQuery\.isError/);
    assert.match(hook, /accountsQuery\.isError \? manualEnrollmentAccountsErrorMessage\(accountsQuery\.error\)/);
  } finally {
    client.clear();
  }
});

test('falha nas contas sem mensagem preserva orientação visível para nova tentativa', () => {
  for (const failure of [null, undefined, {}, { message: '' }, { message: '   ' }, { message: 123 }]) {
    assert.match(manualEnrollmentAccountsErrorMessage(failure), /Não foi possível carregar as contas/);
  }
  assert.equal(manualEnrollmentAccountsErrorMessage(new Error('Falha de rede')), 'Falha de rede');
});
