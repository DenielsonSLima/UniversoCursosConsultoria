-- Real authenticated admission/prelink + local-only cycle creation, always rolled back.
-- No Edge, gateway operation, payment or real transfer is committed.
begin;
set local statement_timeout='60s';
set local lock_timeout='3s';
set local plpgsql.check_asserts='on';
do $test$
declare
  v_actor uuid; v_candidate record; v_student uuid; v_class uuid; v_course uuid;
  v_preview jsonb; v_result jsonb; v_replay jsonb; v_rule jsonb; v_plan jsonb;
  v_review jsonb; v_cycle_preview jsonb; v_state jsonb; v_response jsonb;
  v_request uuid; v_enrollment uuid; v_cycle integer; v_rejected boolean;
  v_emission_request uuid; v_receivable uuid;
  v_today date:=timezone('America/Maceio',now())::date;
begin
  select t.id,t.curso_id into strict v_class,v_course from internal_proesc.class_scopes s
    join public.turmas t on t.id=s.turma_id
    where s.batch_id is not null and s.phase='CONFIRMED' and t.status='EM_ANDAMENTO' limit 1;
  select p.id into strict v_student from public.parceiros p where p.tipo='Aluno'
    and not internal_academic.transfer_entry_person_has_history(p.id)
    and not exists(select 1 from public.matriculas m join public.turmas t on t.id=m.turma_id
      where m.aluno_id=p.id and t.curso_id=v_course) limit 1;
  for v_candidate in select auth_user_id,email from public.usuarios_sistema
    where auth_user_id is not null and public.is_active_status(status) loop
    perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_candidate.auth_user_id,'email',v_candidate.email)::text,true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    begin
      perform internal_academic.assert_transfer_entry_access(v_student,v_class);
      perform internal_academic.resolve_responsavel(null);
      v_actor:=v_candidate.auth_user_id; exit;
    exception when insufficient_privilege then null; end;
  end loop;
  assert v_actor is not null,'Authorized fixture unavailable';
  v_rule:=internal_academic.technical_financial_rule(v_class);

  begin
    execute 'set local role authenticated';
    begin
      perform internal_academic.authorize_regular_technical_admission(gen_random_uuid(),v_student,v_class,'PENDENTE');
      raise exception 'Private admission helper is callable' using errcode='P0001';
    exception when insufficient_privilege then null; end;
    v_result:=public.pre_vincular_aluno_tecnico_secure(v_class,v_student,gen_random_uuid(),v_today+7,
      (v_rule->>'revisao')::integer,v_rule->>'fingerprint');
    execute 'reset role';
    assert v_result->>'cobrancaGerada'='false','Prelink cannot create a debt';
    assert exists(select 1 from public.matriculas where aluno_id=v_student and turma_id=v_class
      and status='PENDENTE' and fluxo_operacional='REGULAR');
    assert not exists(select 1 from internal_academic.regular_technical_admission_claims
      where transaction_id=txid_current()),'Admission claim must be consumed';
    raise exception 'ROLLBACK_FIXTURE' using errcode='ZX001';
  exception when sqlstate 'ZX001' then null; end;

  for v_cycle in 1..2 loop
    begin
      v_request:=gen_random_uuid();
      v_plan:=jsonb_build_object('cicloNumero',v_cycle,'quantidadeParcelas',5,'primeiroVencimento',v_today+7,
        'justificativaCiclo2',case when v_cycle=2 then 'Ingresso no segundo ciclo nesta instituição' end);
      execute 'set local role authenticated';
      v_preview:=public.preview_recebimento_transferencia_tecnica_secure(v_student,v_class,v_plan);
      v_result:=public.receber_transferencia_tecnica_planejada_secure(v_request,v_student,v_class,
        'Instituição de teste',null,'Transferência de teste transacional',null,v_today,'[]',v_plan,
        v_preview->>'regraFingerprint');
      v_replay:=public.receber_transferencia_tecnica_planejada_secure(v_request,v_student,v_class,
        'Instituição de teste',null,'Transferência de teste transacional',null,v_today,'[]',v_plan,
        v_preview->>'regraFingerprint');
      execute 'reset role';
      v_enrollment:=(v_result->>'matriculaId')::uuid;
      assert v_result->>'cobrancaGerada'='false' and v_replay->>'replayed'='true';
      assert v_result->>'matriculaId'=v_replay->>'matriculaId';
      assert (select count(*)=1 from public.transferencias_academicas where matricula_destino_id=v_enrollment);
      assert not exists(select 1 from public.contas_receber where matricula_id=v_enrollment);
      assert not exists(select 1 from internal_academic.technical_external_cycle_coverage where matricula_id=v_enrollment);
      assert not exists(select 1 from internal_proesc.enrollment_sources where matricula_id=v_enrollment);
      v_state:=internal_academic.technical_manual_cycle_state(v_enrollment);
      assert v_state->>'criterioElegibilidade'='TRANSFERENCIA_PLANEJADA'
        and v_state->>'cicloBaseHistorico'='0' and (v_state->>'proximoCicloNumero')::integer=v_cycle;
      v_cycle_preview:=public.preview_ciclo_financeiro_tecnico_manual_secure(v_enrollment,v_cycle,null,null)->'preview';
      assert (select count(*)=5 from jsonb_array_elements(v_cycle_preview->'itens') i where i->>'tipo'='PARCELA');
      assert v_cycle_preview->>'primeiroVencimento'=(v_today+7)::text;
      select jsonb_build_object('emitirMatricula',true,'itens',jsonb_agg(jsonb_build_object(
        'chave',i->>'chave','valor','200.00','vencimento',i->>'vencimento',
        'descontoPontualidade','0.00','jurosAtrasoPercentual','0.00','multaAtrasoPercentual','0.00') order by n))
        into v_review from jsonb_array_elements(v_cycle_preview->'itens') with ordinality a(i,n);
      v_response:=public.preview_ciclo_financeiro_tecnico_manual_secure(v_enrollment,v_cycle,null,
        jsonb_set(v_review,'{itens}',(v_review->'itens')-0));
      assert (select count(*)=5 from jsonb_array_elements(v_response#>'{preview,itens}') i where i->>'tipo'='PARCELA'),
        'A partial review cannot remove a canonical installment';
      begin
        perform public.preview_ciclo_financeiro_tecnico_manual_secure(v_enrollment,v_cycle,null,
          jsonb_set(v_review,'{itens}',(v_review->'itens')||jsonb_build_array((v_review#>'{itens,0}')||'{"chave":"extra"}'::jsonb)));
        raise exception 'Unknown extra item was accepted' using errcode='P0001';
      exception when invalid_parameter_value then null; end;
      v_cycle_preview:=public.preview_ciclo_financeiro_tecnico_manual_secure(v_enrollment,v_cycle,null,v_review)->'preview';
      v_emission_request:=gen_random_uuid();
      execute 'set local role authenticated';
      v_response:=public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(v_enrollment,v_cycle,null,v_emission_request,
        v_cycle_preview->>'regraEfetivaFingerprint',v_cycle_preview->>'politicaFingerprint',
        v_cycle_preview->>'cronogramaFingerprint',v_review);
      v_replay:=public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(v_enrollment,v_cycle,null,v_emission_request,
        v_cycle_preview->>'regraEfetivaFingerprint',v_cycle_preview->>'politicaFingerprint',
        v_cycle_preview->>'cronogramaFingerprint',v_review);
      execute 'reset role';
      assert v_replay->>'replayed'='true','Replay preserves the partial run and its frozen fingerprints';
      select id into strict v_receivable from public.contas_receber where matricula_id=v_enrollment
        and tipo_lancamento='PARCELA' order by parcela_numero limit 1;
      execute 'set local role authenticated';
      perform public.authorize_technical_manual_receivable_issuance_secure(v_receivable,gen_random_uuid());
      execute 'reset role';
      assert (select count(*)=5 from public.contas_receber where matricula_id=v_enrollment and tipo_lancamento='PARCELA');
      assert internal_academic.technical_financial_effective_rule(v_enrollment)#>>'{cobranca,mensalidade,quantidade}'='12',
        'Partial count must not shrink the subsequent cycle';
      assert not exists(select 1 from public.contas_receber where matricula_id=v_enrollment
        and (gateway_payment_id is not null or asaas_payment_id is not null));
      if v_cycle=2 then
        assert not exists(select 1 from internal_academic.technical_manual_cycle_runs
          where matricula_id=v_enrollment and cycle_number=1),'Entry C2 must never forge C1';
        assert internal_academic.technical_manual_cycle_state(v_enrollment)->>'proximoCicloNumero' is null;
      end if;
      perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
      begin
        perform public.receber_transferencia_tecnica_planejada_secure(v_request,v_student,v_class,
          'Instituição de teste',null,'Transferência de teste transacional',null,v_today,'[]',v_plan,
          v_preview->>'regraFingerprint');
        raise exception 'Replay skipped authorization' using errcode='P0001';
      exception when insufficient_privilege then null; end;
      raise exception 'ROLLBACK_FIXTURE' using errcode='ZX001';
    exception when sqlstate 'ZX001' then null; end;
  end loop;
end;
$test$;
rollback;
