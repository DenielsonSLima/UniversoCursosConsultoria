begin;
set local lock_timeout = '5s';

-- Refuse concurrent software drift instead of silently replacing another fix.
do $drift$
begin
  if md5(pg_get_functiondef('internal_academic.technical_manual_cycle_state(uuid)'::regprocedure))
      <> 'e793637f5538571981934397ee7c257c'
    or md5(pg_get_functiondef('internal_proesc.assert_fresh_cycle_generation(uuid)'::regprocedure))
      <> '7424126b41ded541f9bcf8d86a98ce7f'
    or md5(pg_get_functiondef('internal_proesc.enrollment_financial_block(uuid)'::regprocedure))
      <> '6b135028810031aa81f65bf8e5a55360' then
    raise exception 'A regra de ciclos mudou. Revalidar o patch antes de aplicar.';
  end if;
end;
$drift$;

-- Count tuition only. A C2 currently being built in this transaction must not
-- change eligibility halfway through the atomic insertion of its own items.
create function internal_academic.technical_manual_monthly_count(p_matricula_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.contas_receber r
  where r.matricula_id = p_matricula_id and r.tipo_lancamento = 'PARCELA'
    and r.status <> 'CANCELADO'
    and not exists (
      select 1 from internal_academic.technical_manual_cycle_runs run
      where run.matricula_id = p_matricula_id and run.cycle_number = 2
        and run.state = 'GENERATING' and run.completed_at is null
        and run.request_id is not null
        and coalesce(run.xmin = pg_catalog.pg_current_xact_id_if_assigned()::xid, false)
        and r.regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}' = run.request_id::text
    );
$$;

-- Explicit local business decision, never a fabricated Proesc confirmation.
-- Authentication, scope, preview approval and idempotency stay in the RPCs.
create function internal_academic.manager_second_cycle_permitted(p_matricula_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.matriculas m
    join public.turmas t on t.id = m.turma_id
    join public.cursos c on c.id = t.curso_id
    where m.id = p_matricula_id and upper(m.status) in ('ATIVO', 'PENDENTE')
      and upper(c.modalidade) in ('TECNICO', 'TÉCNICO')
      and exists (select 1 from public.matriculas_tecnicas_financeiro_config cfg
        where cfg.matricula_id = m.id)
      and internal_academic.technical_manual_monthly_count(m.id) < 24
      and not internal_academic.technical_imported_cycle_has_conflict(m.id)
      and not internal_academic.technical_imported_cycle_exists(m.id, 2)
      and not internal_academic.technical_cycle_history_outside_enrollment(m.id)
      and (
        exists (select 1 from internal_academic.technical_manual_cycle_policies p
          where p.turma_id = m.turma_id and p.active and p.generation_mode = 'MANUAL'
            and p.baseline_cycle = 1 and p.max_cycle = 2)
        or exists (select 1 from internal_academic.technical_manual_cycle_runs run
          where run.matricula_id = m.id and run.cycle_number = 1
            and run.state in ('LOCAL_CREATED', 'PROTECTED_EXISTING'))
      )
      and not exists (select 1 from internal_academic.technical_manual_cycle_runs run
        where run.matricula_id = m.id and run.cycle_number = 2
          and not (run.state = 'GENERATING' and run.completed_at is null
            and run.request_id is not null
            and coalesce(run.xmin = pg_catalog.pg_current_xact_id_if_assigned()::xid, false)))
      and not exists (select 1 from public.contas_receber r
        where r.matricula_id = m.id and r.status <> 'CANCELADO'
          and (r.tipo_lancamento = 'REMATRICULA'
            or r.regra_financeira_tecnica_snapshot#>>'{cicloManual,cicloNumero}' = '2'
            or r.origem_cronograma_id = 'ciclo-1-rematricula'
            or r.origem_cronograma_id like 'ciclo-2-parc-%')
          and not exists (select 1 from internal_academic.technical_manual_cycle_runs run
            where run.matricula_id = m.id and run.cycle_number = 2
              and run.state = 'GENERATING' and run.completed_at is null
              and run.request_id is not null
              and coalesce(run.xmin = pg_catalog.pg_current_xact_id_if_assigned()::xid, false)
              and r.regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}' = run.request_id::text))
      and not exists (select 1 from internal_academic.technical_external_cycle_coverage cov
        where cov.matricula_id = m.id)
      and not exists (select 1 from internal_proesc.enrollment_cycle_evidence e
        where e.matricula_id = m.id and e.verification = 'CONFIRMED'
          and e.has_external_cycle2 is true)
      and not exists (select 1 from internal_proesc.obligation_links l
        join internal_proesc.obligation_imports i on i.link_id = l.id
        where l.matricula_id = m.id and i.source_cycle in ('SECOND', 'FULL_CONTRACT'))
  );
$$;

-- Keep every existing transfer/correction projection and change only the C2
-- business gate. No historical evidence, receivable or payment is rewritten.
alter function internal_academic.technical_manual_cycle_state(uuid)
  rename to technical_manual_cycle_state_before_manager_decision;
create function internal_academic.technical_manual_cycle_state(p_matricula_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_state jsonb;
begin
  v_state := internal_academic.technical_manual_cycle_state_before_manager_decision(p_matricula_id);
  if v_state->>'habilitado' <> 'true' or v_state->>'modo' <> 'MANUAL'
    or v_state->>'proximoCicloNumero' is distinct from '2'
    or v_state->>'estado' not in ('ELEGIVEL', 'BLOQUEADO') then
    return v_state;
  end if;
  if internal_academic.technical_manual_monthly_count(p_matricula_id) >= 24 then
    return (v_state - 'conferenciaProesc') || jsonb_build_object(
      'estado', 'BLOQUEADO', 'podeGerar', false,
      'bloqueio', jsonb_build_object('codigo', 'PARCELAS_COMPLETAS',
        'mensagem', 'Esta matrícula já possui 24 mensalidades. Consulte as cobranças existentes.'));
  end if;
  if internal_academic.manager_second_cycle_permitted(p_matricula_id)
    and coalesce(v_state#>>'{bloqueio,codigo}', '') in (
      '', 'PROESC_CONFERENCIA_ATUALIZADA_NECESSARIA',
      'PROESC_COBERTURA_INDIVIDUAL_EM_CONFERENCIA', 'PROESC_REVIEW_REQUIRED',
      'HISTORICO_EXTERNO_REQUER_REVISAO', 'INADIMPLENCIA_CICLO_ANTERIOR',
      'CICLO_ANTERIOR_INCOMPLETO', 'CICLO_ANTERIOR_EMISSAO_PENDENTE') then
    v_state := (v_state - 'conferenciaProesc') || jsonb_build_object(
      'estado', 'ELEGIVEL', 'podeGerar', true, 'bloqueio', null);
    v_state := jsonb_set(v_state, '{politica,fingerprint}', to_jsonb(encode(extensions.digest(
      jsonb_build_object('base', v_state#>>'{politica,fingerprint}',
        'decision', 'GESTOR_C2_MENOS_24_V1',
        'monthlyCount', internal_academic.technical_manual_monthly_count(p_matricula_id))::text,
      'sha256'), 'hex')));
  end if;
  return v_state;
end;
$$;

-- The same rule must hold at preview and at the insert trigger. Merely changing
-- the UI would leave confirmation blocked by the previous online API gate.
do $patch$
declare v_source text; v_target regprocedure;
begin
  foreach v_target in array array[
    'internal_proesc.assert_fresh_cycle_generation(uuid)'::regprocedure,
    'internal_proesc.enrollment_financial_block(uuid)'::regprocedure
  ] loop
    v_source := pg_get_functiondef(v_target);
    if v_target = 'internal_proesc.assert_fresh_cycle_generation(uuid)'::regprocedure then
      if position('begin' in v_source) = 0 then raise exception 'Unexpected assertion body'; end if;
      v_source := regexp_replace(v_source, 'begin', 'begin
  if internal_academic.manager_second_cycle_permitted(p_matricula_id) then return; end if;');
    else
      if position('select case' in v_source) = 0 then raise exception 'Unexpected block body'; end if;
      v_source := replace(v_source, 'select case', 'select case
    when internal_academic.manager_second_cycle_permitted(p_matricula_id) then null');
    end if;
    execute v_source;
  end loop;
end;
$patch$;

revoke all on function
  internal_academic.technical_manual_monthly_count(uuid),
  internal_academic.manager_second_cycle_permitted(uuid),
  internal_academic.technical_manual_cycle_state(uuid),
  internal_academic.technical_manual_cycle_state_before_manager_decision(uuid)
  from public, anon, authenticated, service_role;
commit;
