import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

test('sincroniza a memória versionada para um destino OpenContext isolado', async () => {
  const target = await mkdtemp(resolve(tmpdir(), 'universo-opencontext-'));
  const output = execFileSync(process.execPath, ['scripts/sync-opencontext-memory.mjs', '--target', target], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.match(output, /OpenContext sincronizado: 5 documentos/);
  const memory = await readFile(resolve(target, 'MEMORIA_CANONICA.md'), 'utf8');
  assert.match(memory, /Entrega em lote/);
  const decisions = await readFile(resolve(target, 'DECISOES_ATIVAS.md'), 'utf8');
  assert.match(decisions, /Decisões arquiteturais ativas/);
});
