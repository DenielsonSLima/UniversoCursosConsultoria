import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { snapshotFirst } from './voter-snapshot.ts';

const voterFields = [
  ['studentVoterId', 'TITULO-VIVO'],
  ['studentVoterZone', '999'],
  ['studentVoterSection', '8888'],
  ['studentVoterIssueDate', '2026-07-06'],
  ['studentVoterState', 'AL'],
] as const;

test('reimpressão conserva os cinco valores eleitorais vazios congelados', async () => {
  const snapshot = {
    studentVoterId: '',
    studentVoterZone: '',
    studentVoterSection: '',
    studentVoterIssueDate: '',
    studentVoterState: '',
  };

  for (const [key, liveValue] of voterFields) {
    assert.equal(snapshotFirst(snapshot, key, liveValue), '');
  }

  const parserSource = await readFile(
    new URL('./template-parser.ts', import.meta.url),
    'utf8',
  );
  for (const [key] of voterFields) {
    assert.match(
      parserSource,
      new RegExp(`snapshotFirst\\(\\s*emissionData,\\s*'${key}'`),
      `parser histórico não usa presença de chave para ${key}`,
    );
  }
});

test('snapshot eleitoral legado sem a chave mantém fallback ao cadastro vivo', () => {
  for (const [key, liveValue] of voterFields) {
    assert.equal(snapshotFirst({}, key, liveValue), liveValue);
  }
});
