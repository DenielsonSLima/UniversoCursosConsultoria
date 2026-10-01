-- Só o local suspende; Banese fica aberto até baixa confirmada. Sem backfill/rede.
begin;
do $guard$
declare
  v_reason text;
  v_definition text;
begin
  select pg_get_constraintdef(oid) into v_reason
  from pg_constraint
  where conrelid = 'public.banese_cancellation_outbox'::regclass
    and conname = 'banese_cancellation_outbox_reason_check';
  if v_reason is distinct from
     'CHECK ((reason = ANY (ARRAY[''DESISTENCIA''::text, ''CANCELAMENTO''::text, ''TRANSFERENCIA_EXTERNA_ENVIADA''::text])))' then
    raise exception 'Drift no contrato de reason da outbox Banese.';
  end if;
  select pg_get_functiondef('public.enqueue_banese_cancellation(uuid,uuid,date,text)'::regprocedure)
    into v_definition;
  if md5(v_definition) <> '13a5f7c8009aad93e11fb232c3957b14'
     or v_definition not like '%SECURITY DEFINER%'
     or v_definition not like '%SET search_path TO ''''%' then
    raise exception 'Drift em enqueue_banese_cancellation.';
  end if;
  select pg_get_functiondef('public.enqueue_banese_cancellation_from_movement()'::regprocedure)
    into v_definition;
  if md5(v_definition) <> 'd7932a35d286500a4e0928928aa0741e'
     or v_definition not like '%SKIPPED_REACTIVATED%' then
    raise exception 'Drift em enqueue_banese_cancellation_from_movement.';
  end if;

  select pg_get_functiondef('public.enqueue_late_banese_cancellation()'::regprocedure)
    into v_definition;
  if md5(v_definition) <> 'cff541fbe9abaa8cf2b4fb6c5abf4f9b' then
    raise exception 'Drift em enqueue_late_banese_cancellation.';
  end if;
  select pg_get_functiondef(
    'public.cancel_late_terminal_local_receivable()'::regprocedure
  ) into v_definition;
  if md5(v_definition) <> '965aa272c7822c2dbddd8fb09686a631'
     or v_definition not like '%SECURITY DEFINER%'
     or v_definition not like '%SET search_path TO ''''%'
     or has_function_privilege(
       'anon', 'public.cancel_late_terminal_local_receivable()', 'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.cancel_late_terminal_local_receivable()', 'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.cancel_late_terminal_local_receivable()', 'EXECUTE'
     ) then
    raise exception 'Drift em cancel_late_terminal_local_receivable.';
  end if;
  select pg_get_functiondef('public.ajustar_financeiro_movimentacao_matricula()'::regprocedure)
    into v_definition;
  if md5(v_definition) <> 'ed3a1e1aab7205d796fdc6eff3183728'
     or v_definition not like '%internal_academic.apply_external_transfer_finance(new.id)%' then
    raise exception 'Drift em ajustar_financeiro_movimentacao_matricula.';
  end if;
end;
$guard$;
alter table public.banese_cancellation_outbox
  drop constraint banese_cancellation_outbox_reason_check;
alter table public.banese_cancellation_outbox
  add constraint banese_cancellation_outbox_reason_check check (reason in (
    'DESISTENCIA', 'CANCELAMENTO', 'TRANSFERENCIA_EXTERNA_ENVIADA',
    'TRANCAMENTO_FUTURO'
  ));
create or replace function internal_academic.current_trancamento_movement(
  p_matricula_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select mm.id
  from public.matricula_movimentacoes mm
  join public.matriculas m on m.id = mm.matricula_id
  where mm.matricula_id = p_matricula_id
    and m.status = 'TRANCADO'
    and mm.tipo = 'TRANCAMENTO'
    and mm.status_novo = 'TRANCADO'
    and mm.id = (
      select latest.id
      from public.matricula_movimentacoes latest
      where latest.matricula_id = p_matricula_id
      order by latest.created_at desc, latest.id desc
      limit 1
    )
  limit 1;
$$;
create or replace function internal_academic.current_terminal_cancellation_movement(
  p_matricula_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select mm.id
  from public.matricula_movimentacoes mm
  join public.matriculas m on m.id = mm.matricula_id
  where mm.matricula_id = p_matricula_id
    and (
      (mm.tipo = 'DESISTENCIA' and m.status = 'DESISTENTE')
      or (mm.tipo = 'CANCELAMENTO' and m.status = 'CANCELADO')
      or (mm.tipo = 'TRANSFERENCIA_EXTERNA_ENVIADA'
        and m.status = 'TRANSFERIDO')
    )
    and mm.status_novo = m.status
    and mm.id = (
      select latest.id
      from public.matricula_movimentacoes latest
      where latest.matricula_id = p_matricula_id
      order by latest.created_at desc, latest.id desc
      limit 1
    )
  limit 1;
$$;
create or replace function internal_academic.trancamento_receivable_scope_matches(
  p_receivable public.contas_receber,
  p_movement_id uuid,
  p_effective_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_receivable.matricula_id is not null
    and p_receivable.status in ('PENDENTE', 'VENCIDO', 'SUSPENSO')
    and p_receivable.data_pagamento is null
    and coalesce(p_receivable.valor_pago, 0) = 0
    and p_receivable.data_vencimento > p_effective_date
    and not exists (select 1 from internal_proesc.obligation_links link
      where link.receivable_id = p_receivable.id)
    and not exists (
      select 1
      from public.receivable_manual_settlements settlement
      where settlement.receivable_id = p_receivable.id
        and settlement.state in (
          'STARTED', 'REMOTE_CANCELED_LOCAL_PENDING', 'REVIEW_REQUIRED'
        )
    )
    and (
      p_movement_id = internal_academic.current_trancamento_movement(
        p_receivable.matricula_id
      )
      or internal_academic.current_terminal_cancellation_movement(
        p_receivable.matricula_id
      ) is not null
    )
    and exists (
      select 1
      from public.matricula_movimentacoes mm
      where mm.id = p_movement_id
        and mm.matricula_id = p_receivable.matricula_id
        and mm.tipo = 'TRANCAMENTO'
        and mm.status_novo = 'TRANCADO'
        and mm.data_movimentacao = p_effective_date
    ),
    false
  );
$$;
create or replace function internal_academic.banese_trancamento_job_matches(
  p_receivable public.contas_receber,
  p_job public.banese_cancellation_outbox
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_job.reason = 'TRANCAMENTO_FUTURO'
    and p_job.receivable_id = p_receivable.id
    and p_job.matricula_id = p_receivable.matricula_id
    and internal_academic.trancamento_receivable_scope_matches(
      p_receivable,
      p_job.movement_id,
      p_job.effective_date
    ),
    false
  );
$$;
revoke all on function internal_academic.current_trancamento_movement(uuid)
  from public, anon, authenticated;
revoke all on function internal_academic.current_terminal_cancellation_movement(uuid)
  from public, anon, authenticated;
revoke all on function internal_academic.trancamento_receivable_scope_matches(
  public.contas_receber, uuid, date
) from public, anon, authenticated;
revoke all on function internal_academic.banese_trancamento_job_matches(
  public.contas_receber, public.banese_cancellation_outbox
) from public, anon, authenticated;
create or replace function internal_academic.guard_trancamento_cancellation_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.reason = 'TRANCAMENTO_FUTURO' or new.reason = 'TRANCAMENTO_FUTURO')
     and (
       old.receivable_id is distinct from new.receivable_id
       or old.matricula_id is distinct from new.matricula_id
       or old.movement_id is distinct from new.movement_id
       or old.environment is distinct from new.environment
       or old.effective_date is distinct from new.effective_date
       or old.reason is distinct from new.reason
     )
     and not (
       old.state = 'DONE'
       and old.remote_status = 'SKIPPED_REACTIVATED'
       and new.state = 'PENDING'
     ) then
    raise exception using
      errcode = 'PT409',
      message = 'A identidade do cancelamento por trancamento é imutável.';
  end if;
  return new;
end;
$$;
revoke all on function internal_academic.guard_trancamento_cancellation_identity()
  from public, anon, authenticated;
drop trigger if exists guard_trancamento_cancellation_identity
  on public.banese_cancellation_outbox;
create trigger guard_trancamento_cancellation_identity
before update of
  receivable_id, matricula_id, movement_id, environment, effective_date, reason
on public.banese_cancellation_outbox
for each row execute function
  internal_academic.guard_trancamento_cancellation_identity();
do $patch$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  v_definition := pg_get_functiondef(
    'public.enqueue_banese_cancellation(uuid,uuid,date,text)'::regprocedure
  );
  v_old := $old$begin
  if p_reason not in ($old$;
  v_new := $new$begin
  if p_reason = 'TRANCAMENTO_FUTURO' then
    perform 1
    from public.contas_receber
    where id = p_receivable_id
    for update;
  end if;
  if p_reason not in ($new$;
  if length(v_definition) - length(replace(v_definition, v_old, ''))
       <> length(v_old) then
    raise exception 'Âncora do lock por recebível mudou.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  v_old := $old$    'DESISTENCIA', 'CANCELAMENTO', 'TRANSFERENCIA_EXTERNA_ENVIADA'
  ) then$old$;
  v_new := $new$    'DESISTENCIA', 'CANCELAMENTO', 'TRANSFERENCIA_EXTERNA_ENVIADA',
    'TRANCAMENTO_FUTURO'
  ) then$new$;
  if length(v_definition) - length(replace(v_definition, v_old, ''))
       <> length(v_old) then
    raise exception 'Âncora de razões da outbox mudou.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  v_old := $old$  where c.id = p_receivable_id
    and (p_reason<>'TRANSFERENCIA_EXTERNA_ENVIADA' or ($old$;
  v_new := $new$  where c.id = p_receivable_id
    and not exists (select 1 from internal_proesc.obligation_links link
      where link.receivable_id = c.id)
    and (
      p_reason <> 'TRANCAMENTO_FUTURO'
      or internal_academic.trancamento_receivable_scope_matches(
        c, p_movement_id, p_effective_date
      )
    )
    and (p_reason<>'TRANSFERENCIA_EXTERNA_ENVIADA' or ($new$;
  if length(v_definition) - length(replace(v_definition, v_old, ''))
       <> length(v_old) then
    raise exception 'Âncora de escopo do enqueue mudou.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  v_old := $old$  set movement_id = excluded.movement_id,
      effective_date = excluded.effective_date,
      reason = excluded.reason,
      environment = excluded.environment,$old$;
  v_new := $new$  set movement_id = case
        when public.banese_cancellation_outbox.reason = 'TRANCAMENTO_FUTURO'
          and public.banese_cancellation_outbox.state in ('PENDING', 'RETRY')
          and public.banese_cancellation_outbox.remote_attempt_started_at is null
          and excluded.reason in (
            'DESISTENCIA', 'CANCELAMENTO', 'TRANSFERENCIA_EXTERNA_ENVIADA'
          )
        then public.banese_cancellation_outbox.movement_id
        else excluded.movement_id
      end,
      effective_date = case
        when public.banese_cancellation_outbox.reason = 'TRANCAMENTO_FUTURO'
          and public.banese_cancellation_outbox.state in ('PENDING', 'RETRY')
          and public.banese_cancellation_outbox.remote_attempt_started_at is null
          and excluded.reason in (
            'DESISTENCIA', 'CANCELAMENTO', 'TRANSFERENCIA_EXTERNA_ENVIADA'
          )
        then public.banese_cancellation_outbox.effective_date
        else excluded.effective_date
      end,
      reason = case
        when public.banese_cancellation_outbox.reason = 'TRANCAMENTO_FUTURO'
          and public.banese_cancellation_outbox.state in ('PENDING', 'RETRY')
          and public.banese_cancellation_outbox.remote_attempt_started_at is null
          and excluded.reason in (
            'DESISTENCIA', 'CANCELAMENTO', 'TRANSFERENCIA_EXTERNA_ENVIADA'
          )
        then public.banese_cancellation_outbox.reason
        else excluded.reason
      end,
      environment = case
        when public.banese_cancellation_outbox.reason = 'TRANCAMENTO_FUTURO'
          and public.banese_cancellation_outbox.state in ('PENDING', 'RETRY')
          and public.banese_cancellation_outbox.remote_attempt_started_at is null
          and excluded.reason in (
            'DESISTENCIA', 'CANCELAMENTO', 'TRANSFERENCIA_EXTERNA_ENVIADA'
          )
        then public.banese_cancellation_outbox.environment
        else excluded.environment
      end,$new$;
  if length(v_definition) - length(replace(v_definition, v_old, ''))
       <> length(v_old) then
    raise exception 'Âncora de identidade imutável do enqueue mudou.';
  end if;
  execute replace(v_definition, v_old, v_new);
  v_definition := pg_get_functiondef(
    'public.ajustar_financeiro_movimentacao_matricula()'::regprocedure
  );
  v_old := $old$      and data_pagamento is null
      and data_vencimento > new.data_movimentacao;$old$;
  v_new := $new$      and data_pagamento is null
      and coalesce(valor_pago, 0) = 0
      and data_vencimento > new.data_movimentacao
      and not exists (select 1 from internal_proesc.obligation_links link
        where link.receivable_id = contas_receber.id)
      and (
        gateway_provider is distinct from 'banese_card'
        or gateway_payment_method is distinct from 'BOLETO'
      );$new$;
  if length(v_definition) - length(replace(v_definition, v_old, ''))
       <> length(v_old) then
    raise exception 'Âncora de preservação de pagos no trancamento mudou.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  v_old := $old$      and status in ('PENDENTE', 'VENCIDO', 'SUSPENSO')
      and data_pagamento is null
      and ($old$;
  v_new := $new$      and status in ('PENDENTE', 'VENCIDO', 'SUSPENSO')
      and data_pagamento is null
      and coalesce(valor_pago, 0) = 0
      and ($new$;
  if length(v_definition) - length(replace(v_definition, v_old, ''))
       <> length(v_old) then
    raise exception 'Âncora de preservação parcial no encerramento mudou.';
  end if;
  execute replace(v_definition, v_old, v_new);

  v_definition := pg_get_functiondef(
    'public.cancel_late_terminal_local_receivable()'::regprocedure
  );
  v_old := $old$     or new.data_pagamento is not null then$old$;
  v_new := $new$     or new.data_pagamento is not null
     or coalesce(new.valor_pago, 0) <> 0 then$new$;
  if length(v_definition) - length(replace(v_definition, v_old, ''))
       <> length(v_old) then
    raise exception 'Âncora de preservação parcial tardia mudou.';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$patch$;
create or replace function public.enqueue_banese_cancellation_from_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tipo = 'REATIVACAO' then
    if exists (
      select 1 from public.banese_cancellation_outbox j
      where j.matricula_id = new.matricula_id
        and j.state in ('PROCESSING', 'REVIEW_REQUIRED')
    ) then
      raise exception
        'Cancelamento bancário em andamento ou em revisão; regularize antes de reativar.';
    end if;

    update public.banese_cancellation_outbox
    set state = 'DONE', remote_status = 'SKIPPED_REACTIVATED',
        error_class = null, error_message = null,
        lease_token = null, lease_until = null,
        remote_attempt_started_at = null, completed_at = now(), updated_at = now()
    where matricula_id = new.matricula_id
      and state in ('PENDING', 'RETRY');
  elsif new.tipo = 'TRANCAMENTO' then
    perform public.enqueue_banese_cancellation(
      c.id, new.id, new.data_movimentacao, 'TRANCAMENTO_FUTURO'
    )
    from public.contas_receber c
    where c.matricula_id = new.matricula_id;
  elsif new.tipo in (
    'DESISTENCIA', 'CANCELAMENTO', 'TRANSFERENCIA_EXTERNA_ENVIADA'
  ) then
    perform public.enqueue_banese_cancellation(
      c.id, new.id, new.data_movimentacao, new.tipo
    )
    from public.contas_receber c
    where c.matricula_id = new.matricula_id
      and coalesce(c.valor_pago, 0) = 0;
  end if;
  return new;
end;
$$;
create or replace function public.enqueue_late_banese_cancellation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movement public.matricula_movimentacoes%rowtype;
  v_reason text;
begin
  if new.matricula_id is null
     or new.status not in ('PENDENTE', 'VENCIDO', 'SUSPENSO')
     or new.data_pagamento is not null
     or coalesce(new.valor_pago, 0) <> 0
     or new.gateway_provider is distinct from 'banese_card'
     or new.gateway_payment_method is distinct from 'BOLETO' then
    return new;
  end if;
  select latest.* into v_movement
  from public.matriculas m
  cross join lateral (
    select mm.*
    from public.matricula_movimentacoes mm
    where mm.matricula_id = m.id
      and (
        (m.status in ('DESISTENTE', 'CANCELADO', 'TRANSFERIDO')
          and mm.tipo in (
            'DESISTENCIA', 'CANCELAMENTO', 'TRANSFERENCIA_EXTERNA_ENVIADA'
          )
          and mm.status_novo = m.status)
        or (m.status = 'TRANCADO'
          and mm.tipo = 'TRANCAMENTO'
          and mm.status_novo = 'TRANCADO')
      )
    order by mm.created_at desc, mm.id desc
    limit 1
  ) latest
  where m.id = new.matricula_id;

  if not found then return new; end if;
  v_reason := case when v_movement.tipo = 'TRANCAMENTO'
    then 'TRANCAMENTO_FUTURO' else v_movement.tipo end;

  perform public.enqueue_banese_cancellation(
    new.id, v_movement.id, v_movement.data_movimentacao, v_reason
  );
  return new;
end;
$$;

drop trigger if exists enqueue_late_banese_cancellation_trigger
  on public.contas_receber;
create trigger enqueue_late_banese_cancellation_trigger
after insert or update of
  matricula_id, status, data_vencimento, data_pagamento, valor_pago,
  gateway_provider, gateway_environment, gateway_payment_method,
  gateway_payment_id, gateway_boleto_nosso_numero,
  gateway_boleto_convenio, gateway_status, gateway_submission_channel,
  gateway_submission_status, gateway_cnab_file_id, manual_settlement_id
on public.contas_receber
for each row execute function public.enqueue_late_banese_cancellation();

revoke all on function public.enqueue_banese_cancellation_from_movement()
  from public, anon, authenticated;
revoke all on function public.enqueue_late_banese_cancellation()
  from public, anon, authenticated;
grant execute on function public.enqueue_banese_cancellation_from_movement()
  to service_role;
grant execute on function public.enqueue_late_banese_cancellation()
  to service_role;

commit;
