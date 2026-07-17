begin;

-- Mantem o fluxo de limpeza operacional, mas coloca uma barreira financeira
-- antes de qualquer remocao. Titulo pago, parcialmente pago, estornado ou com
-- comprovante permanece como evidencia financeira, mesmo antes da turma iniciar.
alter function public.excluir_turma_nao_iniciada(uuid)
  set schema internal_academic;
alter function internal_academic.excluir_turma_nao_iniciada(uuid)
  rename to operational_excluir_turma_nao_iniciada;

revoke all on function internal_academic.operational_excluir_turma_nao_iniciada(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.excluir_turma_nao_iniciada(p_turma_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turma public.turmas%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('technical_turma:' || p_turma_id::text, 0)
  );

  select t.*
    into v_turma
  from public.turmas t
  where t.id = p_turma_id
  for update;

  if not found then
    raise exception 'Turma não encontrada.';
  end if;

  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.can_write_turma(v_turma.id) then
    raise exception 'Você não tem permissão para excluir esta turma.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.contas_receber cr
    where (
      cr.turma_id = v_turma.id
      or cr.matricula_id in (
        select m.id
        from public.matriculas m
        where m.turma_id = v_turma.id
      )
    )
      and (
        coalesce(cr.valor_pago, 0) > 0
        or cr.data_pagamento is not null
        or cr.asaas_transaction_receipt_url is not null
        or cr.gateway_transaction_receipt_url is not null
        or upper(coalesce(cr.status, '')) in (
          'PAGO', 'PAGA', 'RECEBIDO', 'RECEBIDA', 'CONFIRMADO', 'CONFIRMADA',
          'LIQUIDADO', 'LIQUIDADA', 'PARCIALMENTE_PAGO', 'PAGO_PARCIAL'
        )
        or upper(coalesce(cr.asaas_status, '')) in (
          'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'REFUNDED',
          'REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'PARTIALLY_REFUNDED',
          'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE',
          'AWAITING_CHARGEBACK_REVERSAL', 'DUNNING_REQUESTED', 'DUNNING_RECEIVED'
        )
        or upper(coalesce(cr.gateway_status, '')) in (
          'PAID', 'RECEIVED', 'CONFIRMED', 'SETTLED', 'PARTIALLY_PAID',
          'RECEIVED_IN_CASH', 'REFUNDED', 'PARTIALLY_REFUNDED',
          'REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'CHARGEBACK',
          'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE'
        )
      )
  ) then
    raise exception 'A turma possui cobrança com pagamento, liquidação, estorno ou comprovante e não pode ser excluída. Preserve o histórico financeiro.';
  end if;

  return internal_academic.operational_excluir_turma_nao_iniciada(v_turma.id);
end;
$$;

revoke execute on function public.excluir_turma_nao_iniciada(uuid)
  from public, anon;
grant execute on function public.excluir_turma_nao_iniciada(uuid)
  to authenticated, service_role;

comment on function public.excluir_turma_nao_iniciada(uuid) is
  'Exclui turma futura sem histórico e remove apenas vínculos financeiros sem evidência de pagamento ou liquidação.';

commit;
