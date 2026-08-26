// @ts-nocheck -- contrato executado pelo Deno, fora do runtime TypeScript da aplicação.

import assert from "node:assert/strict";

const pushMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260826213000_harden_push_financial_notification_eligibility.sql",
    import.meta.url,
  ),
);
const pushFinancialRuntimeMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260826213050_harden_push_financial_notification_runtime.sql",
    import.meta.url,
  ),
);
const whatsappMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260826213100_harden_whatsapp_financial_notification_claim.sql",
    import.meta.url,
  ),
);
const continuityMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260622190000_student_enrollment_continuity.sql",
    import.meta.url,
  ),
);
const inboxMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260803232513_create_student_notification_inbox.sql",
    import.meta.url,
  ),
);
const pushLifecycleMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260804184017_harden_rich_push_queue_lifecycle.sql",
    import.meta.url,
  ),
);
const pushDeliveryRuntimeMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260803210000_harden_push_delivery_runtime.sql",
    import.meta.url,
  ),
);
const whatsappWorker = await Deno.readTextFile(
  new URL("../functions/whatsapp-automation-agent/index.ts", import.meta.url),
);
const pushWorker = await Deno.readTextFile(
  new URL(
    "../functions/push-notification-dispatcher/index.ts",
    import.meta.url,
  ),
);

const notifiable = (status: string, paidAt: string | null) =>
  paidAt === null && (status === "PENDENTE" || status === "VENCIDO");
const paidConfirmed = (status: string, paidAt: string | null) =>
  paidAt !== null && ["PAGO", "RECEBIDO", "RECEBIDA"].includes(status);
const enteredPaidConfirmed = (
  oldStatus: string,
  oldPaidAt: string | null,
  newStatus: string,
  newPaidAt: string | null,
) =>
  paidConfirmed(newStatus, newPaidAt) &&
  !paidConfirmed(oldStatus, oldPaidAt);

Deno.test("predicado canônico aceita somente dívida aberta e não paga", () => {
  for (const status of ["PENDENTE", "VENCIDO"]) {
    assert.equal(notifiable(status, null), true, status);
    assert.equal(notifiable(status, "2026-08-26"), false, `${status} pago`);
  }
  for (
    const status of [
      "SUSPENSO",
      "PAGO",
      "CANCELADO",
      "ESTORNADO",
      "DEVOLVIDO",
    ]
  ) {
    assert.equal(notifiable(status, null), false, status);
  }
  assert.match(
    pushMigration,
    /p_data_pagamento is null\s+and coalesce\(p_status in \('PENDENTE', 'VENCIDO'\), false\)/,
  );
  assert.match(
    whatsappMigration,
    /financial_receivable_is_notifiable\(status, data_pagamento\)/,
  );
});

Deno.test("trancamento preserva vencidas no corte e suspende só o futuro", () => {
  const trancamento = continuityMigration.slice(
    continuityMigration.indexOf("IF NEW.tipo = 'TRANCAMENTO'"),
    continuityMigration.indexOf("ELSIF NEW.tipo = 'REATIVACAO'"),
  );
  assert.match(trancamento, /status = 'SUSPENSO'/);
  assert.match(trancamento, /status IN \('PENDENTE', 'VENCIDO'\)/);
  assert.match(trancamento, /data_vencimento > NEW\.data_movimentacao/);
  assert.doesNotMatch(trancamento, /status = 'CANCELADO'/);
});

Deno.test("receipt possui elegibilidade separada de cobrança", () => {
  assert.match(
    whatsappMigration,
    /receipt_rows as \([\s\S]*financial_receivable_is_paid_confirmed\([\s\S]*b\.data_pagamento = p_target_date/,
  );
  const unpaid = whatsappMigration.slice(
    whatsappMigration.indexOf("unpaid as ("),
    whatsappMigration.indexOf("overdue_group as ("),
  );
  assert.doesNotMatch(unpaid, /receipt/);
});

Deno.test("confirmação Push continua enfileirada com snapshot do pagamento", () => {
  assert.match(
    inboxMigration,
    /enqueue_payment_confirmation_push_notification[\s\S]*'event', 'payment_confirmed'/,
  );
  assert.match(
    pushMigration,
    /v_event in \('receipt', 'payment_receipt', 'payment_confirmed'\)/,
  );
  assert.match(
    pushMigration,
    /when new\.data ->> 'event' = 'payment_confirmed'[\s\S]*then v_payment_date::text/,
  );
  assert.match(
    pushMigration,
    /financial_receivable_is_paid_confirmed\([\s\S]*FINANCIAL_PAYMENT_NOT_CONFIRMED/,
  );
  const producer = pushMigration.slice(
    pushMigration.indexOf("enqueue_payment_confirmation_push_notification"),
  );
  assert.match(producer, /'event', 'payment_confirmed'/);
  assert.match(producer, /'financial:payment-confirmed:' \|\| new\.id::text/);
});

Deno.test("confirmação Push espera status e data em qualquer ordem", () => {
  assert.equal(enteredPaidConfirmed("PENDENTE", null, "PAGO", null), false);
  assert.equal(
    enteredPaidConfirmed("PAGO", null, "PAGO", "2026-08-26"),
    true,
  );
  assert.equal(
    enteredPaidConfirmed("PENDENTE", null, "PENDENTE", "2026-08-26"),
    false,
  );
  assert.equal(
    enteredPaidConfirmed(
      "PENDENTE",
      "2026-08-26",
      "RECEBIDO",
      "2026-08-26",
    ),
    true,
  );
  assert.equal(
    enteredPaidConfirmed("PAGO", "2026-08-26", "PAGO", "2026-08-26"),
    false,
  );
  assert.equal(paidConfirmed("RECEBIDA", "2026-08-26"), true);
  assert.match(
    pushMigration,
    /p_data_pagamento is not null[\s\S]*\('PAGO', 'RECEBIDO', 'RECEBIDA'\)/,
  );

  const insertGuard = pushMigration.indexOf(
    "push_notification_jobs_guard_financial_insert",
  );
  const producer = pushMigration.indexOf(
    "enqueue_payment_confirmation_push_notification",
  );
  assert(insertGuard >= 0 && producer > insertGuard);
  for (const sql of [pushMigration, pushFinancialRuntimeMigration]) {
    assert.equal(sql.match(/^begin;$/gm)?.length, 1);
    assert.equal(sql.match(/^commit;$/gm)?.length, 1);
    assert.equal((sql.match(/\$\$/g)?.length ?? 0) % 2, 0);
  }
  assert.match(
    pushMigration,
    /v_new_paid := public\.financial_receivable_is_paid_confirmed\([\s\S]*v_old_paid := public\.financial_receivable_is_paid_confirmed/,
  );
});

Deno.test("Push bloqueia no scheduler, revalida claim e arquiva inbox já visível", () => {
  assert.match(
    pushMigration,
    /before insert on public\.push_notification_jobs[\s\S]*guard_financial_push_job_insert/,
  );
  assert.match(
    pushMigration,
    /for share;[\s\S]*financial_receivable_notification_block_reason/,
  );
  assert.match(
    pushFinancialRuntimeMigration,
    /push_notification_jobs_00_financial_revalidate_claim/,
  );
  assert.match(
    pushMigration,
    /'event' = 'payment_due'[\s\S]*FINANCIAL_NOTIFICATION_WINDOW_EXPIRED/,
  );
  const archive = pushFinancialRuntimeMigration.slice(
    pushFinancialRuntimeMigration.indexOf(
      "archive_cancelled_financial_push_inbox",
    ),
    pushFinancialRuntimeMigration.indexOf(
      "revalidate_push_notification_delivery_before_send",
    ),
  );
  assert.match(archive, /inbox\.archived_at is null/);
  assert.doesNotMatch(archive, /visible_at > now\(\)/);

  const revalidation = pushWorker.indexOf(
    '"revalidate_push_notification_delivery_before_send"',
  );
  const fcm = pushWorker.indexOf("https://fcm.googleapis.com/v1/projects/");
  assert(revalidation >= 0 && fcm > revalidation);
});

Deno.test("cancelamento na revalidação deixa job e delivery terminais", () => {
  const finalRevalidation = pushFinancialRuntimeMigration.slice(
    pushFinancialRuntimeMigration.indexOf(
      "revalidate_push_notification_delivery_before_send",
    ),
  );
  assert.match(
    finalRevalidation,
    /set status = 'cancelled'[\s\S]*last_error = v_reason/,
  );
  const cascade = pushLifecycleMigration.slice(
    pushLifecycleMigration.indexOf("cascade_cancelled_push_job"),
    pushLifecycleMigration.indexOf("guard_push_notification_job_claim"),
  );
  assert.match(
    cascade,
    /set status = 'skipped'[\s\S]*delivery\.status in \('pending', 'processing'\)/,
  );
  assert.match(
    pushWorker,
    /A RPC cancela o job; o trigger canônico move deliveries abertos[\s\S]*return;/,
  );
});

Deno.test("revalidação Push usa ordem conta, job e delivery sem inversão", () => {
  const rpc = pushFinancialRuntimeMigration.slice(
    pushFinancialRuntimeMigration.indexOf(
      "revalidate_push_notification_delivery_before_send",
    ),
  );
  const accountLock = rpc.indexOf("from public.contas_receber receivable");
  const accountForShare = rpc.indexOf("for share;", accountLock);
  const jobLock = rpc.indexOf("from public.push_notification_jobs job");
  const jobForUpdate = rpc.indexOf("for update;", jobLock);
  const deliveryLock = rpc.indexOf(
    "from public.push_notification_deliveries delivery",
    jobLock,
  );
  const deliveryForUpdate = rpc.indexOf("for update;", deliveryLock);

  assert(accountLock >= 0);
  assert(accountForShare > accountLock && accountForShare < jobLock);
  assert(jobLock > accountLock);
  assert(jobForUpdate > jobLock && jobForUpdate < deliveryLock);
  assert(deliveryLock > jobLock);
  assert(deliveryForUpdate > deliveryLock);
  assert.match(
    rpc,
    /source_type is distinct from v_snapshot_source_type[\s\S]*source_id is distinct from v_snapshot_source_id/,
  );
  assert.match(
    rpc,
    /job\.status = 'processing'[\s\S]*job\.locked_by[\s\S]*delivery\.status = 'processing'/,
  );
});

Deno.test("revalidação e conclusão Push preservam job antes de delivery", () => {
  const revalidation = pushFinancialRuntimeMigration.slice(
    pushFinancialRuntimeMigration.indexOf(
      "revalidate_push_notification_delivery_before_send",
    ),
  );
  const revalidationJob = revalidation.indexOf(
    "from public.push_notification_jobs job",
  );
  const revalidationDelivery = revalidation.indexOf(
    "from public.push_notification_deliveries delivery",
    revalidationJob,
  );

  const completion = pushDeliveryRuntimeMigration.slice(
    pushDeliveryRuntimeMigration.indexOf(
      "create function public.complete_push_notification_delivery_v2",
    ),
    pushDeliveryRuntimeMigration.indexOf(
      "revoke all on function public.claim_push_notification_deliveries",
    ),
  );
  const completionJobLock = completion.indexOf("for update of j;");
  const completionDeliveryUpdate = completion.indexOf(
    "update public.push_notification_deliveries",
  );

  assert(revalidationJob >= 0 && revalidationDelivery > revalidationJob);
  assert(completionJobLock >= 0);
  assert(completionDeliveryUpdate > completionJobLock);
});

Deno.test("worker usa somente conclusão v2 e função v1 perde execução", () => {
  assert.match(pushWorker, /"complete_push_notification_delivery_v2"/);
  assert.doesNotMatch(pushWorker, /"complete_push_notification_delivery"/);
  assert.match(
    pushFinancialRuntimeMigration,
    /revoke execute on function public\.complete_push_notification_delivery\(\s*uuid, boolean, text, text, boolean\s*\) from public, anon, authenticated, service_role;/,
  );
  assert.doesNotMatch(
    pushFinancialRuntimeMigration,
    /grant execute on function public\.complete_push_notification_delivery\(/,
  );
});

Deno.test("Push falha fechado quando o título muda de aluno", () => {
  assert.match(
    pushMigration,
    /v_receivable_client_id is distinct from v_job\.aluno_id[\s\S]*FINANCIAL_RECEIVABLE_OWNER_CHANGED/,
  );
  const insertGuard = pushMigration.slice(
    pushMigration.indexOf("guard_financial_push_job_insert"),
    pushMigration.indexOf("push_notification_jobs_guard_financial_insert"),
  );
  assert.match(
    insertGuard,
    /receivable\.cliente_id[\s\S]*v_receivable_client_id is distinct from new\.aluno_id[\s\S]*return null/,
  );
  assert.match(
    pushFinancialRuntimeMigration,
    /after update of status, data_pagamento, data_vencimento, cliente_id/,
  );
  assert.match(
    pushFinancialRuntimeMigration,
    /old\.cliente_id is distinct from new\.cliente_id/,
  );
});

Deno.test("mudança do título invalida jobs Push ainda abertos", () => {
  assert.match(
    pushFinancialRuntimeMigration,
    /after update of status, data_pagamento, data_vencimento[\s\S]*cancel_invalid_financial_push_jobs/,
  );
  assert.match(
    pushFinancialRuntimeMigration,
    /job\.status in \('pending', 'processing', 'failed', 'partial'\)/,
  );
  assert.match(
    pushFinancialRuntimeMigration,
    /set status = 'cancelled'[\s\S]*last_error = public\.financial_push_job_block_reason/,
  );
  assert.match(
    pushFinancialRuntimeMigration,
    /create index if not exists idx_push_notification_jobs_financial_open_source[\s\S]*on public\.push_notification_jobs \(source_id\)[\s\S]*where source_type = 'financial'[\s\S]*status in \('pending', 'processing', 'failed', 'partial'\)/,
  );
});

Deno.test("WhatsApp revalida, trava títulos e só depois consome dedupe", () => {
  const claim = whatsappMigration.slice(
    whatsappMigration.indexOf(
      "claim_whatsapp_financial_automation_delivery",
    ),
  );
  const firstCandidate = claim.indexOf(
    "whatsapp_financial_automation_candidates",
  );
  const lock = claim.indexOf("for share;");
  const secondCandidate = claim.indexOf(
    "whatsapp_financial_automation_candidates",
    firstCandidate + 1,
  );
  const insertDelivery = claim.indexOf(
    "insert into public.whatsapp_automation_deliveries",
  );
  assert(firstCandidate >= 0);
  assert(lock > firstCandidate);
  assert(secondCandidate > lock);
  assert(insertDelivery > secondCandidate);
  assert.match(claim, /on conflict on constraint[\s\S]*do nothing/);

  const workerClaim = whatsappWorker.indexOf(
    '"claim_whatsapp_financial_automation_delivery"',
  );
  const metaPost = whatsappWorker.indexOf("https://graph.facebook.com/");
  assert(workerClaim >= 0 && metaPost > workerClaim);
  assert.doesNotMatch(
    whatsappWorker,
    /from\("whatsapp_automation_deliveries"\)\s*\.insert/,
  );
  assert.match(whatsappWorker, /body: claimed\.message_content/);
});
