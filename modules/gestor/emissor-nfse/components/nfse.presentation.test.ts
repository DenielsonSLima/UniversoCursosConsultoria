import assert from 'node:assert/strict';
import test from 'node:test';
import { formatNfseMoney } from './nfse.presentation.ts';

test('NFS-e preserves canonical monetary precision beyond Number safe integers', () => {
  assert.equal(formatNfseMoney('9007199254740993.07'), 'R$ 9.007.199.254.740.993,07');
  assert.equal(formatNfseMoney('999999999999999999.99'), 'R$ 999.999.999.999.999.999,99');
});

test('NFS-e keeps unavailable amounts distinct from confirmed zero', () => {
  assert.equal(formatNfseMoney(null), '—');
  assert.equal(formatNfseMoney(undefined), '—');
  assert.equal(formatNfseMoney('0.00'), 'R$ 0,00');
});
