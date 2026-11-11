import assert from 'node:assert/strict';
import test from 'node:test';
import { individualCancelNotice, individualIssueNotice } from './nfse-fiscal-notice';
import type { IndividualCancelResult, IndividualIssueResult } from '../individual/nfse-individual.types';
test('fiscal notifications identify authorized/cancelled note number and never promote pending, rejected or analysis states', () => {
  const issue = { state: 'AUTHORIZED', number: '2', message: 'Confirmada.' } as IndividualIssueResult;
  assert.deepEqual(individualIssueNotice(issue), { type: 'success', title: 'NFS-e nº 2 autorizada', message: 'Confirmada.' });
  for (const state of ['PREVIEWED', 'AWAITING_CONFIRMATION', 'REJECTED', 'BLOCKED'] as const) {
    const notice = individualIssueNotice({ ...issue, state, number: null, codes: ['E0120'] });
    assert.notEqual(notice.type, 'success'); assert(!notice.title.includes('nº')); assert(notice.message.includes('E0120'));
  }
  const cancellation = { state: 'CANCELLED', payload: { number: '2' }, message: 'Evento confirmado.' } as IndividualCancelResult;
  assert.equal(individualCancelNotice(cancellation).title, 'NFS-e nº 2 cancelada');
  for (const state of ['PREVIEWED', 'CANCELLATION_PENDING', 'CANCELLATION_REJECTED', 'AWAITING_ANALYSIS', 'BLOCKED'] as const) {
    assert.notEqual(individualCancelNotice({ ...cancellation, state }).type, 'success');
  }
});
