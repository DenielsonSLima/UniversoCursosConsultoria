-- Prévia somente local. Não consulta Banese e não altera recebíveis/fila.
begin;

create or replace function public.preview_trancamento_financeiro(
  p_matricula_id uuid,
  p_data_movimentacao date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_turma_id uuid;
  v_data_matricula date;
  v_status text;
  v_result jsonb;
begin
  select m.turma_id, m.data_matricula::date, m.status
    into v_turma_id, v_data_matricula, v_status
  from public.matriculas m
  where m.id = p_matricula_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'Matrícula não encontrada.';
  end if;
  if not public.can_operate_turma_academics(v_turma_id) then
    raise exception using
      errcode = '42501',
      message = 'Sem permissão de Gestão para revisar o trancamento.';
  end if;
  if p_data_movimentacao is null
     or p_data_movimentacao < v_data_matricula
     or p_data_movimentacao > (now() at time zone 'America/Maceio')::date then
    raise exception using
      errcode = 'PT422',
      message = 'Data de trancamento inválida.';
  end if;

  with receivables as (
    select
      c.*,
      c.data_pagamento is not null
        or c.status = 'PAGO'
        or coalesce(c.valor_pago, 0) > 0 as paid_or_partial,
      c.status in ('PENDENTE', 'VENCIDO', 'SUSPENSO')
        and c.data_pagamento is null
        and coalesce(c.valor_pago, 0) = 0 as open_unpaid,
      coalesce(
        c.gateway_provider = 'banese_card'
          and c.gateway_payment_method = 'BOLETO',
        false
      ) as banese_boleto,
      exists (
        select 1 from internal_proesc.obligation_links link
        where link.receivable_id = c.id
      ) as proesc_linked,
      internal_academic.trancamento_banese_is_canonical(c)
        as canonical_banese
    from public.contas_receber c
    where c.matricula_id = p_matricula_id
  ), counts as (
    select
      count(*) filter (where paid_or_partial)::integer as paid_preserved,
      count(*) filter (
        where open_unpaid and data_vencimento <= p_data_movimentacao
      )::integer as through_cutoff_preserved,
      count(*) filter (
        where open_unpaid and data_vencimento > p_data_movimentacao
          and banese_boleto is not true and proesc_linked is not true
      )::integer as future_local_suspended,
      count(*) filter (
        where open_unpaid and data_vencimento > p_data_movimentacao
          and proesc_linked is true
      )::integer as future_proesc_preserved,
      count(*) filter (
        where open_unpaid and data_vencimento > p_data_movimentacao
          and proesc_linked is not true
          and banese_boleto is true and canonical_banese is true
      )::integer as future_banese_to_cancel,
      count(*) filter (
        where open_unpaid and data_vencimento > p_data_movimentacao
          and proesc_linked is not true
          and banese_boleto is true and canonical_banese is not true
      )::integer as future_banese_review
    from receivables
  ), outbox as (
    select
      count(*) filter (where j.state in ('PENDING', 'RETRY'))::integer
        as pending,
      count(*) filter (where j.state = 'PROCESSING')::integer
        as processing,
      count(*) filter (where j.state = 'REVIEW_REQUIRED')::integer
        as review_required,
      count(*) filter (
        where j.state = 'DONE' and j.remote_status = 'CANCELED'
          and c.status = 'CANCELADO'
      )::integer as canceled
    from public.banese_cancellation_outbox j
    join public.contas_receber c on c.id = j.receivable_id
    where j.matricula_id = p_matricula_id
      and j.reason = 'TRANCAMENTO_FUTURO'
  )
  select jsonb_build_object(
    'policy', 'TRANCAMENTO_FUTURO_V1',
    'cutoffDate', p_data_movimentacao,
    'academicStatus', v_status,
    'paidPreserved', counts.paid_preserved,
    'throughCutoffPreserved', counts.through_cutoff_preserved,
    'futureLocalSuspended', counts.future_local_suspended,
    'futureProescPreserved', counts.future_proesc_preserved,
    'futureBaneseToCancel', counts.future_banese_to_cancel,
    'futureBaneseReview', counts.future_banese_review,
    'baneseCancellation', jsonb_build_object(
      'pending', outbox.pending,
      'processing', outbox.processing,
      'reviewRequired', outbox.review_required,
      'canceled', outbox.canceled
    ),
    'livePaymentsVerified', false,
    'canceledExcludedFromOpenTotals', true
  ) into v_result
  from counts cross join outbox;

  return v_result;
end;
$$;

revoke all on function public.preview_trancamento_financeiro(uuid, date)
  from public, anon;
grant execute on function public.preview_trancamento_financeiro(uuid, date)
  to authenticated, service_role;

comment on function public.preview_trancamento_financeiro(uuid, date) is
  'Prévia local: o worker ainda fará GET do título e pagamentos antes de qualquer PUT.';

commit;
