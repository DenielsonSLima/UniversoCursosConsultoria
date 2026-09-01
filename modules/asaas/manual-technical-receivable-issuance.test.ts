import assert from 'node:assert/strict';
import {
  createReceivableIssuanceRequestId,
  syncAfterExplicitReceivableIssuanceAuthorization,
} from './manual-technical-receivable-issuance.ts';

declare const Deno: {
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

Deno.test('autoriza o ID exato antes de solicitar a sincronização', async () => {
  const events: string[] = [];
  const result = await syncAfterExplicitReceivableIssuanceAuthorization({
    receivableId: 'receivable-1',
    requestId: 'request-1',
    authorize: async (receivableId, requestId) => {
      events.push(`authorize:${receivableId}:${requestId}`);
    },
    sync: async (receivableId) => {
      events.push(`sync:${receivableId}`);
      return { success: true };
    },
  });

  assert.deepEqual(events, [
    'authorize:receivable-1:request-1',
    'sync:receivable-1',
  ]);
  assert.deepEqual(result, { success: true });
});

Deno.test('falha de autorização impede qualquer chamada ao emissor', async () => {
  let syncCalls = 0;

  await assert.rejects(
    syncAfterExplicitReceivableIssuanceAuthorization({
      receivableId: 'protected-receivable',
      requestId: 'request-2',
      authorize: async () => {
        throw new Error('Matrícula protegida');
      },
      sync: async () => {
        syncCalls += 1;
        return { success: true };
      },
    }),
    /protegida/i,
  );

  assert.equal(syncCalls, 0);
});

Deno.test('cada clique cria um request ID UUID seguro', () => {
  assert.match(
    createReceivableIssuanceRequestId(),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});
