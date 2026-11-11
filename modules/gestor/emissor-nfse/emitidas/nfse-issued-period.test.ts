import assert from 'node:assert/strict';
import test from 'node:test';
import { createNfseIssuedPeriod, nfseIssuedQueryFilters } from './nfse-issued-period.ts';
import { getNfseCurrentMonth } from '../types/nfse.scope.ts';

test('current period follows Maceio, calendar month end and leap years', () => {
  assert.equal(getNfseCurrentMonth(new Date('2026-12-01T02:59:59Z')), '2026-11');
  assert.equal(getNfseCurrentMonth(new Date('2026-12-01T03:00:00Z')), '2026-12');
  assert.equal(createNfseIssuedPeriod('2026-11').dateFrom, '2026-11-01');
  assert.equal(createNfseIssuedPeriod('2026-11').dateTo, '2026-11-30');
  assert.equal(createNfseIssuedPeriod('2028-02').dateTo, '2028-02-29');
  assert.equal(createNfseIssuedPeriod('2026-02').dateTo, '2026-02-28');
  assert.equal(createNfseIssuedPeriod('2026-12').dateTo, '2026-12-31');
});

test('issued filters explicitly select active authorizations and reset page without summing rows', () => {
  const filters = { ...createNfseIssuedPeriod('2026-11'), search: '  Alice  ', origin: 'SERVICO' as const };
  assert.deepEqual(nfseIssuedQueryFilters(filters), { ...filters, search: 'Alice', status: 'EMITIDA', issuedState: 'ACTIVE', page: 1 });
  assert.equal(filters.search, '  Alice  ');
});
