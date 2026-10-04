import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getUnifiedSupportSelection, notifyUnifiedSupportOpened, registerUnifiedInternalStart,
  requestUnifiedInternalStart, setUnifiedSupportActive, setUnifiedSupportSelection,
  subscribeUnifiedSupportOpened, subscribeUnifiedSupportSelection,
  notifyUnifiedSupportStartClosed, subscribeUnifiedSupportStartClosed,
} from './unified-support-selection.ts';

test('seleção compartilhada troca o canal e não repete eventos idênticos', () => {
  setUnifiedSupportSelection(null);
  const channels: (string | null)[] = [];
  const unsubscribe = subscribeUnifiedSupportSelection((selection) => channels.push(selection?.channel || null));
  try {
    const internal = { channel: 'internal' as const, conversationId: 'same-id' };
    setUnifiedSupportSelection(internal);
    setUnifiedSupportSelection({ ...internal });
    setUnifiedSupportSelection({ channel: 'whatsapp', conversationId: 'same-id', connectionId: 'line-1' });
    assert.equal(getUnifiedSupportSelection()?.connectionId, 'line-1');
    setUnifiedSupportSelection(null);
    assert.deepEqual(channels, [null, 'internal', 'whatsapp', null]);
  } finally {
    unsubscribe();
    setUnifiedSupportSelection(null);
  }
});

test('início interno usa o callback atual e limpa o registro ao desmontar', () => {
  let calls = 0;
  const disposePrevious = registerUnifiedInternalStart(() => { calls += 10; });
  const disposeCurrent = registerUnifiedInternalStart(() => { calls += 1; });
  disposePrevious();
  assert.equal(requestUnifiedInternalStart(), true);
  assert.equal(calls, 1);
  disposeCurrent();
  assert.equal(requestUnifiedInternalStart(), false);
});

test('nova conversa só comunica a seleção quando a fila unificada está ativa', () => {
  const opened: string[] = [];
  const unsubscribe = subscribeUnifiedSupportOpened((selection) => opened.push(selection.conversationId));
  try {
    setUnifiedSupportActive(false);
    notifyUnifiedSupportOpened({ channel: 'internal', conversationId: 'ignored' });
    setUnifiedSupportActive(true);
    notifyUnifiedSupportOpened({ channel: 'internal', conversationId: 'new-chat' });
    assert.deepEqual(opened, ['new-chat']);
  } finally {
    unsubscribe();
    setUnifiedSupportActive(false);
  }
});

test('cancelar início comunica a origem apenas à fila ativa e respeita desmontagem', () => {
  const closed: string[] = [];
  const unsubscribe = subscribeUnifiedSupportStartClosed((channel) => closed.push(channel));
  setUnifiedSupportActive(false);
  notifyUnifiedSupportStartClosed('internal');
  setUnifiedSupportActive(true);
  notifyUnifiedSupportStartClosed('internal');
  unsubscribe();
  notifyUnifiedSupportStartClosed('whatsapp');
  setUnifiedSupportActive(false);
  assert.deepEqual(closed, ['internal']);
});
