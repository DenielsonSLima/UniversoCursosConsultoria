-- MCP-only regression. No bank/Edge calls; every local effect is rolled back.
begin;
set local statement_timeout='30s';
set local lock_timeout='3s';
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);

do $test$
declare
  v_id uuid; v_request uuid:=gen_random_uuid(); v_preview jsonb; v_result jsonb;
  v_review jsonb:='{"emitirMatricula":false,"itens":[]}'::jsonb;
  v_due date:=timezone('America/Maceio',now())::date+7;
  v_row public.contas_receber%rowtype; v_altered public.contas_receber%rowtype;
  v_patch jsonb; v_actor uuid; v_candidate uuid;
begin
  select m.id into strict v_id from public.matriculas m
  where internal_academic.technical_local_cycle_eligible(m.id)
    and upper(m.status) in ('ATIVO','PENDENTE')
    and m.fluxo_operacional='IMPLANTACAO'
    and not exists(select 1 from internal_academic.technical_manual_cycle_runs r where r.matricula_id=m.id)
    and not exists(select 1 from internal_academic.technical_manual_cycle_policies p where p.turma_id=m.turma_id and p.active)
    and exists(select 1 from public.matriculas_tecnicas_financeiro_config c where c.matricula_id=m.id)
  order by m.data_matricula desc limit 1;
  v_preview:=public.preview_ciclo_financeiro_tecnico_manual_secure(v_id,1,v_due,v_review)->'preview';
  v_result:=public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(
    v_id,1,v_due,v_request,v_preview->>'regraEfetivaFingerprint',
    v_preview->>'politicaFingerprint',v_preview->>'cronogramaFingerprint',v_review);
  select * into strict v_row from public.contas_receber
  where matricula_id=v_id order by parcela_numero limit 1;
  perform internal_academic.assert_manual_cycle_reviewed_receivable(v_row);
  perform internal_academic.technical_manual_banese_expected_terms(v_row);

  -- Each reviewed identity field is checked independently at the terms boundary.
  for v_patch in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('data_vencimento',v_row.data_vencimento+5),
    jsonb_build_object('origem_cronograma_id','ciclo-1-parc-2'),
    jsonb_build_object('parcela_numero',2),
    jsonb_build_object('valor',v_row.valor+1),
    jsonb_build_object('tipo_lancamento','MATRICULA'),
    jsonb_build_object('cliente_id',gen_random_uuid()),
    jsonb_build_object('turma_id',gen_random_uuid()),
    jsonb_build_object('polo_id',gen_random_uuid()),
    jsonb_build_object('matricula_id',gen_random_uuid()),
    jsonb_build_object('regra_financeira_tecnica_snapshot',jsonb_set(
      v_row.regra_financeira_tecnica_snapshot,'{cicloManual,cronogramaFingerprint}',to_jsonb(repeat('0',64))))
  )) loop
    v_altered:=jsonb_populate_record(v_row,v_patch);
    begin
      perform internal_academic.assert_manual_cycle_reviewed_receivable(v_altered);
      raise exception 'Reviewed item divergence accepted' using errcode='P0001';
    exception when check_violation then null;
    end;
    begin
      perform internal_academic.technical_manual_banese_expected_terms(v_altered);
      raise exception 'Adapter accepted reviewed item divergence' using errcode='P0001';
    exception when check_violation then null;
    end;
  end loop;

  for v_candidate in select distinct u.auth_user_id from public.usuarios_sistema u
    join internal_academic.technical_manual_receivable_issuance_authorizations a on a.authorized_by=u.auth_user_id
    where public.is_active_status(u.status)
  loop
    perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_candidate)::text,true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    if public.gestor_has_financeiro_tab('receber') and public.is_gestor_for_polo(v_row.polo_id) then
      v_actor:=v_candidate; exit;
    end if;
  end loop;
  if v_actor is null then raise exception 'Financial actor fixture unavailable'; end if;

  -- Regression: an authorized direct RLS update used to change a reviewed due
  -- date while retaining the original schedule fingerprint.
  begin
    execute 'set local role authenticated';
    update public.contas_receber set data_vencimento=data_vencimento+5 where id=v_row.id;
    raise exception 'Authenticated due drift accepted' using errcode='P0001';
  exception when check_violation then
    if sqlerrm<>'A identidade e o vencimento revisados do ciclo manual são imutáveis.' then raise; end if;
  end;
  execute 'reset role';
  begin
    update public.contas_receber set origem_cronograma_id='ciclo-1-parc-2',parcela_numero=2 where id=v_row.id;
    raise exception 'Reviewed item swap accepted' using errcode='P0001';
  exception when check_violation then null;
  end;
  begin
    update public.contas_receber set cliente_id=gen_random_uuid() where id=v_row.id;
    raise exception 'Reviewed person drift accepted' using errcode='P0001';
  exception when check_violation then null;
  end;

  -- The reviewed run itself cannot be changed after local creation.
  begin
    update internal_academic.technical_manual_cycle_runs
      set reviewed_items=jsonb_set(reviewed_items,'{0,vencimento}',to_jsonb((v_row.data_vencimento+5)::text))
      where matricula_id=v_id and cycle_number=1;
    raise exception 'Stored review mutation accepted' using errcode='P0001';
  exception when check_violation then null;
  end;
  perform public.authorize_technical_manual_receivable_issuance_secure(v_row.id,gen_random_uuid());
  perform public.technical_manual_banese_expected_terms_service(v_row.id);
  if exists(select 1 from public.contas_receber where matricula_id=v_id
    and (gateway_creation_token is not null or gateway_payment_id is not null)) then
    raise exception 'Test started a bank attempt';
  end if;

  -- A legacy run without a review is deliberately outside this new validator.
  select r.* into strict v_row from public.contas_receber r
    join internal_academic.technical_manual_cycle_runs run on r.id=any(run.receivable_ids)
    where run.state='LOCAL_CREATED' and run.reviewed_items is null limit 1;
  v_altered:=jsonb_populate_record(v_row,jsonb_build_object('data_vencimento',v_row.data_vencimento+5));
  perform internal_academic.assert_manual_cycle_reviewed_receivable(v_altered);
end;
$test$;
rollback;
