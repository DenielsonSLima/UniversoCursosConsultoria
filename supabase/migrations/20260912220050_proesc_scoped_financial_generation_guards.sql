-- Scoped Proesc import extension, rebased against the verified remote contract.
begin;

-- Remote base CAS from MCP read-only inspection.
do $base_50$
begin
  if md5(pg_get_functiondef('internal_academic.guard_technical_manual_cycle_insert()'::regprocedure)) <> 'fb36fcc9dd15f0961308989f9030b21e' then
    raise exception 'Remote base changed: internal_academic.guard_technical_manual_cycle_insert; rebase required.'; end if;
  if md5(pg_get_functiondef('internal_academic.technical_manual_cycle_state(uuid)'::regprocedure)) <> '42c083315142d962110b23c0be0dc005' then
    raise exception 'Remote base changed: internal_academic.technical_manual_cycle_state; rebase required.'; end if;
  if md5(pg_get_functiondef('internal_academic.is_technical_manual_cycle_protected(uuid)'::regprocedure)) <> '69f358809f4bc529dfd6360e8dc4eed9' then
    raise exception 'Remote base changed: internal_academic.is_technical_manual_cycle_protected; rebase required.'; end if;
  if md5(pg_get_functiondef('public.gerar_parcelas_matricula(uuid)'::regprocedure)) <> 'e02e8cfd3c0a5e524ad5d447c062287d' then
    raise exception 'Remote base changed: public.gerar_parcelas_matricula; rebase required.'; end if;
  if md5(pg_get_functiondef('public.gerar_rematricula_apos_parcelas(uuid)'::regprocedure)) <> '1b57121970c4d40b1bc6f2c9e2ffa6e6' then
    raise exception 'Remote base changed: public.gerar_rematricula_apos_parcelas; rebase required.'; end if;
  if md5(pg_get_functiondef('public.should_skip_technical_manual_future_sync(uuid)'::regprocedure)) <> '119442488252396261c7a2d048cd0179' then
    raise exception 'Remote base changed: public.should_skip_technical_manual_future_sync; rebase required.'; end if;
end;
$base_50$;

-- A seed scope with batch_id NULL represents the pre-existing, reconciled T42.
-- New scopes stay closed until academic AND financial review are both complete.
create function internal_proesc.enrollment_financial_block(p_matricula_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select case
    when s.phase<>'CONFIRMED' then 'PROESC_IMPORTACAO_EM_CONFERENCIA'
    when e.matricula_id is null or not e.source_verified or e.source_status<>'CURSANDO'
      or m.status<>'ATIVO' then 'PROESC_SITUACAO_ACADEMICA_EM_CONFERENCIA'
    when e.financial_review_state<>'CONFIRMED' then 'PROESC_FINANCEIRO_EM_CONFERENCIA'
    when exists(select 1 from internal_proesc.enrollment_cycle_evidence coverage
      where coverage.matricula_id=m.id and coverage.scope_id=s.id
        and coverage.classification='FULL' and coverage.verification='CONFIRMED')
      then 'PROESC_CONTRATO_EXTERNO'
    when exists(select 1 from internal_proesc.obligation_links link
      join internal_proesc.obligation_imports imported on imported.link_id=link.id
      where link.matricula_id=m.id and imported.source_cycle in ('SECOND','FULL_CONTRACT'))
      then 'PROESC_COBERTURA_INDIVIDUAL_EM_CONFERENCIA'
    when not internal_proesc.has_confirmed_first_cycle_only(m.id)
      then 'PROESC_COBERTURA_INDIVIDUAL_EM_CONFERENCIA'
    else null end
  from public.matriculas m join internal_proesc.class_scopes s on s.turma_id=m.turma_id
  left join internal_proesc.enrollment_sources e on e.matricula_id=m.id
  where m.id=p_matricula_id and s.batch_id is not null;
$$;
revoke all on function internal_proesc.enrollment_financial_block(uuid) from public,anon,authenticated,service_role;

alter function internal_academic.is_technical_manual_cycle_protected(uuid)
  rename to is_technical_manual_cycle_protected_before_proesc_scopes;
create function internal_academic.is_technical_manual_cycle_protected(p_matricula_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select internal_academic.is_technical_manual_cycle_protected_before_proesc_scopes(p_matricula_id)
    or internal_proesc.enrollment_financial_block(p_matricula_id) is not null;
$$;
alter function internal_academic.technical_manual_cycle_state(uuid)
  rename to technical_manual_cycle_state_before_proesc_scopes;
create function internal_academic.technical_manual_cycle_state(p_matricula_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_state jsonb; v_block text;
begin
  v_state:=internal_academic.technical_manual_cycle_state_before_proesc_scopes(p_matricula_id);
  if v_state#>>'{politica,fingerprint}' is not null then
    v_state:=jsonb_set(v_state,'{politica,fingerprint}',to_jsonb(
      internal_proesc.individual_cycle_policy_fingerprint(p_matricula_id,
        v_state#>>'{politica,fingerprint}')),false);
  end if;
  v_block:=internal_proesc.enrollment_financial_block(p_matricula_id);
  if v_block is null then return v_state; end if;
  return v_state || jsonb_build_object('podeGerar',false,
    'estado',case when v_state->>'estado'='ELEGIVEL' then 'BLOQUEADO' else v_state->>'estado' end,
    'bloqueio',jsonb_build_object('codigo',v_block,
      'mensagem','Cobranças Proesc protegidas. Confira o contrato e a situação individual antes de gerar um ciclo local.'));
end;
$$;
revoke all on function internal_academic.is_technical_manual_cycle_protected_before_proesc_scopes(uuid),
  internal_academic.is_technical_manual_cycle_protected(uuid),
  internal_academic.technical_manual_cycle_state_before_proesc_scopes(uuid),
  internal_academic.technical_manual_cycle_state(uuid) from public,anon,authenticated,service_role;

create or replace function internal_academic.guard_technical_manual_cycle_insert()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_request_id uuid;
  v_expected_origin text;
begin
  if exists (select 1 from internal_proesc.class_scopes scope
    where scope.batch_id is not null and (scope.turma_id=new.turma_id
      or exists (select 1 from public.matriculas m where m.id=new.matricula_id and m.turma_id=scope.turma_id))) then
    if not exists (select 1 from public.matriculas m join public.turmas t on t.id=m.turma_id
      where m.id=new.matricula_id and m.turma_id=new.turma_id
        and m.aluno_id=new.cliente_id and t.polo_id=new.polo_id) then
      raise exception 'Identidade da cobrança Proesc diverge da matrícula.' using errcode='42501'; end if;
    if internal_academic.is_authorized_external_history_insert(new) then return new; end if;
    if internal_proesc.enrollment_financial_block(new.matricula_id) is not null
      or new.origem_pagamento='SISTEMA_ANTERIOR' then
      raise exception 'Turma Proesc: inclusão financeira exige importação ou ciclo local conferido.' using errcode='42501';
    end if;
  end if;
  if new.matricula_id is not null
    and upper(coalesce(new.tipo_lancamento, '')) in ('MATRICULA', 'REMATRICULA', 'PARCELA')
    and exists (
      select 1 from internal_academic.technical_external_cycle_coverage coverage
      where coverage.matricula_id = new.matricula_id and coverage.state = 'CONFIRMED'
    ) then
    raise exception 'Matrícula com cobertura Proesc: novas cobranças técnicas são bloqueadas.' using errcode = 'P0001';
  end if;
  if new.matricula_id is null
    or upper(coalesce(new.tipo_lancamento, '')) not in ('MATRICULA', 'REMATRICULA', 'PARCELA')
    or not exists (
      select 1 from public.matriculas enrollment
      join internal_academic.technical_manual_cycle_policies policy
        on policy.turma_id = enrollment.turma_id and policy.active
        and policy.generation_mode = 'MANUAL'
      where enrollment.id = new.matricula_id
    ) then return new; end if;
  if internal_academic.is_technical_manual_cycle_protected(new.matricula_id) then
    raise exception 'Matrícula protegida: novas cobranças técnicas são bloqueadas.' using errcode = 'P0001';
  end if;
  if internal_academic.is_authorized_external_history_insert(new) then return new; end if;
  begin
    v_request_id := nullif(current_setting('app.technical_manual_cycle_request_id', true), '')::uuid;
  exception when invalid_text_representation then v_request_id := null;
  end;
  select run.* into v_run from internal_academic.technical_manual_cycle_runs run
  where run.matricula_id = new.matricula_id and run.request_id = v_request_id
    and run.state = 'GENERATING';
  if v_run.matricula_id is null then
    raise exception 'Cobrança de ciclo técnico manual exige RPC autorizada.' using errcode = '42501';
  end if;
  v_expected_origin := case upper(new.tipo_lancamento)
    when 'MATRICULA' then 'matricula'
    when 'REMATRICULA' then 'ciclo-' || (v_run.cycle_number - 1) || '-rematricula'
    else 'ciclo-' || v_run.cycle_number || '-parc-' || new.parcela_numero end;
  if new.origem_cronograma_id is distinct from v_expected_origin then
    raise exception 'Identidade de cobrança incompatível com o ciclo manual.' using errcode = '22023';
  end if;
  return new;
end;
$function$;
revoke all on function internal_academic.guard_technical_manual_cycle_insert()
  from public, anon, authenticated, service_role;


-- Linked external obligations never enter any gateway lane, including provider
-- fields added after the original Banese guard. Banese rows without Proesc links
-- retain the original behavior.
create function internal_proesc.guard_external_gateway_fields()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_old jsonb; v_new jsonb;
begin
  if not exists (select 1 from internal_proesc.obligation_links where receivable_id=old.id) then return new; end if;
  select jsonb_object_agg(key,value) into v_old from jsonb_each(to_jsonb(old))
    where left(key,8)='gateway_' or left(key,6)='asaas_' or key='nosso_numero_asaas';
  select jsonb_object_agg(key,value) into v_new from jsonb_each(to_jsonb(new))
    where left(key,8)='gateway_' or left(key,6)='asaas_' or key='nosso_numero_asaas';
  if v_new is distinct from v_old then
    raise exception 'Obrigação externa Proesc não permite alteração de identidade bancária.' using errcode='42501'; end if;
  return new;
end;
$$;
revoke all on function internal_proesc.guard_external_gateway_fields() from public,anon,authenticated,service_role;
create trigger guard_proesc_external_gateway_fields before update on public.contas_receber
for each row execute function internal_proesc.guard_external_gateway_fields();

-- Both compatibility entry points return without invoking the legacy generator
-- for every attached Proesc scope, including STAGED before enrollment creation.
alter function public.gerar_parcelas_matricula(uuid) rename to generate_installments_before_proesc_scopes;
alter function public.generate_installments_before_proesc_scopes(uuid) set schema internal_proesc;
create function public.gerar_parcelas_matricula(p_matricula_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
begin
  if exists (select 1 from public.matriculas m join internal_proesc.class_scopes s on s.turma_id=m.turma_id
    where m.id=p_matricula_id) then return 0; end if;
  return internal_proesc.generate_installments_before_proesc_scopes(p_matricula_id);
end;
$$;
alter function public.gerar_rematricula_apos_parcelas(uuid) rename to generate_reenrollment_before_proesc_scopes;
alter function public.generate_reenrollment_before_proesc_scopes(uuid) set schema internal_proesc;
create function public.gerar_rematricula_apos_parcelas(p_matricula_id uuid)
returns public.contas_receber language plpgsql security definer set search_path='' as $$
begin
  if exists (select 1 from public.matriculas m join internal_proesc.class_scopes s on s.turma_id=m.turma_id
    where m.id=p_matricula_id) then return null; end if;
  return internal_proesc.generate_reenrollment_before_proesc_scopes(p_matricula_id);
end;
$$;
alter function public.should_skip_technical_manual_future_sync(uuid) rename to skip_future_sync_before_proesc_scopes;
alter function public.skip_future_sync_before_proesc_scopes(uuid) set schema internal_proesc;
create function public.should_skip_technical_manual_future_sync(p_matricula_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (select 1 from public.matriculas m join internal_proesc.class_scopes s on s.turma_id=m.turma_id
    where m.id=p_matricula_id) or internal_proesc.skip_future_sync_before_proesc_scopes(p_matricula_id);
$$;
revoke all on function internal_proesc.generate_installments_before_proesc_scopes(uuid),
  internal_proesc.generate_reenrollment_before_proesc_scopes(uuid),
  internal_proesc.skip_future_sync_before_proesc_scopes(uuid),
  public.gerar_parcelas_matricula(uuid),public.gerar_rematricula_apos_parcelas(uuid),
  public.should_skip_technical_manual_future_sync(uuid) from public,anon,authenticated,service_role;
grant execute on function public.gerar_parcelas_matricula(uuid),public.gerar_rematricula_apos_parcelas(uuid),
  public.should_skip_technical_manual_future_sync(uuid) to service_role;

-- Keep the legacy scheduled activator from touching imported configurations.
-- Require a single exact insertion point; fail closed if its reviewed body drifted.
do $skip_scoped_activation$
declare v_definition text; v_old text := 'where config.status_financeiro = ''AGENDADA''';
  v_new text := 'where not exists (select 1 from internal_proesc.class_scopes ps where ps.turma_id=enrollment.turma_id)
      and config.status_financeiro = ''AGENDADA''';
begin
  v_definition:=pg_get_functiondef('public.processar_ativacoes_financeiras_tecnicas_agendadas(integer)'::regprocedure);
  if (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 then
    raise exception 'O ativador financeiro mudou; revisar a guarda Proesc.'; end if;
  execute replace(v_definition,v_old,v_new);
end;
$skip_scoped_activation$;
commit;
