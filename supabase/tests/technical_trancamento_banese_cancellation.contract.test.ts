import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile(path: string | URL): Promise<string>;
  test(name: string, run: () => void | Promise<void>): void;
};

const read = (path: string) => Deno.readTextFile(new URL(path, import.meta.url));
const [policy, projection, raceFence, terminal, lane, preview, rollback, completion, adjustment, adapter, summary, modal, card] = await Promise.all([
  read('../migrations/20261001020000_add_trancamento_banese_cancellation_policy.sql'),
  read('../migrations/20261001020010_project_trancamento_banese_cancellation.sql'),
  read('../migrations/20261001020020_fence_trancamento_manual_settlement_races.sql'),
  read('../migrations/20261001020050_preserve_trancamento_during_terminal_movement.sql'),
  read('../migrations/20261001020100_extend_banese_cancellation_claim_for_trancamento.sql'),
  read('../migrations/20261001020200_preview_trancamento_financeiro.sql'),
  read('./technical_trancamento_banese_cancellation.rollback.sql'),
  read('../migrations/20260826235920_complete_all_unpaid_terminal_cancellations.sql'),
  read('../migrations/20260827002500_require_confirmed_banese_terminal_cancellation.sql'),
  read('../functions/banese/core/adapter/boleto-cancellation.ts'),
  read('../migrations/20260912133702_align_receivables_summary_payment_period.sql'),
  read('../../modules/gestor/gestao/tecnicos/detalhes/components/alunos/MovimentacaoAlunoModal.tsx'),
  read('../../modules/gestor/gestao/tecnicos/detalhes/components/alunos/TrancamentoFinancialPreview.tsx'),
]);

Deno.test('migration é aditiva, sem backfill ou dispatch bancário', () => {
  assert.match(policy, /'TRANCAMENTO_FUTURO'/);
  assert.doesNotMatch(policy, /insert into public\.banese_cancellation_outbox/i);
  assert.doesNotMatch(`${policy}\n${projection}\n${raceFence}\n${terminal}\n${lane}\n${preview}`, /http|fetch\(|invoke\(/i);
  for (const sql of [policy, projection, raceFence, terminal, lane, preview]) {
    assert.match(sql, /^begin;/m);
    assert.match(sql, /^commit;/m);
    assert.ok(sql.split('\n').length <= 500);
  }
});

Deno.test('corte é estrito, pago/parcial é preservado e movimento continua atual', () => {
  assert.match(policy, /data_vencimento > p_effective_date/);
  assert.match(policy, /coalesce\(p_receivable\.valor_pago, 0\) = 0/);
  assert.match(policy, /p_receivable\.data_pagamento is null/);
  assert.match(policy, /current_trancamento_movement/);
  assert.match(policy, /current_terminal_cancellation_movement/);
  assert.match(policy, /coalesce\(valor_pago, 0\) = 0[\s\S]*data_vencimento > new\.data_movimentacao/);
  assert.match(policy, /Âncora de preservação parcial no encerramento mudou/);
  assert.match(policy, /coalesce\(new\.valor_pago, 0\) <> 0/);
  assert.match(policy, /Âncora de preservação parcial tardia mudou/);
  assert.match(policy, /gateway_provider is distinct from 'banese_card'[\s\S]*gateway_payment_method is distinct from 'BOLETO'/);
});

Deno.test('Banese permanece em aberto e provisionado até confirmação remota', () => {
  assert.match(policy, /p_receivable\.status in \('PENDENTE', 'VENCIDO', 'SUSPENSO'\)/);
  assert.doesNotMatch(policy, /v_reason = 'TRANCAMENTO_FUTURO'[\s\S]*set status = 'SUSPENSO'/);
  assert.match(card, /continuam em aberto[\s\S]*provisionados[\s\S]*confirmação do banco/);
  assert.match(summary, /pending_value[\s\S]*status in \('PENDENTE', 'VENCIDO', 'SUSPENSO'\)/i);
});

Deno.test('histórico Proesc é somente leitura e não entra em suspensão ou outbox', () => {
  assert.equal((policy.match(/internal_proesc\.obligation_links/g) || []).length >= 3, true);
  assert.equal((terminal.match(/internal_proesc\.obligation_links/g) || []).length, 3);
  assert.match(projection, /not exists \(select 1 from internal_proesc\.obligation_links/);
  assert.match(projection, /trancamento_banese_is_canonical/);
  assert.match(projection, /banese_trancamento_completion_matches/);
  assert.match(projection, /payment_gateway_transactions tx/);
  assert.match(preview, /as proesc_linked/);
  assert.match(preview, /future_proesc_preserved/);
  assert.match(preview, /proesc_linked is not true[\s\S]*future_local_suspended/);
  assert.match(rollback, /futureProescPreserved/);
  assert.match(rollback, /Proesc-linked history must remain untouched/);
  assert.match(rollback, /Reactivation must not mutate linked Proesc history/);
  assert.match(rollback, /Terminal movement must not enqueue Proesc-linked history/);
});

Deno.test('claim, start e complete repetem a mesma cerca antes e depois da rede', () => {
  assert.equal((lane.match(/banese_trancamento_job_matches\(c, j\)/g) || []).length >= 3, true);
  assert.equal((lane.match(/banese_trancamento_job_matches\(c, v_job\)/g) || []).length >= 6, true);
  assert.equal((lane.match(/internal_proesc\.obligation_links/g) || []).length >= 3, true);
  assert.match(lane, /cerca pós-remoto do complete/);
  assert.match(lane, /banese_trancamento_completion_matches\(c, v_job\)/);
  assert.match(lane, /snapshot|CAS/i);
  assert.match(lane, /has_function_privilege\('authenticated'/);
  assert.doesNotMatch(lane, /errcode\s*=\s*'40001'/i);
});

Deno.test('GET de título e pagamentos cerca o PUT e somente code 5 conclui', () => {
  const firstGet = adapter.indexOf('const current = await queryBaneseBoleto');
  const paymentCheck = adapter.indexOf('current.paymentsError');
  const put = adapter.indexOf('method: "PUT"');
  const secondGet = adapter.indexOf('const confirmed = await queryBaneseBoleto');
  const confirmedPayment = adapter.indexOf('confirmed.paymentsError');
  const codeFive = adapter.indexOf('confirmed.situationCode !== 5');
  assert.ok(firstGet < paymentCheck && paymentCheck < put);
  assert.ok(put < secondGet && secondGet < confirmedPayment && confirmedPayment < codeFive);
});

Deno.test('terminal posterior preserva cutoff sem bloquear encerramento e DONE não revive', () => {
  assert.match(policy, /reason = 'TRANCAMENTO_FUTURO'[\s\S]*state in \('PENDING', 'RETRY'\)[\s\S]*then public\.banese_cancellation_outbox\.movement_id/);
  assert.match(policy, /then public\.banese_cancellation_outbox\.effective_date/);
  assert.doesNotMatch(policy, /Baixa Banese do trancamento em andamento ou em revisão/);
  assert.match(policy, /new\.tipo[\s\S]*coalesce\(c\.valor_pago, 0\) = 0/);
  assert.match(terminal, /reason='TRANCAMENTO_FUTURO'[\s\S]*banese_trancamento_job_matches\(v_row,j\)/);
  assert.match(policy, /old\.state = 'DONE'[\s\S]*old\.remote_status = 'SKIPPED_REACTIVATED'/);
  assert.doesNotMatch(policy, /old\.remote_status = 'CANCELED'[\s\S]*new\.state = 'PENDING'/);
});

Deno.test('Banese não canônico mantém revisão persistente sem inventar ambiente bancário', () => {
  assert.match(projection, /when j\.id is null[\s\S]*'state', 'REVIEW_REQUIRED'/);
  assert.match(projection, /gateway_provider = 'banese_card'[\s\S]*gateway_payment_method = 'BOLETO'/);
  assert.match(projection, /mm\.tipo = 'TRANCAMENTO'/);
  assert.match(projection, /state\.terminal_id is not null[\s\S]*select prior\.id/);
  assert.match(rollback, /v_projection->>'state' = 'REVIEW_REQUIRED'/);
  assert.match(rollback, /rollback;\s*$/);
  assert.match(rollback, /claim_banese_cancellation_batch\(1\)/);
  assert.match(rollback, /complete_banese_cancellation_job/);
});

Deno.test('fixture preserva auditoria e usa RPC real no movimento posterior', () => {
  assert.doesNotMatch(rollback, /update public\.matricula_movimentacoes/i);
  assert.match(rollback, /clock_timestamp\(\) - interval '1 day'/);
  assert.match(
    rollback,
    /p1_movimentar_matricula_academica_20260719\([\s\S]*'REATIVACAO'/,
  );
  assert.match(
    rollback,
    /p1_movimentar_matricula_academica_20260719\([\s\S]*'CANCELAMENTO'/,
  );
});

Deno.test('baixa manual e outbox serializam o recebível e falham fechado', () => {
  assert.match(policy, /from public\.contas_receber[\s\S]*id = p_receivable_id[\s\S]*for update/);
  assert.match(policy, /receivable_manual_settlements[\s\S]*REMOTE_CANCELED_LOCAL_PENDING/);
  assert.match(raceFence, /from public\.contas_receber[\s\S]*for update/);
  assert.match(raceFence, /job\.state in \('PENDING', 'RETRY', 'PROCESSING', 'REVIEW_REQUIRED'\)/);
  assert.match(raceFence, /errcode = 'PT409'/);
  assert.match(projection, /receivable_manual_settlements[\s\S]*REMOTE_CANCELED_LOCAL_PENDING/);
});

Deno.test('reativação só restaura SUSPENSO; CANCELADO confirmado permanece terminal', () => {
  const reactivation = adjustment.slice(
    adjustment.indexOf("elsif new.tipo = 'REATIVACAO'"),
    adjustment.indexOf("elsif new.tipo in ("),
  );
  assert.match(reactivation, /where matricula_id = new\.matricula_id[\s\S]*status = 'SUSPENSO'/);
  assert.doesNotMatch(reactivation, /status = 'CANCELADO'/);
  assert.match(terminal, /readonly Proesc da reativação/);
  assert.match(completion, /p_remote_status[\s\S]*<> 'CANCELED'[\s\S]*set status = 'CANCELADO'/);
});

Deno.test('CANCELADO sai de valores em aberto, mas continua auditável no resumo', () => {
  assert.match(summary, /pending_value[\s\S]*status in \('PENDENTE', 'VENCIDO', 'SUSPENSO'\)/i);
  assert.match(summary, /canceled_count[\s\S]*status = 'CANCELADO'/i);
  assert.match(preview, /canceledExcludedFromOpenTotals', true/);
});

Deno.test('UI bloqueia sem prévia e explica SUSPENSO, revisão e confirmação Banese', () => {
  assert.match(modal, /reviewingTrancamento && !trancamentoCanConfirm/);
  assert.match(modal, /TrancamentoFinancialPreview/);
  assert.match(card, /só aparecem como CANCELADOS[\s\S]*confirmação do banco/);
  assert.match(card, /revisão não significa cancelamento no banco/);
  assert.match(card, /Estado atual:[\s\S]*em processamento[\s\S]*em revisão/);
});
