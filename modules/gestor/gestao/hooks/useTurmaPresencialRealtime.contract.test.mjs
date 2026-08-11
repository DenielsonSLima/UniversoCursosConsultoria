import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./useTurmaPresencialRealtime.ts', import.meta.url), 'utf8');

test('reconcilia recebíveis pela outbox financeira autorizada', () => {
  assert.match(source, /table: 'finance_realtime_events'/);
  assert.match(source, /event: 'INSERT'/);
  assert.match(source, /source_table/);
  assert.match(source, /sourceTable === 'contas_receber'/);
  assert.doesNotMatch(source, /table: 'contas_receber'/);
});

test('reconcilia consultas ativas ao reconectar no Realtime', () => {
  assert.match(source, /let subscribedOnce = false/);
  assert.match(source, /status !== 'SUBSCRIBED'/);
  assert.match(source, /if \(subscribedOnce\) scheduleRefresh\(true\)/);
});
