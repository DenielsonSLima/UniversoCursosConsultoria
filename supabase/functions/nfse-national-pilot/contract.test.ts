import assert from 'node:assert/strict';
import { parsePilotCommand } from './contract.ts';
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope = { contextKey: id(1), poloId: id(2), environment: 'HOMOLOGACAO', month: '2026-11' };
const command = { scope, action: 'PREVIEW', requestId: id(3) };
Deno.test('pilot partner is an optional canonical UUID only on PREVIEW; old commands stay valid', () => {
  assert.deepEqual(parsePilotCommand(command), command);
  assert.equal(parsePilotCommand({ ...command, recipientPartnerId: id(4) }).recipientPartnerId, id(4));
  for (const extra of [{ recipientPartnerId: 'bad' }, { recipientPartnerId: null }, { recipientName: 'PRIVATE_SENTINEL' },
    { recipientDocument: '00000000000' }, { recipient: { name: 'PRIVATE_SENTINEL' } }]) {
    assert.throws(() => parsePilotCommand({ ...command, ...extra }), /INVALID_PILOT_COMMAND/);
  }
  for (const action of ['ISSUE', 'RECONCILE']) {
    const value = { ...command, action, previewId: id(5), ...(action === 'ISSUE' ? { confirmed: true } : {}) };
    assert.deepEqual(parsePilotCommand(value), value);
    assert.throws(() => parsePilotCommand({ ...value, recipientPartnerId: id(4) }), /INVALID_PILOT_COMMAND/);
  }
});
