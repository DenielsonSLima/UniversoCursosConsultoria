begin;

create table internal_academic.technical_manual_cycle_policies (
  turma_id uuid primary key references public.turmas(id) on delete cascade,
  generation_mode text not null default 'MANUAL'
    check (generation_mode = 'MANUAL'),
  initial_state text not null default 'NOVA'
    check (initial_state in (
      'NOVA', 'IMPORTADA_CICLO_1', 'IMPORTADA_CONCLUIDA'
    )),
  baseline_cycle smallint not null default 0
    check (baseline_cycle in (0, 1, 2)),
  max_cycle smallint not null default 2
    check (max_cycle = 2),
  eligibility_rule text not null default 'QUITACAO_TOTAL'
    check (eligibility_rule in ('QUITACAO_TOTAL', 'PENULTIMA_SEM_ATRASO')),
  active boolean not null default true,
  revision integer not null default 1 check (revision > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (initial_state = 'NOVA' and baseline_cycle = 0)
    or (initial_state = 'IMPORTADA_CICLO_1' and baseline_cycle = 1)
    or (initial_state = 'IMPORTADA_CONCLUIDA' and baseline_cycle = 2)
  )
);

create table internal_academic.technical_manual_cycle_runs (
  matricula_id uuid not null references public.matriculas(id) on delete cascade,
  turma_id uuid not null references public.turmas(id) on delete cascade,
  cycle_number smallint not null check (cycle_number in (1, 2)),
  state text not null
    check (state in ('GENERATING', 'LOCAL_CREATED', 'PROTECTED_EXISTING')),
  request_id uuid unique,
  rule_fingerprint text check (
    rule_fingerprint is null or rule_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  policy_fingerprint text check (
    policy_fingerprint is null or policy_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  schedule_fingerprint text check (
    schedule_fingerprint is null or schedule_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  first_due_date date,
  item_count integer not null check (item_count between 1 and 61),
  expected_installment_count smallint not null
    check (expected_installment_count between 1 and 60),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  receivable_ids uuid[] not null default '{}'::uuid[],
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (matricula_id, cycle_number),
  check (
    (state = 'GENERATING' and request_id is not null and completed_at is null)
    or (state = 'LOCAL_CREATED' and request_id is not null and completed_at is not null)
    or (state = 'PROTECTED_EXISTING' and completed_at is not null)
  ),
  check (
    (state = 'GENERATING' and cardinality(receivable_ids) = 0)
    or (
      state in ('LOCAL_CREATED', 'PROTECTED_EXISTING')
      and cardinality(receivable_ids) = item_count
    )
  )
);

create index technical_manual_cycle_runs_turma_idx
  on internal_academic.technical_manual_cycle_runs(turma_id, cycle_number);

revoke all on table internal_academic.technical_manual_cycle_policies
  from public, anon, authenticated, service_role;
revoke all on table internal_academic.technical_manual_cycle_runs
  from public, anon, authenticated, service_role;

do $policy$
declare
  v_turma_id uuid;
  v_turma_count integer;
begin
  select count(*)::integer into v_turma_count
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.codigo = 'ENF-T42-INT-MAT'
    and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'TÉCNICO');

  if v_turma_count = 0 then
    return;
  elsif v_turma_count > 1 then
    raise exception 'Código técnico ENF-T42-INT-MAT não é único.'
      using errcode = '21000';
  end if;

  select class.id into v_turma_id
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.codigo = 'ENF-T42-INT-MAT'
    and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'TÉCNICO');

  insert into internal_academic.technical_manual_cycle_policies(
    turma_id, generation_mode, initial_state, baseline_cycle, max_cycle,
    eligibility_rule, active, revision
  ) values (
    v_turma_id, 'MANUAL', 'IMPORTADA_CICLO_1', 1, 2,
    'PENULTIMA_SEM_ATRASO', true, 1
  );

  insert into internal_academic.technical_manual_cycle_runs(
    matricula_id, turma_id, cycle_number, state, request_id,
    first_due_date, item_count, expected_installment_count,
    total_amount, receivable_ids,
    completed_at
  )
  select
    enrollment.id,
    enrollment.turma_id,
    2,
    'PROTECTED_EXISTING',
    null,
    min(receivable.data_vencimento),
    count(*)::integer,
    count(*) filter (
      where upper(coalesce(receivable.tipo_lancamento, '')) = 'PARCELA'
    )::integer,
    round(sum(receivable.valor)::numeric, 2),
    array_agg(receivable.id order by receivable.data_vencimento, receivable.id),
    pg_catalog.clock_timestamp()
  from public.matriculas enrollment
  join public.contas_receber receivable
    on receivable.matricula_id = enrollment.id
  where enrollment.turma_id = v_turma_id
    and (
      (
        upper(coalesce(receivable.tipo_lancamento, '')) = 'REMATRICULA'
        and receivable.origem_cronograma_id = 'ciclo-1-rematricula'
      )
      or (
        upper(coalesce(receivable.tipo_lancamento, '')) = 'PARCELA'
        and receivable.origem_cronograma_id ~ '^ciclo-2-parc-[0-9]+$'
      )
      or receivable.regra_financeira_tecnica_snapshot
        -> 'cicloManual' ->> 'cicloNumero' = '2'
    )
    and exists (
      select 1
      from public.contas_receber lead_receivable
      where lead_receivable.matricula_id = enrollment.id
        and upper(coalesce(lead_receivable.tipo_lancamento, '')) = 'REMATRICULA'
        and (
          lead_receivable.origem_cronograma_id = 'ciclo-1-rematricula'
          or lead_receivable.regra_financeira_tecnica_snapshot
            -> 'cicloManual' ->> 'cicloNumero' = '2'
        )
    )
  group by enrollment.id, enrollment.turma_id
  having count(*) = 13
    and count(*) filter (
      where upper(coalesce(receivable.tipo_lancamento, '')) = 'REMATRICULA'
    ) = 1
    and count(*) filter (
      where upper(coalesce(receivable.tipo_lancamento, '')) = 'PARCELA'
    ) = 12;
end;
$policy$;

create or replace function
internal_academic.technical_manual_cycle_policy_projection(
  p_turma_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select jsonb_build_object(
      'habilitado', true,
      'modo', policy.generation_mode,
      'estadoInicial', policy.initial_state,
      'cicloBaseHistorico', policy.baseline_cycle,
      'cicloMaximo', policy.max_cycle,
      'criterioElegibilidade', policy.eligibility_rule,
      'revisao', policy.revision,
      'fingerprint', pg_catalog.encode(extensions.digest(
        pg_catalog.convert_to(jsonb_build_object(
          'versao', 2,
          'turmaId', policy.turma_id,
          'modo', policy.generation_mode,
          'estadoInicial', policy.initial_state,
          'cicloBaseHistorico', policy.baseline_cycle,
          'cicloMaximo', policy.max_cycle,
          'criterioElegibilidade', policy.eligibility_rule,
          'revisao', policy.revision
        )::text, 'UTF8'),
        'sha256'
      ), 'hex')
    )
    from internal_academic.technical_manual_cycle_policies policy
    where policy.turma_id = p_turma_id
      and policy.active
      and policy.generation_mode = 'MANUAL'
  ), jsonb_build_object(
    'habilitado', false, 'modo', null, 'estadoInicial', null,
    'cicloBaseHistorico', null, 'cicloMaximo', null,
    'criterioElegibilidade', null, 'revisao', null, 'fingerprint', null
  ));
$function$;

revoke all on function
  internal_academic.technical_manual_cycle_policy_projection(uuid)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.is_technical_manual_cycle_protected(
  p_matricula_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from internal_academic.technical_manual_cycle_runs run
    where run.matricula_id = p_matricula_id
      and run.state = 'PROTECTED_EXISTING'
  );
$function$;

revoke all on function internal_academic.is_technical_manual_cycle_protected(uuid)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.guard_technical_manual_cycle_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_request_id uuid;
  v_expected_origin text;
begin
  if new.matricula_id is null
    or upper(coalesce(new.tipo_lancamento, '')) not in (
      'MATRICULA', 'REMATRICULA', 'PARCELA'
    )
    or not exists (
      select 1
      from public.matriculas enrollment
      join internal_academic.technical_manual_cycle_policies policy
        on policy.turma_id = enrollment.turma_id
       and policy.active
       and policy.generation_mode = 'MANUAL'
      where enrollment.id = new.matricula_id
    )
  then
    return new;
  end if;

  if internal_academic.is_technical_manual_cycle_protected(new.matricula_id) then
    raise exception 'Matrícula protegida: novas cobranças técnicas são bloqueadas.'
      using errcode = 'P0001';
  end if;

  begin
    v_request_id := nullif(
      current_setting('app.technical_manual_cycle_request_id', true), ''
    )::uuid;
  exception when invalid_text_representation then
    v_request_id := null;
  end;

  select run.* into v_run
  from internal_academic.technical_manual_cycle_runs run
  where run.matricula_id = new.matricula_id
    and run.request_id = v_request_id
    and run.state = 'GENERATING';

  if v_run.matricula_id is null then
    raise exception 'Cobrança de ciclo técnico manual exige RPC autorizada.'
      using errcode = '42501';
  end if;

  v_expected_origin := case upper(new.tipo_lancamento)
    when 'MATRICULA' then 'matricula'
    when 'REMATRICULA' then 'ciclo-' || (v_run.cycle_number - 1) || '-rematricula'
    else 'ciclo-' || v_run.cycle_number || '-parc-' || new.parcela_numero
  end;

  if new.origem_cronograma_id is distinct from v_expected_origin then
    raise exception 'Identidade de cobrança incompatível com o ciclo manual.'
      using errcode = '22023';
  end if;
  return new;
end;
$function$;

revoke all on function internal_academic.guard_technical_manual_cycle_insert()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_technical_manual_cycle_insert
  on public.contas_receber;
create trigger guard_technical_manual_cycle_insert
before insert on public.contas_receber
for each row execute function internal_academic.guard_technical_manual_cycle_insert();

create or replace function internal_academic.guard_technical_manual_cycle_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1
    from internal_academic.technical_manual_cycle_runs run
    where run.state in ('LOCAL_CREATED', 'PROTECTED_EXISTING')
      and run.matricula_id = old.matricula_id
      and old.id = any(run.receivable_ids)
  ) then
    raise exception 'Cobrança vinculada a ciclo técnico manual não pode ser excluída.'
      using errcode = '42501';
  end if;
  return old;
end;
$function$;

revoke all on function internal_academic.guard_technical_manual_cycle_delete()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_technical_manual_cycle_delete
  on public.contas_receber;
create trigger guard_technical_manual_cycle_delete
before delete on public.contas_receber
for each row execute function internal_academic.guard_technical_manual_cycle_delete();

create or replace function internal_academic.guard_protected_technical_bank_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if internal_academic.is_technical_manual_cycle_protected(new.matricula_id)
    and (
      (
        new.gateway_creation_token is not null
        and new.gateway_creation_token is distinct from old.gateway_creation_token
      )
      or (
        new.gateway_cnab_file_id is not null
        and new.gateway_cnab_file_id is distinct from old.gateway_cnab_file_id
      )
      or (
        new.gateway_submission_channel = 'CNAB'
        and new.gateway_submission_channel is distinct from old.gateway_submission_channel
      )
      or (
        new.gateway_submission_channel = 'API'
        and new.gateway_submission_status = 'API_AMBIGUOUS'
        and new.gateway_submission_status is distinct from old.gateway_submission_status
      )
    )
  then
    raise exception 'Matrícula protegida: novo POST Banese bloqueado.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke all on function internal_academic.guard_protected_technical_bank_post()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_protected_technical_bank_post
  on public.contas_receber;
create trigger guard_protected_technical_bank_post
before update of gateway_creation_token, gateway_cnab_file_id,
  gateway_submission_channel, gateway_submission_status
on public.contas_receber
for each row execute function internal_academic.guard_protected_technical_bank_post();

comment on table internal_academic.technical_manual_cycle_policies is
  'Política manual técnica: NOVA, IMPORTADA_CICLO_1 ou IMPORTADA_CONCLUIDA; máximo fixo de dois ciclos.';
comment on table internal_academic.technical_manual_cycle_runs is
  'Fence idempotente por matrícula/ciclo; PROTECTED_EXISTING impede novas cobranças sem bloquear conciliação.';

notify pgrst, 'reload schema';
commit;
