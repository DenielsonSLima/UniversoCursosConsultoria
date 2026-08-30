import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("timeout técnico não cancela pares nem vira revisão financeira", async () => {
  const [worker, migration] = await Promise.all([
    readFile(
      new URL("functions/banese-reconciliation-worker/index.ts", root),
      "utf8",
    ),
    readFile(
      new URL(
        "migrations/20260830104000_harden_banese_timeout_drain.sql",
        root,
      ),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(worker, /HALTED_POSTGREST_DRAIN_MS/);
  assert.doesNotMatch(worker, /batchController\.abort/);
  assert.doesNotMatch(worker, /createBaneseTimedFetch/);
  assert.doesNotMatch(
    worker,
    /reconcileBaneseReceivable\([\s\S]*?signal:\s*queryController\.signal/,
  );
  assert.match(migration, /'TIMEOUT', 'NETWORK', 'UPSTREAM_5XX'/);
  assert.match(migration, /'AUTH', 'CONFIGURATION', 'AUDIT_WRITE'/);
  assert.doesNotMatch(migration, /set status\s*=\s*'PAGO'/i);
});

test("RPCs críticas têm duração menor que a janela do worker", async () => {
  const migration = await readFile(
    new URL(
      "migrations/20260830104000_harden_banese_timeout_drain.sql",
      root,
    ),
    "utf8",
  );

  assert.match(migration, /prepare_banese_reconciliation_batch_v3/);
  assert.match(migration, /record_banese_reconciliation_attempt/);
  assert.match(migration, /finish_banese_reconciliation_run/);
  assert.match(migration, /persist_banese_reconciliation_snapshot/);
  assert.match(migration, /set lock_timeout to ''2s''/);
  assert.match(migration, /set statement_timeout to ''7s''/);
});
