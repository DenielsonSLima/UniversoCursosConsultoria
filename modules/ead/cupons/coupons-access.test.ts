import assert from 'node:assert/strict';
import test from 'node:test';
import { hasEadCouponManagementAccess } from './coupons-access.ts';

test('gestão de cupom exige Matriz canônica, Secretaria e Financeiro explicitamente', () => {
  assert.equal(hasEadCouponManagementAccess({ modules: ['secretaria', 'financeiro'] }, true), true);
  for (const matriz of [undefined, null, false, 'true', 1, { nome: 'Matriz' }, { is_matriz: true }]) {
    assert.equal(hasEadCouponManagementAccess({ modules: ['secretaria', 'financeiro'] }, matriz), false);
  }
  for (const permissions of [null, {}, { modules: ['secretaria'] }, { modules: ['financeiro'] },
    { modules: 'secretaria,financeiro' }, { allPolos: true }]) {
    assert.equal(hasEadCouponManagementAccess(permissions, true), false);
  }
});
