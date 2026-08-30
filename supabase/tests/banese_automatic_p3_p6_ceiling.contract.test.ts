import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL(
  "../migrations/20260830154500_cap_banese_automatic_profile_at_p6.sql",
  import.meta.url,
);

test("teto P6 preserva o perfil efetivo e falha fechado fora da faixa", async () => {
  const sql = await readFile(migration, "utf8");
  const preflight = sql.indexOf("do $preflight$");
  const oldConstraintDrop = sql.indexOf(
    "drop constraint if exists banese_reconciliation_config_automatic_range_check",
  );
  const configUpdate = sql.indexOf("with before as materialized");
  const configSlice = sql.slice(configUpdate, sql.indexOf("alter table public.banese_reconciliation_config", configUpdate));

  assert.ok(preflight >= 0 && preflight < configUpdate);
  assert.ok(oldConstraintDrop > preflight && oldConstraintDrop < configUpdate);
  assert.match(sql, /effective_profile_id not between 3 and 6/);
  assert.match(sql, /last_stable_profile_id not between 3 and 6/);
  assert.match(configSlice, /set selected_profile_id = 6,/);
  assert.match(configSlice, /version = before\.version \+ 1/);
  assert.doesNotMatch(configSlice, /set[\s\S]*effective_profile_id\s*=/);
  assert.doesNotMatch(configSlice, /set[\s\S]*last_stable_profile_id\s*=/);
  assert.doesNotMatch(configSlice, /set[\s\S]*stable_since\s*=/);
  assert.doesNotMatch(configSlice, /set[\s\S]*cooldown_until\s*=/);
});

test("somente P3 a P6 permanecem elegíveis no automático", async () => {
  const sql = await readFile(migration, "utf8");

  assert.match(sql, /automatic_selectable = id between 3 and 6/);
  assert.match(sql, /id between 7 and 8[\s\S]+not automatic_selectable/);
  assert.match(sql, /id between 9 and 12[\s\S]+not automatic_selectable/);
  assert.match(sql, /selected_profile_id = 6[\s\S]+effective_profile_id between 3 and 6[\s\S]+last_stable_profile_id between 3 and 6/);
  assert.match(sql, /'SYSTEM_POLICY'/);
});

test("RPCs não restauram P9 e mantêm privilégios mínimos", async () => {
  const sql = await readFile(migration, "utf8");

  assert.match(sql, /v_old_target[\s\S]+then 9 else p_profile_id/);
  assert.match(sql, /v_new_target[\s\S]+then 6 else p_profile_id/);
  assert.match(sql, /v_hits = 2[\s\S]+v_old_selected/);
  assert.match(sql, /get_banese_reconciliation_autopilot_progress/);
  assert.match(sql, /prepare_banese_reconciliation_batch_v3/);
  assert.match(sql, /security definer/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /set lock_timeout = '2s'/);
  assert.match(sql, /set statement_timeout = '7s'/);
  assert.match(sql, /to authenticated, service_role/);
  assert.match(sql, /to service_role/);
});

test("migration de política não toca títulos nem liquidações", async () => {
  const sql = await readFile(migration, "utf8");

  assert.doesNotMatch(sql, /update\s+public\.contas_receber/i);
  assert.doesNotMatch(sql, /update\s+public\.payment_gateway_transactions/i);
  assert.doesNotMatch(sql, /update\s+public\.banese_reconciliation_queue/i);
  assert.doesNotMatch(sql, /update\s+public\.banese_reconciliation_attempts/i);
  assert.doesNotMatch(sql, /delete\s+from/i);
});
