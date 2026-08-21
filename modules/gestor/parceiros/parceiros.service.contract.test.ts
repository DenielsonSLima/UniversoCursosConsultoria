import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const serviceSource = await readFile(new URL('./parceiros.service.ts', import.meta.url), 'utf8');

test('parceria PJ global aparece em cada polo, sem incluir aluno global', () => {
  assert.match(serviceSource, /filterTipo === 'PJ'[\s\S]*?query\.or\(`\$\{scopedFilter\},polo_id\.is\.null`\)/);
  assert.match(serviceSource, /!filterTipo[\s\S]*?and\(polo_id\.is\.null,tipo\.eq\.PJ\)/);
  assert.match(serviceSource, /filterTipo !== 'Aluno'[\s\S]*?tipo\.neq\.Aluno/);
});
