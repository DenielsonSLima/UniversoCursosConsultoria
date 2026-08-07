-- Limpeza explicitamente autorizada do financeiro de homologação.
-- Preserva somente a cobrança Banese paga de R$ 14,90 (Nosso Número 000000074).
-- Matrículas e acessos acadêmicos permanecem intactos.
-- Todos os registros removidos são arquivados em maintenance_archive antes da exclusão.

do $cleanup$
declare
  v_run_id uuid;
  v_keep_id uuid;
  v_keep_count integer;
  v_target_ids uuid[];
  v_settlement_ids uuid[];
  v_target_count integer;
  v_transaction_count integer;
  v_inscription_count integer;
  v_settlement_count integer;
  v_settlement_event_count integer;
  v_deleted_transactions integer;
  v_deleted_inscriptions integer;
  v_deleted_settlements integer;
  v_deleted_settlement_events integer;
  v_deleted_receivables integer;
begin
  perform pg_advisory_xact_lock(
    hashtext('finance-cleanup-keep-banese-14-90-20260726')
  );

  -- Os gatilhos de proteção reconhecem somente operações internas service_role.
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  select count(*), (array_agg(cr.id order by cr.id))[1]
    into v_keep_count, v_keep_id
  from public.contas_receber cr
  join public.parceiros p on p.id = cr.cliente_id
  join public.matriculas m on m.id = cr.matricula_id
  join public.turmas t on t.id = m.turma_id
  join public.cursos c on c.id = t.curso_id
  where cr.valor = 14.90
    and cr.valor_pago = 14.90
    and cr.status = 'PAGO'
    and cr.gateway_provider = 'banese_card'
    and cr.gateway_environment = 'production'
    and cr.gateway_payment_id = '000000074'
    and cr.gateway_boleto_nosso_numero = '000000074'
    and cr.gateway_status = 'PAID'
    and regexp_replace(p.cpf_cnpj, '\D', '', 'g') = '05911811502'
    and c.nome = 'Auxiliar Administrativo';

  if v_keep_count <> 1 or v_keep_id is null then
    raise exception
      'A cobrança Banese de R$ 14,90 não foi identificada de forma única.';
  end if;

  perform 1
  from public.contas_receber
  order by id
  for update;

  select array_agg(cr.id order by cr.id), count(*)
    into v_target_ids, v_target_count
  from public.contas_receber cr
  where cr.id <> v_keep_id;

  if v_target_count <> 8 then
    raise exception
      'A limpeza esperava 8 cobranças de teste, mas encontrou %.',
      v_target_count;
  end if;

  if (
    select coalesce(sum(cr.valor), 0)
    from public.contas_receber cr
    where cr.id = any(v_target_ids)
  ) <> 949.20 then
    raise exception
      'O total das cobranças de teste divergiu de R$ 949,20.';
  end if;

  if exists (
    select 1
    from public.contas_receber cr
    where cr.id = any(v_target_ids)
      and not (
        cr.gateway_status = 'CANCELED'
        or (
          cr.gateway_status is null
          and cr.gateway_payment_id is null
        )
      )
  ) then
    raise exception
      'Há cobrança remota não cancelada entre os registros de teste.';
  end if;

  select array_agg(s.id order by s.id), count(*)
    into v_settlement_ids, v_settlement_count
  from public.receivable_manual_settlements s
  where s.receivable_id = any(v_target_ids);

  select count(*)
    into v_transaction_count
  from public.payment_gateway_transactions tx
  where tx.receivable_id = any(v_target_ids);

  select count(*)
    into v_inscription_count
  from public.inscricoes_online io
  where io.receivable_id = any(v_target_ids);

  select count(*)
    into v_settlement_event_count
  from public.receivable_manual_settlement_events evt
  where evt.settlement_id = any(v_settlement_ids);

  if row(
    v_transaction_count,
    v_inscription_count,
    v_settlement_count,
    v_settlement_event_count
  ) is distinct from row(7, 7, 9, 27) then
    raise exception
      'Os vínculos da limpeza divergiram: transações %, inscrições %, baixas %, eventos %.',
      v_transaction_count,
      v_inscription_count,
      v_settlement_count,
      v_settlement_event_count;
  end if;

  insert into maintenance_archive.cleanup_runs (
    label,
    criteria,
    baseline
  ) values (
    'finance_cleanup_keep_banese_14_90_20260726',
    jsonb_build_object(
      'preserved_receivable_id', v_keep_id,
      'preserved_amount', 14.90,
      'preserved_provider', 'banese_card',
      'preserved_environment', 'production',
      'preserved_remote_payment_id', '000000074',
      'scope', 'financial_test_records_only'
    ),
    jsonb_build_object(
      'receivables', v_target_count,
      'receivable_total', 949.20,
      'transactions', v_transaction_count,
      'online_inscriptions', v_inscription_count,
      'manual_settlements', v_settlement_count,
      'manual_settlement_events', v_settlement_event_count
    )
  )
  returning id into v_run_id;

  insert into maintenance_archive.cleanup_rows (
    run_id,
    source_table,
    source_key,
    payload
  )
  select
    v_run_id,
    'contas_receber',
    jsonb_build_object('id', src.id),
    to_jsonb(src)
  from public.contas_receber src
  where src.id = any(v_target_ids);

  insert into maintenance_archive.cleanup_rows (
    run_id,
    source_table,
    source_key,
    payload
  )
  select
    v_run_id,
    'payment_gateway_transactions',
    jsonb_build_object('id', src.id),
    to_jsonb(src)
  from public.payment_gateway_transactions src
  where src.receivable_id = any(v_target_ids);

  insert into maintenance_archive.cleanup_rows (
    run_id,
    source_table,
    source_key,
    payload
  )
  select
    v_run_id,
    'inscricoes_online',
    jsonb_build_object('id', src.id),
    to_jsonb(src)
  from public.inscricoes_online src
  where src.receivable_id = any(v_target_ids);

  insert into maintenance_archive.cleanup_rows (
    run_id,
    source_table,
    source_key,
    payload
  )
  select
    v_run_id,
    'receivable_manual_settlements',
    jsonb_build_object('id', src.id),
    to_jsonb(src)
  from public.receivable_manual_settlements src
  where src.id = any(v_settlement_ids);

  insert into maintenance_archive.cleanup_rows (
    run_id,
    source_table,
    source_key,
    payload
  )
  select
    v_run_id,
    'receivable_manual_settlement_events',
    jsonb_build_object('id', src.id),
    to_jsonb(src)
  from public.receivable_manual_settlement_events src
  where src.settlement_id = any(v_settlement_ids);

  -- A tabela é append-only no uso normal. Nesta limpeza administrativa,
  -- os eventos já foram arquivados e o gatilho é suspenso somente dentro
  -- desta transação; qualquer falha reverte também esta alteração de DDL.
  alter table public.receivable_manual_settlement_events
    disable trigger prevent_receivable_manual_settlement_event_mutation;

  delete from public.receivable_manual_settlement_events evt
  where evt.settlement_id = any(v_settlement_ids);
  get diagnostics v_deleted_settlement_events = row_count;

  alter table public.receivable_manual_settlement_events
    enable trigger prevent_receivable_manual_settlement_event_mutation;

  update public.contas_receber cr
  set
    manual_settlement_id = null,
    manual_settlement_principal_cents = null,
    manual_settlement_interest_cents = null,
    manual_settlement_penalty_cents = null,
    manual_settlement_addition_cents = null,
    manual_settlement_discount_cents = null,
    manual_settlement_received_cents = null,
    manual_settlement_reversed_at = null,
    updated_at = now()
  where cr.id = any(v_target_ids);

  delete from public.receivable_manual_settlements settlement
  where settlement.id = any(v_settlement_ids);
  get diagnostics v_deleted_settlements = row_count;

  delete from public.payment_gateway_transactions tx
  where tx.receivable_id = any(v_target_ids);
  get diagnostics v_deleted_transactions = row_count;

  delete from public.inscricoes_online io
  where io.receivable_id = any(v_target_ids);
  get diagnostics v_deleted_inscriptions = row_count;

  delete from public.contas_receber cr
  where cr.id = any(v_target_ids);
  get diagnostics v_deleted_receivables = row_count;

  if row(
    v_deleted_transactions,
    v_deleted_inscriptions,
    v_deleted_settlements,
    v_deleted_settlement_events,
    v_deleted_receivables
  ) is distinct from row(7, 7, 9, 27, 8) then
    raise exception
      'A exclusão ficou incompleta: transações %, inscrições %, baixas %, eventos %, cobranças %.',
      v_deleted_transactions,
      v_deleted_inscriptions,
      v_deleted_settlements,
      v_deleted_settlement_events,
      v_deleted_receivables;
  end if;

  if (select count(*) from public.contas_receber) <> 1 then
    raise exception 'A limpeza não terminou com uma única cobrança.';
  end if;

  if not exists (
    select 1
    from public.contas_receber cr
    where cr.id = v_keep_id
      and cr.valor = 14.90
      and cr.valor_pago = 14.90
      and cr.status = 'PAGO'
      and cr.gateway_payment_id = '000000074'
      and cr.gateway_status = 'PAID'
  ) then
    raise exception 'A cobrança preservada foi alterada durante a limpeza.';
  end if;

  update maintenance_archive.cleanup_runs
  set
    result = jsonb_build_object(
      'deleted_receivables', v_deleted_receivables,
      'deleted_transactions', v_deleted_transactions,
      'deleted_online_inscriptions', v_deleted_inscriptions,
      'deleted_manual_settlements', v_deleted_settlements,
      'deleted_manual_settlement_events', v_deleted_settlement_events,
      'remaining_receivable_id', v_keep_id,
      'remaining_amount', 14.90
    ),
    completed_at = now()
  where id = v_run_id;
end;
$cleanup$;
