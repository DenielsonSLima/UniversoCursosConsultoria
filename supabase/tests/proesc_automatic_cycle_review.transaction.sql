-- Run via MCP only; inject the two unapplied migrations at the marker.
-- Synthetic cache/evidence remain inside this rolled-back transaction.
begin;
set local request.jwt.claims='{"role":"service_role"}';
/* __AUTOMATIC_CYCLE_REVIEW_MIGRATIONS__ */

do $schedule_contract$
declare
  v_rows jsonb; v_context jsonb; v_result jsonb; v_changed jsonb;
begin
  select jsonb_agg(jsonb_build_object('key',n::text,'classId','2','personHash',repeat('a',64),
    'amountCents',27990,'dueDate',to_char(date '2026-01-15'+((n-1)||' months')::interval,'YYYY-MM-DD'),
    'createdDate','2026-01-01','unsafe',false) order by n) into v_rows from generate_series(1,12) n;
  v_context:=jsonb_build_object('classId','2','personHash',repeat('a',64),
    'startDate','2026-01-01','academicReady',true,'obligations',v_rows);
  v_result:=internal_proesc.evaluate_api_cycle_schedule(v_context,v_rows);
  assert v_result->>'classification'='C1','12 coherent monthly items must prove C1 without an API enrollment fee';
  assert internal_proesc.evaluate_api_cycle_schedule(
    v_context||'{"academicReady":false}',v_rows)->>'classification'='UNKNOWN';
  assert internal_proesc.evaluate_api_cycle_schedule(
    v_context||'{"startDate":"2026-04-01"}',v_rows)->>'classification'='UNKNOWN';
  assert internal_proesc.evaluate_api_cycle_schedule(v_context,v_rows-11)->>'classification'='UNKNOWN';
  assert internal_proesc.evaluate_api_cycle_schedule(v_context,
    jsonb_set(v_rows,'{0,unsafe}','true'))->>'classification'='UNKNOWN';
  assert internal_proesc.evaluate_api_cycle_schedule(v_context,
    jsonb_set(v_rows,'{0,personHash}','null'))->>'classification'='UNKNOWN';
  assert internal_proesc.evaluate_api_cycle_schedule(v_context,
    jsonb_set(v_rows,'{0,createdDate}','"2026-01-02"'))->>'classification'='UNKNOWN';
  assert internal_proesc.evaluate_api_cycle_schedule(v_context,
    jsonb_set(v_rows,'{1,dueDate}','"2026-01-16"'))->>'classification'='UNKNOWN';
  assert internal_proesc.evaluate_api_cycle_schedule(v_context,
    jsonb_set(v_rows,'{0,key}','"999"'))->>'classification'='UNKNOWN';
  select jsonb_agg(jsonb_build_object('key',n::text,'classId','2','personHash',repeat('a',64),
    'amountCents',case when n=25 then 10000 else 27990 end,
    'dueDate',to_char(date '2026-01-15'+((n-1)||' months')::interval,'YYYY-MM-DD'),
    'createdDate','2026-01-01','unsafe',false) order by n) into v_changed from generate_series(1,25) n;
  assert internal_proesc.evaluate_api_cycle_schedule(v_context,v_changed)->>'classification'='FULL',
    'Second-cycle evidence protects even obligations not yet imported';
end;
$schedule_contract$;

do $integration_contract$
declare
  v_actor uuid; v_enrollment uuid; v_context jsonb; v_begin jsonb; v_rows jsonb;
  v_response jsonb; v_periods jsonb; v_cache uuid; v_policy text; v_preview jsonb;
  v_before text; v_after text; v_hash text; v_seen timestamptz; v_revision integer;
  v_seed uuid; v_limited_actor uuid; v_outside_enrollment uuid;
  v_token_revision uuid; v_claim jsonb; v_targets jsonb; v_total integer; v_request uuid;
  v_item jsonb; v_message text; v_blocked_enrollment uuid; v_status text;
begin
  select updated_by into strict v_actor from internal_proesc.connection where id;
  select m.id into strict v_seed from public.matriculas m
    join internal_proesc.class_scopes s on s.turma_id=m.turma_id
    where s.batch_id is null and s.financial_mode='CICLO1_PROESC' and m.status='PENDENTE'
      and not exists(select 1 from internal_academic.technical_manual_cycle_runs r where r.matricula_id=m.id)
      and not exists(select 1 from internal_academic.technical_external_cycle_coverage c where c.matricula_id=m.id)
    order by m.id limit 1;
  assert internal_proesc.cycle_review_context(v_seed)->'academicReady'='true',
    'Existing T42 PENDENTE status must retain its established academic eligibility';
  assert internal_academic.technical_manual_cycle_state(v_seed)#>>'{conferenciaProesc,necessaria}'='true',
    'Unissued T42 enrollments must require the same fresh API preflight';
  assert not exists(select 1 from internal_proesc.enrollment_sources where matricula_id=v_seed),
    'T42 must use its reconciled source without invented academic import records';
  select u.id,m.id into v_limited_actor,v_outside_enrollment from public.usuarios_sistema u
    left join public.perfis_acesso p on p.id=u.perfil_acesso_id
    cross join public.matriculas m join internal_proesc.class_scopes s on s.turma_id=m.turma_id
    where lower(u.status) in ('ativo','active') and lower(u.perfil)='gestor' and u.auth_user_id is not null
      and coalesce((case when p.id is not null and not coalesce(u.personalizar_permissoes,false)
        then p.permissoes else u.permissoes end)->'allPolos','false')<>'true'
      and not(s.polo_id=any(coalesce(u.polo_ids,array[]::uuid[])))
      and s.polo_id::text is distinct from u.context limit 1;
  assert v_limited_actor is not null,'Existing limited actor fixture required';
  begin
    perform internal_proesc.authorize_cycle_review(v_limited_actor,v_outside_enrollment);
    raise exception 'Actor outside the class polo must not access its source review';
  exception when insufficient_privilege then null; end;
  select m.id into strict v_enrollment from public.matriculas m
    join internal_proesc.class_scopes s on s.turma_id=m.turma_id
    join internal_proesc.enrollment_sources a on a.matricula_id=m.id
    where s.class_code='ENF-T45-SEM-PDF' and m.status='ATIVO'
      and a.source_verified and a.source_status='CURSANDO'
      and (select count(*)=12 and min(c.valor)=279.90 and max(c.valor)=279.90
        and count(distinct date_trunc('month',c.data_vencimento))=12
        and min(c.data_vencimento)>=greatest((s.class_spec->>'startDate')::date,a.source_enrolled_at::date)
        and date_trunc('month',min(c.data_vencimento))<=date_trunc('month',
          greatest((s.class_spec->>'startDate')::date,a.source_enrolled_at::date))+interval '1 month'
        and max(c.data_vencimento)-min(c.data_vencimento) between 330 and 340
        from public.contas_receber c join internal_proesc.obligation_links l on l.receivable_id=c.id
        where l.matricula_id=m.id) order by m.id limit 1;
  select md5(jsonb_agg(to_jsonb(c) order by c.id)::text) into v_before
    from public.contas_receber c where c.matricula_id=v_enrollment;
  v_context:=internal_proesc.cycle_review_context(v_enrollment);
  v_begin:=public.proesc_cycle_review_cache_service('begin',v_actor,v_enrollment);
  assert v_begin->'cached'='false','Fresh test must acquire a source lease';
  assert public.proesc_cycle_review_cache_service('begin',v_actor,v_enrollment)->'busy'='true',
    'Concurrent source collection must not duplicate its requests';
  v_cache:=(v_begin->>'cacheId')::uuid;
  select jsonb_agg(r||jsonb_build_object('classId',v_context->>'classId',
    'personHash',v_context->>'personHash','unsafe',false,'createdDate',v_context->>'startDate')
    order by r->>'key') into v_rows from jsonb_array_elements(v_context->'obligations') r;
  select jsonb_agg(jsonb_build_object('year',y,'month',m,'complete',true)) into v_periods
    from generate_series((v_context->>'firstYear')::int,(v_context->>'lastYear')::int) y
    cross join generate_series(1,12) m;
  begin
    perform public.proesc_cycle_review_cache_service('complete',v_actor,v_enrollment,
      jsonb_build_object('cacheId',v_cache,'lease',v_begin->>'lease','obligations',v_rows,'periods',v_periods-0));
    raise exception 'Partial source collection must fail';
  exception when invalid_parameter_value then null; end;
  perform public.proesc_cycle_review_cache_service('complete',v_actor,v_enrollment,
    jsonb_build_object('cacheId',v_cache,'lease',v_begin->>'lease','obligations',v_rows,'periods',v_periods));
  v_response:=public.proesc_record_api_cycle_review_service(v_actor,v_enrollment,v_cache);
  assert v_response->>'classification'='C1' and v_response->'eligible'='true',
    'Complete, source-bound C1 must enable only the second-cycle workflow';
  assert internal_proesc.has_confirmed_first_cycle_only(v_enrollment);
  assert internal_academic.technical_manual_cycle_state(v_enrollment)#>>'{conferenciaProesc,necessaria}'='true';
  v_preview:=internal_academic.technical_manual_cycle_preview(v_enrollment,2,current_date+30);
  assert jsonb_array_length(v_preview#>'{preview,itens}')=13,'C2 must preview renewal plus12 monthly items';
  select revision into v_revision from internal_proesc.enrollment_cycle_evidence where matricula_id=v_enrollment;
  perform public.proesc_record_api_cycle_review_service(v_actor,v_enrollment,v_cache);
  assert (select revision=v_revision from internal_proesc.enrollment_cycle_evidence where matricula_id=v_enrollment),
    'Reviewing unchanged cached source must preserve preview fingerprints';
  select source_hash,observed_at into v_hash,v_seen from internal_proesc.cycle_review_cache where id=v_cache;
  update internal_proesc.cycle_review_cache set source_hash=repeat('0',64) where id=v_cache;
  assert not internal_proesc.has_confirmed_first_cycle_only(v_enrollment),'New API obligations must invalidate C1';
  update internal_proesc.cycle_review_cache set source_hash=v_hash,observed_at=now()-interval '6 minutes' where id=v_cache;
  assert internal_proesc.has_confirmed_first_cycle_only(v_enrollment),'Display must retain unchanged C1 beyond five minutes';
  assert not internal_proesc.api_cycle_schedule_is_fresh(v_enrollment),'Generation still requires a recent observation';
  begin
    perform internal_academic.technical_manual_cycle_preview(v_enrollment,2,current_date+30);
    raise exception 'Stale preview must be denied';
  exception when insufficient_privilege then null; end;
  -- Even a pre-existing GENERATING run cannot bypass freshness at INSERT.
  v_request:=gen_random_uuid();
  begin
    insert into internal_academic.technical_manual_cycle_runs(
      matricula_id,turma_id,cycle_number,state,request_id,rule_fingerprint,
      policy_fingerprint,schedule_fingerprint,first_due_date,item_count,
      expected_installment_count,total_amount,created_by)
    select v_enrollment,m.turma_id,2,'GENERATING',v_request,
      v_preview#>>'{preview,regraEfetivaFingerprint}',v_preview#>>'{preview,politicaFingerprint}',
      v_preview#>>'{preview,cronogramaFingerprint}',current_date+30,13,12,3458.80,auth.uid()
      from public.matriculas m where m.id=v_enrollment;
    perform set_config('app.technical_manual_cycle_request_id',v_request::text,true);
    v_item:=v_preview#>'{preview,itens,0}';
    insert into public.contas_receber(polo_id,descricao,valor,data_vencimento,status,categoria,
      cliente_id,matricula_id,turma_id,tipo_lancamento,parcela_numero,origem_cronograma_id,
      regra_financeira_tecnica_snapshot)
    select t.polo_id,v_item->>'descricao',(v_item->>'valor')::numeric,
      (v_item->>'vencimento')::date,'PENDENTE','MENSALIDADE',m.aluno_id,m.id,m.turma_id,
      v_item->>'tipo',0,v_item->>'chave',
      internal_academic.build_technical_receivable_policy_snapshot(m.id,v_item->>'tipo',
        v_item->>'descricao',(v_item->>'valor')::numeric,false)
      from public.matriculas m join public.turmas t on t.id=m.turma_id where m.id=v_enrollment;
    raise exception 'Stale insertion with GENERATING run must be denied';
  exception when insufficient_privilege then
    get stacked diagnostics v_message=message_text;
    assert v_message like '%consulta automática Proesc%', 'The new freshness trigger must reject the insert';
  end;
  update internal_proesc.cycle_review_cache set observed_at=v_seen where id=v_cache;
  assert internal_proesc.api_cycle_schedule_is_fresh(v_enrollment);
  -- The current academic state always wins over an earlier source review.
  foreach v_status in array array['TRANCADO','TRANSFERIDO'] loop
    select m.id into strict v_blocked_enrollment from public.matriculas m
      join internal_proesc.class_scopes s on s.turma_id=m.turma_id
      where s.phase='CONFIRMED' and m.status=v_status order by m.id limit 1;
    begin
      perform internal_proesc.assert_fresh_cycle_generation(v_blocked_enrollment);
      raise exception 'Inactive academic status must block generation';
    exception when insufficient_privilege then
      get stacked diagnostics v_message=message_text;
      assert v_message like '%situação acadêmica%';
    end;
  end loop;
  -- Freshness is checked on all 13 inserts, without the first insert invalidating C1.
  begin
    v_response:=public.gerar_ciclo_financeiro_tecnico_manual_secure(v_enrollment,2,current_date+30,
      gen_random_uuid(),v_preview#>>'{preview,regraEfetivaFingerprint}',
      v_preview#>>'{preview,politicaFingerprint}',v_preview#>>'{preview,cronogramaFingerprint}');
    assert v_response#>>'{ciclo,quantidadeItens}'='13';
    assert (select count(*)=13 from public.contas_receber where matricula_id=v_enrollment
      and origem_cronograma_id in(select item->>'chave' from jsonb_array_elements(v_preview#>'{preview,itens}') item));
    raise exception 'Roll back the local creation fixture' using errcode='Z9999';
  exception when sqlstate 'Z9999' then null; end;
  -- Worker retries continue the same round; a new credential starts a new round.
  v_targets:=public.proesc_cycle_review_batch_service('targets',v_actor,null);
  select sum(jsonb_array_length(g->'matriculaIds')) into v_total
    from jsonb_array_elements(v_targets->'groups') g;
  assert v_total=427,'The automatic round must include every confirmed enrollment';
  v_claim:=public.proesc_cycle_review_runtime_service('claim',v_actor);
  assert v_claim->'claimed'='true';
  update internal_proesc.cycle_review_runtime set completed_ids=array[v_enrollment] where id;
  perform public.proesc_cycle_review_runtime_service('finish',v_actor,
    jsonb_build_object('leaseId',v_claim->>'leaseId','success',false,'result',jsonb_build_object('reviewed',1)));
  v_targets:=public.proesc_cycle_review_batch_service('targets',v_actor,null);
  assert (select sum(jsonb_array_length(g->'matriculaIds'))=426 from jsonb_array_elements(v_targets->'groups') g);
  select revision into v_token_revision from internal_proesc.connection where id;
  update internal_proesc.connection set revision=gen_random_uuid() where id;
  v_claim:=public.proesc_cycle_review_runtime_service('claim',v_actor);
  assert v_claim->'claimed'='true';
  assert (select cardinality(completed_ids)=0 from internal_proesc.cycle_review_runtime where id),
    'Rotating the credential must not skip enrollments reviewed with the prior token';
  v_targets:=public.proesc_cycle_review_batch_service('targets',v_actor,null);
  assert (select sum(jsonb_array_length(g->'matriculaIds'))=427 from jsonb_array_elements(v_targets->'groups') g);
  -- A failed source refresh after rotation cannot label old source with the new token.
  v_begin:=public.proesc_cycle_review_cache_service('begin',v_actor,v_enrollment);
  assert v_begin->'cached'='false';
  perform public.proesc_cycle_review_cache_service('abort',v_actor,v_enrollment,
    jsonb_build_object('cacheId',v_cache,'lease',v_begin->>'lease'));
  assert not internal_proesc.api_cycle_schedule_is_fresh(v_enrollment);
  assert not internal_proesc.has_confirmed_first_cycle_only(v_enrollment);
  update internal_proesc.connection set revision=v_token_revision where id;
  update internal_proesc.cycle_review_cache set token_revision=v_token_revision,source_hash=v_hash,
    observed_at=v_seen,verified_observed_at=v_seen,state='COMPLETE' where id=v_cache;
  assert internal_proesc.api_cycle_schedule_is_fresh(v_enrollment);
  update internal_proesc.enrollment_cycle_evidence set obligation_manifest_hash=repeat('0',64) where matricula_id=v_enrollment;
  assert not internal_proesc.has_confirmed_first_cycle_only(v_enrollment),'Local manifest changes must invalidate C1';
  select md5(jsonb_agg(to_jsonb(c) order by c.id)::text) into v_after
    from public.contas_receber c where c.matricula_id=v_enrollment;
  assert v_before=v_after,'Review and preview must not change receivables, paid values or gateway identity';
  assert not has_function_privilege('authenticated',
    'public.proesc_record_api_cycle_review_service(uuid,uuid,uuid)','EXECUTE');
  assert not has_function_privilege('authenticated',
    'public.proesc_cycle_review_cache_service(text,uuid,uuid,jsonb)','EXECUTE');
end;
$integration_contract$;
select 'Automatic batch, durable resume, credential rotation, persistent C1, fresh preview and 13 inserts, academic blocks and preserved payments verified.' as result;
rollback;
