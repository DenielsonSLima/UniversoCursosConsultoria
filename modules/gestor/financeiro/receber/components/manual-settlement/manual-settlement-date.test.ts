import assert from 'node:assert/strict';
import { formatMaceioIsoDate } from './manual-settlement-date.ts';

declare const Deno: {
  test: (name: string, testFunction: () => void) => void;
};

Deno.test('mantém a data civil de Maceió quando UTC já avançou o dia', () => {
  assert.equal(
    formatMaceioIsoDate(new Date('2026-07-23T00:30:00.000Z')),
    '2026-07-22',
  );
});

Deno.test('avança a data civil somente à meia-noite de Maceió', () => {
  assert.equal(
    formatMaceioIsoDate(new Date('2026-07-23T02:59:59.999Z')),
    '2026-07-22',
  );
  assert.equal(
    formatMaceioIsoDate(new Date('2026-07-23T03:00:00.000Z')),
    '2026-07-23',
  );
});
