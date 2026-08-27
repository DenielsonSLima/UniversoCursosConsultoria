import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const schemaSql = await Deno.readTextFile(
  new URL(
    "../migrations/20260826224000_create_banese_terminal_cancellation_outbox.sql",
    import.meta.url,
  ),
);
const claimSql = await Deno.readTextFile(
  new URL(
    "../migrations/20260826224010_claim_banese_terminal_cancellation_outbox.sql",
    import.meta.url,
  ),
);
const completionSql = await Deno.readTextFile(
  new URL(
    "../migrations/20260826224020_complete_banese_terminal_cancellation_outbox.sql",
    import.meta.url,
  ),
);
const indexSql = await Deno.readTextFile(
  new URL(
    "../migrations/20260826224030_index_banese_terminal_cancellation_outbox.sql",
    import.meta.url,
  ),
);
const expansionSql = await Deno.readTextFile(
  new URL(
    "../migrations/20260826235900_expand_terminal_cancellation_to_all_unpaid.sql",
    import.meta.url,
  ),
);
const claimAllSql = await Deno.readTextFile(
  new URL(
    "../migrations/20260826235910_claim_all_unpaid_terminal_cancellations.sql",
    import.meta.url,
  ),
);
const completionAllSql = await Deno.readTextFile(
  new URL(
    "../migrations/20260826235920_complete_all_unpaid_terminal_cancellations.sql",
    import.meta.url,
  ),
);
const hardeningSql = await Deno.readTextFile(
  new URL(
    "../migrations/20260827001500_harden_all_unpaid_terminal_cancellation.sql",
    import.meta.url,
  ),
);
const confirmedBaneseSql = await Deno.readTextFile(
  new URL(
    "../migrations/20260827002500_require_confirmed_banese_terminal_cancellation.sql",
    import.meta.url,
  ),
);
const sql = [
  schemaSql,
  claimSql,
  completionSql,
  indexSql,
  expansionSql,
  claimAllSql,
  completionAllSql,
  hardeningSql,
  confirmedBaneseSql,
].join("\n");

const functionBody = (source: string, name: string, nextName?: string) => {
  const start = source.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `função ${name} ausente`);
  const end = nextName
    ? source.indexOf(`create or replace function public.${nextName}`, start)
    : source.length;
  return source.slice(start, end === -1 ? source.length : end);
};

const enqueue = functionBody(
  expansionSql,
  "enqueue_banese_cancellation",
  "enqueue_late_banese_cancellation",
);
const movement = functionBody(
  schemaSql,
  "enqueue_banese_cancellation_from_movement",
  "enqueue_late_banese_cancellation",
);
const late = functionBody(
  expansionSql,
  "enqueue_late_banese_cancellation",
  "cancel_late_terminal_local_receivable",
);
const lateLocal = functionBody(
  hardeningSql,
  "cancel_late_terminal_local_receivable",
  "ajustar_financeiro_movimentacao_matricula",
);
const localAdjustment = functionBody(
  confirmedBaneseSql,
  "ajustar_financeiro_movimentacao_matricula",
);
const cancelLocal = functionBody(
  hardeningSql,
  "cancel_terminal_local_receivable",
  "fail_banese_cancellation_job",
);
const claim = functionBody(
  claimAllSql,
  "claim_banese_cancellation_batch",
  "start_banese_cancellation_remote_attempt",
);
const startAttempt = functionBody(
  claimAllSql,
  "start_banese_cancellation_remote_attempt",
);
const complete = functionBody(
  completionAllSql,
  "complete_banese_cancellation_job",
);
const fail = functionBody(
  hardeningSql,
  "fail_banese_cancellation_job",
);

Deno.test("outbox Banese é privada e RPCs são exclusivos do service_role", () => {
  assert.match(sql, /enable row level security/i);
  assert.match(
    sql,
    /revoke all on table[\s\S]*from public, anon, authenticated/i,
  );
  for (
    const fn of [
      "claim_banese_cancellation_batch",
      "start_banese_cancellation_remote_attempt",
      "complete_banese_cancellation_job",
      "fail_banese_cancellation_job",
      "cancel_terminal_local_receivable",
    ]
  ) {
    assert.match(
      sql,
      new RegExp(
        `grant execute on function public\\.${fn}[\\s\\S]*to service_role`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `revoke all on function public\\.${fn}[\\s\\S]*from public, anon, authenticated`,
        "i",
      ),
    );
  }
  assert.doesNotMatch(sql, /set search_path\s*=\s*'public'/i);
});

Deno.test("elegibilidade automática inclui todo título aberto e não pago", () => {
  for (const section of [enqueue, claim, startAttempt, complete]) {
    assert.match(
      section,
      /c\.status in \('PENDENTE', 'VENCIDO', 'SUSPENSO'\)/i,
    );
    assert.match(section, /c\.data_pagamento is null/i);
    assert.doesNotMatch(section, /data_vencimento > (p_|j\.)?effective_date/i);
    assert.doesNotMatch(section, /America\/Maceio/i);
  }
  assert.match(
    late,
    /new\.status not in \('PENDENTE', 'VENCIDO', 'SUSPENSO'\)/i,
  );
  const lateral = late.slice(
    late.indexOf("cross join lateral"),
    late.indexOf("order by mm.created_at"),
  );
  assert.match(lateral, /mm\.tipo in[\s\S]*'DESISTENCIA'/i);
  assert.match(lateral, /mm\.status_novo = m\.status/i);
});

Deno.test("título estritamente local também fecha em matrícula terminal", () => {
  for (const section of [lateLocal, cancelLocal]) {
    assert.match(
      section,
      /status not in \('PENDENTE', 'VENCIDO', 'SUSPENSO'\)/i,
    );
    assert.match(section, /data_pagamento is not null/i);
    assert.match(section, /payment_gateway_transactions/i);
    assert.match(section, /'DESISTENTE', 'CANCELADO', 'TRANSFERIDO'/i);
  }
  assert.match(lateLocal, /new\.gateway_provider is null/i);
  assert.match(lateLocal, /new\.asaas_payment_id is null/i);
  assert.match(cancelLocal, /v_receivable\.gateway_provider is not null/i);
  assert.match(cancelLocal, /v_receivable\.asaas_payment_id is not null/i);
  assert.match(lateLocal, /new\.status := 'CANCELADO'/i);
  assert.match(cancelLocal, /set status = 'CANCELADO'/i);
  assert.match(
    cancelLocal,
    /from public\.matriculas[\s\S]*for update[\s\S]*select \* into v_receivable[\s\S]*from public\.contas_receber[\s\S]*for update/i,
  );
  assert.match(
    sql,
    /cancel_late_terminal_local_receivable_trigger[\s\S]*before insert or update/i,
  );
});

Deno.test("revisão não é reaberta nem descartada por reativação", () => {
  const upsert = enqueue.slice(enqueue.indexOf("on conflict"));
  assert.match(upsert, /state in \('PENDING', 'RETRY'\)/i);
  assert.doesNotMatch(upsert, /REVIEW_REQUIRED/i);
  assert.match(
    movement,
    /state in \('PROCESSING', 'REVIEW_REQUIRED'\)[\s\S]*regularize antes de reativar/i,
  );
  assert.match(
    claim,
    /remote_attempt_started_at is null[\s\S]*else 'REVIEW_REQUIRED'/i,
  );
});

Deno.test("snapshot e CAS protegem título, pagamento e transação", () => {
  for (
    const field of [
      "snapshot_convenio",
      "snapshot_nosso_numero",
      "snapshot_payment_id",
      "snapshot_transaction_id",
      "snapshot_due_date",
      "snapshot_gateway_status",
      "snapshot_transaction_status",
      "snapshot_receivable_updated_at",
    ]
  ) {
    assert.match(schemaSql, new RegExp(`${field}\\s`, "i"));
    assert.match(claim, new RegExp(`${field}\\s*=`, "i"));
    assert.match(
      `${startAttempt}\n${complete}`,
      new RegExp(`v_job\\.${field}`, "i"),
    );
  }
  assert.match(startAttempt, /set updated_at = clock_timestamp\(\)/i);
  assert.match(startAttempt, /lease_until > now\(\)/i);
  assert.match(
    startAttempt,
    /from public\.banese_reconciliation_queue q[\s\S]*for update[\s\S]*v_reconciliation\.state = 'LEASED'/i,
  );
  assert.doesNotMatch(complete, /lease_until > now\(\)/i);
  assert.match(
    complete,
    /t\.remote_payment_id = v_job\.snapshot_nosso_numero/i,
  );
  assert.match(
    complete,
    /t\.bank_slip_our_number = v_job\.snapshot_nosso_numero/i,
  );
  assert.match(complete, /v_transaction_count <> 1/i);
  assert.match(complete, /c\.data_pagamento is null/i);
});

Deno.test("confirmação local e reconciliação fecham atomicamente", () => {
  assert.match(
    complete,
    /update public\.payment_gateway_transactions[\s\S]*remote_status = 'CANCELED'/i,
  );
  assert.match(
    complete,
    /update public\.contas_receber[\s\S]*status = 'CANCELADO'[\s\S]*gateway_status = 'CANCELED'/i,
  );
  assert.match(
    complete,
    /update public\.banese_reconciliation_queue[\s\S]*state = 'DONE'/i,
  );
  assert.match(
    complete,
    /update public\.banese_cancellation_outbox[\s\S]*state = 'DONE'/i,
  );
  assert.match(
    fail,
    /p_remote_mutation_started[\s\S]*then 'REVIEW_REQUIRED'/i,
  );
  assert.match(
    `${claim}\n${fail}`,
    /q\.state = 'LEASED'[\s\S]*q\.lease_until > now\(\)/i,
  );
  assert.match(
    claim,
    /LEASE_EXPIRED_AFTER_REMOTE_ATTEMPT[\s\S]*CANCELLATION_REVIEW/i,
  );
  assert.match(
    fail,
    /c\.status in \([\s\S]*'SUSPENSO'[\s\S]*'AGUARDANDO_CONFIRMACAO'/i,
  );
});

Deno.test("movimento protege controles e mantém títulos Banese abertos até o banco", () => {
  assert.match(
    localAdjustment,
    /internal_academic\.authorize_matricula_control_update/i,
  );
  assert.match(
    localAdjustment,
    /gateway_provider is distinct from 'banese_card'/i,
  );
  assert.match(
    localAdjustment,
    /gateway_payment_method is distinct from 'BOLETO'/i,
  );
  assert.match(
    localAdjustment,
    /upper\(coalesce\(gateway_status, ''\)\) in[\s\S]*'CANCELED'/i,
  );
  assert.match(
    localAdjustment,
    /data_vencimento > new\.data_movimentacao[\s\S]*gateway_provider is distinct from 'banese_card'/i,
  );
  assert.match(
    localAdjustment,
    /gateway_provider is null[\s\S]*payment_gateway_transactions/i,
  );
  assert.match(localAdjustment, /and data_pagamento is null/i);
  assert.match(
    localAdjustment,
    /m\.status in \('DESISTENTE', 'CANCELADO', 'TRANSFERIDO'\)[\s\S]*new\.status_novo = m\.status/i,
  );
  assert.match(
    localAdjustment,
    /gateway_provider = 'banese_card'[\s\S]*gateway_status[\s\S]*'CANCELED'[\s\S]*payment_gateway_transactions[\s\S]*remote_status/i,
  );
  const confirmedCanceled = localAdjustment.slice(
    localAdjustment.lastIndexOf("gateway_provider = 'banese_card'"),
  );
  assert.doesNotMatch(confirmedCanceled, /data_vencimento >/i);
  const futureBranch = localAdjustment.slice(
    localAdjustment.indexOf("data_vencimento > new.data_movimentacao"),
    localAdjustment.indexOf("gateway_provider is null"),
  );
  assert.doesNotMatch(futureBranch, /gateway_status|CANCELED/i);
});

Deno.test("cron usa segredo interno e não existe backfill global", () => {
  assert.match(sql, /X-Banese-Worker-Token/i);
  assert.match(
    sql,
    /payment_gateway_banese_card_reconciliation_worker_secret/i,
  );
  const beforeFunctions = schemaSql.slice(
    0,
    schemaSql.indexOf("create or replace function"),
  );
  assert.doesNotMatch(
    beforeFunctions,
    /insert into public\.banese_cancellation_outbox[\s\S]*from public\.contas_receber/i,
  );
});

Deno.test("chaves estrangeiras operacionais possuem índices de cobertura", () => {
  assert.match(
    indexSql,
    /banese_cancellation_outbox\(matricula_id, state\)/i,
  );
  assert.match(
    indexSql,
    /banese_cancellation_outbox\(movement_id\)[\s\S]*movement_id is not null/i,
  );
});
