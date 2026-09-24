-- Executar via MCP Supabase. Não emite títulos bancários; tudo é revertido.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  v_id uuid;
  v_preview jsonb;
  v_review jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_request uuid := gen_random_uuid();
  v_first_due date := timezone('America/Maceio', now())::date + 7;
  v_before integer;
  v_count integer;
  v_issue_fee boolean := coalesce(nullif(current_setting('app.manual_cycle_test_include_fee',true),''),'false')::boolean;
  v_expected integer;
  v_actor uuid;
  v_candidate uuid;
  v_polo uuid;
  v_receivable_id uuid;
  v_authorization_request uuid;
  v_authorization jsonb;
  v_terms jsonb;
  v_academic_before jsonb;
begin
  v_expected := case when v_issue_fee then 13 else 12 end;
  select m.id into strict v_id from public.matriculas m
    where internal_academic.technical_local_cycle_eligible(m.id)
      and upper(m.status) in ('ATIVO', 'PENDENTE')
      and m.fluxo_operacional='IMPLANTACAO'
      and not exists(select 1 from internal_academic.technical_manual_cycle_policies p
        where p.turma_id=m.turma_id and p.active)
      and not exists (select 1 from internal_academic.technical_manual_cycle_runs r
        where r.matricula_id=m.id)
      and exists (select 1 from public.matriculas_tecnicas_financeiro_config c
        where c.matricula_id=m.id)
    order by m.data_matricula desc limit 1;
  select t.polo_id,jsonb_build_object('status',m.status,'fluxo',m.fluxo_operacional)
    into strict v_polo,v_academic_before from public.matriculas m
    join public.turmas t on t.id=m.turma_id where m.id=v_id;
  select count(*) into v_before from public.contas_receber where matricula_id=v_id;
  v_preview := public.preview_ciclo_financeiro_tecnico_manual_secure(v_id, 1, v_first_due, null)->'preview';
  if v_preview#>>'{itens,0,tipo}' <> 'MATRICULA'
    or (select count(*) from jsonb_array_elements(v_preview->'itens') i
      where i->>'tipo'='PARCELA') <> 12 then
    raise exception 'C1 precisa mostrar matrícula e doze mensalidades';
  end if;
  select jsonb_build_object('emitirMatricula', true, 'itens', jsonb_agg(
    jsonb_build_object('chave', i->>'chave',
      'valor', case when i->>'tipo'='MATRICULA' then '125.50' else '270.00' end,
      'vencimento', i->>'vencimento', 'descontoPontualidade', '5.00',
      'jurosAtrasoPercentual', '1.25', 'multaAtrasoPercentual', '2.50') order by n))
    into v_review from jsonb_array_elements(v_preview->'itens') with ordinality a(i,n);
  v_preview := public.preview_ciclo_financeiro_tecnico_manual_secure(v_id, 1, v_first_due, v_review)->'preview';
  if v_preview#>>'{itens,0,detalhesBoleto,desconto,valor}' <> '5.00'
    or v_preview#>>'{itens,0,detalhesBoleto,juros,percentualMes}' <> '1.250000'
    or v_preview#>>'{itens,0,detalhesBoleto,multa,valor}' <> '3.14' then
    raise exception 'Revisão por item não chegou à prévia canônica';
  end if;

  -- A matrícula é opcional e sua exclusão não desloca as mensalidades nem paga nada.
  v_review := jsonb_set(v_review, '{emitirMatricula}', to_jsonb(v_issue_fee));
  v_preview := public.preview_ciclo_financeiro_tecnico_manual_secure(v_id, 1, v_first_due, v_review)->'preview';
  if (v_preview->>'quantidadeItens')::integer <> v_expected
    or (not v_issue_fee and (v_preview#>>'{matriculaSemBoleto,tipo}' <> 'MATRICULA'
      or v_preview#>>'{itens,0,chave}' <> 'ciclo-1-parc-1'))
    or (v_issue_fee and v_preview->'matriculaSemBoleto' <> 'null'::jsonb) then
    raise exception 'Exclusão da matrícula perdeu identidade';
  end if;
  v_result := public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(
    v_id,1,v_first_due,v_request,v_preview->>'regraEfetivaFingerprint',
    v_preview->>'politicaFingerprint',v_preview->>'cronogramaFingerprint',v_review);
  v_replay := public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(
    v_id,1,v_first_due,v_request,v_preview->>'regraEfetivaFingerprint',
    v_preview->>'politicaFingerprint',v_preview->>'cronogramaFingerprint',v_review);
  if not (v_replay->>'replayed')::boolean
    or v_replay#>'{ciclo,recebiveis}' <> v_result#>'{ciclo,recebiveis}' then
    raise exception 'Replay não preservou os mesmos recebíveis';
  end if;
  select count(*) into v_count from public.contas_receber where matricula_id=v_id;
  if v_count-v_before <> v_expected then raise exception 'Geração duplicou recebíveis'; end if;
  if exists(select 1 from public.contas_receber where matricula_id=v_id and (
    status <> 'PENDENTE' or gateway_payment_id is not null
    or regra_financeira_tecnica_snapshot->>'jurosAtrasoPercentual' <> '1.250000'
    or regra_financeira_tecnica_snapshot->>'descontoPontualidade' <> '5.00')) then
    raise exception 'Snapshot, pagamento ou identidade bancária indevidos';
  end if;
  perform public.technical_manual_banese_expected_terms_service(id)
    from public.contas_receber where matricula_id=v_id;

  -- Exercise the same per-receivable authorization used immediately before
  -- the Edge claims a bank attempt. No bank attempt or external request occurs.
  for v_candidate in select distinct u.auth_user_id from public.usuarios_sistema u
    join internal_academic.technical_manual_receivable_issuance_authorizations a
      on a.authorized_by=u.auth_user_id
    where public.is_active_status(u.status)
  loop
    perform set_config('request.jwt.claims',jsonb_build_object(
      'role','authenticated','sub',v_candidate)::text,true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    if public.gestor_has_financeiro_tab('receber') and public.is_gestor_for_polo(v_polo) then
      v_actor:=v_candidate;
      exit;
    end if;
  end loop;
  if v_actor is null then
    raise exception 'Fixture exige gestor ativo com autorização financeira anterior neste escopo';
  end if;
  for v_receivable_id in select id from public.contas_receber where matricula_id=v_id order by id
  loop
    v_authorization_request:=gen_random_uuid();
    v_authorization:=public.authorize_technical_manual_receivable_issuance_secure(
      v_receivable_id,v_authorization_request);
    if v_authorization->'authorized' is distinct from 'true'::jsonb
      or v_authorization->>'receivableId' is distinct from v_receivable_id::text
      or v_authorization->>'cycleNumber' is distinct from '1'
      or v_authorization->'existingRemoteTitle' is distinct from 'false'::jsonb then
      raise exception 'Novo recebível individual não passou pela autorização canônica de emissão';
    end if;
    v_authorization:=public.authorize_technical_manual_receivable_issuance_secure(
      v_receivable_id,v_authorization_request);
    if v_authorization->'authorized' is distinct from 'true'::jsonb
      or v_authorization->'replayed' is distinct from 'true'::jsonb then
      raise exception 'Replay da autorização de emissão não preservou a identidade';
    end if;
    v_terms:=public.technical_manual_banese_expected_terms_service(v_receivable_id);
    if (v_terms#>>'{discount,value}')::numeric is distinct from 5
      or (v_terms#>>'{interest,value}')::numeric is distinct from 1.25
      or (v_terms#>>'{penalty,value}')::numeric is distinct from 2.5 then
      raise exception 'Termos Banese v2 perderam os valores revisados após autorização';
    end if;
  end loop;
  if (select count(*) from internal_academic.technical_manual_receivable_issuance_authorizations
      where matricula_id=v_id and authorized_by=v_actor and first_claimed_at is null) <> v_expected
    or exists(select 1 from public.contas_receber where matricula_id=v_id
      and (gateway_creation_token is not null or gateway_payment_id is not null)) then
    raise exception 'Autorização criou claim bancário indevido ou não cobriu todos os itens';
  end if;
  if (select jsonb_build_object('status',m.status,'fluxo',m.fluxo_operacional)
      from public.matriculas m where m.id=v_id) is distinct from v_academic_before then
    raise exception 'Emissão manual alterou o estado acadêmico';
  end if;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.jwt.claim.role','service_role',true);
  if internal_academic.technical_manual_cycle_state(v_id)->>'podeGerar' <> 'false' then
    raise exception 'C2 liberado com C1 ainda sem emissão';
  end if;
  begin
    perform public.gerar_ciclo_financeiro_tecnico_manual_secure(
      v_id,1,v_first_due,v_request,v_preview->>'regraEfetivaFingerprint',
      v_preview->>'politicaFingerprint',v_preview->>'cronogramaFingerprint',
      jsonb_set(v_review,'{emitirMatricula}',to_jsonb(not v_issue_fee)));
    raise exception 'Replay aceitou intenção diferente' using errcode='23514';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  begin
    perform public.authorize_technical_manual_receivable_issuance_secure(
      v_receivable_id,v_authorization_request);
    raise exception 'Replay da autorização acessível sem identidade autenticada' using errcode='23514';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.gerar_ciclo_financeiro_tecnico_manual_secure(
      v_id,1,v_first_due,v_request,v_preview->>'regraEfetivaFingerprint',
      v_preview->>'politicaFingerprint',v_preview->>'cronogramaFingerprint',v_review);
    raise exception 'Replay acessível sem autorização' using errcode='23514';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
rollback;
