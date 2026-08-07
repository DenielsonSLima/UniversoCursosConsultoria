import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const run = (...args) => execFileSync(process.execPath, ['scripts/agent-memory-rag.mjs', ...args], {
  cwd: process.cwd(),
  encoding: 'utf8',
});

test('indexa apenas as fontes autorizadas e recupera a regra de RPC financeiro', () => {
  assert.match(run('index'), /Índice RAG criado:/);
  const result = run('search', 'frontend regras financeiras RPC', '--json');
  const payload = JSON.parse(result);
  assert.equal(payload.strategy, 'lexical-bm25');
  assert.ok(payload.results.length > 0);
  assert.equal(payload.results[0].source, 'ai/operacao/MEMORIA_CANONICA.md');
  assert.ok(payload.results.some((entry) => entry.source === 'ai/operacao/MEMORIA_CANONICA.md'));
});
