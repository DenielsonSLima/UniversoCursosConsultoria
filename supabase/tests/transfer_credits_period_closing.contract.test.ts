import assert from 'node:assert/strict';
import { buildTransferClosingFixture, transferClosingScenarios } from './transfer_credits_period_closing.fixture.mjs';

declare const Deno: {
  readTextFile: (path: URL) => Promise<string>;
  test: (name: string, fn: () => void) => void;
};

const migration = await Deno.readTextFile(new URL(
  '../migrations/20260924201000_recognize_transfer_credits_in_period_closing.sql', import.meta.url,
));

Deno.test('fechamento mantém autorização existente e escopo exato do aproveitamento', () => {
  assert.match(migration, /internal_academic\.p1_get_pendencias_fechamento_periodo_20260719/);
  assert.match(migration, /public\.can_write_turma\(p\.turma_id\)/);
  assert.match(migration, /select m\.id as matricula_id, m\.aluno_id/);
  assert.equal((migration.match(/credit\.matricula_id = aa\.matricula_id/g) || []).length, 4);
  assert.equal((migration.match(/credit\.disciplina_id = (?:dp|ap)\.disciplina_id/g) || []).length, 4);
  assert.doesNotMatch(migration, /\b(?:insert|update|delete|grant)\b/i);
});

Deno.test('fixture gera seis SELECTs sem referência a tabela ou função real', () => {
  assert.equal(transferClosingScenarios.length, 6);
  for (const scenario of transferClosingScenarios) {
    const sql = buildTransferClosingFixture(migration, scenario.options);
    assert.match(sql, /^with fixture_periodos_letivos/);
    assert.doesNotMatch(sql, /public\.|auth\.|internal_academic\.|\b(?:insert|update|delete)\b/);
    assert.match(sql, /'podeFechar'/);
  }
});
