begin;

create function internal_contas.ead_expiration_eligible(p_receivable_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select internal_contas.ead_checkout_can_expire(p_receivable_id) or exists(
    select 1 from public.ead_checkout_attempts a
    join public.contas_receber c on c.id=a.receivable_id
    join public.inscricoes_online i on i.id=a.inscription_id
    join public.payment_gateway_transactions t on t.id=a.transaction_id
    where c.id=p_receivable_id and a.state='PAYMENT_RECOVERY_FENCED'
      and a.nature='COMPRA_OPCIONAL' and c.ead_checkout_attempt_id=a.id
      and c.status in ('PENDENTE','VENCIDO','AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO')
      and c.data_pagamento is null and coalesce(c.valor_pago,0)=0 and c.manual_settlement_id is null
      and i.status='AGUARDANDO_PAGAMENTO' and i.pago_em is null and i.confirmado_em is null
      and upper(coalesce(t.remote_status,'')) in ('PENDING','REGISTERED','EXPIRED')
      and exists(select 1 from public.ead_checkout_attempts paid
        join public.contas_receber received on received.id=paid.receivable_id
        where paid.matricula_id=a.matricula_id and paid.curso_id=a.curso_id and paid.id<>a.id
          and paid.state in ('PAID','PAID_REVIEW') and received.status='PAGO'
          and received.gateway_status='PAID' and received.origem_pagamento='BANESE'
          and received.gateway_settlement_source='API' and received.valor_pago>0
          and received.data_pagamento is not null));
$$;
revoke all on function internal_contas.ead_expiration_eligible(uuid) from public,anon,authenticated,service_role;

-- The durable nature of a validated attempt survives academic activation.
do $$
declare v_definition text;v_anchor text;
begin
  v_definition:=pg_get_functiondef('internal_contas.ead_checkout_is_optional(uuid)'::regprocedure);
  v_anchor:='FUNCTION internal_contas.ead_checkout_is_optional(';
  if position(v_anchor in v_definition)=0 then raise exception 'Financial helper definition drift.'; end if;
  execute replace(v_definition,v_anchor,'FUNCTION internal_contas.ead_checkout_is_optional_legacy_20261004(');
  v_definition:=pg_get_functiondef('internal_contas.ead_checkout_paid_after_cutoff(uuid,date)'::regprocedure);
  v_anchor:='FUNCTION internal_contas.ead_checkout_paid_after_cutoff(';
  if position(v_anchor in v_definition)=0 then raise exception 'Historical helper definition drift.'; end if;
  execute replace(v_definition,v_anchor,'FUNCTION internal_contas.ead_checkout_paid_after_cutoff_legacy_20261004(');
end; $$;
revoke all on function internal_contas.ead_checkout_is_optional_legacy_20261004(uuid),
  internal_contas.ead_checkout_paid_after_cutoff_legacy_20261004(uuid,date) from public,anon,authenticated,service_role;
create or replace function internal_contas.ead_checkout_is_optional(p_receivable_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.ead_checkout_attempts a
    join public.contas_receber c on c.id=a.receivable_id
    where c.id=p_receivable_id and c.ead_checkout_attempt_id=a.id
      and a.nature='COMPRA_OPCIONAL' and c.status<>'PAGO')
    or internal_contas.ead_checkout_is_optional_legacy_20261004(p_receivable_id);
$$;
revoke all on function internal_contas.ead_checkout_is_optional(uuid) from public,anon,authenticated,service_role;
create or replace function internal_contas.ead_checkout_paid_after_cutoff(p_receivable_id uuid,p_payment_cutoff_exclusive date)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.ead_checkout_attempts a
    join public.contas_receber c on c.id=a.receivable_id
    where c.id=p_receivable_id and c.ead_checkout_attempt_id=a.id and a.nature='COMPRA_OPCIONAL'
      and c.status='PAGO' and c.valor_pago>0 and c.data_pagamento>=p_payment_cutoff_exclusive)
    or internal_contas.ead_checkout_paid_after_cutoff_legacy_20261004(p_receivable_id,p_payment_cutoff_exclusive);
$$;
revoke all on function internal_contas.ead_checkout_paid_after_cutoff(uuid,date) from public,anon,authenticated,service_role;

-- Legacy projection is unchanged. Managed purchases select their own receipt;
-- closing an attempt never closes the student's shared academic enrollment.
alter function public.ead_activate_matricula_on_paid_inscricao() rename to ead_activate_matricula_on_paid_inscricao_legacy_20261004;
create function public.ead_activate_matricula_on_paid_inscricao()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_a public.ead_checkout_attempts%rowtype;v_c public.contas_receber%rowtype;
begin
  if new.ead_checkout_attempt_id is null then
    -- A trigger function cannot call another trigger function directly. The
    -- legacy trigger below handles only rows without the managed attempt ID.
    return new;
  end if;
  select * into strict v_a from public.ead_checkout_attempts where id=new.ead_checkout_attempt_id for update;
  if new.status<>'PAGO' then return new; end if;
  select * into strict v_c from public.contas_receber where id=v_a.receivable_id;
  if v_c.status<>'PAGO' or v_c.data_pagamento is null or coalesce(v_c.valor_pago,0)<=0
    or v_c.gateway_status<>'PAID' or v_c.origem_pagamento<>'BANESE' then
    raise exception 'Inscrição EAD exige seu próprio pagamento canônico.' using errcode='PT409';
  end if;
  update public.ead_checkout_attempts set state=case when state='PAID_REVIEW' then state else 'PAID' end,
    paid_at=coalesce(paid_at,new.pago_em,now()),updated_at=now() where id=v_a.id;
  if v_a.state<>'PAID_REVIEW' and not exists(select 1 from public.ead_checkout_attempts other
    where other.matricula_id=v_a.matricula_id and other.id<>v_a.id and other.state in ('PAID','PAID_REVIEW')) then
    update public.matriculas set status='ATIVO' where id=v_a.matricula_id
      and status in ('PENDENTE','AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO','VENCIDO');
  end if;
  return new;
end; $$;
-- Replace references to the old trigger while retaining its original WHEN
-- predicate for historical rows. Trigger metadata is checked before mutation.
do $$
declare v_trigger record;v_definition text;
begin
  for v_trigger in select t.oid,t.tgname from pg_trigger t
    where t.tgrelid='public.inscricoes_online'::regclass and not t.tgisinternal
      and t.tgfoid='public.ead_activate_matricula_on_paid_inscricao_legacy_20261004()'::regprocedure loop
    v_definition:=pg_get_triggerdef(v_trigger.oid);
    execute format('drop trigger %I on public.inscricoes_online',v_trigger.tgname);
    -- Existing trigger has no WHEN clause in the published contract.
    if position(' WHEN ' in v_definition)>0 then raise exception 'EAD projection trigger predicate drift.'; end if;
    v_definition:=replace(v_definition,' EXECUTE FUNCTION ',
      ' WHEN (new.ead_checkout_attempt_id IS NULL) EXECUTE FUNCTION ');
    execute v_definition;
  end loop;
end; $$;
create trigger ead_managed_attempt_paid_projection after insert or update of status on public.inscricoes_online
  for each row when(new.ead_checkout_attempt_id is not null)
  execute function public.ead_activate_matricula_on_paid_inscricao();
revoke all on function public.ead_activate_matricula_on_paid_inscricao() from public,anon,authenticated,service_role;

create function public.ead_validate_checkout_attempt_for_issuance(
  p_attempt_id uuid,p_receivable_id uuid,p_creation_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_a public.ead_checkout_attempts%rowtype;v_c public.contas_receber%rowtype;
begin
  perform internal_contas.ead_assert_service_role();
  select * into strict v_a from public.ead_checkout_attempts where id=p_attempt_id;
  perform 1 from public.matriculas where id=v_a.matricula_id for update;
  select * into strict v_a from public.ead_checkout_attempts where id=p_attempt_id for update;
  select * into strict v_c from public.contas_receber where id=p_receivable_id for update;
  if v_a.receivable_id is distinct from p_receivable_id or not v_a.is_current or v_a.state not in ('RESERVED','OPEN')
    or v_c.status is distinct from 'PENDENTE' or v_c.gateway_status is distinct from 'CREATING'
    or v_c.gateway_creation_token is distinct from p_creation_token or p_creation_token is null
    or v_c.data_pagamento is not null or coalesce(v_c.valor_pago,0)>0
    or exists(select 1 from public.payment_gateway_transactions tx where tx.receivable_id=v_c.id
      and upper(coalesce(tx.remote_status,'')) in ('PAID','RECEIVED','CONFIRMED','APPROVED'))
    or exists(select 1 from public.contas_receber other where other.matricula_id=v_a.matricula_id
      and other.id<>v_c.id and other.status='PAGO') then
    raise exception 'Emissão da tentativa EAD foi reservada para recuperação.' using errcode='PT409';
  end if;
  return jsonb_build_object('allowed',true);
end; $$;
revoke all on function public.ead_validate_checkout_attempt_for_issuance(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ead_validate_checkout_attempt_for_issuance(uuid,uuid,uuid) to service_role;

commit;
