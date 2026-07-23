import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../../../migrations/20260722080000_receivable_manual_settlement_audit.sql",
  import.meta.url,
);
const migrationSql = await Deno.readTextFile(migrationUrl);

const functionBody = (signature: string) => {
  const start = migrationSql.indexOf(signature);
  assert.notEqual(start, -1, `função ausente na migration: ${signature}`);
  const end = migrationSql.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `fim da função ausente na migration: ${signature}`);
  return migrationSql.slice(start, end + 4);
};

const finalizeSql = functionBody(
  "create or replace function public.finalize_receivable_manual_settlement(",
);

Deno.test("RPC de baixa manual confia somente no JWT service_role", () => {
  assert.match(
    finalizeSql,
    /if coalesce\(auth\.role\(\), ''\) <> 'service_role' then/,
  );
  assert.doesNotMatch(finalizeSql, /current_user/i);
  assert.match(
    migrationSql,
    /revoke all on function public\.finalize_receivable_manual_settlement\(uuid, uuid\)[\s\S]*?from public, anon, authenticated;/,
  );
  assert.match(
    migrationSql,
    /grant execute on function public\.finalize_receivable_manual_settlement\(uuid, uuid\)[\s\S]*?to service_role;/,
  );
});

Deno.test("RPC rejeita lease expirada antes de qualquer baixa local", () => {
  assert.match(
    finalizeSql,
    /lease_expires_at is null[\s\S]*?lease_expires_at <= clock_timestamp\(\)/,
  );
  const leaseGuard = finalizeSql.indexOf("lease_expires_at is null");
  const localPaidUpdate = finalizeSql.indexOf("update public.contas_receber");
  assert.ok(leaseGuard >= 0 && leaseGuard < localPaidUpdate);
});

Deno.test("RPC exige e bloqueia exatamente uma transação canônica", () => {
  assert.match(
    finalizeSql,
    /select tx\.id, tx\.remote_status[\s\S]*?into strict v_transaction_id, v_transaction_remote_status/,
  );
  assert.match(finalizeSql, /from public\.payment_gateway_transactions tx/);
  assert.match(finalizeSql, /tx\.receivable_id = v_settlement\.receivable_id/);
  assert.match(finalizeSql, /tx\.provider_code = v_settlement\.provider_code/);
  assert.match(finalizeSql, /tx\.environment = v_settlement\.environment/);
  assert.match(finalizeSql, /v_settlement\.provider_code = 'asaas'/);
  assert.match(
    finalizeSql,
    /tx\.remote_payment_id = v_settlement\.remote_payment_id/,
  );
  assert.match(
    finalizeSql,
    /tx\.remote_payment_link_id = v_settlement\.remote_payment_link_id/,
  );
  assert.match(finalizeSql, /v_settlement\.provider_code = 'banese_card'/);
  assert.match(
    finalizeSql,
    /tx\.bank_slip_our_number = v_settlement\.remote_payment_id/,
  );
  assert.match(finalizeSql, /for update;[\s\S]*?when no_data_found/);
  assert.match(finalizeSql, /when too_many_rows/);
  assert.match(
    finalizeSql,
    /update public\.payment_gateway_transactions[\s\S]*?where id = v_transaction_id;/,
  );

  const transactionLock = finalizeSql.indexOf(
    "select tx.id, tx.remote_status",
  );
  const localPaidUpdate = finalizeSql.indexOf("update public.contas_receber");
  assert.ok(transactionLock >= 0 && transactionLock < localPaidUpdate);
});

Deno.test("RPC bloqueia status financeiro e preserva snapshot do principal", () => {
  assert.match(
    finalizeSql,
    /upper\(coalesce\(v_transaction_remote_status, ''\)\)/,
  );
  for (const paidStatus of ["PAID", "RECEIVED", "LIQUIDATED", "REFUNDED"]) {
    assert.match(finalizeSql, new RegExp(`'${paidStatus}'`));
  }
  assert.match(
    finalizeSql,
    /'valor_cents', round\(v_receivable\.valor \* 100\)::bigint/,
  );
  assert.match(finalizeSql, /'polo_id', v_receivable\.polo_id/);
  assert.match(
    finalizeSql,
    /from public\.contas_bancarias[\s\S]*?for update;[\s\S]*?v_account\.ativo is distinct from true/,
  );
});

Deno.test("booleans Asaas só confirmam cancelamento realmente exigido", () => {
  assert.match(
    finalizeSql,
    /'asaasCanceled', v_settlement\.requires_remote_cancellation[\s\S]*?v_settlement\.remote_payment_id is not null/,
  );
  assert.match(
    finalizeSql,
    /'asaasPaymentLinkCanceled', v_settlement\.requires_remote_cancellation[\s\S]*?v_settlement\.remote_payment_link_id is not null/,
  );
});

Deno.test("trigger dos campos auditáveis não possui bypass por current_user", () => {
  const triggerSql = functionBody(
    "create or replace function public.protect_receivable_manual_settlement_fields()",
  );
  assert.match(triggerSql, /coalesce\(auth\.role\(\), ''\) = 'service_role'/);
  assert.doesNotMatch(triggerSql, /current_user/i);
});
