-- Exercise the real RPC and its complete trigger chain, with no bank/Edge call.
-- The two transfers, claims, outbox entries and status changes are rolled back.
begin;
set local statement_timeout='60s';
set local lock_timeout='3s';
set local plpgsql.check_asserts='on';
do $test$
declare v_source uuid; v_target_class uuid; v_target uuid; v_candidate uuid; v_actor uuid; v_email text; v_jobs integer;
  v_day date:=timezone('America/Maceio',now())::date;
  v_preview jsonb; v_result jsonb; v_replay jsonb; v_snapshot jsonb; v_after jsonb;
  v_request uuid; v_type text; v_movement uuid;
begin
  select m.id,t.id into strict v_source,v_target_class from public.matriculas m
    join public.turmas source_class on source_class.id=m.turma_id
    join public.cursos source_course on source_course.id=source_class.curso_id
    join public.turmas t on t.id<>m.turma_id and t.status='EM_ANDAMENTO'
    join public.cursos target_course on target_course.id=t.curso_id
    where m.status='ATIVO' and upper(source_course.modalidade) in ('TECNICO','TÉCNICO')
      and upper(target_course.modalidade) in ('TECNICO','TÉCNICO')
      and not exists(select 1 from public.matriculas target where target.aluno_id=m.aluno_id and target.turma_id=t.id)
      and exists(select 1 from internal_proesc.obligation_links l where l.matricula_id=m.id)
      and not exists(select 1 from public.contas_receber r where r.matricula_id=m.id
        and not exists(select 1 from internal_proesc.obligation_links l where l.receivable_id=r.id))
    order by m.id,t.id limit 1;
  for v_candidate,v_email in select auth_user_id,email from public.usuarios_sistema
    where auth_user_id is not null and public.is_active_status(status) loop
    perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_candidate,'email',v_email)::text,true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    begin
      perform internal_academic.assert_transfer_financial_access(v_source,v_target_class);
      v_actor:=v_candidate; exit;
    exception when insufficient_privilege then null; end;
  end loop;
  assert v_actor is not null,'Financial actor fixture unavailable';
  select jsonb_agg(to_jsonb(r) order by r.id) into v_snapshot from public.contas_receber r where r.matricula_id=v_source;
  select count(*) into v_jobs from public.banese_cancellation_outbox where matricula_id=v_source;
  foreach v_type in array array['EXTERNA_ENVIADA','INTERNA_TURMA'] loop
    begin
      v_request:=gen_random_uuid();
      execute 'set local role authenticated';
      begin
        perform public.transferir_matricula_academica(v_source,v_type,'Unreviewed transfer',
          case when v_type='INTERNA_TURMA' then v_target_class end,'Test institution',null,v_day,null);
        raise exception 'Legacy RPC bypassed financial review' using errcode='P0001';
      exception when insufficient_privilege then null; end;
      v_preview:=public.preview_transferencia_financeira(v_source,v_type,v_day,
        case when v_type='INTERNA_TURMA' then v_target_class end);
      begin
        perform public.transferir_matricula_com_revisao_financeira(v_request,repeat('0',64),v_source,v_type,
          'Rollback financial transfer',v_day,case when v_type='INTERNA_TURMA' then v_target_class end,
          case when v_type='EXTERNA_ENVIADA' then 'Test institution' end,null);
        raise exception 'Stale preview was accepted' using errcode='P0001';
      exception when serialization_failure then null; end;
      v_result:=public.transferir_matricula_com_revisao_financeira(v_request,v_preview->>'fingerprint',v_source,v_type,
        'Rollback financial transfer',v_day,case when v_type='INTERNA_TURMA' then v_target_class end,
        case when v_type='EXTERNA_ENVIADA' then 'Test institution' end,null);
      v_replay:=public.transferir_matricula_com_revisao_financeira(v_request,v_preview->>'fingerprint',v_source,v_type,
        'Rollback financial transfer',v_day,case when v_type='INTERNA_TURMA' then v_target_class end,
        case when v_type='EXTERNA_ENVIADA' then 'Test institution' end,null);
      execute 'reset role';
      assert v_result->>'academicoConcluido'='true' and v_replay->>'replayed'='true';
      assert v_replay->>'transferenciaId'=v_result->>'transferenciaId';
      select jsonb_agg(to_jsonb(r) order by r.id) into v_after from public.contas_receber r where r.matricula_id=v_source;
      assert v_after=v_snapshot,'Imported identity, states and payments must remain unchanged';
      if v_type='INTERNA_TURMA' then
        v_target:=(v_result->>'matriculaDestinoId')::uuid;
        assert internal_academic.transfer_financial_origin(v_target)=v_source;
        assert not internal_academic.transfer_source_cycle_one_complete(v_target),'Imported source cannot prove a new C1';
        assert internal_academic.technical_manual_cycle_state(v_target)->>'podeGerar'='false';
        assert internal_academic.current_external_transfer_movement(v_source) is null;
        assert not exists(select 1 from public.contas_receber where matricula_id=v_target);
        assert (select count(*) from public.banese_cancellation_outbox where matricula_id=v_source)=v_jobs;
      else
        v_movement:=internal_academic.current_external_transfer_movement(v_source);
        assert v_movement is not null;
        assert not exists(select 1 from public.banese_cancellation_outbox q join public.contas_receber r on r.id=q.receivable_id
          where q.movement_id=v_movement and r.data_vencimento<=v_day);
        assert (select count(*) from internal_academic.transfer_financial_reviews where movement_id=v_movement)=
          (select count(*) from jsonb_array_elements(v_preview->'itens') i where i->>'acao'='REVISAO_EXTERNA');
      end if;
      perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
      begin
        perform public.transferir_matricula_com_revisao_financeira(v_request,v_preview->>'fingerprint',v_source,v_type,
          'Rollback financial transfer',v_day,case when v_type='INTERNA_TURMA' then v_target_class end,
          case when v_type='EXTERNA_ENVIADA' then 'Test institution' end,null);
        raise exception 'Replay skipped authorization' using errcode='P0001';
      exception when insufficient_privilege then null; end;
      raise exception 'ROLLBACK_FIXTURE' using errcode='ZX001';
    exception when sqlstate 'ZX001' then null; end;
  end loop;
end;
$test$;
rollback;
