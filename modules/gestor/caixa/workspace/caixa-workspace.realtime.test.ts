import assert from 'node:assert/strict';
import test from 'node:test';
import { getCaixaWorkspaceInvalidation } from './caixa-workspace.realtime.ts';

const poloA = '00000000-0000-0000-0000-000000000001';
const poloB = '00000000-0000-0000-0000-000000000002';
const otherCompanyPolo = '00000000-0000-0000-0000-000000000099';
const companyPolos = new Set([poloA, poloB]);

test('evento do polo invalida o polo e o consolidado da empresa', () => {
  assert.deepEqual(
    getCaixaWorkspaceInvalidation({ new: { polo_id: poloA } }, companyPolos),
    { kind: 'SCOPES', scopes: [poloA, null] },
  );
});

test('evento global invalida somente o consolidado', () => {
  assert.deepEqual(
    getCaixaWorkspaceInvalidation({ new: { polo_id: null } }, companyPolos),
    { kind: 'SCOPES', scopes: [null] },
  );
});

test('polo desconhecido invalida a empresa porque o evento não informa company_id', () => {
  assert.deepEqual(
    getCaixaWorkspaceInvalidation({ new: { polo_id: otherCompanyPolo } }, companyPolos),
    { kind: 'COMPANY', scopes: [] },
  );
});

test('payload incompleto ou polo inválido usa fallback conservador da empresa', () => {
  assert.deepEqual(
    getCaixaWorkspaceInvalidation({ new: {} }, companyPolos),
    { kind: 'COMPANY', scopes: [] },
  );
  assert.deepEqual(
    getCaixaWorkspaceInvalidation({ new: { polo_id: 'polo-invalido' } }, companyPolos),
    { kind: 'COMPANY', scopes: [] },
  );
});
