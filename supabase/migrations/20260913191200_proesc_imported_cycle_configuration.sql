-- Future cycle configuration is separate from imported financial evidence.
-- Baseline 1 limits the next local operation to cycle 2; it does not classify
-- historical obligations or assert which external cycles already exist.
-- Apply after the nine-class commercial-rule initialization (191100).
begin;
set local lock_timeout = '5s';
set local request.jwt.claims = '{"role":"service_role"}';

do $base$
begin
  if md5(pg_get_functiondef('internal_academic.ensure_technical_financial_pending(uuid)'::regprocedure)) <> '236f20a73249053498b4df708d947256' then
    raise exception 'Imported financial configuration changed; rebase required: ensure_technical_financial_pending.';
  end if;
  if md5(pg_get_functiondef('internal_academic.guard_imported_technical_activation()'::regprocedure)) <> '566aacba1365982f4697f812bf6c0ecd' then
    raise exception 'Imported financial configuration changed; rebase required: guard_imported_technical_activation.';
  end if;
  if md5(pg_get_functiondef('internal_academic.normalize_new_technical_financial_override()'::regprocedure)) <> 'e1c759d645e92281d4c5c3dec601d8bf' then
    raise exception 'Imported financial configuration changed; rebase required: normalize_new_technical_financial_override.';
  end if;
end;
$base$;

CREATE OR REPLACE FUNCTION internal_academic.normalize_new_technical_financial_override()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_enrollment public.matriculas%rowtype;
  v_class public.turmas%rowtype;
  v_is_copy boolean;
begin
  select enrollment.* into v_enrollment
  from public.matriculas enrollment where enrollment.id = new.matricula_id;
  select class.* into v_class from public.turmas class where class.id = new.turma_id;
  if v_enrollment.id is null or v_class.id is null then return new; end if;
  if exists (
    select 1 from internal_proesc.class_scopes scope
    join internal_academic.technical_manual_cycle_policies policy
      on policy.turma_id = scope.turma_id and policy.active
    where scope.turma_id = new.turma_id and scope.batch_id is not null
      and scope.phase = 'CONFIRMED'
      and policy.eligibility_rule = 'HISTORICO_IMPORTADO_CONSULTA'
  ) then
    -- Imported rows are immutable history here. Existing explicit conditions
    -- remain an override; otherwise the future cycle follows the class rule.
    new.override_ativo := exists (
      select 1 from jsonb_each(to_jsonb(v_enrollment)) field
      where right(field.key, 11) = '_individual' and field.value <> 'null'::jsonb
    );
    new.override_revisao := case when new.override_ativo
      then greatest(coalesce(new.override_revisao, 0), 1) else 0 end;
    return new;
  end if;
  v_is_copy :=
    (v_enrollment.valor_matricula_individual is null or v_enrollment.valor_matricula_individual = v_class.valor_matricula)
    and (v_enrollment.valor_rematricula_individual is null or v_enrollment.valor_rematricula_individual = v_class.valor_rematricula)
    and (v_enrollment.valor_parcela_individual is null or v_enrollment.valor_parcela_individual = v_class.valor_parcela)
    and (v_enrollment.dia_vencimento_individual is null or v_enrollment.dia_vencimento_individual = v_class.dia_vencimento_padrao)
    and (v_enrollment.desconto_pontualidade_individual is null or v_enrollment.desconto_pontualidade_individual = v_class.desconto_pontualidade)
    and (v_enrollment.juros_atraso_individual is null or v_enrollment.juros_atraso_individual = v_class.juros_atraso)
    and (v_enrollment.multa_atraso_percentual_individual is null or v_enrollment.multa_atraso_percentual_individual = v_class.multa_atraso_percentual);
  if v_is_copy then
    perform internal_academic.authorize_matricula_control_update(new.matricula_id);
    update public.matriculas enrollment set
      valor_matricula_individual = null,
      valor_rematricula_individual = null,
      valor_parcela_individual = null,
      dia_vencimento_individual = null,
      desconto_pontualidade_individual = null,
      juros_atraso_individual = null,
      multa_atraso_individual = null,
      multa_atraso_percentual_individual = null
    where enrollment.id = new.matricula_id;
    new.override_ativo := false;
    new.override_revisao := 0;
  else
    new.override_ativo := true;
    new.override_revisao := greatest(coalesce(new.override_revisao, 0), 1);
  end if;
  return new;
end;
$function$;
create function internal_academic.ensure_imported_technical_cycle_config(p_matricula_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $function$
declare
  v_enrollment public.matriculas%rowtype;
  v_rule jsonb;
  v_effective jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'technical-manual-cycle-enrollment:' || p_matricula_id::text, 0));
  select enrollment.* into v_enrollment from public.matriculas enrollment
  where enrollment.id = p_matricula_id;
  if not found then raise exception 'Matrícula não encontrada.' using errcode = '22023'; end if;
  perform 1 from public.turmas where id = v_enrollment.turma_id for update;
  select * into strict v_enrollment from public.matriculas where id = p_matricula_id for update;
  if not exists (
    select 1 from internal_proesc.class_scopes scope
    join internal_academic.technical_manual_cycle_policies policy on policy.turma_id = scope.turma_id
    where scope.turma_id = v_enrollment.turma_id and scope.batch_id is not null
      and scope.phase = 'CONFIRMED' and scope.financial_mode = 'INDIVIDUAL_REVIEW'
      and policy.active and policy.generation_mode = 'MANUAL'
      and policy.eligibility_rule = 'HISTORICO_IMPORTADO_CONSULTA'
      and policy.initial_state = 'IMPORTADA_CICLO_1' and policy.baseline_cycle = 1
      and policy.max_cycle = 2
  ) then return false; end if;
  if exists (select 1 from public.matriculas_tecnicas_financeiro_config
    where matricula_id = p_matricula_id) then return false; end if;
  v_rule := internal_academic.technical_financial_rule(v_enrollment.turma_id);
  insert into public.matriculas_tecnicas_financeiro_config(
    matricula_id, turma_id, aluno_id, status_financeiro, primeiro_vencimento,
    ativar_em, regra_revisao, regra_fingerprint, titulo_matricula_id, last_error
  ) values (
    v_enrollment.id, v_enrollment.turma_id, v_enrollment.aluno_id,
    'PENDENTE', null, null, (v_rule->>'revisao')::integer, v_rule->>'fingerprint', null, null
  );
  -- Bind the configuration to both canonical identities; the manual preview
  -- obtains the current rule and the generated cycle freezes its own snapshot.
  v_effective := internal_academic.technical_financial_effective_rule(v_enrollment.id);
  update public.matriculas_tecnicas_financeiro_config set
    override_fingerprint = v_effective#>>'{identidade,overrideFingerprint}',
    regra_efetiva_fingerprint = v_effective#>>'{identidade,efetivaFingerprint}'
  where matricula_id = v_enrollment.id;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION internal_academic.ensure_technical_financial_pending(p_matricula_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if internal_proesc.is_enrollment_bootstrap_claim(p_matricula_id) then return false; end if;
  if exists (select 1 from public.matriculas enrollment
    join internal_proesc.class_scopes scope on scope.turma_id = enrollment.turma_id
    where enrollment.id = p_matricula_id and scope.batch_id is not null) then
    return internal_academic.ensure_imported_technical_cycle_config(p_matricula_id);
  end if;
  return internal_academic.ensure_technical_financial_pending_before_proesc_bootstrap(p_matricula_id);
end;
$function$;
CREATE OR REPLACE FUNCTION internal_academic.guard_imported_technical_activation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_policy internal_academic.technical_manual_cycle_policies%rowtype;
begin
  select policy.* into v_policy
  from internal_academic.technical_manual_cycle_policies policy
  where policy.turma_id = new.turma_id and policy.active;
  if not found or (
    v_policy.initial_state <> 'IMPORTADA_CONCLUIDA'
    and v_policy.eligibility_rule not in ('HISTORICO_EXTERNO', 'HISTORICO_IMPORTADO_CONSULTA')
  ) then return new; end if;
  if new.status_financeiro = 'AGENDADA' or new.ativar_em is not null then
    raise exception 'Turma importada não permite ativação financeira agendada.'
      using errcode = '42501';
  end if;
  if v_policy.initial_state = 'IMPORTADA_CONCLUIDA' and new.override_ativo then
    raise exception 'Turma sem novas cobranças não permite condições financeiras individuais.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;
revoke all on function internal_academic.normalize_new_technical_financial_override(),
  internal_academic.ensure_imported_technical_cycle_config(uuid),
  internal_academic.ensure_technical_financial_pending(uuid),
  internal_academic.guard_imported_technical_activation()
  from public, anon, authenticated, service_role;

-- Snapshot protected state before adding policy/configuration rows.
create temporary table imported_cycle_preservation on commit drop as
select 'enrollments'::text source, md5(coalesce(jsonb_agg(to_jsonb(m) order by m.id)::text,'[]')) fingerprint
from public.matriculas m join internal_proesc.class_scopes s on s.turma_id=m.turma_id
union all
select 'receivables', md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text,'[]'))
from public.contas_receber c join internal_proesc.class_scopes s on s.turma_id=c.turma_id
union all
select 'runs', md5(coalesce(jsonb_agg(to_jsonb(r) order by r.matricula_id,r.cycle_number)::text,'[]'))
from internal_academic.technical_manual_cycle_runs r;

do $initialize_imported_cycles$
declare
  v_class record;
  v_enrollment record;
  v_actor uuid;
  v_auth_actor uuid;
  v_count integer := 0;
  v_rule jsonb;
begin
  select updated_by into strict v_actor from internal_proesc.connection where id;
  perform internal_proesc.authorize_financial_operator(v_actor);
  select auth_user.id into v_auth_actor
  from public.usuarios_sistema operator join auth.users auth_user on auth_user.id=operator.auth_user_id
  where operator.id=v_actor;
  for v_class in
    select s.turma_id,s.class_code from internal_proesc.class_scopes s
    where s.batch_id is not null and s.phase='CONFIRMED' and s.financial_mode='INDIVIDUAL_REVIEW'
      and s.class_code in ('ENF-T35-INT-MAT','ENF-T37-SEM-PDF','ENF-T38-INT-MAT',
        'ENF-T39-SEM-PDF','ENF-T40-INT-MAT','ENF-T41-SEM-AQB',
        'ENF-T43-INT-MAT','ENF-T44-SEM-AQB','ENF-T45-SEM-PDF')
    order by s.class_code
  loop
    v_count:=v_count+1;
    v_rule:=internal_academic.technical_financial_rule(v_class.turma_id);
    if v_rule#>>'{cobranca,mensalidade,valor}' is distinct from '279.90'
      or (v_rule#>>'{cobranca,mensalidade,quantidade}')::integer is distinct from 12
      or v_rule#>>'{cobranca,matricula,valor}' is distinct from '200.00'
      or v_rule#>>'{cobranca,rematricula,valor}' is distinct from '100.00' then
      raise exception 'Initialize and review the commercial rule before cycle configuration.';
    end if;
    if exists (select 1 from internal_academic.technical_manual_cycle_policies
      where turma_id=v_class.turma_id) then
      raise exception 'Imported class already has a cycle policy; review instead of overwriting.';
    end if;
    insert into internal_academic.technical_manual_cycle_policies(
      turma_id,generation_mode,initial_state,baseline_cycle,max_cycle,eligibility_rule,
      active,revision,created_by
    ) values(v_class.turma_id,'MANUAL','IMPORTADA_CICLO_1',1,2,
      'HISTORICO_IMPORTADO_CONSULTA',true,1,v_auth_actor);
    for v_enrollment in select id from public.matriculas where turma_id=v_class.turma_id order by id loop
      perform internal_academic.ensure_imported_technical_cycle_config(v_enrollment.id);
    end loop;
  end loop;
  if v_count<>9 then raise exception 'Expected exactly the nine reviewed imported classes.'; end if;
end;
$initialize_imported_cycles$;

do $preserve_imported_history$
begin
  if exists (
    (select 'enrollments'::text source, md5(coalesce(jsonb_agg(to_jsonb(m) order by m.id)::text,'[]')) fingerprint
    from public.matriculas m join internal_proesc.class_scopes s on s.turma_id=m.turma_id
    union all
    select 'receivables', md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text,'[]'))
    from public.contas_receber c join internal_proesc.class_scopes s on s.turma_id=c.turma_id
    union all
    select 'runs', md5(coalesce(jsonb_agg(to_jsonb(r) order by r.matricula_id,r.cycle_number)::text,'[]'))
    from internal_academic.technical_manual_cycle_runs r)
    except select * from pg_temp.imported_cycle_preservation
  ) then raise exception 'Existing enrollments, receivables or emitted cycles changed.'; end if;
end;
$preserve_imported_history$;

notify pgrst, 'reload schema';
commit;
