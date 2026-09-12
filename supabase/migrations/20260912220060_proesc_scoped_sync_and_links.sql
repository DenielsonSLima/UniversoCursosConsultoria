-- Scoped Proesc import extension, rebased against the verified remote contract.
begin;

-- Remote base CAS from MCP read-only inspection.
do $base_60$
begin
  if md5(pg_get_functiondef('public.proesc_sync_runtime_service(text,uuid,jsonb)'::regprocedure)) <> '415edddcbc72a931ac639e764c005aa4' then
    raise exception 'Remote base changed: public.proesc_sync_runtime_service; rebase required.'; end if;
  if md5(pg_get_functiondef('internal_proesc.assert_sync_lease(uuid,uuid)'::regprocedure)) <> '9184cfffa0afcd91dd0852b94d3da59d' then
    raise exception 'Remote base changed: internal_proesc.assert_sync_lease; rebase required.'; end if;
  if md5(pg_get_functiondef('public.proesc_link_obligation_service(uuid,uuid,jsonb)'::regprocedure)) <> '97776ce7f1721765bc292114da8b79ce' then
    raise exception 'Remote base changed: public.proesc_link_obligation_service; rebase required.'; end if;
end;
$base_60$;

create function internal_proesc.sync_link_allowed(p_link_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  -- auto_enabled authorizes consultation only. Applying a payment still requires
  -- the normalizer's VERIFIED snapshot and the existing receivable CAS guards.
  select exists (select 1 from internal_proesc.obligation_links l
    join internal_proesc.class_scopes s on s.turma_id=l.turma_id
      and s.source_unit_id=l.source_unit_id and s.source_class_id=l.source_class_id
    join public.contas_receber c on c.id=l.receivable_id and c.matricula_id=l.matricula_id
      and c.turma_id=l.turma_id and c.polo_id=s.polo_id
    where l.id=p_link_id and l.auto_enabled and s.phase='CONFIRMED'
      and c.origem_pagamento='SISTEMA_ANTERIOR' and c.gateway_provider is null
      and c.gateway_payment_id is null and c.gateway_creation_token is null
      and (s.batch_id is null or exists (
        select 1 from internal_proesc.enrollment_sources e
        join internal_proesc.obligation_imports i on i.link_id=l.id and i.scope_id=s.id
        where e.matricula_id=l.matricula_id and e.scope_id=s.id and e.source_verified
          and e.source_person_key=i.source_person_hash
          and i.source_person_hash=internal_proesc.person_document_hash(c.cliente_id))));
$$;
revoke all on function internal_proesc.sync_link_allowed(uuid) from public,anon,authenticated,service_role;

-- Keep the reviewed cursor/lease algorithm and its six-item bound. Only replace
-- the class-name eligibility predicate; T42 is represented by its confirmed seed.
create or replace function public.proesc_sync_runtime_service(
  p_action text, p_actor_id uuid default null, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid;
  v_secret text;
  v_expected bytea;
  v_received bytea;
  v_difference integer := 0;
  v_state internal_proesc.sync_runtime%rowtype;
  v_links jsonb;
  v_last uuid;
  v_lease uuid;
  v_request bigint;
  i integer;
begin
  if coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role'
    is distinct from 'service_role' then
    raise exception 'Acesso interno Proesc não autorizado.' using errcode='42501';
  end if;
  select updated_by into v_actor from internal_proesc.connection where id;
  perform internal_proesc.authorize_financial_operator(v_actor);
  if coalesce(p_action,'') not in ('authorize','enqueue','claim','finish')
    or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Operação interna de consulta inválida.' using errcode='22023';
  end if;
  if p_action in ('claim','finish') and p_actor_id is distinct from v_actor then
    raise exception 'Operador da integração foi alterado.' using errcode='42501';
  end if;

  if p_action in ('authorize','enqueue') then
    select decrypted_secret into v_secret from vault.decrypted_secrets where name='proesc_sync_worker_secret';
    if v_secret is null then raise exception 'Consulta interna indisponível.' using errcode='42501'; end if;
    if p_action='authorize' then
      if not coalesce(p_payload->>'key' ~ '^[0-9a-f]{64}$',false) then
        raise exception 'Credencial interna inválida.' using errcode='42501'; end if;
      v_expected:=extensions.digest(v_secret,'sha256');
      v_received:=extensions.digest(coalesce(p_payload->>'key',''),'sha256');
      for i in 0..31 loop
        v_difference:=v_difference | (get_byte(v_expected,i) # get_byte(v_received,i));
      end loop;
      if v_difference<>0 then raise exception 'Credencial interna inválida.' using errcode='42501'; end if;
      return jsonb_build_object('actorId',v_actor);
    end if;
    if p_payload <> '{}'::jsonb then raise exception 'Agendamento sem parâmetros externos.' using errcode='22023'; end if;
    if not exists(select 1 from internal_proesc.sync_runtime where id and enabled) then
      return jsonb_build_object('scheduled',false); end if;
    v_request:=net.http_post(
      url:='https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/proesc-api',
      body:='{"action":"internal_sync"}'::jsonb,
      headers:=jsonb_build_object('Content-Type','application/json','X-Proesc-Sync-Secret',v_secret),
      timeout_milliseconds:=120000
    );
    return jsonb_build_object('scheduled',true,'requestId',v_request);
  end if;

  select * into v_state from internal_proesc.sync_runtime where id for update;
  if p_action='claim' then
    if p_payload <> '{}'::jsonb then raise exception 'Consulta sem parâmetros externos.' using errcode='22023'; end if;
    if not v_state.enabled or v_state.lease_until>now() then
      return jsonb_build_object('claimed',false); end if;
    if not exists(select 1 from internal_proesc.obligation_links l
      join public.contas_receber c on c.id=l.receivable_id join public.turmas t on t.id=l.turma_id
      where internal_proesc.sync_link_allowed(l.id)
        and c.origem_pagamento='SISTEMA_ANTERIOR' and c.gateway_provider is null
        and (v_state.cursor_id is null or l.id>v_state.cursor_id)) then v_state.cursor_id:=null; end if;
    with batch as (
      select l.*, c, a.cpf_cnpj from internal_proesc.obligation_links l
      join public.contas_receber c on c.id=l.receivable_id
      join public.parceiros a on a.id=c.cliente_id
      join public.turmas t on t.id=l.turma_id
      where internal_proesc.sync_link_allowed(l.id)
        and (v_state.cursor_id is null or l.id>v_state.cursor_id)
        and c.origem_pagamento='SISTEMA_ANTERIOR' and c.gateway_provider is null
      order by l.id limit 6
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'linkId',id,'classId',turma_id,'unitId',source_unit_id,'sourceClassId',source_class_id,
      'externalKey',source_key,'receivableId',receivable_id,
      'personHash',encode(extensions.digest(regexp_replace(coalesce(cpf_cnpj,''),'[^0-9]','','g'),'sha256'),'hex'),
      'dueDate',(c).data_vencimento,'principalCents',round((c).valor*100)::bigint,
      'status',(c).status,'paidCents',round(coalesce((c).valor_pago,0)*100)::bigint,
      'paymentDate',(c).data_pagamento,'expectedBefore',internal_proesc.receivable_fingerprint(c)
    ) order by id),'[]'::jsonb), (array_agg(id order by id desc))[1] into v_links,v_last from batch;
    if jsonb_array_length(v_links)=0 then return jsonb_build_object('claimed',false); end if;
    v_lease:=gen_random_uuid();
    update internal_proesc.sync_runtime set lease_id=v_lease,lease_until=now()+interval '3 minutes',
      lease_links=array(select (item->>'linkId')::uuid from jsonb_array_elements(v_links) item),
      lease_last_id=v_last,credential_revision=(select revision from internal_proesc.connection where id),
      last_started_at=now() where id;
    return jsonb_build_object('claimed',true,'leaseId',v_lease,'lastId',v_last,'links',v_links);
  end if;

  v_lease:=(p_payload->>'leaseId')::uuid;
  if v_state.lease_id is distinct from v_lease or v_lease is null or v_state.lease_until<now() then
    raise exception 'Consulta interna fora da concessão atual.' using errcode='40001'; end if;
  if jsonb_typeof(p_payload->'success') is distinct from 'boolean'
    or jsonb_typeof(p_payload->'counts') is distinct from 'object'
    or v_state.lease_last_id is distinct from (p_payload->>'lastId')::uuid then
    raise exception 'Resultado de consulta inválido.' using errcode='22023'; end if;
  update internal_proesc.sync_runtime set
    cursor_id=case when (p_payload->>'success')::boolean then (p_payload->>'lastId')::uuid else cursor_id end,
    lease_id=null,lease_until=null,lease_links=null,lease_last_id=null,credential_revision=null,
    last_finished_at=now(),last_result=p_payload->'counts' where id;
  return jsonb_build_object('finished',true);
end;
$$;
revoke all on function public.proesc_sync_runtime_service(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.proesc_sync_runtime_service(text,uuid,jsonb) to service_role;

create or replace function internal_proesc.assert_sync_lease(p_lease_id uuid,p_link_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_state internal_proesc.sync_runtime%rowtype;
begin
  select * into strict v_state from internal_proesc.sync_runtime where id for update;
  if not v_state.enabled or p_lease_id is null or v_state.lease_id is distinct from p_lease_id
    or v_state.lease_until is null or v_state.lease_until<=now()
    or not coalesce(p_link_id=any(v_state.lease_links),false)
    or v_state.credential_revision is distinct from (select revision from internal_proesc.connection where id)
    or not internal_proesc.sync_link_allowed(p_link_id) then
    raise exception 'Concessão de consulta Proesc expirada ou alterada.' using errcode='40001'; end if;
end;
$$;
revoke all on function internal_proesc.assert_sync_lease(uuid,uuid) from public,anon,authenticated,service_role;


-- Existing linked T42 obligations preserve their operation. New links require
-- the canonical source-person proof; enabling AUTO also requires scoped review.
alter function public.proesc_link_obligation_service(uuid,uuid,jsonb)
  rename to link_obligation_before_class_scopes;
alter function public.link_obligation_before_class_scopes(uuid,uuid,jsonb) set schema internal_proesc;
create function public.proesc_link_obligation_service(p_actor_id uuid,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare v_row public.contas_receber%rowtype; v_result jsonb; v_scope internal_proesc.class_scopes%rowtype;
begin
  perform internal_proesc.authorize_financial_operator(p_actor_id);
  select * into strict v_row from public.contas_receber where id=(p_payload->>'receivableId')::uuid;
  v_scope:=internal_proesc.assert_confirmed_class_scope(v_row.turma_id,
    p_payload->'source'->>'unitId',p_payload->'source'->>'classId');
  if not exists (select 1 from internal_proesc.obligation_links where receivable_id=v_row.id)
    and internal_proesc.person_document_hash(v_row.cliente_id)
      is distinct from p_payload->'source'->>'personHash' then
    raise exception 'Novo vínculo exige CPF canônico conferido na fonte.' using errcode='42501'; end if;
  v_result:=internal_proesc.link_obligation_before_class_scopes(p_actor_id,p_request_id,p_payload);
  if coalesce((p_payload->>'autoEnabled')::boolean,false)
    and not internal_proesc.sync_link_allowed((v_result->>'linkId')::uuid) then
    raise exception 'Consulta automática exige identidade Proesc confirmada e recebível protegido.' using errcode='42501'; end if;
  return v_result;
end;
$$;
revoke all on function internal_proesc.link_obligation_before_class_scopes(uuid,uuid,jsonb),
  public.proesc_link_obligation_service(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.proesc_link_obligation_service(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
