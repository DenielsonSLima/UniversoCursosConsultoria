import assert from 'node:assert/strict';
import test from 'node:test';
import { formatNfseFiscalDocument } from './nfse-fiscal-document.presentation.ts';

test('CPF is displayed with the standard mask and preserves leading zeros', () => {
  assert.equal(formatNfseFiscalDocument('01234567890'), '012.345.678-90');
});

test('CNPJ is displayed with the standard mask and preserves leading zeros', () => {
  assert.equal(formatNfseFiscalDocument('01234567000189'), '01.234.567/0001-89');
});

test('formatting is idempotent and accepts existing presentation separators', () => {
  for (const value of ['012.345.678-90', '01.234.567/0001-89']) {
    assert.equal(formatNfseFiscalDocument(value), value);
    assert.equal(formatNfseFiscalDocument(formatNfseFiscalDocument(value)), value);
  }
  assert.equal(formatNfseFiscalDocument(' 012 345 678 90 '), '012.345.678-90');
});

test('missing documents remain available for the existing empty-state label', () => {
  assert.equal(formatNfseFiscalDocument(null), '');
  assert.equal(formatNfseFiscalDocument(undefined), '');
  assert.equal(formatNfseFiscalDocument(''), '');
});

test('incomplete or oversized documents are preserved without filling or truncating digits', () => {
  for (const value of ['0123456789', '012.345.678-', '0123456700018', '01.234.567/0001-', '012345670001890', ' 01234 ']) {
    assert.equal(formatNfseFiscalDocument(value), value);
  }
});

test('unexpected content and alphanumeric documents are not converted into a numeric identity', () => {
  for (const value of ['CPF 01234567890', '01234567890X', '12ABC345000189', 'Não informado', '   ']) {
    assert.equal(formatNfseFiscalDocument(value), value);
  }
});

test('formatting does not validate check digits or mutate source fiscal data', () => {
  const issuer = Object.freeze({ cnpj: '00000000000000' });
  const recipient = Object.freeze({ document: '00000000000' });
  assert.equal(formatNfseFiscalDocument(issuer.cnpj), '00.000.000/0000-00');
  assert.equal(formatNfseFiscalDocument(recipient.document), '000.000.000-00');
  assert.deepEqual(issuer, { cnpj: '00000000000000' });
  assert.deepEqual(recipient, { document: '00000000000' });
});
