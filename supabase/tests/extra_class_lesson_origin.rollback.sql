-- Execute through MCP after applying the origin/chronology migrations.
-- Writes are rolled back; use a still-unlinked legacy activity as the fixture.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

do $test$
declare
  v_activity public.atividades_extra_classe%rowtype;
  v_linked public.atividades_extra_classe%rowtype;
  v_origin uuid;
  v_wrong_origin uuid;
  v_candidate record;
  v_actor uuid;
  v_credit jsonb;
  v_before_credit jsonb;
  v_before_answers jsonb;
  v_before_calls jsonb;
  v_metadata jsonb;
begin
  select activity.* into strict v_activity
  from public.atividades_extra_classe activity
  where activity.aula_origem_id is null and activity.status='PUBLICADA'
    and exists(select 1 from public.aulas_turma lesson
      where lesson.turma_id=activity.turma_id and lesson.disciplina_id=activity.disciplina_id)
  order by activity.prazo_entrega,activity.id limit 1;
  select lesson.id into strict v_origin from public.aulas_turma lesson
  where lesson.turma_id=v_activity.turma_id and lesson.disciplina_id=v_activity.disciplina_id
  order by lesson.data_aula,case lesson.sessao when 'M' then 1 when 'T' then 2 else 3 end,
    lesson.created_at,lesson.id limit 1;
  select lesson.id into strict v_wrong_origin from public.aulas_turma lesson
  where (lesson.turma_id,lesson.disciplina_id) <>
    (v_activity.turma_id,v_activity.disciplina_id)
  order by lesson.id limit 1;

  for v_candidate in select usuario.auth_user_id from public.usuarios_sistema usuario
    where upper(coalesce(usuario.status,''))='ATIVO' and usuario.auth_user_id is not null
    order by usuario.id
  loop
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub',v_candidate.auth_user_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object(
      'role','authenticated','sub',v_candidate.auth_user_id)::text,true);
    if public.can_operate_atividade_extra(v_activity.turma_id,v_activity.disciplina_id) then
      v_actor:=v_candidate.auth_user_id; exit;
    end if;
  end loop;
  assert v_actor is not null,'No authorized manager for the actual fixture';
  v_before_credit:=public.get_diario_extra_classe_credito(v_activity.turma_id,v_activity.disciplina_id);
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) into v_before_answers
    from public.atividade_extra_classe_respostas r where r.atividade_id=v_activity.id;
  select coalesce(jsonb_agg(to_jsonb(f) order by f.aula_id,f.aluno_id),'[]'::jsonb) into v_before_calls
    from public.diario_frequencia f where f.turma_id=v_activity.turma_id
      and f.disciplina_id=v_activity.disciplina_id;

  select result.* into strict v_linked from public.gerenciar_atividade_extra_classe(
    v_activity.id,'VINCULAR_ORIGEM',null,null,null,v_activity.updated_at,v_origin) result;
  assert v_linked.aula_origem_id=v_origin,'Dedicated action did not retain origin';
  v_metadata:=to_jsonb(v_linked)-array['aula_origem_id','updated_at','atualizado_por_auth_id'];
  assert v_metadata=to_jsonb(v_activity)-array['aula_origem_id','updated_at','atualizado_por_auth_id'],
    'Origin linking changed academic activity content';
  assert v_before_answers=(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb)
    from public.atividade_extra_classe_respostas r where r.atividade_id=v_activity.id),
    'Origin linking changed responses';
  assert v_before_calls=(select coalesce(jsonb_agg(to_jsonb(f) order by f.aula_id,f.aluno_id),'[]'::jsonb)
    from public.diario_frequencia f where f.turma_id=v_activity.turma_id
      and f.disciplina_id=v_activity.disciplina_id),'Origin linking changed classroom calls';
  v_credit:=public.get_diario_extra_classe_credito(v_activity.turma_id,v_activity.disciplina_id);
  assert v_credit->'contentOrder'=v_before_credit->'contentOrder','Linking changed chronology';
  assert v_credit->'eligibleActivityIdsByStudent'=v_before_credit->'eligibleActivityIdsByStudent',
    'Linking changed earned frequency credits';
  assert v_credit->'contentOrder'=internal_academic.diario_content_order(
    public.get_aulas_diario_agrupadas(v_activity.turma_id,v_activity.disciplina_id),
    v_credit->'activities'),'Diary order does not match canonical backend order';
  begin
    update public.atividades_extra_classe set aula_origem_id=v_wrong_origin where id=v_activity.id;
    raise exception 'Cross-context origin unexpectedly accepted';
  exception when foreign_key_violation then null; end;
  begin
    update public.atividades_extra_classe set aula_origem_id=null where id=v_activity.id;
    raise exception 'Clearing origin unexpectedly accepted';
  exception when check_violation then null; end;
  begin
    perform public.gerenciar_atividade_extra_classe(
      v_activity.id,'VINCULAR_ORIGEM',null,null,null,v_linked.updated_at,v_origin);
    raise exception 'Existing origin unexpectedly replaced';
  exception when check_violation then null; end;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.gerenciar_atividade_extra_classe(
      v_activity.id,'VINCULAR_ORIGEM',null,null,null,v_linked.updated_at,v_origin);
    raise exception 'Missing actor unexpectedly accepted';
  exception when insufficient_privilege then null; end;
  assert not has_function_privilege('anon',
    'public.gerenciar_atividade_extra_classe(uuid,text,text,date,numeric,timestamptz,uuid)','EXECUTE');
  assert not has_function_privilege('authenticated',
    'internal_academic.diario_content_order(jsonb,jsonb)','EXECUTE');
end;
$test$;
rollback;
select 'Origin RPC, context integrity, academic preservation and chronology passed; all writes rolled back.' as result;
