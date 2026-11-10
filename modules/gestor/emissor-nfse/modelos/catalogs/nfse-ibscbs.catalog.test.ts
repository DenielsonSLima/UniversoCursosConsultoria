import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nfseIbsCbsClassifications, nfsePresumedCredits, nfseIbsCbsCatalogProvenance,
  isNfseClassificationActive } from './nfse-ibscbs.catalog';

test('the reviewed SVRS snapshot preserves every NFSe classification, flags, validity and source digests', () => {
  assert.equal(nfseIbsCbsClassifications.length, 73);
  assert.equal(new Set(nfseIbsCbsClassifications.map(row => row.cst)).size, 12);
  assert.equal(new Set(nfseIbsCbsClassifications.map(row => row.classificationCode)).size, 73);
  assert.equal(nfseIbsCbsCatalogProvenance.classificationSourceSha256,
    '0bc584c60039708f62a7240201352924da5d6c94fd92761d89dc0fefbe77f41c');
  for (const row of nfseIbsCbsClassifications) {
    assert.match(row.cst, /^[0-9]{3}$/); assert.match(row.classificationCode, /^[0-9]{6}$/);
    assert.equal(row.classificationCode.slice(0, 3), row.cst);
    assert.equal(row.classificationFlags.IndNfse, true);
    for (const value of [...Object.values(row.flags), ...Object.values(row.classificationFlags)]) assert.equal(typeof value, 'boolean');
  }
  for (const file of nfseIbsCbsCatalogProvenance.files) {
    const bytes = readFileSync(resolve('modules/gestor/emissor-nfse/modelos/catalogs', file.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
  }
});

test('classification eligibility checks CST and class intervals without changing the stored catalog', () => {
  const row = nfseIbsCbsClassifications.find(item => item.classificationCode === '000001')!;
  assert.equal(isNfseClassificationActive(row, '2026-11-10'), true);
  for (const date of ['2024-01-01', '2026-02-30', '2026-99-99', 'invalid']) assert.equal(isNfseClassificationActive(row, date), false);
  assert.equal(isNfseClassificationActive({ ...row, cstValidUntil: '2026-11-09' }, '2026-11-10'), false);
  assert.equal(isNfseClassificationActive({ ...row, validUntil: '2026-11-09' }, '2026-11-10'), false);
  assert.equal(isNfseClassificationActive({ ...row, classificationFlags: { ...row.classificationFlags, IndNfse: false } }, '2026-11-10'), false);
});

test('the public credit catalog preserves NFSe document/event distinctions and future validity', () => {
  assert.equal(nfsePresumedCredits.length, 13);
  assert.equal(new Set(nfsePresumedCredits.map(row => row.code)).size, 13);
  const nfse = nfsePresumedCredits.filter(row => row.nfse);
  assert.deepEqual(nfse.map(row => row.code), ['01', '02']);
  for (const row of nfse) {
    assert.equal(row.appropriationByDfe, false); assert.equal(row.appropriationByEvent, true);
    assert.equal(row.ibsValidFrom, '2027-01-01'); assert.equal(row.cbsValidFrom, '2027-01-01');
  }
});
