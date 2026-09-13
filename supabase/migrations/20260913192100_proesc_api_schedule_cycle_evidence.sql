-- User-authorized schedule derivation is distinct from a source contract.
begin;
alter table internal_proesc.enrollment_cycle_evidence
  drop constraint enrollment_cycle_evidence_evidence_kind_check;
alter table internal_proesc.enrollment_cycle_evidence
  add constraint enrollment_cycle_evidence_evidence_kind_check check(evidence_kind in(
    'UNRESOLVED','SOURCE_CONTRACT','SOURCE_CYCLE_REFERENCE','USER_CONFIRMED_CONTRACT','API_SCHEDULE_REVIEW'));

create function internal_proesc.evaluate_api_cycle_schedule(p_context jsonb,p_rows jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare
  v_rows jsonb; v_monthly jsonb; v_count integer; v_fees integer;
  v_first date; v_start date:=(p_context->>'startDate')::date;
  v_reason text:='O cronograma Proesc ainda precisa de conferência individual.';
begin
  select coalesce(jsonb_agg(r order by r->>'dueDate',r->>'key'),'[]') into v_rows
    from jsonb_array_elements(p_rows) r where r->>'classId'=p_context->>'classId'
      and r->>'personHash'=p_context->>'personHash';
  if jsonb_array_length(v_rows)=0 or exists(select 1 from jsonb_array_elements(v_rows) r
    where r->'unsafe' is distinct from 'false' or r->>'createdDate' is null)
    or (select count(distinct r->>'key') from jsonb_array_elements(v_rows) r)<>jsonb_array_length(v_rows) then
    return jsonb_build_object('classification','UNKNOWN','reason','Origem incompleta, cancelada ou renegociada; confira o histórico individual.'); end if;
  select coalesce(jsonb_agg(r order by r->>'dueDate',r->>'key'),'[]') into v_monthly
    from jsonb_array_elements(v_rows) r where (r->>'amountCents')::bigint=27990;
  v_count:=jsonb_array_length(v_monthly);
  -- Blocking known second-cycle schedules is conservative even if some keys
  -- have not yet entered the local ledger. Never import them in this preflight.
  if v_count>=24 and exists(select 1 from jsonb_array_elements(v_rows) r
    where (r->>'amountCents')::bigint=10000) then
    return jsonb_build_object('classification','FULL','reason',
      'O Proesc contém mensalidades de dois ciclos e rematrícula. Novas cobranças estão protegidas.',
      'monthlyCount',v_count,'obligationCount',jsonb_array_length(v_rows)); end if;
  -- Unknown identities cannot disprove already observed FULL coverage, but
  -- they do prevent claiming absence of a second cycle for another student.
  if exists(select 1 from jsonb_array_elements(p_rows) r
    where r->>'classId'=p_context->>'classId' and r->>'personHash' is null) then
    return jsonb_build_object('classification','UNKNOWN','reason','Há cobranças sem identidade confirmada nesta turma.'); end if;
  select count(*) into v_fees from jsonb_array_elements(v_rows) r where (r->>'amountCents')::bigint=20000;
  if v_count<>12 or v_fees>1 or jsonb_array_length(v_rows)<>12+v_fees
    or p_context->'academicReady' is distinct from 'true' then
    return jsonb_build_object('classification','UNKNOWN','reason',v_reason); end if;
  if (select count(distinct r->>'createdDate') from jsonb_array_elements(v_monthly) r)<>1 then
    return jsonb_build_object('classification','UNKNOWN','reason','As parcelas foram criadas em momentos diferentes; revisão individual necessária.'); end if;
  v_first:=(v_monthly->0->>'dueDate')::date;
  if v_first<v_start or date_trunc('month',v_first)>date_trunc('month',v_start)+interval '1 month'
    or exists(select 1 from jsonb_array_elements(v_monthly) with ordinality d(r,n)
      where date_trunc('month',(r->>'dueDate')::date)
        <>date_trunc('month',v_first)+((n-1)||' months')::interval) then
    return jsonb_build_object('classification','UNKNOWN','reason','Datas das parcelas não comprovam os 12 meses do primeiro ciclo.'); end if;
  if (p_context->'reconciledSeed' is distinct from 'true'
      and jsonb_array_length(p_context->'obligations')<>jsonb_array_length(v_rows))
    or exists(select 1 from jsonb_array_elements(p_context->'obligations') l where not exists(
      select 1 from jsonb_array_elements(v_rows) r
      where l->>'key'=r->>'key' and l->>'amountCents'=r->>'amountCents'
        and l->>'dueDate'=r->>'dueDate')) then
    return jsonb_build_object('classification','UNKNOWN','reason','A API contém obrigações diferentes do histórico importado; concilie antes de emitir.'); end if;
  return jsonb_build_object('classification','C1','reason',
    'Conferidos 12 meses do primeiro ciclo pela API e pelas condições informadas. Nenhum segundo ciclo encontrado na janela consultada.',
    'monthlyCount',12,'obligationCount',jsonb_array_length(v_rows));
end;
$$;

create function internal_proesc.api_cycle_schedule_is_fresh(p_matricula_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from internal_proesc.enrollment_cycle_evidence e
    join internal_proesc.cycle_review_cache c on c.id::text=e.source_evidence->>'cacheId'
    join internal_proesc.connection token on token.id
    where e.matricula_id=p_matricula_id and e.evidence_kind='API_SCHEDULE_REVIEW'
      and e.classification='C1' and e.verification='CONFIRMED'
      and c.state='COMPLETE' and c.observed_at>now()-interval '5 minutes'
      and c.observed_at=e.source_observed_at and c.token_revision=token.revision
      and c.source_hash=e.source_evidence->>'sourceHash'
      and internal_proesc.cycle_review_context(p_matricula_id)->>'academicFingerprint'
        =e.source_evidence->>'academicFingerprint'
      and e.obligation_manifest_hash=internal_proesc.enrollment_cycle_manifest_hash(p_matricula_id));
$$;

create function public.proesc_record_api_cycle_review_service(
  p_actor_id uuid,p_matricula_id uuid,p_cache_id uuid
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
  v_context jsonb; v_result jsonb; v_source jsonb; v_hash text; v_request uuid:=gen_random_uuid();
  v_cache internal_proesc.cycle_review_cache%rowtype;
  v_old internal_proesc.enrollment_cycle_evidence%rowtype;
  v_new internal_proesc.enrollment_cycle_evidence%rowtype;
  v_classification text;
begin
  perform internal_proesc.authorize_cycle_review(p_actor_id,p_matricula_id);
  perform pg_advisory_xact_lock(hashtextextended('technical-manual-cycle-enrollment:'||p_matricula_id::text,0));
  perform 1 from public.matriculas where id=p_matricula_id for update;
  v_context:=internal_proesc.cycle_review_context(p_matricula_id);
  select * into strict v_cache from internal_proesc.cycle_review_cache where id=p_cache_id for share;
  if v_cache.state<>'COMPLETE' or v_cache.observed_at<=now()-interval '5 minutes'
    or v_cache.token_revision is distinct from (select revision from internal_proesc.connection where id)
    or v_cache.unit_id<>v_context->>'unitId'
    or v_cache.first_year<>(v_context->>'firstYear')::int
    or v_cache.last_year<>(v_context->>'lastYear')::int or v_cache.class_ids<>v_context->'classIds' then
    raise exception 'Conferência expirou ou mudou; consulte o Proesc novamente.' using errcode='40001'; end if;
  v_result:=internal_proesc.evaluate_api_cycle_schedule(v_context,v_cache.obligations);
  v_classification:=v_result->>'classification';
  select * into v_old from internal_proesc.enrollment_cycle_evidence where matricula_id=p_matricula_id for update;
  if v_old.has_external_cycle2 is true then
    return jsonb_build_object('classification','FULL','eligible',false,
      'source','API_SCHEDULE_REVIEW','reason','Segundo ciclo externo já comprovado e protegido.',
      'observedAt',v_old.source_observed_at,'validUntil',null); end if;
  if exists(select 1 from internal_academic.technical_manual_cycle_runs where matricula_id=p_matricula_id)
    or exists(select 1 from internal_academic.technical_external_cycle_coverage where matricula_id=p_matricula_id) then
    return jsonb_build_object('classification','UNKNOWN','eligible',false,'source','API_SCHEDULE_REVIEW',
      'reason','Ciclo já gerado ou protegido. A conferência não modifica emissões existentes.',
      'observedAt',v_cache.observed_at,'validUntil',null); end if;
  v_source:=v_result||jsonb_build_object('cacheId',v_cache.id,'sourceHash',v_cache.source_hash,
    'academicFingerprint',v_context->>'academicFingerprint','firstYear',v_cache.first_year,
    'lastYear',v_cache.last_year,'unitId',v_cache.unit_id,'classId',v_context->>'classId',
    'personHash',v_context->>'personHash','rule','USER_STANDARD_12_X_27990_200_100',
    'completeApiWindow',true,'derived',true);
  v_hash:=encode(extensions.digest(jsonb_build_object('source',v_source,
    'manifest',v_context->>'manifestHash','observedAt',v_cache.observed_at)::text,'sha256'),'hex');
  if v_old.evidence_hash is distinct from v_hash then
    insert into internal_proesc.enrollment_cycle_evidence(matricula_id,scope_id,classification,
      has_external_cycle2,verification,evidence_kind,source_evidence,obligation_manifest_hash,
      evidence_hash,source_observed_at,revision,request_id,recorded_by,confirmed_by,confirmed_at)
    values(p_matricula_id,(v_context->>'scopeId')::uuid,v_classification,
      case when v_classification='UNKNOWN' then null else v_classification='FULL' end,
      case when v_classification='UNKNOWN' then 'REVIEW' else 'CONFIRMED' end,
      'API_SCHEDULE_REVIEW',v_source,v_context->>'manifestHash',v_hash,v_cache.observed_at,
      coalesce(v_old.revision,0)+1,v_request,p_actor_id,
      case when v_classification='UNKNOWN' then null else p_actor_id end,
      case when v_classification='UNKNOWN' then null else now() end)
    on conflict(matricula_id) do update set classification=excluded.classification,
      has_external_cycle2=excluded.has_external_cycle2,verification=excluded.verification,
      evidence_kind=excluded.evidence_kind,source_evidence=excluded.source_evidence,
      obligation_manifest_hash=excluded.obligation_manifest_hash,evidence_hash=excluded.evidence_hash,
      source_observed_at=excluded.source_observed_at,revision=excluded.revision,request_id=excluded.request_id,
      recorded_by=excluded.recorded_by,recorded_at=now(),confirmed_by=excluded.confirmed_by,
      confirmed_at=excluded.confirmed_at returning * into v_new;
    insert into internal_proesc.cycle_evidence_requests(request_id,actor_id,payload_hash,matricula_id,
      before_state,after_state,response) values(v_request,p_actor_id,v_hash,p_matricula_id,
      case when v_old.matricula_id is null then null else to_jsonb(v_old) end,to_jsonb(v_new),v_result);
  end if;
  return v_result||jsonb_build_object('eligible',v_classification='C1'
      and coalesce((internal_academic.technical_manual_cycle_state(p_matricula_id)->>'podeGerar')::boolean,false),
    'source','API_SCHEDULE_REVIEW','observedAt',v_cache.observed_at,
    'validUntil',case when v_classification='C1' then v_cache.observed_at+interval '5 minutes' else null end);
end;
$$;

create or replace function internal_proesc.has_confirmed_first_cycle_only(p_matricula_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from internal_proesc.enrollment_cycle_evidence e
    join internal_proesc.class_scopes s on s.id=e.scope_id
    left join internal_proesc.enrollment_sources a on a.matricula_id=e.matricula_id and a.scope_id=e.scope_id
    join public.matriculas m on m.id=e.matricula_id and m.turma_id=s.turma_id
    where e.matricula_id=p_matricula_id and s.phase='CONFIRMED'
      and ((s.batch_id is not null and s.financial_mode='INDIVIDUAL_REVIEW')
        or (s.batch_id is null and s.financial_mode='CICLO1_PROESC'))
      and e.classification='C1' and e.has_external_cycle2 is false
      and e.verification='CONFIRMED' and e.evidence_kind<>'UNRESOLVED'
      and e.obligation_manifest_hash=internal_proesc.enrollment_cycle_manifest_hash(m.id)
      and (case when s.batch_id is null then upper(m.status) in ('ATIVO','PENDENTE')
        else upper(m.status)='ATIVO' and a.source_verified and a.source_status='CURSANDO' end)
      and (case when e.evidence_kind='API_SCHEDULE_REVIEW'
        then internal_proesc.api_cycle_schedule_is_fresh(m.id) else a.financial_review_state='CONFIRMED' end)
      and not exists(select 1 from internal_proesc.obligation_links l
        join internal_proesc.obligation_imports i on i.link_id=l.id
        where l.matricula_id=m.id and i.source_cycle in('SECOND','FULL_CONTRACT')));
$$;
create or replace function internal_proesc.enrollment_financial_block(p_matricula_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select case
    when s.phase<>'CONFIRMED' then 'PROESC_IMPORTACAO_EM_CONFERENCIA'
    when s.batch_id is null and (exists(select 1 from internal_academic.technical_manual_cycle_runs r
      where r.matricula_id=m.id) or exists(select 1 from internal_academic.technical_external_cycle_coverage c
      where c.matricula_id=m.id)) then null
    when (s.batch_id is not null and (e.matricula_id is null or not e.source_verified or e.source_status<>'CURSANDO'))
      or (case when s.batch_id is null then m.status not in ('ATIVO','PENDENTE')
        else m.status<>'ATIVO' end) then 'PROESC_SITUACAO_ACADEMICA_EM_CONFERENCIA'
    when exists(select 1 from internal_proesc.enrollment_cycle_evidence c
      where c.matricula_id=m.id and c.scope_id=s.id and c.classification='FULL'
        and c.verification='CONFIRMED') then 'PROESC_CONTRATO_EXTERNO'
    when internal_proesc.has_confirmed_first_cycle_only(m.id) then null
    when exists(select 1 from internal_proesc.enrollment_cycle_evidence c
      where c.matricula_id=m.id and c.evidence_kind='API_SCHEDULE_REVIEW') then 'PROESC_CONFERENCIA_ATUALIZADA_NECESSARIA'
    when e.financial_review_state<>'CONFIRMED' then 'PROESC_FINANCEIRO_EM_CONFERENCIA'
    else 'PROESC_COBERTURA_INDIVIDUAL_EM_CONFERENCIA' end
  from public.matriculas m join internal_proesc.class_scopes s on s.turma_id=m.turma_id
  left join internal_proesc.enrollment_sources e on e.matricula_id=m.id
  where m.id=p_matricula_id and (s.batch_id is not null or s.financial_mode='CICLO1_PROESC');
$$;
create or replace function internal_academic.technical_manual_cycle_state(p_matricula_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_state jsonb; v_block text; v_message text;
begin
  v_state:=internal_academic.technical_manual_cycle_state_before_proesc_scopes(p_matricula_id);
  if v_state#>>'{politica,fingerprint}' is not null then
    v_state:=jsonb_set(v_state,'{politica,fingerprint}',to_jsonb(
      internal_proesc.individual_cycle_policy_fingerprint(p_matricula_id,
        v_state#>>'{politica,fingerprint}')),false);
  end if;
  if exists(select 1 from public.matriculas m
    join internal_proesc.class_scopes s on s.turma_id=m.turma_id
    left join internal_proesc.enrollment_sources a on a.matricula_id=m.id
    where m.id=p_matricula_id and s.phase='CONFIRMED'
      and ((s.batch_id is not null and s.financial_mode='INDIVIDUAL_REVIEW'
        and a.source_verified and a.source_status='CURSANDO')
        or (s.batch_id is null and s.financial_mode='CICLO1_PROESC'))
      and (case when s.batch_id is null then m.status in ('ATIVO','PENDENTE') else m.status='ATIVO' end)
      and not exists(select 1 from internal_proesc.enrollment_cycle_evidence e
        where e.matricula_id=m.id and e.has_external_cycle2 is true)
      and not exists(select 1 from internal_academic.technical_manual_cycle_runs r where r.matricula_id=m.id)
      and not exists(select 1 from internal_academic.technical_external_cycle_coverage e where e.matricula_id=m.id)) then
    v_state:=v_state||jsonb_build_object('conferenciaProesc',jsonb_build_object('necessaria',true));
  end if;
  v_block:=internal_proesc.enrollment_financial_block(p_matricula_id);
  if v_block is null then return v_state; end if;
  v_message:=case v_block
    when 'PROESC_CONTRATO_EXTERNO' then 'O segundo ciclo já consta no Proesc. Novas cobranças estão protegidas.'
    when 'PROESC_SITUACAO_ACADEMICA_EM_CONFERENCIA' then 'A situação acadêmica não permite gerar um novo ciclo.'
    else 'Confira os ciclos no Proesc para verificar se esta matrícula possui somente o primeiro ciclo.' end;
  return v_state||jsonb_build_object('podeGerar',false,
    'estado',case when v_state->>'estado'='ELEGIVEL' then 'BLOQUEADO' else v_state->>'estado' end,
    'bloqueio',jsonb_build_object('codigo',v_block,'mensagem',v_message));
end;
$$;
revoke all on function internal_proesc.evaluate_api_cycle_schedule(jsonb,jsonb),
  internal_proesc.api_cycle_schedule_is_fresh(uuid),
  public.proesc_record_api_cycle_review_service(uuid,uuid,uuid),
  internal_proesc.has_confirmed_first_cycle_only(uuid),internal_proesc.enrollment_financial_block(uuid),
  internal_academic.technical_manual_cycle_state(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.proesc_record_api_cycle_review_service(uuid,uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
