import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGestorPermissions, canAccessGestorModule } from '../access-control';
import { buildGestorNavigation } from '../gestor-navigation';
import { GESTOR_MAIN_NAVIGATION } from '../gestor-navigation.config';

test('acesso financeiro ou fallback legado não concede o novo domínio fiscal', () => {
  for (const input of [undefined, { modules: ['financeiro'], allPolos: true }]) {
    const permissions = normalizeGestorPermissions(input);
    assert.equal(canAccessGestorModule(permissions, 'emissor-nfse'), false);
  }
});

test('emissor usa permissão própria e aparece imediatamente após Financeiro', () => {
  const permissions = normalizeGestorPermissions({
    modules: ['financeiro', 'emissor-nfse', 'configuracoes'], allPolos: false,
  });
  assert.equal(canAccessGestorModule(permissions, 'emissor-nfse'), true);
  const order: readonly string[] = GESTOR_MAIN_NAVIGATION.map((item) => item.id);
  assert.equal(order[order.indexOf('financeiro') + 1], 'emissor-nfse');
  const { visibleMenuItems } = buildGestorNavigation({
    permissions, isMatrizSelected: false, pendingChatsCount: 0,
    canOpenModule: (id) => canAccessGestorModule(permissions, id),
  });
  assert.ok(visibleMenuItems.find((item) => item.id === 'emissor-nfse')?.icon);
  assert.equal(visibleMenuItems.some((item) => item.id === 'configuracoes'), false);
});
