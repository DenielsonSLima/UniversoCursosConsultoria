-- A class's imported cycle never supplies the history of a new person.
-- No enrollment, receivable, payment or bank identity is changed here.
begin;

create function internal_academic.is_manual_technical_enrollment(p_matricula_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.matriculas m
    join public.turmas t on t.id=m.turma_id join public.cursos c on c.id=t.curso_id
    where m.id=p_matricula_id and upper(coalesce(c.modalidade,'')) in ('TECNICO','TÉCNICO'));
$$;

create function internal_academic.technical_cycle_history_outside_enrollment(p_matricula_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  with person as (select aluno_id from public.matriculas where id=p_matricula_id),
  other_enrollments as (select m.id from public.matriculas m join person p on p.aluno_id=m.aluno_id
    where m.id<>p_matricula_id)
  select exists(select 1 from public.contas_receber r
    where (r.cliente_id in (select aluno_id from person) and r.matricula_id is distinct from p_matricula_id)
      or r.matricula_id in (select id from other_enrollments))
    or exists(select 1 from internal_proesc.enrollment_sources s
      join other_enrollments m on m.id=s.matricula_id)
    or exists(select 1 from internal_proesc.obligation_links l
      join other_enrollments m on m.id=l.matricula_id)
    or exists(select 1 from internal_proesc.enrollment_cycle_evidence e
      join other_enrollments m on m.id=e.matricula_id)
    or exists(select 1 from internal_academic.technical_external_cycle_coverage c
      join other_enrollments m on m.id=c.matricula_id)
    or exists(select 1 from internal_academic.technical_manual_cycle_runs r
      join other_enrollments m on m.id=r.matricula_id);
$$;

-- Enrollment status is checked by the state/generation RPC, independently of
-- the person's registration status. PENDENTE is an allowed technical admission.
-- Transfer flags and class dates are not proof that a student owes a past cycle.
create function internal_academic.technical_local_cycle_eligible(p_matricula_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  with person as (
    select m.aluno_id,m.turma_id from public.matriculas m
    where m.id=p_matricula_id
      and internal_academic.is_manual_technical_enrollment(m.id)
  ), enrollments as (
    select m.id from public.matriculas m join person p on p.aluno_id=m.aluno_id
  )
  select exists(select 1 from person)
    and not exists(select 1 from person p join internal_proesc.class_scopes s
      on s.turma_id=p.turma_id where s.phase<>'CONFIRMED')
    and not exists(select 1 from internal_proesc.enrollment_sources s
      join enrollments e on e.id=s.matricula_id)
    and not exists(select 1 from internal_proesc.obligation_links l
      join enrollments e on e.id=l.matricula_id)
    and not exists(select 1 from internal_proesc.enrollment_cycle_evidence c
      join enrollments e on e.id=c.matricula_id)
    and not exists(select 1 from internal_academic.technical_external_cycle_coverage c
      join enrollments e on e.id=c.matricula_id)
    and not exists(select 1 from internal_academic.technical_manual_cycle_runs r
      join enrollments e on e.id=r.matricula_id
      where r.matricula_id<>p_matricula_id or r.state='PROTECTED_EXISTING'
        or (r.cycle_number=2 and not exists(
          select 1 from internal_academic.technical_manual_cycle_runs first_run
          where first_run.matricula_id=r.matricula_id and first_run.cycle_number=1
            and first_run.state='LOCAL_CREATED')))
    and not exists(select 1 from public.contas_receber cr
      where (cr.cliente_id in (select aluno_id from person)
        or cr.matricula_id in (select id from enrollments))
        and not exists(select 1 from internal_academic.technical_manual_cycle_runs run
          where run.matricula_id=p_matricula_id and run.turma_id=cr.turma_id
            and cr.matricula_id=run.matricula_id
            and cr.cliente_id=(select aluno_id from person)
            and run.state in ('GENERATING','LOCAL_CREATED')
            and cr.regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}'=run.request_id::text
            and cr.regra_financeira_tecnica_snapshot#>>'{cicloManual,cicloNumero}'=run.cycle_number::text
            and (cr.id=any(run.receivable_ids) or (run.state='GENERATING'
              and run.request_id::text=current_setting('app.technical_manual_cycle_request_id',true)))))
$$;

revoke all on function internal_academic.is_manual_technical_enrollment(uuid),
  internal_academic.technical_cycle_history_outside_enrollment(uuid),
  internal_academic.technical_local_cycle_eligible(uuid) from public,anon,authenticated,service_role;

-- Retain the canonical state implementation and all existing run/duplicate
-- protections. The virtual policy applies only after individual history checks.
do $individual_policy$
declare v_definition text; v_from text; v_to text;
begin
  v_definition:=pg_get_functiondef('internal_academic.technical_manual_cycle_state_before_external_history(uuid)'::regprocedure);
  if md5(v_definition)<>'35672b1026b6ea599ba3456004c64590' then
    raise exception 'Technical cycle base changed; review the individual policy patch.';
  end if;
  v_from:=$old$  if v_policy.turma_id is null then$old$;
  v_to:=$new$  if internal_academic.technical_local_cycle_eligible(p_matricula_id) then
    v_policy.turma_id:=v_enrollment.turma_id;
    v_policy.generation_mode:='MANUAL';
    v_policy.initial_state:='NOVA';
    v_policy.baseline_cycle:=0;
    v_policy.max_cycle:=2;
    v_policy.eligibility_rule:='MANUAL_APOS_EMISSAO';
    v_policy.active:=true;
    v_policy.revision:=coalesce(v_policy.revision,1);
  end if;
  if v_policy.turma_id is null then$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Unexpected cycle policy boundary.'; end if;
  v_definition:=replace(v_definition,v_from,v_to);

  v_from:=$old$  select run.* into v_last_run$old$;
  v_to:=$new$  if v_policy.eligibility_rule='MANUAL_APOS_EMISSAO' then
    v_policy_projection:=jsonb_build_object('fingerprint',encode(extensions.digest(
      jsonb_build_object('version',3,'matriculaId',p_matricula_id,
        'turmaId',v_enrollment.turma_id,'origemMatriculaId',v_enrollment.origem_matricula_id,
        'baseline',0,'maximum',2,'criterion',v_policy.eligibility_rule,
        'classPolicy',v_policy_projection)::text,'sha256'),'hex'));
  end if;

  select run.* into v_last_run$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Unexpected cycle fingerprint boundary.'; end if;
  v_definition:=replace(v_definition,v_from,v_to);

  v_from:=$old$    else
      if v_last_run.matricula_id is not null$old$;
  v_to:=$new$    elsif v_policy.eligibility_rule='MANUAL_APOS_EMISSAO' then
      if v_last_run.cycle_number=1 and v_last_run.state='LOCAL_CREATED'
        and cardinality(v_last_run.receivable_ids)=v_last_run.item_count
        and (select count(*) from public.contas_receber r
          where r.id=any(v_last_run.receivable_ids) and r.matricula_id=p_matricula_id
            and r.turma_id=v_enrollment.turma_id
            and r.regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}'=v_last_run.request_id::text
            and r.status in ('PENDENTE','PAGO','VENCIDO')
            and r.gateway_submission_status='API_REGISTERED')=v_last_run.item_count
      then v_state:='ELEGIVEL';
      else
        v_state:='BLOQUEADO';
        v_block_code:='CICLO_ANTERIOR_EMISSAO_PENDENTE';
        v_block_message:='Conclua ou revise a emissão do primeiro ciclo antes de gerar o segundo.';
      end if;
    else
      if v_last_run.matricula_id is not null$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Unexpected second cycle eligibility boundary.'; end if;
  execute replace(v_definition,v_from,v_to);
end;
$individual_policy$;

alter function internal_academic.technical_manual_cycle_state(uuid)
  rename to technical_manual_cycle_state_before_individual_admission;
create function internal_academic.technical_manual_cycle_state(p_matricula_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_state jsonb;
begin
  if internal_academic.technical_local_cycle_eligible(p_matricula_id) then
    return internal_academic.technical_manual_cycle_state_before_external_history(p_matricula_id);
  end if;
  v_state:=internal_academic.technical_manual_cycle_state_before_individual_admission(p_matricula_id);
  if internal_academic.is_manual_technical_enrollment(p_matricula_id) and (
    not coalesce((v_state->>'habilitado')::boolean,false)
    or internal_academic.technical_cycle_history_outside_enrollment(p_matricula_id)
    or (v_state->>'estado'='ELEGIVEL' and v_state->>'proximoCicloNumero'='1')
  ) then
    return v_state||jsonb_build_object('habilitado',true,'modo','MANUAL',
      'estado','PROTEGIDO_EXISTENTE','podeGerar',false,'cicloMaximo',2,
      'proximoCicloNumero',null,'primeiroVencimentoSugerido',null,
      'bloqueio',jsonb_build_object('codigo','HISTORICO_FINANCEIRO_EXISTENTE',
        'mensagem','Há histórico financeiro vinculado ao aluno. Confira as cobranças existentes antes de qualquer novo ciclo.'));
  end if;
  return v_state;
end;
$$;
revoke all on function internal_academic.technical_manual_cycle_state(uuid),
  internal_academic.technical_manual_cycle_state_before_individual_admission(uuid)
  from public,anon,authenticated,service_role;
commit;
