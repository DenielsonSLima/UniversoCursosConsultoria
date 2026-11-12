import assert from 'node:assert/strict';
import { observeFiscalExecution } from './execution-observation.ts';
import { NfseContractError } from '../_shared/nfse-national/xml.ts';
Deno.test('fiscal observation retains timing and uncertainty code without sensitive contents', async () => {
  const records: unknown[] = []; let time = 10;
  const result = { state: 'AWAITING_CONFIRMATION', code: 'RESPONSE_DPS_MISMATCH',
    signedDpsXml: '<DPS>PRIVATE</DPS>', accessKey: 'SECRET', diagnostics: { idDps: 'PRIVATE',
      postAttemptedInThisExecution: true, postResponseStatus: 201, consult: { phase: 'AFTER_POST', httpStatus: 404, body: 'PRIVATE' } } };
  assert.equal(await observeFiscalExecution('ISSUE', async () => { time = 125; return result; }, row => records.push(row), () => time), result);
  assert.deepEqual(records, [{ event: 'nfse_execution_result', action: 'ISSUE', state: 'AWAITING_CONFIRMATION',
    elapsedMs: 115, code: 'RESPONSE_DPS_MISMATCH', postAttempted: true, postStatus: 201, consultPhase: 'AFTER_POST', consultStatus: 404 }]);
});
Deno.test('observation never changes result when sink fails or exposes arbitrary errors', async () => {
  const result = { state: 'AUTHORIZED' };
  assert.equal(await observeFiscalExecution('RECONCILE', async () => result, () => { throw Error('sink'); }), result);
  const rows: Record<string, unknown>[] = []; const error = Error('credential SECRET');
  await assert.rejects(observeFiscalExecution('CANCEL', async () => { throw error; }, row => rows.push(row)), value => value === error);
  assert.equal(rows[0].code, 'UNEXPECTED_EXECUTION_ERROR');
  assert.equal(JSON.stringify(rows).includes('SECRET'), false);
  const failure = new NfseContractError('EVENT_RESULT_UNCONFIRMED');
  await assert.rejects(observeFiscalExecution('RECONCILE_CANCEL', async () => { throw failure; }, row => rows.push(row)), value => value === failure);
  assert.equal(rows[1].code, 'EVENT_RESULT_UNCONFIRMED');
});
