-- Confirma localmente títulos Banese não pagos somente após a baixa remota.

create or replace function public.complete_banese_cancellation_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_remote_status text,
  p_already_canceled boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.banese_cancellation_outbox%rowtype;
  v_transaction_count integer;
  v_updated_count integer;
begin
  if upper(coalesce(p_remote_status, '')) <> 'CANCELED' then
    raise exception 'Confirmação remota inválida.';
  end if;

  select * into v_job
  from public.banese_cancellation_outbox
  where id = p_job_id
    and state = 'PROCESSING'
    and lease_token = p_lease_token
  for update;
  if not found then
    raise exception 'Lease de cancelamento inválido.';
  end if;
  if v_job.remote_attempt_started_at is null then
    raise exception 'Tentativa remota não cercada.';
  end if;

  perform 1
  from public.contas_receber c
  join public.matriculas m on m.id = c.matricula_id
  join public.matricula_movimentacoes mm on mm.id = v_job.movement_id
  where c.id = v_job.receivable_id
    and c.matricula_id = v_job.matricula_id
    and c.status in ('PENDENTE', 'VENCIDO', 'SUSPENSO')
    and c.status = v_job.snapshot_receivable_status
    and c.data_pagamento is null
    and c.data_vencimento = v_job.snapshot_due_date
    and c.gateway_provider = 'banese_card'
    and c.gateway_environment = v_job.environment
    and c.gateway_payment_method = 'BOLETO'
    and c.gateway_submission_channel = 'API'
    and c.gateway_submission_status = 'API_REGISTERED'
    and c.gateway_cnab_file_id is null
    and c.manual_settlement_id is null
    and c.gateway_payment_id = v_job.snapshot_payment_id
    and c.gateway_boleto_nosso_numero = v_job.snapshot_nosso_numero
    and regexp_replace(c.gateway_boleto_convenio, '\D', '', 'g') =
      v_job.snapshot_convenio
    and upper(coalesce(c.gateway_status, '')) = v_job.snapshot_gateway_status
    and c.updated_at is not distinct from v_job.snapshot_receivable_updated_at
    and m.status in ('DESISTENTE', 'CANCELADO', 'TRANSFERIDO')
    and mm.matricula_id = v_job.matricula_id
    and mm.tipo = v_job.reason
    and mm.data_movimentacao = v_job.effective_date
    and mm.status_novo = m.status
  for update of c;
  if not found then
    raise exception 'Recebível mudou durante o cancelamento.';
  end if;

  select count(*) into v_transaction_count
  from public.payment_gateway_transactions t
  where t.receivable_id = v_job.receivable_id
    and t.provider_code = 'banese_card'
    and t.environment = v_job.environment
    and t.payment_method = 'BOLETO';
  if v_transaction_count <> 1 then
    raise exception 'Transação Banese ausente ou ambígua.';
  end if;

  update public.payment_gateway_transactions t
  set remote_status = 'CANCELED',
      last_error = null,
      synced_at = now(),
      updated_at = now()
  where t.id = v_job.snapshot_transaction_id
    and t.receivable_id = v_job.receivable_id
    and t.provider_code = 'banese_card'
    and t.environment = v_job.environment
    and t.payment_method = 'BOLETO'
    and t.remote_payment_id = v_job.snapshot_nosso_numero
    and t.bank_slip_our_number = v_job.snapshot_nosso_numero
    and upper(coalesce(t.remote_status, '')) =
      v_job.snapshot_transaction_status;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'Identidade da transação Banese mudou.';
  end if;

  update public.contas_receber c
  set status = 'CANCELADO',
      gateway_status = 'CANCELED',
      gateway_synced_at = now(),
      gateway_last_error = null,
      updated_at = now()
  where c.id = v_job.receivable_id
    and c.matricula_id = v_job.matricula_id
    and c.status = v_job.snapshot_receivable_status
    and c.status in ('PENDENTE', 'VENCIDO', 'SUSPENSO')
    and c.data_pagamento is null
    and c.data_vencimento = v_job.snapshot_due_date
    and c.gateway_provider = 'banese_card'
    and c.gateway_environment = v_job.environment
    and c.gateway_payment_method = 'BOLETO'
    and c.gateway_submission_channel = 'API'
    and c.gateway_submission_status = 'API_REGISTERED'
    and c.gateway_cnab_file_id is null
    and c.manual_settlement_id is null
    and c.gateway_payment_id = v_job.snapshot_payment_id
    and c.gateway_boleto_nosso_numero = v_job.snapshot_nosso_numero
    and regexp_replace(c.gateway_boleto_convenio, '\D', '', 'g') =
      v_job.snapshot_convenio
    and upper(coalesce(c.gateway_status, '')) = v_job.snapshot_gateway_status
    and c.updated_at is not distinct from v_job.snapshot_receivable_updated_at;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'Recebível mudou durante a conclusão local.';
  end if;

  update public.banese_reconciliation_queue
  set state = 'DONE',
      next_check_at = null,
      lease_run_id = null,
      lease_until = null,
      last_checked_at = now(),
      last_result = 'CANCELED',
      last_error_class = null,
      updated_at = now()
  where receivable_id = v_job.receivable_id;

  update public.banese_cancellation_outbox
  set state = 'DONE',
      remote_status = 'CANCELED',
      already_canceled = coalesce(p_already_canceled, false),
      error_class = null,
      error_message = null,
      lease_token = null,
      lease_until = null,
      completed_at = now(),
      updated_at = now()
  where id = v_job.id
    and state = 'PROCESSING'
    and lease_token = p_lease_token;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'Job mudou durante a conclusão local.';
  end if;

  return jsonb_build_object('completed', true);
end;
$$;

revoke all on function public.complete_banese_cancellation_job(
  uuid, uuid, text, boolean
) from public, anon, authenticated;
grant execute on function public.complete_banese_cancellation_job(
  uuid, uuid, text, boolean
) to service_role;
