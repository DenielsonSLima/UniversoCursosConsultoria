import assert from 'node:assert/strict';
import { canReceivePlannedExternalTransfer } from './external-transfer-access.ts';
import type { GestorPermissions } from '../../../../../access-control.ts';

declare const Deno: { test: (name: string, fn: () => void) => void };

const permissions = (patch: Partial<GestorPermissions> = {}): GestorPermissions => ({
  modules: ['gestao', 'financeiro'], financeiroTabs: ['receber'], allPolos: false,
  tabs: { gestao: ['academico', 'financeiro'] }, ...patch,
});

Deno.test('entrada exige as capacidades acadêmica e financeiras, mesmo com abas residuais', () => {
  assert.equal(canReceivePlannedExternalTransfer(permissions()), true);
  assert.equal(canReceivePlannedExternalTransfer(permissions({ modules: ['gestao'] })), false);
  assert.equal(canReceivePlannedExternalTransfer(permissions({ modules: ['financeiro'] })), false);
  assert.equal(canReceivePlannedExternalTransfer(permissions({ financeiroTabs: ['resumo'] })), false);
  assert.equal(canReceivePlannedExternalTransfer(permissions({ tabs: { gestao: ['academico'] } })), false);
  assert.equal(canReceivePlannedExternalTransfer(permissions({
    modules: ['gestao', 'secretaria', 'caixa'], financeiroTabs: [],
    tabs: { gestao: ['academico', 'financeiro'], secretaria: ['recebimentos'] },
  })), false);
});

Deno.test('acesso a todos os polos não substitui Financeiro/Receber', () => {
  assert.equal(canReceivePlannedExternalTransfer(permissions({ allPolos: true, financeiroTabs: [] })), false);
  assert.equal(canReceivePlannedExternalTransfer(permissions({ allPolos: true })), true);
});
