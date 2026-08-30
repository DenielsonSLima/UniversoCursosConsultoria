import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL(
  "../migrations/20260830014000_bound_banese_reconciliation_snapshot_locks.sql",
  import.meta.url,
);

test("limita lock e duração da persistência sem alterar o contrato financeiro", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /persist_banese_reconciliation_snapshot/i);
  assert.match(sql, /set lock_timeout to ''5s''/i);
  assert.match(sql, /set statement_timeout to ''45s''/i);
  assert.match(sql, /Contrato da persistência Banese inesperado/i);
  assert.doesNotMatch(sql, /p_should_settle\s*:=\s*false/i);
});
