-- Canonical local-fee proof and fences are independent of payment completion.
begin;

create function internal_academic.manual_cycle_has_local_intent(p_receivable public.contas_receber)
returns boolean language sql stable security definer set search_path='' as $function$
  select exists(select 1 from internal_academic.technical_manual_cycle_runs run
    join public.matriculas m on m.id=run.matricula_id
    join public.turmas t on t.id=m.turma_id
    cross join lateral jsonb_array_elements(run.reviewed_items) item
    where run.matricula_id=p_receivable.matricula_id and run.turma_id=p_receivable.turma_id
      and m.aluno_id=p_receivable.cliente_id and t.polo_id=p_receivable.polo_id
      and run.cycle_number=1 and p_receivable.tipo_lancamento='MATRICULA'
      and p_receivable.parcela_numero=0 and p_receivable.origem_cronograma_id='matricula'
      and item->>'chave'='matricula' and item->>'tipo'='MATRICULA'
      and item->>'destinoCobranca'='LOCAL'
      and p_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL'
      and p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}'=run.request_id::text
      and (p_receivable.id=any(run.receivable_ids) and run.state='LOCAL_CREATED'
        or run.state='GENERATING' and run.request_id::text=current_setting('app.technical_manual_cycle_request_id',true)));
$function$;

create function internal_academic.manual_cycle_has_bank_fields(p_receivable public.contas_receber)
returns boolean language sql immutable set search_path='' as $function$
  select exists(select 1 from jsonb_each(to_jsonb(p_receivable)) f(key,value)
    where (left(key,8)='gateway_' or left(key,6)='asaas_' or key='nosso_numero_asaas')
      and value<>'null'::jsonb);
$function$;

create function internal_academic.manual_cycle_local_receivable_complete(p_receivable public.contas_receber)
returns boolean language plpgsql stable security definer set search_path='' as $function$
begin
  if not internal_academic.manual_cycle_has_local_intent(p_receivable)
    or internal_academic.manual_cycle_has_bank_fields(p_receivable)
    or exists(select 1 from public.payment_gateway_transactions t where t.receivable_id=p_receivable.id)
  then return false; end if;
  perform internal_academic.assert_manual_cycle_reviewed_receivable(p_receivable);
  if p_receivable.status in ('PENDENTE','VENCIDO') then
    return p_receivable.data_pagamento is null and p_receivable.valor_pago is null
      and p_receivable.manual_settlement_id is null;
  end if;
  if p_receivable.status<>'PAGO' or p_receivable.origem_pagamento is distinct from 'PRESENCIAL'
    or p_receivable.manual_settlement_reversed_at is not null then return false; end if;
  return exists(select 1 from public.receivable_manual_settlements s
    where s.id=p_receivable.manual_settlement_id and s.receivable_id=p_receivable.id
      and s.state='COMPLETED' and not s.requires_remote_cancellation
      and s.provider_code is null and s.remote_payment_id is null and s.remote_payment_link_id is null
      and s.polo_id is not distinct from p_receivable.polo_id
      and s.account_id is not distinct from p_receivable.conta_bancaria_id
      and s.payment_method is not distinct from p_receivable.forma_pagamento
      and s.payment_date=p_receivable.data_pagamento
      and s.principal_cents=round(p_receivable.valor*100)::bigint
      and s.received_cents=round(p_receivable.valor_pago*100)::bigint
      and s.principal_cents=p_receivable.manual_settlement_principal_cents
      and s.interest_cents=p_receivable.manual_settlement_interest_cents
      and s.penalty_cents=p_receivable.manual_settlement_penalty_cents
      and s.addition_cents=p_receivable.manual_settlement_addition_cents
      and s.discount_cents=p_receivable.manual_settlement_discount_cents
      and s.received_cents=p_receivable.manual_settlement_received_cents);
exception when others then return false;
end;
$function$;

create function internal_academic.guard_local_manual_cycle_bank_fields()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if (new.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL'
      or internal_academic.manual_cycle_has_local_intent(new))
    and internal_academic.manual_cycle_has_bank_fields(new) then
    raise exception 'Matrícula registrada sem boleto não permite emissão ou vínculo bancário.' using errcode='23514';
  end if;
  return new;
end;
$function$;
create trigger guard_local_manual_cycle_bank_fields
  before insert or update on public.contas_receber
  for each row execute function internal_academic.guard_local_manual_cycle_bank_fields();

create function internal_academic.guard_local_manual_cycle_gateway_transaction()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if exists(select 1 from public.contas_receber r where r.id=new.receivable_id
    and (r.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL'
      or internal_academic.manual_cycle_has_local_intent(r))) then
    raise exception 'Matrícula registrada sem boleto não permite transação bancária.' using errcode='23514';
  end if;
  return new;
end;
$function$;
create trigger guard_local_manual_cycle_gateway_transaction
  before insert or update on public.payment_gateway_transactions
  for each row execute function internal_academic.guard_local_manual_cycle_gateway_transaction();

create function internal_academic.guard_manual_cycle_reviewed_items()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if old.state='LOCAL_CREATED' and old.reviewed_items is not null
    and new.reviewed_items is distinct from old.reviewed_items then
    raise exception 'A revisão de um ciclo criado é imutável.' using errcode='23514';
  end if;
  return new;
end;
$function$;
create trigger guard_manual_cycle_reviewed_items before update of reviewed_items
  on internal_academic.technical_manual_cycle_runs
  for each row execute function internal_academic.guard_manual_cycle_reviewed_items();

revoke all on function
  internal_academic.manual_cycle_has_local_intent(public.contas_receber),
  internal_academic.manual_cycle_has_bank_fields(public.contas_receber),
  internal_academic.manual_cycle_local_receivable_complete(public.contas_receber),
  internal_academic.guard_local_manual_cycle_bank_fields(),
  internal_academic.guard_local_manual_cycle_gateway_transaction(),
  internal_academic.guard_manual_cycle_reviewed_items()
  from public,anon,authenticated,service_role;

commit;
