-- Durable post-import invariants; safe after later legitimate Proesc payments.
do $proesc_invariants$
declare v_count bigint;
begin
  assert not exists (select 1 from internal_proesc.reconciliation_requests where response is null),
    'Unfinished Proesc reconciliation request';
  assert not exists (select 1 from internal_proesc.mutation_claims where not completed),
    'Unconsumed Proesc mutation claim';
  select count(*) into v_count from internal_proesc.obligation_links link
  join public.contas_receber receipt on receipt.id = link.receivable_id
  join public.matriculas enrollment on enrollment.id = link.matricula_id
  join public.turmas class on class.id = link.turma_id
  where receipt.matricula_id is distinct from link.matricula_id
    or receipt.turma_id is distinct from link.turma_id or enrollment.turma_id <> class.id
    or receipt.cliente_id is distinct from enrollment.aluno_id or receipt.polo_id is distinct from class.polo_id
    or class.codigo <> 'ENF-T42-INT-MAT' or receipt.origem_pagamento <> 'SISTEMA_ANTERIOR'
    or receipt.gateway_provider is not null or receipt.gateway_payment_id is not null
    or receipt.gateway_creation_token is not null or receipt.manual_settlement_id is not null
    or receipt.regra_financeira_tecnica_snapshot -> 'cicloManual' is not null
    or exists (select 1 from public.payment_gateway_transactions transaction where transaction.receivable_id = receipt.id);
  assert v_count = 0, 'Linked Proesc identity or bank isolation drifted';
  assert not exists (select 1 from internal_proesc.obligation_links link
    join internal_academic.technical_external_cycle_evidence evidence on evidence.receivable_id = link.receivable_id
    where (link.source_unit_id,link.source_class_id,link.source_key)
      is distinct from (evidence.source_unit_id,evidence.source_class_id,evidence.source_key)),
    'Confirmed external-cycle source identity drifted';
  assert not exists (select 1 from internal_proesc.obligation_links child
    join internal_proesc.obligation_links parent on parent.id = child.parent_link_id
    where child.kind <> 'RESIDUAL' or child.matricula_id <> parent.matricula_id
      or child.turma_id <> parent.turma_id or child.source_unit_id <> parent.source_unit_id
      or child.source_class_id <> parent.source_class_id or child.id = parent.id),
    'Residual link has an incompatible parent';
  assert not exists (select 1 from internal_proesc.reconciliation_events event
    join internal_proesc.financial_snapshots snapshot on snapshot.id = event.snapshot_id
    where event.result = 'APPLIED' and (
      snapshot.verification <> 'VERIFIED' or snapshot.source_status <> 'PAID'
      or event.after_state ->> 'status' <> 'PAGO'
      or (event.after_state ->> 'valor_pago')::numeric <> snapshot.received_cents::numeric / 100
      or (event.after_state ->> 'data_pagamento')::date <> snapshot.payment_date
      or (event.before_state - array['status','valor_pago','data_pagamento','conta_bancaria_id','updated_at'])
        is distinct from (event.after_state - array['status','valor_pago','data_pagamento','conta_bancaria_id','updated_at']))),
    'Applied payment changed unapproved fields or diverged from source evidence';
  assert not exists (select 1 from internal_proesc.financial_snapshots snapshot
    where snapshot.verification = 'VERIFIED' and snapshot.evidence_kind = 'API_PAYMENT_TOTAL' and (
      snapshot.received_cents is distinct from (select sum((line ->> 'amountCents')::bigint)
        from jsonb_array_elements(snapshot.accounting_lines) line where line ->> 'blockCode' = '2')
      or exists (select 1 from jsonb_array_elements(snapshot.accounting_lines) line
        where line ->> 'blockCode' = '2' and (line ->> 'paymentDate')::date is distinct from snapshot.payment_date)
      or snapshot.components -> 'discountCents' <> 'null'::jsonb
      or snapshot.components -> 'additionCents' <> 'null'::jsonb)),
    'Verified API total no longer matches its complete block-2 multiset';
  raise notice 'Proesc private reconciliation invariants passed';
end;
$proesc_invariants$;
