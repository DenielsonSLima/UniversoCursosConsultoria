-- Real admission, LOCAL fee, audited payment and transfer RPCs; always rollback.
-- No Edge call, bank POST/PUT, bank identity or bank transaction is fabricated.
begin;
set local statement_timeout='60s';
set local lock_timeout='3s';
set local plpgsql.check_asserts='on';
do $test$
declare v_class uuid; v_course uuid; v_student uuid; v_actor uuid; v_system_actor uuid;
  v_candidate uuid; v_email text; v_polo uuid; v_enrollment uuid; v_iteration integer;
  v_preview jsonb; v_plan jsonb; v_result jsonb; v_review jsonb; v_cycle jsonb;
  v_fee public.contas_receber%rowtype; v_lease uuid; v_settlement uuid; v_account uuid;
  v_snapshot jsonb; v_movement uuid; v_day date:=timezone('America/Maceio',now())::date; v_due date;
begin
  select t.id,t.curso_id,t.polo_id into strict v_class,v_course,v_polo from internal_proesc.class_scopes s
    join public.turmas t on t.id=s.turma_id
    where s.batch_id is not null and s.phase='CONFIRMED' and t.status='EM_ANDAMENTO' limit 1;
  select p.id into strict v_student from public.parceiros p where p.tipo='Aluno'
    and not internal_academic.transfer_entry_person_has_history(p.id)
    and not exists(select 1 from public.matriculas m join public.turmas t on t.id=m.turma_id
      where m.aluno_id=p.id and t.curso_id=v_course) limit 1;
  for v_candidate,v_email in select auth_user_id,email from public.usuarios_sistema
    where auth_user_id is not null and public.is_active_status(status) loop
    perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_candidate,'email',v_email)::text,true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    begin
      perform internal_academic.assert_transfer_entry_access(v_student,v_class);
      perform internal_academic.resolve_responsavel(null);
      if public.gestor_has_module('financeiro') then v_actor:=v_candidate; exit; end if;
    exception when insufficient_privilege then null; end;
  end loop;
  assert v_actor is not null,'Authorized actor fixture unavailable';
  select id into strict v_system_actor from public.usuarios_sistema where auth_user_id=v_actor limit 1;
  select id into strict v_account from public.contas_bancarias
    where ativo and (polo_id=v_polo or polo_id is null) order by polo_id nulls last limit 1;
  for v_iteration in 1..3 loop
    begin
      v_due:=case when v_iteration=3 then v_day else v_day+7 end;
      v_plan:=jsonb_build_object('cicloNumero',1,'quantidadeParcelas',1,'primeiroVencimento',v_due);
      execute 'set local role authenticated';
      v_preview:=public.preview_recebimento_transferencia_tecnica_secure(v_student,v_class,v_plan);
      v_result:=public.receber_transferencia_tecnica_planejada_secure(gen_random_uuid(),v_student,v_class,
        'Instituição sintética',null,'Teste transacional LOCAL e saída',null,v_day,'[]',v_plan,v_preview->>'regraFingerprint');
      execute 'reset role';
      v_enrollment:=(v_result->>'matriculaId')::uuid;
      v_cycle:=public.preview_ciclo_financeiro_tecnico_manual_secure(v_enrollment,1,v_due,null)->'preview';
      select jsonb_build_object('modoMatricula','REGISTRO_SEM_BOLETO','emitirMatricula',false,
        'itens',jsonb_agg(jsonb_build_object('chave',i->>'chave',
          'valor',case when i->>'tipo'='MATRICULA' then '125.50' else '270.00' end,
          'vencimento',i->>'vencimento','descontoPontualidade','0.00',
          'jurosAtrasoPercentual','0.00','multaAtrasoPercentual','0.00') order by n))
        into v_review from jsonb_array_elements(v_cycle->'itens') with ordinality a(i,n);
      v_cycle:=public.preview_ciclo_financeiro_tecnico_manual_secure(v_enrollment,1,v_due,v_review)->'preview';
      execute 'set local role authenticated';
      perform public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(v_enrollment,1,v_due,gen_random_uuid(),
        v_cycle->>'regraEfetivaFingerprint',v_cycle->>'politicaFingerprint',v_cycle->>'cronogramaFingerprint',v_review);
      execute 'reset role';
      select * into strict v_fee from public.contas_receber where matricula_id=v_enrollment and tipo_lancamento='MATRICULA';
      assert internal_academic.manual_cycle_local_receivable_complete(v_fee);
      if v_iteration>1 then
        perform set_config('request.jwt.claims',jsonb_build_object('role','service_role','sub',v_actor,'email',v_email)::text,true);
        perform set_config('request.jwt.claim.role','service_role',true);
        v_lease:=gen_random_uuid();
        v_snapshot:=jsonb_build_object('status',v_fee.status,'valor_cents',12550,'polo_id',v_polo,
          'gateway_provider',null,'gateway_environment',null,'gateway_payment_method',null,'gateway_payment_id',null,
          'gateway_payment_link_id',null,'gateway_boleto_nosso_numero',null,'gateway_status',null,
          'asaas_payment_id',null,'asaas_payment_link_id',null,'asaas_status',null,'manual_settlement_context','STANDARD');
        insert into public.receivable_manual_settlements(idempotency_key,request_fingerprint,receivable_id,
          actor_id,polo_id,account_id,payment_date,payment_method,principal_cents,interest_cents,
          penalty_cents,discount_cents,received_cents,receivable_snapshot,state,lease_token,lease_expires_at)
          values(gen_random_uuid(),repeat('a',64),v_fee.id,v_system_actor,v_polo,v_account,v_day,'DINHEIRO',
            12550,0,0,0,12550,v_snapshot,'REMOTE_CANCELED_LOCAL_PENDING',v_lease,clock_timestamp()+interval '3 minutes')
          returning id into v_settlement;
        perform public.finalize_receivable_manual_settlement(v_settlement,v_lease);
        select * into strict v_fee from public.contas_receber where id=v_fee.id;
        assert v_fee.status='PAGO' and internal_academic.manual_cycle_local_receivable_complete(v_fee);
        perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_actor,'email',v_email)::text,true);
        perform set_config('request.jwt.claim.role','authenticated',true);
      end if;
      execute 'set local role authenticated';
      v_preview:=public.preview_transferencia_financeira(v_enrollment,'EXTERNA_ENVIADA',v_day,null);
      v_result:=public.transferir_matricula_com_revisao_financeira(gen_random_uuid(),v_preview->>'fingerprint',
        v_enrollment,'EXTERNA_ENVIADA','Teste transacional da saída LOCAL',v_day,null,'Instituição sintética',null);
      execute 'reset role';
      v_movement:=internal_academic.current_external_transfer_movement(v_enrollment);
      assert v_movement is not null;
      select * into strict v_fee from public.contas_receber where id=v_fee.id;
      if v_iteration=1 then
        assert v_fee.status='CANCELADO','Future LOCAL is canceled without a bank action';
        assert internal_academic.technical_manual_cycle_state(v_enrollment)->'matriculaLocal'='null'::jsonb,
          'Canceled LOCAL must not break the list parser';
        execute 'set local role service_role';
        v_result:=public.cancel_terminal_local_receivable(v_fee.id,v_movement);
        execute 'reset role';
        assert v_result->>'canceled'='true' and v_result->>'alreadyCanceled'='true';
        -- An isolated subsequent current internal movement must invalidate the old exit.
        insert into public.matricula_movimentacoes(matricula_id,aluno_id,tipo,status_anterior,status_novo,
          turma_origem_id,motivo,data_movimentacao,responsavel_id,created_at)
          values(v_enrollment,v_student,'TRANSFERENCIA_INTERNA','ATIVO','TRANSFERIDO',v_class,
            'Cenário sintético de movimento posterior',v_day,v_system_actor,clock_timestamp());
        update public.contas_receber set status='PENDENTE' where id=v_fee.id;
        assert internal_academic.current_external_transfer_movement(v_enrollment) is null;
        execute 'set local role service_role';
        begin
          perform public.cancel_terminal_local_receivable(v_fee.id,v_movement);
          raise exception 'Old external movement falsely confirmed cancellation' using errcode='P0001';
        exception when serialization_failure then null; end;
        execute 'reset role';
        assert (select status='PENDENTE' from public.contas_receber where id=v_fee.id);
      elsif v_iteration=2 then
        assert v_fee.status='PAGO','Transfer preserves a paid future fee';
        execute 'set local role authenticated';
        begin
          perform public.estornar_matricula_local_sem_boleto_secure(v_fee.id,v_settlement,'Teste após saída');
          raise exception 'A future obligation was reopened after exit' using errcode='P0001';
        exception when check_violation then null; end;
        execute 'reset role';
        assert (select status='PAGO' from public.contas_receber where id=v_fee.id);
        assert (select state='COMPLETED' and reversed_at is null from public.receivable_manual_settlements where id=v_settlement);
      else
        execute 'set local role authenticated';
        v_result:=public.estornar_matricula_local_sem_boleto_secure(v_fee.id,v_settlement,'Teste no dia da saída');
        execute 'reset role';
        assert v_result->>'success'='true','Same-day paid fee retains normal audited reversal';
        assert (select status='PENDENTE' from public.contas_receber where id=v_fee.id);
        assert (select state='REVERSED' from public.receivable_manual_settlements where id=v_settlement);
      end if;
      assert not exists(select 1 from public.payment_gateway_transactions
        where receivable_id in(select id from public.contas_receber where matricula_id=v_enrollment));
      raise exception 'ROLLBACK_FIXTURE' using errcode='ZX001';
    exception when sqlstate 'ZX001' then null; end;
  end loop;
end;
$test$;
rollback;
