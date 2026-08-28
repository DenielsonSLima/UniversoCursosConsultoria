begin;

do $guard$
begin
  if to_regclass('public.banese_reconciliation_queue') is null
    or to_regprocedure('public.banese_reconciliation_queue_receivable()') is null
    or to_regprocedure(
      'public.banese_reconciliation_resolve_modality(uuid,uuid,uuid)'
    ) is null
  then
    raise exception 'Contrato da fila Banese ausente; trigger nao alterado.';
  end if;
end;
$guard$;

create or replace function public.banese_reconciliation_queue_receivable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_modality text;
  v_post_settlement_pending boolean;
  v_eligible boolean;
begin
  v_post_settlement_pending := upper(coalesce(new.status, '')) = 'PAGO'
    and left(coalesce(new.gateway_last_error, ''),
      char_length('BANESE_POST_SETTLEMENT_PENDING:')) =
      'BANESE_POST_SETTLEMENT_PENDING:';
  v_eligible := new.gateway_provider = 'banese_card'
    and new.gateway_payment_method = 'BOLETO'
    and new.gateway_environment in ('sandbox', 'production')
    and coalesce(new.gateway_boleto_nosso_numero, '') ~ '^[0-9]{9}$'
    and (
      v_post_settlement_pending
      or (
        new.status in ('PENDENTE', 'VENCIDO', 'AGUARDANDO_CONFIRMACAO')
        and coalesce(new.gateway_status, '') not in (
          'PAID', 'RECEIVED', 'CONFIRMED', 'CANCELED', 'CANCELED_BY_BANK',
          'EXPIRED', 'REFUNDED', 'REJECTED', 'REJECTED_TIMEOUT', 'PROTESTED'
        )
      )
    );

  if not v_eligible then
    update public.banese_reconciliation_queue
    set state = case
          when state = 'LEASED' and lease_until > now() then 'LEASED'
          else 'DONE'
        end,
        next_check_at = null,
        lease_run_id = case
          when state = 'LEASED' and lease_until > now() then lease_run_id
          else null
        end,
        lease_until = case
          when state = 'LEASED' and lease_until > now() then lease_until
          else null
        end,
        last_result = coalesce(new.status, new.gateway_status, 'TERMINAL'),
        updated_at = now()
    where receivable_id = new.id;
    return new;
  end if;

  v_modality := public.banese_reconciliation_resolve_modality(
    new.id, new.turma_id, new.matricula_id
  );
  insert into public.banese_reconciliation_queue (
    receivable_id, environment, modality, priority, state,
    next_check_at, issued_at
  ) values (
    new.id, new.gateway_environment, v_modality,
    case
      when v_modality = 'EAD' then 10
      when v_modality in ('LIVRE', 'ESPECIALIZACAO') then 20
      when new.status = 'VENCIDO' then 35
      else 50
    end,
    'READY', now(), coalesce(new.gateway_boleto_issued_at, new.created_at, now())
  )
  on conflict (receivable_id) do update
  set environment = excluded.environment,
      modality = excluded.modality,
      priority = excluded.priority,
      state = case
        when public.banese_reconciliation_queue.state = 'LEASED'
          and public.banese_reconciliation_queue.lease_until > now()
          then 'LEASED'
        else 'READY'
      end,
      next_check_at = case
        when public.banese_reconciliation_queue.state = 'LEASED'
          and public.banese_reconciliation_queue.lease_until > now()
          then public.banese_reconciliation_queue.next_check_at
        else least(
          coalesce(public.banese_reconciliation_queue.next_check_at, now()),
          now()
        )
      end,
      updated_at = now();
  return new;
end;
$function$;

revoke all on function public.banese_reconciliation_queue_receivable()
  from public, anon, authenticated;

drop trigger if exists trg_banese_reconciliation_queue_receivable
  on public.contas_receber;
create trigger trg_banese_reconciliation_queue_receivable
after insert or update of
  gateway_provider,
  gateway_payment_method,
  gateway_environment,
  gateway_boleto_nosso_numero,
  gateway_status,
  gateway_submission_status,
  gateway_last_error,
  status,
  turma_id,
  matricula_id
on public.contas_receber
for each row
execute function public.banese_reconciliation_queue_receivable();

commit;
