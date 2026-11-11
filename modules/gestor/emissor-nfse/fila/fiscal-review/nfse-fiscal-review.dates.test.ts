import assert from 'node:assert/strict';
import test from 'node:test';
import { NfseContractError } from '../../services/nfse.errors';
import { parseNfseFiscalReview } from './nfse-fiscal-review.contract';
import { getNfseFiscalReviewDates } from './nfse-fiscal-review.dates';
import { fiscalReview } from './nfse-fiscal-review.fixture';

const withDates = (paymentDates: string[], receiptCount = paymentDates.length) => ({ ...fiscalReview,
  preparation: { ...fiscalReview.preparation, paymentDates, receiptCount, paymentMonth: '2026-10' } });

test('one real payment day is the pre-model date, not a saved or confirmed fiscal definition', () => {
  const review = withDates(['2026-10-12']);
  const before = JSON.parse(JSON.stringify(review));
  assert.deepEqual(getNfseFiscalReviewDates(review), {
    competenceDate: '2026-10-12', serviceDate: '2026-10-12', source: 'PAYMENT', paymentDates: ['2026-10-12'],
  });
  assert.deepEqual(review, before);
  assert.equal(review.service.competenceDate, null);
  assert.equal(review.recipient.confirmed, false);
  assert.equal(review.reviewComplete, false);
  assert.equal(review.canTransmit, false);
  assert.equal(getNfseFiscalReviewDates(withDates(['2026-10-12'], 3)).source, 'PAYMENT');
});

test('missing evidence never invents day one, month end or issue day', () => {
  for (const review of [fiscalReview, withDates([], 1)]) {
    const dates = getNfseFiscalReviewDates(review);
    assert.equal(dates.source, 'MANUAL'); assert.equal(dates.competenceDate, ''); assert.equal(dates.serviceDate, '');
  }
});

test('multiple days use the latest actual payment, not array order or the month end', () => {
  assert.deepEqual(getNfseFiscalReviewDates(withDates(['2026-10-21', '2026-10-04'])), {
    competenceDate: '2026-10-21', serviceDate: '2026-10-21', source: 'PAYMENT', paymentDates: ['2026-10-04', '2026-10-21'],
  });
});

test('old saved dates remain in history but a differing pre-model date needs a new review', () => {
  for (const service of [{ competenceDate: '2026-09-12', serviceDate: '2026-09-11' },
    { competenceDate: '2026-10-04', serviceDate: '2026-10-04' },
    { competenceDate: '2026-10-12', serviceDate: null }]) {
    const review = { ...withDates(['2026-10-12']), revision: 1, reviewStatus: 'STALE' as const,
      service: { ...fiscalReview.service, ...service } };
    const before = JSON.parse(JSON.stringify(review));
    assert.deepEqual(getNfseFiscalReviewDates(review), { competenceDate: '2026-10-12',
      serviceDate: '2026-10-12', source: 'PAYMENT', paymentDates: ['2026-10-12'] });
    assert.deepEqual(review, before);
  }
  const saved = { ...withDates(['2026-10-12']), revision: 1,
    service: { ...fiscalReview.service, competenceDate: '2026-10-12', serviceDate: '2026-10-12' } };
  assert.equal(getNfseFiscalReviewDates(saved).source, 'SAVED');
});

test('changed, removed or unstructured source evidence cannot become a fiscal suggestion', () => {
  for (const code of ['SOURCE_CHANGED', 'PREPARATION_REMOVED', 'ACADEMIC_DESCRIPTION_CONTEXT_REQUIRED']) {
    assert.equal(getNfseFiscalReviewDates({ ...withDates(['2026-10-12']),
      checks: [{ code, status: 'BLOCKED', message: 'Confira a origem.' }] }).source, 'MANUAL');
  }
  assert.equal(getNfseFiscalReviewDates({ ...withDates(['2026-10-12']), reviewStatus: 'STALE' }).source, 'PAYMENT');
});

test('parser accepts deployment without new field and rejects ambiguous or malformed date evidence', () => {
  assert.deepEqual(parseNfseFiscalReview(fiscalReview, fiscalReview.documentId).preparation.paymentDates, []);
  const valid = withDates(['2026-10-21', '2026-10-04']);
  assert.deepEqual(parseNfseFiscalReview(valid, valid.documentId).preparation.paymentDates, ['2026-10-04', '2026-10-21']);
  for (const dates of [['2026-02-31'], ['2026-11-01'], ['2026-10-01T00:00:00Z'], ['2026-10-01', '2026-10-01']]) {
    const value = withDates(dates);
    assert.throws(() => parseNfseFiscalReview(value, value.documentId), NfseContractError);
    assert.equal(getNfseFiscalReviewDates(value).source, 'MANUAL');
  }
  assert.throws(() => parseNfseFiscalReview(withDates(['2026-10-01', '2026-10-02'], 1), fiscalReview.documentId), NfseContractError);
  assert.throws(() => parseNfseFiscalReview({ ...fiscalReview,
    preparation: { ...fiscalReview.preparation, paymentDates: null } }, fiscalReview.documentId), NfseContractError);
});
