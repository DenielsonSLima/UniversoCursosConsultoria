import assert from 'node:assert/strict';
import test from 'node:test';
import { nfseServicePeriod, nfseServicePeriodPreview } from './nfse-service-period';

test('period preview formats explicit interval from the reference without guessing dates', () => {
  assert.equal(nfseServicePeriod('2026-09-09', '2026-10-08').label, '09/09/2026 ATÉ 08/10/2026');
  for (const [start, end] of [['', ''], ['2026-02-30', '2026-03-01'], ['2026-11-02', '2026-11-01']]) {
    assert.equal(nfseServicePeriod(start, end).valid, false);
  }
  assert.equal(nfseServicePeriod('2028-02-29', '2028-02-29').valid, true);
  const preview = nfseServicePeriodPreview('NO PERÍODO DE {{periodo}}.', '2026-09-09', '2026-10-08');
  assert.equal(preview.text, 'NO PERÍODO DE 09/09/2026 ATÉ 08/10/2026.');
  assert.equal(preview.unknownVariables, false);
  assert.equal(nfseServicePeriodPreview('{{curso}}', '', '').unknownVariables, true);
  assert.equal(nfseServicePeriodPreview('x'.repeat(1980) + '{{periodo}}', '2026-09-09', '2026-10-08').tooLong, true);
});
