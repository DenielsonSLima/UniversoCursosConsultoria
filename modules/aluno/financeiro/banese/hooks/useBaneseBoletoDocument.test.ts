import assert from 'node:assert/strict';
import test from 'node:test';
import { baneseBoletoDocumentQueryKey } from './banese-document-query-key';

test('invalida o PDF quando o BolePix oficial fica disponível', () => {
  const pending = baneseBoletoDocumentQueryKey('receivable-1', 'pending');
  const available = baneseBoletoDocumentQueryKey('receivable-1', 'available');

  assert.notDeepEqual(pending, available);
  assert.deepEqual(available, [
    'banese-boleto-document',
    'receivable-1',
    'available',
  ]);
});
