-- Transfer intent and financial review are durable; external obligations stay intact.
begin;

create table internal_academic.transfer_financial_operations (
  request_id uuid primary key,
  actor_id uuid not null references auth.users(id),
  source_enrollment_id uuid not null references public.matriculas(id),
  transfer_id uuid unique references public.transferencias_academicas(id),
  payload jsonb not null,
  preview jsonb not null,
  result jsonb,
  database_txid bigint not null default txid_current(),
  created_at timestamptz not null default now()
);
create index transfer_financial_operations_source_idx
  on internal_academic.transfer_financial_operations(source_enrollment_id,created_at desc);
create table internal_academic.transfer_financial_reviews (
  movement_id uuid not null references public.matricula_movimentacoes(id),
  receivable_id uuid not null references public.contas_receber(id),
  origin text not null,
  reason text not null,
  effective_date date not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  primary key(movement_id,receivable_id)
);
create table internal_academic.transfer_financial_continuity (
  transferencia_id uuid primary key references public.transferencias_academicas(id),
  source_enrollment_id uuid not null references public.matriculas(id),
  target_enrollment_id uuid not null unique references public.matriculas(id),
  effective_date date not null,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check(source_enrollment_id<>target_enrollment_id)
);
alter table internal_academic.transfer_financial_operations enable row level security;
alter table internal_academic.transfer_financial_reviews enable row level security;
alter table internal_academic.transfer_financial_continuity enable row level security;
revoke all on internal_academic.transfer_financial_operations,
  internal_academic.transfer_financial_reviews,internal_academic.transfer_financial_continuity
  from public,anon,authenticated,service_role;

create function internal_academic.assert_transfer_financial_access(p_matricula_id uuid,p_destino uuid)
returns void language plpgsql stable security definer set search_path='' as $function$
begin
  if auth.uid() is null
    or not coalesce(public.gestor_has_tab('gestao','financeiro'),false)
    or not coalesce(public.gestor_has_financeiro_tab('receber'),false)
    or not exists(select 1 from public.matriculas m join public.turmas t on t.id=m.turma_id
      where m.id=p_matricula_id and public.can_operate_turma_academics(t.id)
        and public.is_gestor_for_polo(t.polo_id))
    or (p_destino is not null and not exists(select 1 from public.turmas t
      where t.id=p_destino and public.can_operate_turma_academics(t.id)
        and public.is_gestor_for_polo(t.polo_id)))
    or exists(select 1 from public.matriculas m join public.turmas t on t.id=m.turma_id
      where m.id=any(internal_academic.transfer_financial_origin_chain(p_matricula_id))
        and not coalesce(public.is_gestor_for_polo(t.polo_id),false)) then
    raise exception 'Sem permissão acadêmica e financeira nos polos da transferência.' using errcode='42501';
  end if;
end;
$function$;

create function internal_academic.current_external_transfer_movement(p_matricula_id uuid)
returns uuid language sql stable security definer set search_path='' as $function$
  select latest.id from public.matriculas m cross join lateral(
    select mm.id,mm.tipo,mm.status_novo from public.matricula_movimentacoes mm
      where mm.matricula_id=m.id order by mm.created_at desc,mm.id desc limit 1
  ) latest where m.id=p_matricula_id and m.status='TRANSFERIDO'
    and latest.status_novo=m.status and latest.tipo='TRANSFERENCIA_EXTERNA_ENVIADA';
$function$;

create function internal_academic.transfer_receivable_origin(p_row public.contas_receber)
returns text language sql stable security definer set search_path='' as $function$
  select case
    when exists(select 1 from internal_proesc.obligation_links l where l.receivable_id=p_row.id)
      then 'PROESC'
    when p_row.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL' then 'LOCAL'
    when p_row.gateway_provider='banese_card'
      and (p_row.gateway_submission_channel='CNAB' or p_row.gateway_cnab_file_id is not null)
      then 'BANESE_CNAB'
    when p_row.gateway_provider='banese_card' then 'BANESE_API'
    when p_row.gateway_provider is null and p_row.asaas_payment_id is null
      and p_row.asaas_payment_link_id is null and p_row.asaas_installment_id is null
      and not exists(select 1 from public.payment_gateway_transactions t where t.receivable_id=p_row.id)
      then 'LOCAL'
    else 'LEGADO' end;
$function$;

create function internal_academic.transfer_receivable_action(
  p_row public.contas_receber,p_type text,p_date date
)
returns text language plpgsql stable security definer set search_path='' as $function$
declare v_origin text:=internal_academic.transfer_receivable_origin(p_row);
begin
  if p_row.status not in ('PENDENTE','VENCIDO','SUSPENSO')
    or p_row.data_pagamento is not null or coalesce(p_row.valor_pago,0)>0 then return 'PRESERVAR'; end if;
  if p_type in ('INTERNA_TURMA','INTERNA_POLO') then return 'CONTINUAR_ORIGEM'; end if;
  if p_type<>'EXTERNA_ENVIADA' or p_date is null or p_row.data_vencimento<=p_date
    or p_row.data_vencimento is null then return 'PRESERVAR'; end if;
  if v_origin='LOCAL' and not internal_academic.manual_cycle_has_bank_fields(p_row)
    and (p_row.manual_settlement_id is null
      or coalesce(internal_academic.manual_cycle_local_receivable_complete(p_row),false))
    and not exists(select 1 from public.payment_gateway_transactions t where t.receivable_id=p_row.id)
  then return 'CANCELAR_LOCAL'; end if;
  if v_origin='BANESE_API' and p_row.gateway_payment_method='BOLETO'
    and p_row.gateway_environment in ('production','sandbox')
    and p_row.gateway_submission_channel='API'
    and p_row.gateway_submission_status='API_REGISTERED'
    and p_row.gateway_cnab_file_id is null and p_row.manual_settlement_id is null
    and p_row.gateway_payment_id=p_row.gateway_boleto_nosso_numero
    and coalesce(p_row.gateway_boleto_nosso_numero,'')~'^[0-9]{9}$'
    and upper(coalesce(p_row.gateway_status,'')) in ('PENDING','REGISTERED')
    and (select count(*) from public.payment_gateway_transactions t where t.receivable_id=p_row.id
      and t.provider_code='banese_card' and t.environment=p_row.gateway_environment
      and t.payment_method='BOLETO')=1
    and exists(select 1 from public.payment_gateway_transactions t where t.receivable_id=p_row.id
      and t.provider_code='banese_card' and t.environment=p_row.gateway_environment
      and t.payment_method='BOLETO' and t.remote_payment_id=p_row.gateway_boleto_nosso_numero
      and t.bank_slip_our_number=p_row.gateway_boleto_nosso_numero
      and upper(coalesce(t.remote_status,'')) in ('PENDING','REGISTERED'))
  then return 'AGUARDAR_BANESE'; end if;
  return 'REVISAO_EXTERNA';
end;
$function$;

create function internal_academic.transfer_financial_origin_chain(p_matricula_id uuid)
returns uuid[] language plpgsql stable security definer set search_path='' as $function$
declare v_current uuid:=p_matricula_id; v_next uuid; v_seen uuid[]:=array[p_matricula_id]; v_result uuid[]:='{}';
begin
  for step in 1..32 loop
    v_next:=internal_academic.transfer_financial_origin(v_current);
    if v_next is null then return v_result; end if;
    if v_next=any(v_seen) then raise exception 'Cadeia de transferência circular exige revisão.' using errcode='23514'; end if;
    v_seen:=array_append(v_seen,v_next); v_result:=array_append(v_result,v_next); v_current:=v_next;
  end loop;
  raise exception 'Cadeia de transferência excede o limite de conferência.' using errcode='23514';
end;
$function$;

create function internal_academic.transfer_financial_preview(
  p_matricula_id uuid,p_tipo text,p_data date,p_turma_destino_id uuid
)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_enrollment public.matriculas%rowtype; v_items jsonb; v_body jsonb;
begin
  perform internal_academic.assert_transfer_financial_access(p_matricula_id,p_turma_destino_id);
  select * into v_enrollment from public.matriculas where id=p_matricula_id;
  if auth.uid() is null or not coalesce(public.can_operate_turma_academics(v_enrollment.turma_id),false)
    or (p_tipo in ('INTERNA_TURMA','INTERNA_POLO')
      and not coalesce(public.can_operate_turma_academics(p_turma_destino_id),false)) then
    raise exception 'Sem permissão nas turmas da transferência.' using errcode='42501';
  end if;
  if p_tipo not in ('INTERNA_TURMA','INTERNA_POLO','EXTERNA_ENVIADA') or p_tipo is null
    or p_data is null or p_data>(timezone('America/Maceio',now()))::date
    or p_data<v_enrollment.data_matricula::date
    or (p_tipo<>'EXTERNA_ENVIADA' and (p_turma_destino_id is null or p_turma_destino_id=v_enrollment.turma_id))
    or (p_tipo='EXTERNA_ENVIADA' and p_turma_destino_id is not null) then
    raise exception 'Tipo, destino ou data da transferência inválidos.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'descricao',r.descricao,
    'origem',internal_academic.transfer_receivable_origin(r),'status',r.status,'matriculaOrigemId',r.matricula_id,
    'valor',r.valor,'vencimento',r.data_vencimento,
    'faixa',case when r.status='PAGO' or r.data_pagamento is not null or coalesce(r.valor_pago,0)>0 then 'PAGO'
      when r.data_vencimento<p_data then 'VENCIDO' when r.data_vencimento=p_data then 'NO_DIA'
      when r.data_vencimento>p_data then 'FUTURO' else 'SEM_DATA' end,
    'acao',case when r.matricula_id<>p_matricula_id and p_tipo='EXTERNA_ENVIADA'
        and internal_academic.transfer_receivable_action(r,p_tipo,p_data)<>'PRESERVAR'
      then 'REVISAO_EXTERNA' else internal_academic.transfer_receivable_action(r,p_tipo,p_data) end,
    'referencia',coalesce((select l.source_unit_id||':'||l.source_key from internal_proesc.obligation_links l
      where l.receivable_id=r.id),r.gateway_boleto_nosso_numero,r.asaas_payment_id),
    'versao',r.updated_at) order by r.data_vencimento,r.id),'[]'::jsonb)
    into v_items from public.contas_receber r where r.matricula_id=any(array_prepend(p_matricula_id,
      internal_academic.transfer_financial_origin_chain(p_matricula_id)));
  v_body:=jsonb_build_object('versao',1,'matriculaId',p_matricula_id,'tipo',p_tipo,
    'dataTransferencia',p_data,'turmaDestinoId',p_turma_destino_id,
    'origensFinanceiras',to_jsonb(internal_academic.transfer_financial_origin_chain(p_matricula_id)),
    'statusMatricula',v_enrollment.status,'itens',v_items,
    'resumo',(select jsonb_build_object(
      'preservados',count(*) filter(where x->>'acao' in ('PRESERVAR','CONTINUAR_ORIGEM')),
      'locaisACancelar',count(*) filter(where x->>'acao'='CANCELAR_LOCAL'),
      'banesePendentes',count(*) filter(where x->>'acao'='AGUARDAR_BANESE'),
      'revisaoExterna',count(*) filter(where x->>'acao'='REVISAO_EXTERNA')) from jsonb_array_elements(v_items) x));
  return v_body||jsonb_build_object('fingerprint',encode(extensions.digest(v_body::text,'sha256'),'hex'));
end;
$function$;
create function public.preview_transferencia_financeira(
  p_matricula_id uuid,p_tipo text,p_data_transferencia date,p_turma_destino_id uuid default null
)
returns jsonb language sql stable security definer set search_path='' as $function$
  select internal_academic.transfer_financial_preview(p_matricula_id,p_tipo,p_data_transferencia,p_turma_destino_id);
$function$;
revoke all on function internal_academic.transfer_receivable_origin(public.contas_receber),
  internal_academic.assert_transfer_financial_access(uuid,uuid),
  internal_academic.current_external_transfer_movement(uuid),
  internal_academic.transfer_financial_origin_chain(uuid),
  internal_academic.transfer_receivable_action(public.contas_receber,text,date),
  internal_academic.transfer_financial_preview(uuid,text,date,uuid),
  public.preview_transferencia_financeira(uuid,text,date,uuid) from public,anon,authenticated,service_role;
grant execute on function public.preview_transferencia_financeira(uuid,text,date,uuid) to authenticated;
commit;
