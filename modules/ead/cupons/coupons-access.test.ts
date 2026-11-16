import assert from 'node:assert/strict';
import test from 'node:test';
import { hasEadCouponManagementAccess } from './coupons-access.ts';

test('gestão de cupom exige Secretaria e Financeiro explicitamente', () => {
  assert.equal(hasEadCouponManagementAccess({ modules: ['secretaria', 'financeiro'] }), true);
  for (const permissions of [null, {}, { modules: ['secretaria'] }, { modules: ['financeiro'] },
    { modules: 'secretaria,financeiro' }, { allPolos: true }]) {
    assert.equal(hasEadCouponManagementAccess(permissions), false);
  }
});
