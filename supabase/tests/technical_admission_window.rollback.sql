-- Canonical entrypoints and synthetic records only; no gateway, payment or commit.
begin;
set local statement_timeout='60s';
set local lock_timeout='3s';
set local plpgsql.check_asserts='on';
create function pg_temp.admission_cpf()
returns text language plpgsql as $function$
declare v_digits text:=lpad(floor(random()*999999999)::bigint::text,9,'0');
  v_sum integer; v_check integer; v_length integer; v_i integer;
begin
  for v_length in 9..10 loop
    v_sum:=0;
    for v_i in 1..v_length loop
      v_sum:=v_sum+substring(v_digits,v_i,1)::integer*(v_length+2-v_i);
    end loop;
    v_check:=(v_sum*10)%11;
    v_digits:=v_digits||case when v_check=10 then 0 else v_check end::text;
  end loop;
  return v_digits;
end;
$function$;
do $test$
declare
  v_actor uuid; v_candidate record; v_claims text; v_polo uuid; v_course uuid; v_empty_course uuid;
  v_class uuid:=gen_random_uuid(); v_late uuid:=gen_random_uuid(); v_missing uuid:=gen_random_uuid();
  v_future uuid:=gen_random_uuid(); v_student uuid:=gen_random_uuid(); v_other uuid:=gen_random_uuid();
  v_unscoped uuid:=gen_random_uuid(); v_unscoped_email text:=gen_random_uuid()::text||'@example.invalid';
  v_today date:=timezone('America/Maceio',now())::date; v_policy jsonb; v_rule jsonb;
  v_result jsonb; v_replay jsonb; v_preview jsonb; v_plan jsonb:='{"versao":3,"itens":[]}';
  v_request uuid:=gen_random_uuid(); v_enrollment uuid; v_new uuid; v_transfer jsonb;
  v_reason text; v_row record;
begin
  select t.polo_id,t.curso_id into strict v_polo,v_course from public.turmas t
    join public.cursos c on c.id=t.curso_id where c.modalidade='TECNICO' limit 1;
  select id into strict v_empty_course from public.cursos c where c.modalidade='TECNICO'
    and not exists(select 1 from public.modulos m where m.curso_id=c.id) limit 1;
  insert into public.turmas(id,codigo,nome,curso_id,polo_id,turno,status,data_inicio,data_previsao_termino,
    valor_matricula,valor_rematricula,qtd_parcelas,valor_parcela,primeiro_vencimento_padrao,
    publicar_no_site,permitir_inscricoes_online)
  values
    (v_class,'TEST-'||v_class,'Turma sintética dia365',v_course,v_polo,'INTEGRAL','PLANEJADA',v_today-365,v_today+730,100,75,12,250,v_today+7,true,true),
    (v_late,'TEST-'||v_late,'Turma sintética dia366',v_course,v_polo,'INTEGRAL','PLANEJADA',v_today-366,v_today+730,100,75,12,250,v_today+7,true,true),
    (v_missing,'TEST-'||v_missing,'Turma sintética sem início',v_empty_course,v_polo,'INTEGRAL','PLANEJADA',null,v_today+730,100,75,12,250,v_today+7,true,true),
    (v_future,'TEST-'||v_future,'Turma sintética futura',v_course,v_polo,'INTEGRAL','PLANEJADA',v_today+7,v_today+730,100,75,12,250,v_today+7,true,true);
  insert into public.parceiros(id,tipo,nome,cpf_cnpj,polo_id,nome_mae,nome_pai,
    endereco,cep,bairro,cidade,uf,situacao_ensino_medio,escola_ensino_medio,ano_conclusao_ensino_medio)
  values(v_student,'Aluno','ALUNO SINTETICO JANELA365',pg_temp.admission_cpf(),v_polo,
    'MAE SINTETICA','PAI SINTETICO','RUA DE TESTE','49000000','CENTRO','ARACAJU','SE','CONCLUIDO','ESCOLA SINTETICA',2025),
    (v_other,'Aluno','OUTRO ALUNO SINTETICO JANELA365',pg_temp.admission_cpf(),v_polo,
    'MAE SINTETICA','PAI SINTETICO','RUA DE TESTE','49000000','CENTRO','ARACAJU','SE','CONCLUIDO','ESCOLA SINTETICA',2025);
  for v_candidate in select auth_user_id,email from public.usuarios_sistema
    where auth_user_id is not null and public.is_active_status(status) loop
    perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
      'sub',v_candidate.auth_user_id,'email',v_candidate.email)::text,true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    begin
      if not (public.can_operate_turma_academics(v_class)
        and public.gestor_has_tab('gestao','alunos') and public.gestor_has_tab('gestao','financeiro')
        and public.gestor_has_financeiro_tab('receber')) then continue; end if;
      perform internal_academic.resolve_responsavel(null);
      v_actor:=v_candidate.auth_user_id; exit;
    exception when insufficient_privilege then null; end;
  end loop;
  assert v_actor is not null,'Authorized synthetic fixture unavailable';
  v_claims:=current_setting('request.jwt.claims');
  v_policy:=internal_academic.technical_class_admission_policy(v_class);
  assert v_policy->>'matriculaDiretaPermitida'='true' and v_policy->>'diasDesdeInicio'='365';
  assert v_policy->>'dataLimiteMatriculaDireta'=v_today::text;
  assert internal_academic.technical_class_admission_policy(v_class,v_today-1)->>'matriculaDiretaPermitida'='true';
  assert internal_academic.technical_class_admission_policy(v_class,v_today+1)->>'motivo'='PRAZO_EXPIRADO';
  -- The limit is elapsed calendar days, including leap years, never twelve months.
  update public.turmas set data_inicio='2024-02-29' where id=v_class;
  v_policy:=internal_academic.technical_class_admission_policy(v_class,'2025-02-28');
  assert v_policy->>'diasDesdeInicio'='365' and v_policy->>'matriculaDiretaPermitida'='true';
  assert internal_academic.technical_class_admission_policy(v_class,'2025-03-01')->>'motivo'='PRAZO_EXPIRADO';
  update public.turmas set data_inicio=v_today-365 where id=v_class;
  v_policy:=internal_academic.technical_class_admission_policy(v_class);
  assert internal_academic.technical_class_admission_policy(v_late)->>'motivo'='PRAZO_EXPIRADO';
  assert internal_academic.technical_class_admission_policy(v_missing)->>'motivo'='DATA_INICIO_AUSENTE';
  assert internal_academic.technical_class_admission_policy(v_future)->>'diasDesdeInicio'='-7';
  assert not has_function_privilege('anon','public.get_turma_tecnica_ingresso_secure(uuid)','EXECUTE');
  assert not has_function_privilege('service_role','internal_academic.authorize_technical_transfer_admission(uuid,uuid,uuid,text,uuid)','EXECUTE');
  assert not has_table_privilege('service_role','internal_academic.technical_transfer_admission_permits','INSERT');
  execute 'set local role authenticated';
  assert public.get_turma_tecnica_ingresso_secure(v_class)=v_policy;
  execute 'reset role';
  -- A real active gestor without any authorized polo must not read the DTO.
  insert into public.usuarios_sistema(id,nome,email,perfil,status,context,polo_ids,permissoes)
    values(v_unscoped,'Gestor sintético sem polo',v_unscoped_email,'gestor','Ativo','local','{}',
      '{"allPolos":false,"modules":["gestao","secretaria","parceiros","cadastros"]}');
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_unscoped,'email',v_unscoped_email)::text,true);
  execute 'set local role authenticated';
  begin
    perform public.get_turma_tecnica_ingresso_secure(v_class);
    raise exception 'Unscoped user read admission policy' using errcode='ZX001';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims',v_claims,true);
  v_rule:=internal_academic.technical_financial_rule(v_class);
  execute 'set local role authenticated';
  v_result:=public.pre_vincular_aluno_tecnico_secure(v_class,v_student,v_request,v_today+7,
    (v_rule->>'revisao')::integer,v_rule->>'fingerprint');
  execute 'reset role';
  select id into strict v_enrollment from public.matriculas where aluno_id=v_student and turma_id=v_class;
  assert v_result->>'cobrancaGerada'='false' and exists(select 1 from public.matriculas where id=v_enrollment);
  -- A valid calendar edit closes new entries, without changing the existing link/replay.
  update public.turmas set data_inicio=v_today-366 where id=v_class;
  assert internal_academic.technical_class_admission_policy(v_class)->>'motivo'='PRAZO_EXPIRADO';
  execute 'set local role authenticated';
  v_replay:=public.pre_vincular_aluno_tecnico_secure(v_class,v_student,v_request,v_today+7,
    (v_rule->>'revisao')::integer,v_rule->>'fingerprint');
  execute 'reset role';
  assert v_replay-'replayed'=v_result-'replayed' and v_replay->>'replayed'='true';
  foreach v_new in array array[v_late,v_missing] loop
    v_rule:=internal_academic.technical_financial_rule(v_new);
    execute 'set local role authenticated';
    begin
      perform public.pre_vincular_aluno_tecnico_secure(v_new,v_other,gen_random_uuid(),v_today+7,
        (v_rule->>'revisao')::integer,v_rule->>'fingerprint');
      raise exception 'Direct entry bypassed admission window' using errcode='ZX001';
    exception when check_violation then
      get stacked diagnostics v_reason=pg_exception_detail;
      assert v_reason=case when v_new=v_missing then 'DATA_INICIO_AUSENTE' else 'PRAZO_EXPIRADO' end;
    end;
    execute 'reset role';
  end loop;
  -- Class activation after day365 preserves and activates the prior valid preregistration.
  perform internal_academic.authorize_transition('TURMA_STATUS',v_class,'EM_ANDAMENTO');
  update public.turmas set status='EM_ANDAMENTO' where id=v_class;
  assert (select status='ATIVO' from public.matriculas where id=v_enrollment);
  update public.matriculas set valor_parcela_individual=251 where id=v_enrollment;
  begin
    update public.matriculas set turma_id=v_late where id=v_enrollment;
    raise exception 'Identity UPDATE bypassed admission policy' using errcode='ZX001';
  exception when check_violation then null; end;
  -- service_role still passes through the INSERT guard; origin text/flags are not proof.
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.jwt.claim.role','service_role',true);
  for v_row in select * from (values (null::text,false),('TRANSFERENCIA_INTERNA',true)) x(origin,inherited) loop
    begin
      v_new:=gen_random_uuid();
      perform internal_academic.authorize_enrollment_upsert(v_other,v_late,'PENDENTE');
      insert into public.matriculas(id,aluno_id,turma_id,status,data_matricula,continuidade_tipo,financeiro_herdado)
        values(v_new,v_other,v_late,'PENDENTE',now(),v_row.origin,v_row.inherited);
      raise exception 'service_role/origin INSERT bypassed admission policy' using errcode='ZX001';
    exception when check_violation then
      get stacked diagnostics v_reason=pg_exception_detail;
      assert v_reason='PRAZO_EXPIRADO';
    end;
  end loop;
  foreach v_new in array array[v_late,v_missing] loop
    begin
      perform public.asaas_checkout_upsert_matricula(v_other,v_new,false);
      raise exception 'Checkout bypassed admission window' using errcode='ZX001';
    exception when check_violation then null; end;
    begin
      perform public.payment_checkout_upsert_matricula(v_other,v_new,false);
      raise exception 'Legacy checkout bypassed admission window' using errcode='ZX001';
    exception when check_violation then null; end;
  end loop;
  perform set_config('request.jwt.claims',v_claims,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform internal_academic.authorize_transition('TURMA_STATUS',v_late,'EM_ANDAMENTO');
  update public.turmas set status='EM_ANDAMENTO' where id=v_late;
  execute 'set local role authenticated';
  v_preview:=public.preview_transferencia_financeira(v_enrollment,'INTERNA_TURMA',v_today,v_late);
  v_transfer:=public.transferir_matricula_com_revisao_financeira(gen_random_uuid(),v_preview->>'fingerprint',
    v_enrollment,'INTERNA_TURMA','Transferência interna sintética',v_today,v_late,null,null);
  execute 'reset role';
  execute 'set constraints complete_technical_transfer_admission immediate';
  assert exists(select 1 from public.matriculas where aluno_id=v_student and turma_id=v_late and status='ATIVO');
  assert (select status='TRANSFERIDO' from public.matriculas where id=v_enrollment);
  assert not exists(select 1 from internal_academic.technical_transfer_admission_permits where database_txid=txid_current());
  -- Even a private transaction permit cannot complete without the actual transfer record.
  begin
    execute 'set constraints complete_technical_transfer_admission deferred';
    v_new:=gen_random_uuid();
    perform internal_academic.authorize_technical_transfer_admission(v_new,v_other,v_late,'EXTERNA_RECEBIDA');
    perform internal_academic.authorize_enrollment_upsert(v_other,v_late,'PENDENTE');
    insert into public.matriculas(id,aluno_id,turma_id,status,data_matricula)
      values(v_new,v_other,v_late,'PENDENTE',now());
    execute 'set constraints complete_technical_transfer_admission immediate';
    raise exception 'Unproved private permit completed' using errcode='ZX001';
  exception when check_violation then null; end;
  -- The old real transfer cannot exempt a different new link, even with a false origin.
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.jwt.claim.role','service_role',true);
  begin
    v_new:=gen_random_uuid();
    perform internal_academic.authorize_enrollment_upsert(v_other,v_late,'PENDENTE');
    insert into public.matriculas(id,aluno_id,turma_id,status,data_matricula,continuidade_tipo)
      values(v_new,v_other,v_late,'PENDENTE',now(),'TRANSFERENCIA_INTERNA');
    raise exception 'Prior transfer exempted a new direct link' using errcode='ZX001';
  exception when check_violation then null; end;
  assert not exists(select 1 from public.contas_receber r join public.matriculas m on m.id=r.matricula_id
    where m.aluno_id in(v_student,v_other));
  -- Public projections use the same canonical decision and disclose no students.
  for v_row in select value row from jsonb_array_elements(public.list_public_technical_classes_ingresso(null,null,v_course)) loop
    assert v_row.row->'ingresso'=internal_academic.technical_class_admission_policy((v_row.row->>'turma_id')::uuid);
    assert not (v_row.row ? 'aluno_id' or v_row.row ? 'cpf_cnpj');
  end loop;
  if exists(select 1 from public.cursos where id=v_course and publicar_site and lower(status)='ativo') then
    v_policy:=public.list_public_technical_classes_ingresso(null,v_late,null)->0;
    assert v_policy#>>'{ingresso,motivo}'='PRAZO_EXPIRADO' and v_policy->>'inscricoes_online_disponiveis'='false';
    assert v_policy->>'situacao_vagas'='ENTRADA SOMENTE POR TRANSFERÊNCIA';
    assert (select not inscricoes_online_disponiveis and situacao_vagas='ENTRADA SOMENTE POR TRANSFERÊNCIA'
      from public.list_public_technical_classes(3,v_late));
  end if;
end;
$test$;
set constraints all immediate;
rollback;
