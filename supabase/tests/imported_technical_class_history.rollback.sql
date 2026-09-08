-- Run through MCP only, after the three migrations, always in one transaction.
-- Synthetic course/students/classes; existing polo is referenced by ID only.
-- No banking function, network request, real student or existing title is changed.
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select set_config('request.jwt.claim.role', 'service_role', true);

create function pg_temp.expect_imported_finance_block(p_sql text)
returns void language plpgsql as $function$
begin
  begin
    execute p_sql;
  exception when sqlstate '42501' or sqlstate '22023'
    or sqlstate 'P0001' or check_violation then
    return;
  end;
  raise exception 'Expected financial block: %', p_sql;
end;
$function$;

create function pg_temp.synthetic_cpf()
returns text language plpgsql as $function$
declare v_digits text := lpad(floor(random()*999999999)::bigint::text,9,'0');
  v_sum integer; v_check integer; v_length integer; v_i integer;
begin
  for v_length in 9..10 loop
    v_sum := 0;
    for v_i in 1..v_length loop
      v_sum := v_sum + substring(v_digits,v_i,1)::integer*(v_length+2-v_i);
    end loop;
    v_check := (v_sum*10)%11;
    v_digits := v_digits || case when v_check=10 then 0 else v_check end::text;
  end loop;
  return v_digits;
end;
$function$;

create function pg_temp.expect_imported_finance_sqlstate(p_sql text, p_expected text)
returns void language plpgsql as $function$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_expected then return; end if;
    raise;
  end;
  raise exception 'Expected SQLSTATE %: %', p_expected, p_sql;
end;
$function$;

do $test$
declare
  v_polo uuid;
  v_course uuid := gen_random_uuid();
  v_student uuid;
  v_classes uuid[] := '{}';
  v_enrollments uuid[] := '{}';
  v_class_requests uuid[] := '{}';
  v_class_payloads jsonb[] := '{}';
  v_payload jsonb;
  v_contract jsonb;
  v_result jsonb;
  v_rule jsonb;
  v_state jsonb;
  v_preview jsonb;
  v_generation jsonb;
  v_request uuid;
  v_class_request uuid;
  v_class uuid;
  v_enrollment uuid;
  v_receivable uuid;
  v_mode integer;
  v_before integer;
  v_today date := (pg_catalog.timezone('America/Maceio', now()))::date;
begin
  select id into strict v_polo from public.polos order by id limit 1;
  insert into public.cursos(id, nome, modalidade, carga_horaria)
  values(v_course, 'CURSO SINTETICO TESTE CICLOS EXTERNOS', 'TECNICO', 1200);

  for v_mode in 0..2 loop
    v_contract := jsonb_build_object(
      'modo', 'MANUAL', 'baselineCycle', v_mode, 'maxCycle', 2,
      'estadoInicial', case v_mode when 0 then 'NOVA'
        when 1 then 'IMPORTADA_CICLO_1' else 'IMPORTADA_CONCLUIDA' end,
      'eligibilityRule', case v_mode when 1 then 'HISTORICO_EXTERNO'
        else 'QUITACAO_TOTAL' end
    );
    v_payload := jsonb_build_object(
      'codigo', 'TESTE-EXTERNO-' || gen_random_uuid()::text,
      'nome', 'TURMA SINTETICA TESTE CICLO ' || v_mode,
      'curso_id', v_course, 'polo_id', v_polo,
      'data_inicio', v_today - 180, 'data_previsao_termino', v_today + 550,
      'status', case when v_mode = 0 then 'PLANEJADA' else 'EM_ANDAMENTO' end,
      'turno', 'NOTURNO', 'vagas_totais', 40,
      'publicar_no_site', false, 'permitir_inscricoes_online', false,
      'origem_financeira', case when v_mode = 0 then 'NORMAL' else 'LEGADO' end,
      'financeiro_herdado', v_mode > 0,
      'cobrar_matricula', v_mode = 0,
      'valor_matricula', case when v_mode = 0 then 100 else 0 end,
      'cobrar_rematricula', true, 'valor_rematricula', 120,
      'qtd_parcelas', 12, 'valor_parcela', 279.90,
      'desconto_pontualidade', 19.90, 'juros_atraso', 1,
      'multa_atraso_percentual', 2, 'dia_vencimento_padrao', 10,
      'aplicar_desconto_matricula', false,
      'aplicar_multa_juros_matricula', false,
      'aplicar_desconto_mensalidade', true,
      'aplicar_multa_juros_mensalidade', true,
      'aplicar_desconto_rematricula', false,
      'aplicar_multa_juros_rematricula', false,
      'primeiro_vencimento_padrao', case when v_mode = 2 then null
        else (v_today + 40)::text end,
      'instrucao_boleto_carne', 'TESTE SINTETICO SEM EMISSAO',
      'ciclo_financeiro_tecnico', v_contract
    );
    v_class_request := gen_random_uuid();
    v_class_requests := array_append(v_class_requests, v_class_request);
    v_class_payloads := array_append(v_class_payloads, v_payload);
    v_result := public.criar_turma_tecnica_com_codigo_condicao_secure(
      v_class_request, v_payload, 'Teste123456'
    );
    v_class := (v_result -> 'turma' ->> 'id')::uuid;
    v_classes := array_append(v_classes, v_class);
    if v_result -> 'turma' ->> 'status' is distinct from
      (case when v_mode = 0 then 'PLANEJADA' else 'EM_ANDAMENTO' end) then
      raise exception 'Creation returned the wrong academic phase';
    end if;
    v_result := public.criar_turma_tecnica_com_codigo_condicao_secure(
      v_class_request, v_payload, 'Teste123456'
    );
    if not (v_result ->> 'replayed')::boolean
      or (v_result -> 'turma' ->> 'id')::uuid <> v_class then
      raise exception 'Creation idempotency failed';
    end if;

    v_student := gen_random_uuid();
    insert into public.parceiros(id, cpf_cnpj, tipo, nome)
    values(v_student, pg_temp.synthetic_cpf(), 'Aluno', 'ALUNO SINTETICO SEM DADOS PESSOAIS ' || v_mode);
    v_rule := internal_academic.technical_financial_rule(v_class);
    v_result := public.pre_vincular_aluno_tecnico_secure(
      v_class, v_student, gen_random_uuid(), v_today + 40,
      (v_rule -> 'identidade' ->> 'turmaRevisao')::integer,
      v_rule -> 'identidade' ->> 'turmaFingerprint'
    );
    select id into strict v_enrollment from public.matriculas
    where turma_id = v_class and aluno_id = v_student;
    v_enrollments := array_append(v_enrollments, v_enrollment);
    if exists (select 1 from public.contas_receber where matricula_id = v_enrollment) then
      raise exception 'Creation/prelink unexpectedly created charges';
    end if;
    v_state := internal_academic.technical_manual_cycle_state(v_enrollment);
    if v_mode < 2 and (
      v_state ->> 'estado' <> 'ELEGIVEL'
      or (v_state ->> 'proximoCicloNumero')::integer <> v_mode + 1
    ) then raise exception 'Expected eligibility for mode %: %', v_mode, v_state; end if;
    if v_mode = 2 and (v_state ->> 'estado' <> 'CICLOS_CONCLUIDOS'
      or (v_state ->> 'podeGerar')::boolean) then
      raise exception 'Closed external history must never generate charges';
    end if;
    if v_mode > 0 and (
      public.gerar_parcelas_matricula(v_enrollment) <> 0
      or (public.gerar_rematricula_apos_parcelas(v_enrollment)).id is not null
    ) then raise exception 'Automatic generator bypass'; end if;
  end loop;

  -- Authorization still precedes request replay for an unauthenticated identity.
  begin
    perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform pg_temp.expect_imported_finance_sqlstate(format(
      'select public.criar_turma_tecnica_com_codigo_condicao_secure(%L,%L::jsonb,%L)',
      v_class_requests[2], v_class_payloads[2], 'Teste123456'
    ), '42501');
    perform pg_temp.expect_imported_finance_sqlstate(format(
      'select public.preview_ciclo_financeiro_tecnico_manual_secure(%L,2,%L::date)',
      v_enrollments[2], v_today + 40
    ), '42501');
    raise exception using errcode = 'Z0001', message = 'Restore service test identity';
  exception when sqlstate 'Z0001' then null;
  end;
  perform pg_temp.expect_imported_finance_sqlstate(format(
    'select public.criar_turma_tecnica_com_codigo_condicao_secure(%L,%L::jsonb,%L)',
    v_class_requests[2],
    v_class_payloads[2] || '{"valor_parcela":301}'::jsonb, 'Teste123456'
  ), '22023');
  perform pg_temp.expect_imported_finance_sqlstate(format(
    'select public.criar_turma_tecnica_com_codigo_condicao_secure(%L,%L::jsonb,%L)',
    v_class_requests[2],
    v_class_payloads[2] || '{"exige_matricula":false}'::jsonb, 'Teste123456'
  ), '22023');

  -- A replay must not regress a class that has advanced academically.
  begin
    perform internal_academic.authorize_transition('TURMA_STATUS', v_classes[2], 'FINALIZADA');
    update public.turmas set status='FINALIZADA' where id=v_classes[2];
    v_result := public.criar_turma_tecnica_com_codigo_condicao_secure(
      v_class_requests[2], v_class_payloads[2], 'Teste123456'
    );
    if v_result -> 'turma' ->> 'status' is distinct from 'FINALIZADA' then
      raise exception 'Replayed creation regressed academic phase';
    end if;
    raise exception using errcode = 'Z0001', message = 'Restore ongoing test class';
  exception when sqlstate 'Z0001' then null;
  end;

  -- New-class cycle 1 and existing policy semantics are unchanged.
  v_preview := public.preview_ciclo_financeiro_tecnico_manual_secure(
    v_enrollments[1], 1, v_today + 40
  );
  if not exists (select 1 from jsonb_array_elements(v_preview -> 'preview' -> 'itens') item
    where item ->> 'tipo' = 'MATRICULA') then
    raise exception 'New class lost its enrollment fee';
  end if;

  -- Imported cycle 2 permits future terms, never cycle-1 or public checkout.
  update public.turmas set valor_parcela = 300, desconto_pontualidade = 20,
    juros_atraso = 1.25, multa_atraso_percentual = 2.5 where id = v_classes[2];
  perform pg_temp.expect_imported_finance_block(format(
    'update public.turmas set cobrar_matricula=true, valor_matricula=100 where id=%L',
    v_classes[2]
  ));
  perform pg_temp.expect_imported_finance_block(format(
    'update public.turmas set permitir_inscricoes_online=true where id=%L', v_classes[2]
  ));
  perform pg_temp.expect_imported_finance_block(format(
    'update public.turmas set valor_parcela=400 where id=%L', v_classes[3]
  ));
  -- The configuration RPC sends these no-op flags even when only the name changes.
  update public.turmas set nome = 'TURMA SINTETICA NOME ATUALIZADO',
    publicar_no_site = publicar_no_site,
    permitir_inscricoes_online = permitir_inscricoes_online,
    origem_financeira = origem_financeira, financeiro_herdado = financeiro_herdado,
    gerar_cobrancas_futuras = gerar_cobrancas_futuras,
    sincronizar_asaas_futuro = sincronizar_asaas_futuro
  where id=v_classes[3];
  perform pg_temp.expect_imported_finance_block(format(
    'select public.preview_ciclo_financeiro_tecnico_manual_secure(%L,1,%L::date)',
    v_enrollments[2], v_today + 40
  ));
  perform pg_temp.expect_imported_finance_block(format(
    'select public.preview_ciclo_financeiro_tecnico_manual_secure(%L,2,%L::date)',
    v_enrollments[3], v_today + 40
  ));
  perform pg_temp.expect_imported_finance_block(format(
    'update public.matriculas_tecnicas_financeiro_config set status_financeiro=''AGENDADA'', ativar_em=now()+interval ''1 day'' where matricula_id=%L',
    v_enrollments[2]
  ));

  -- Local first-cycle data is never interpreted as an external payment proof.
  update internal_academic.technical_manual_cycle_policies
  set active = false where turma_id = v_classes[2];
  insert into public.contas_receber(
    polo_id, cliente_id, matricula_id, turma_id, descricao, valor,
    data_vencimento, status, categoria, tipo_lancamento, origem_cronograma_id
  ) values (
    v_polo, (select aluno_id from public.matriculas where id=v_enrollments[2]),
    v_enrollments[2], v_classes[2], 'TITULO SINTETICO HISTORICO LOCAL', 1,
    v_today + 40, 'PENDENTE', 'MENSALIDADE', 'MATRICULA', 'matricula'
  ) returning id into v_receivable;
  update internal_academic.technical_manual_cycle_policies
  set active = true where turma_id = v_classes[2];
  v_state := internal_academic.technical_manual_cycle_state(v_enrollments[2]);
  if v_state -> 'bloqueio' ->> 'codigo' <> 'HISTORICO_EXTERNO_REQUER_REVISAO' then
    raise exception 'Local history was not blocked for review: %', v_state;
  end if;
  delete from public.contas_receber where id = v_receivable;

  -- Academic and missing-configuration guards precede external eligibility.
  perform internal_academic.authorize_enrollment_status(v_enrollments[2], 'TRANCADO');
  update public.matriculas set status='TRANCADO' where id=v_enrollments[2];
  v_state := internal_academic.technical_manual_cycle_state(v_enrollments[2]);
  if v_state -> 'bloqueio' ->> 'codigo' <> 'STATUS_ACADEMICO' then
    raise exception 'Academic protection was bypassed';
  end if;
  perform internal_academic.authorize_enrollment_status(v_enrollments[2], 'PENDENTE');
  update public.matriculas set status='PENDENTE' where id=v_enrollments[2];

  begin
    delete from public.matriculas_tecnicas_financeiro_config
    where matricula_id = v_enrollments[2];
    v_state := internal_academic.technical_manual_cycle_state(v_enrollments[2]);
    if v_state -> 'bloqueio' ->> 'codigo' is distinct from 'SEM_CONFIGURACAO' then
      raise exception 'Missing financial configuration was bypassed';
    end if;
    raise exception using errcode = 'Z0001', message = 'Restore synthetic configuration';
  exception when sqlstate 'Z0001' then null;
  end;

  -- Existing imported policies keep their payment-evidence requirement.
  begin
    update internal_academic.technical_manual_cycle_policies
    set eligibility_rule='PENULTIMA_SEM_ATRASO' where turma_id=v_classes[2];
    v_state := internal_academic.technical_manual_cycle_state(v_enrollments[2]);
    if v_state -> 'bloqueio' ->> 'codigo' is distinct from 'CICLO_ANTERIOR_INCOMPLETO' then
      raise exception 'Legacy imported eligibility changed without opt-in';
    end if;
    raise exception using errcode = 'Z0001', message = 'Restore external policy';
  exception when sqlstate 'Z0001' then null;
  end;

  v_preview := public.preview_ciclo_financeiro_tecnico_manual_secure(
    v_enrollments[2], 2, v_today + 40
  ) -> 'preview';
  if (v_preview ->> 'quantidadeItens')::integer <> 13
    or exists (select 1 from jsonb_array_elements(v_preview -> 'itens') item
      where item ->> 'tipo' = 'MATRICULA')
    or (v_preview ->> 'total')::numeric <> 3720
    or (v_preview -> 'termos' ->> 'multaAtrasoPercentual')::numeric <> 2.5 then
    raise exception 'Cycle-2 preview lost canonical terms: %', v_preview;
  end if;
  select count(*) into v_before from public.contas_receber
  where matricula_id = v_enrollments[2];
  v_request := gen_random_uuid();
  -- A stale monetary preview must create no title, then a new preview can proceed.
  update public.turmas set valor_parcela=310 where id=v_classes[2];
  perform pg_temp.expect_imported_finance_sqlstate(format(
    'select public.gerar_ciclo_financeiro_tecnico_manual_secure(%L,2,%L::date,%L,%L,%L,%L)',
    v_enrollments[2], v_today+40, v_request,
    v_preview ->> 'regraEfetivaFingerprint', v_preview ->> 'politicaFingerprint',
    v_preview ->> 'cronogramaFingerprint'
  ), '40001');
  if exists (select 1 from public.contas_receber where matricula_id=v_enrollments[2]) then
    raise exception 'Stale preview unexpectedly created titles';
  end if;
  update public.turmas set valor_parcela=300 where id=v_classes[2];
  v_preview := public.preview_ciclo_financeiro_tecnico_manual_secure(
    v_enrollments[2], 2, v_today+40
  ) -> 'preview';
  v_generation := public.gerar_ciclo_financeiro_tecnico_manual_secure(
    v_enrollments[2], 2, v_today + 40, v_request,
    v_preview ->> 'regraEfetivaFingerprint', v_preview ->> 'politicaFingerprint',
    v_preview ->> 'cronogramaFingerprint'
  );
  v_generation := public.gerar_ciclo_financeiro_tecnico_manual_secure(
    v_enrollments[2], 2, v_today + 40, v_request,
    v_preview ->> 'regraEfetivaFingerprint', v_preview ->> 'politicaFingerprint',
    v_preview ->> 'cronogramaFingerprint'
  );
  if not (v_generation ->> 'replayed')::boolean
    or (select count(*) from public.contas_receber where matricula_id=v_enrollments[2]) <> v_before+13
    or exists (select 1 from public.contas_receber where matricula_id=v_enrollments[2]
      and (status='PAGO' or gateway_payment_id is not null)) then
    raise exception 'Local cycle generation duplicated titles or fabricated payment/issuance';
  end if;
  v_state := internal_academic.technical_manual_cycle_state(v_enrollments[2]);
  if v_state ->> 'estado' <> 'JA_GERADO' or (v_state ->> 'podeGerar')::boolean then
    raise exception 'Generated second cycle is not protected';
  end if;
  raise notice 'PASS: new/external/closed creation, prelink, preview, guards and idempotent local generation';
end;
$test$;
rollback;
