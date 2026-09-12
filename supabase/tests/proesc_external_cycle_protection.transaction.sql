-- Transactional negative contract. Execute via MCP ONLY inside the root's
-- explicit BEGIN ... ROLLBACK rehearsal after importing a contract. This file
-- intentionally has no BEGIN/COMMIT/ROLLBACK, so it can exercise that uncommitted
-- coverage. Every attempted DML is additionally isolated by a subtransaction.
-- It invokes database guards/RPCs only, never an Edge Function or bank endpoint.
do $external_coverage_negative_paths$
declare
  v_coverage record;
  v_receivable public.contas_receber%rowtype;
  v_legacy public.contas_receber%rowtype;
  v_before text;
  v_after text;
  v_message text;
  v_constraint text;
  v_cycle integer;
  v_tested integer := 0;
  v_claims text := current_setting('request.jwt.claims', true);
  v_role text := current_setting('request.jwt.claim.role', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
begin
  for v_coverage in select coverage.*
    from internal_academic.technical_external_cycle_coverage coverage
    where coverage.state = 'CONFIRMED'
  loop
    v_tested := v_tested + 1;
    perform set_config('request.jwt.claims', jsonb_build_object(
      'role', 'service_role', 'sub', v_coverage.created_by
    )::text, true);
    perform set_config('request.jwt.claim.role', 'service_role', true);
    perform set_config('request.jwt.claim.sub', v_coverage.created_by::text, true);
    if auth.uid() is distinct from v_coverage.created_by
      or auth.role() is distinct from 'service_role' then
      raise exception 'Claims de teste não representam o ator autorizado.';
    end if;
    select c.* into strict v_receivable
    from public.contas_receber c
    join internal_academic.technical_external_cycle_evidence evidence
      on evidence.receivable_id = c.id
    where evidence.matricula_id = v_coverage.matricula_id and evidence.imported_now
    order by evidence.source_ordinal limit 1;
    select md5(jsonb_agg(to_jsonb(c) order by c.id)::text) into v_before
    from public.contas_receber c where c.matricula_id = v_coverage.matricula_id;

    for v_cycle in 1..3 loop
      begin
        perform public.preview_ciclo_financeiro_tecnico_manual_secure(
          v_coverage.matricula_id, v_cycle, current_date + 30);
        raise exception 'Prévia pública liberou ciclo coberto.' using errcode = 'P9001';
      exception when invalid_parameter_value then
        get stacked diagnostics v_message = message_text;
        if v_message <> 'Ciclo técnico manual inválido para esta matrícula.' then raise; end if;
      end;
    end loop;
    begin
      perform public.gerar_ciclo_financeiro_tecnico_manual_secure(
        v_coverage.matricula_id, 2, current_date + 30, gen_random_uuid(),
        repeat('a', 64), repeat('b', 64), repeat('c', 64));
      raise exception 'RPC de geração liberou segundo ciclo coberto.' using errcode = 'P9001';
    exception when invalid_parameter_value then
      get stacked diagnostics v_message = message_text;
      if v_message <> 'Ciclo técnico manual inválido para esta matrícula.' then raise; end if;
    end;
    begin
      perform public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(
        v_coverage.matricula_id, 2, current_date + 30, gen_random_uuid(),
        repeat('a', 64), repeat('b', 64), repeat('c', 64));
      raise exception 'Preparação de emissão liberou segundo ciclo coberto.' using errcode = 'P9001';
    exception when invalid_parameter_value then
      get stacked diagnostics v_message = message_text;
      if v_message <> 'Ciclo técnico manual inválido para esta matrícula.' then raise; end if;
    end;
    begin
      perform public.obter_emissao_ciclo_financeiro_tecnico_manual_service(v_coverage.matricula_id, 2);
      raise exception 'Retomada tratou cobertura externa como emissão local.' using errcode = 'P9001';
    exception when no_data_found then null;
    end;
    begin
      perform public.assert_technical_manual_cycle_recovery_service(
        v_coverage.matricula_id, 2, gen_random_uuid(), 25);
      raise exception 'Recuperação interna liberou contrato externo.' using errcode = 'P9001';
    exception when invalid_parameter_value then
      get stacked diagnostics v_message = message_text;
      if v_message <> 'Run do ciclo técnico não encontrado para recuperação.' then raise; end if;
    end;
    begin
      perform public.authorize_technical_manual_receivable_issuance_secure(
        v_receivable.id, gen_random_uuid());
      raise exception 'Autorização individual liberou título do contrato externo.' using errcode = 'P9001';
    exception when insufficient_privilege then
      get stacked diagnostics v_message = message_text;
      if v_message <> 'Matrícula protegida: nova emissão bancária bloqueada.' then raise; end if;
    end;
    if public.gerar_parcelas_matricula(v_coverage.matricula_id) is distinct from 0 then
      raise exception 'Gerador automático não pode produzir parcelas para cobertura externa.';
    end if;
    v_legacy := public.gerar_rematricula_apos_parcelas(v_coverage.matricula_id);
    if v_legacy.id is not null then
      raise exception 'Gerador automático não pode produzir rematrícula para cobertura externa.';
    end if;

    begin
      insert into public.contas_receber (
        id, matricula_id, turma_id, cliente_id, polo_id, descricao, valor,
        data_vencimento, status, tipo_lancamento, parcela_numero, origem_cronograma_id
      ) values (gen_random_uuid(), v_receivable.matricula_id, v_receivable.turma_id,
        v_receivable.cliente_id, v_receivable.polo_id, 'Teste transacional de proteção',
        279.90, current_date + 30, 'PENDENTE', 'PARCELA', 1, 'ciclo-2-parc-1');
      raise exception 'INSERT direto ultrapassou a proteção externa.' using errcode = 'P9001';
    exception when sqlstate 'P0001' then
      get stacked diagnostics v_message = message_text;
      if v_message <> 'Matrícula com cobertura Proesc: novas cobranças técnicas são bloqueadas.' then raise; end if;
    end;
    begin
      update public.contas_receber set valor = valor + 1 where id = v_receivable.id;
      raise exception 'Identidade financeira da evidência foi alterada.' using errcode = 'P9001';
    exception when insufficient_privilege then
      get stacked diagnostics v_message = message_text;
      if v_message <> 'A identidade vinculada à cobertura Proesc exige revisão auditada.' then raise; end if;
    end;
    begin
      update public.contas_receber set gateway_creation_token = gen_random_uuid()
      where id = v_receivable.id;
      raise exception 'Claim de novo POST foi aceito para cobertura externa.' using errcode = 'P9001';
    exception when insufficient_privilege then
      get stacked diagnostics v_message = message_text;
      if v_message <> 'Matrícula protegida: novo claim bancário bloqueado.' then raise; end if;
    end;
    begin
      delete from public.contas_receber where id = v_receivable.id;
      set constraints all immediate;
      raise exception 'DELETE removeu recebível vinculado à evidência externa.' using errcode = 'P9001';
    exception when foreign_key_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> 'technical_external_cycle_evidence_receivable_id_fkey' then raise; end if;
    end;
    select md5(jsonb_agg(to_jsonb(c) order by c.id)::text) into v_after
    from public.contas_receber c where c.matricula_id = v_coverage.matricula_id;
    if v_after is distinct from v_before
      or exists (select 1 from internal_academic.technical_manual_cycle_runs
        where matricula_id = v_coverage.matricula_id)
    then raise exception 'Testes negativos alteraram recebíveis ou geraram run.'; end if;
  end loop;
  if v_tested = 0 then raise exception 'O ensaio exige uma cobertura recém-importada.'; end if;
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.role', coalesce(v_role, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
end;
$external_coverage_negative_paths$;
