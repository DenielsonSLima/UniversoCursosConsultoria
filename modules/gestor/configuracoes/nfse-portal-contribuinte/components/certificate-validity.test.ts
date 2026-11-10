import assert from 'node:assert/strict';
import test from 'node:test';
import { certificateValidity } from './certificate-validity.ts';

test('formats the server expiry instant in the explicit Brazilian time zone', () => {
  const result = certificateValidity('2040-01-01T00:00:00Z', Date.parse('2039-01-01T00:00:00Z'));
  assert.deepEqual(result, {
    dateTime: '2040-01-01T00:00:00.000Z',
    label: '31/12/2039 às 21:00 (horário de Brasília)',
    warning: null,
  });
  assert.deepEqual(result, certificateValidity('2039-12-31T21:00:00-03:00', Date.parse('2039-01-01T00:00:00Z')));
});

test('marks expired at the exact instant, not at midnight or the end of that day', () => {
  const expiry = Date.parse('2040-06-01T14:30:00Z');
  assert.match(certificateValidity('2040-06-01T14:30:00Z', expiry)?.warning ?? '', /vencido/);
  assert.match(certificateValidity('2040-06-01T14:30:00Z', expiry + 1)?.warning ?? '', /vencido/);
  assert.match(certificateValidity('2040-06-01T14:30:00Z', expiry - 1)?.warning ?? '', /próximos 30 dias/);
});

test('warns only within 30 days before the expiry instant', () => {
  const expiry = Date.parse('2040-06-01T14:30:00Z');
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  assert.match(certificateValidity('2040-06-01T14:30:00Z', expiry - thirtyDays)?.warning ?? '', /renovação/);
  assert.equal(certificateValidity('2040-06-01T14:30:00Z', expiry - thirtyDays - 1)?.warning, null);
});

test('does not invent a validity date from missing, malformed or zone-free metadata', () => {
  for (const value of [null, undefined, '', 'invalid', '2040-06-01', '2040-06-01T14:30:00']) {
    assert.equal(certificateValidity(value), null);
  }
  assert.equal(certificateValidity('2040-06-01T14:30:00Z', NaN), null);
});
