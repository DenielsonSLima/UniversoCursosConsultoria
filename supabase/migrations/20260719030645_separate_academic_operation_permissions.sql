-- Separate class configuration access from academic operation access.
-- Configuration/catalog policies keep using can_write_turma. Only academic
-- records and lifecycle policies are redirected to the stricter helper.

create or replace function public.can_operate_turma_academics(p_turma_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select auth.role()), '') = 'service_role'
    or (
      public.gestor_has_module('gestao')
      and exists (
        select 1
        from public.turmas t
        where t.id = p_turma_id
          and public.is_gestor_for_polo(t.polo_id)
      )
    );
$function$;

revoke all on function public.can_operate_turma_academics(uuid)
  from public, anon;
grant execute on function public.can_operate_turma_academics(uuid)
  to authenticated, service_role;

comment on function public.can_operate_turma_academics(uuid) is
  'Authorizes service_role or a scheduled Gestao user in the class polo; unlike can_write_turma, Cadastros alone is insufficient.';

-- Read authorization is deliberately split by resource. A module that needs a
-- roster or a report must not inherit access to grades, attendance, internship
-- records or the teacher's private notes.
create or replace function public.gestor_can_read_turma(p_turma_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.can_operate_turma_academics(p_turma_id);
$function$;

revoke all on function public.gestor_can_read_turma(uuid)
  from public, anon;
grant execute on function public.gestor_can_read_turma(uuid)
  to authenticated, service_role;

comment on function public.gestor_can_read_turma(uuid) is
  'Legacy-compatible narrow helper: service_role or Gestao in the class polo. Resource-specific reads must use the dedicated helpers.';

create or replace function public.gestor_can_read_academic_roster(p_turma_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select auth.role()), '') = 'service_role'
    or (
      public.gestor_has_any_module(array[
        'gestao', 'relatorios', 'secretaria', 'parceiros'
      ])
      and exists (
        select 1
        from public.turmas t
        where t.id = p_turma_id
          and public.is_gestor_for_polo(t.polo_id)
      )
    );
$function$;

create or replace function public.gestor_can_read_diario_results(p_turma_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select auth.role()), '') = 'service_role'
    or (
      public.gestor_has_any_module(array[
        'gestao', 'secretaria', 'parceiros'
      ])
      and exists (
        select 1
        from public.turmas t
        where t.id = p_turma_id
          and public.is_gestor_for_polo(t.polo_id)
      )
    );
$function$;

create or replace function public.gestor_can_read_estagio_records(p_turma_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select auth.role()), '') = 'service_role'
    or (
      public.gestor_has_any_module(array[
        'gestao', 'relatorios', 'secretaria'
      ])
      and exists (
        select 1
        from public.turmas t
        where t.id = p_turma_id
          and public.is_gestor_for_polo(t.polo_id)
      )
    );
$function$;

create or replace function public.gestor_can_read_diario_internal(p_turma_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select auth.role()), '') = 'service_role'
    or (
      public.gestor_has_module('gestao')
      and exists (
        select 1
        from public.turmas t
        where t.id = p_turma_id
          and public.is_gestor_for_polo(t.polo_id)
      )
    );
$function$;

create or replace function public.gestor_can_read_enrollment_continuity(p_turma_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select auth.role()), '') = 'service_role'
    or (
      public.gestor_has_any_module(array[
        'gestao', 'secretaria', 'parceiros'
      ])
      and exists (
        select 1
        from public.turmas t
        where t.id = p_turma_id
          and public.is_gestor_for_polo(t.polo_id)
      )
    );
$function$;

do $block$
declare function_oid regprocedure;
begin
  foreach function_oid in array array[
    'public.gestor_can_read_academic_roster(uuid)'::regprocedure,
    'public.gestor_can_read_diario_results(uuid)'::regprocedure,
    'public.gestor_can_read_estagio_records(uuid)'::regprocedure,
    'public.gestor_can_read_diario_internal(uuid)'::regprocedure,
    'public.gestor_can_read_enrollment_continuity(uuid)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public, anon', function_oid);
    execute format('grant execute on function %s to authenticated, service_role', function_oid);
  end loop;
end;
$block$;

comment on function public.gestor_can_read_academic_roster(uuid) is
  'Roster read: Gestao, Relatorios, Secretaria or Parceiros, constrained by effective schedule and class polo.';
comment on function public.gestor_can_read_diario_results(uuid) is
  'Grades and attendance read: Gestao, Secretaria or Parceiros, constrained by effective schedule and class polo.';
comment on function public.gestor_can_read_estagio_records(uuid) is
  'Internship read: Gestao, Relatorios or Secretaria, constrained by effective schedule and class polo.';
comment on function public.gestor_can_read_diario_internal(uuid) is
  'Teacher notes and practices read: Gestao only, constrained by effective schedule and class polo.';
comment on function public.gestor_can_read_enrollment_continuity(uuid) is
  'Movement, transfer and credit read: Gestao, Secretaria or Parceiros, constrained by effective schedule and class polo.';

create or replace function public.can_write_academic_record_open(
  p_turma_id uuid,
  p_disciplina_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select auth.role()), '') = 'service_role' or exists (
    select 1
    from public.turmas t
    join public.cursos c on c.id = t.curso_id
    join public.turmas_disciplinas td
      on td.turma_id = t.id
     and td.disciplina_id = p_disciplina_id
    left join public.periodos_letivos pl on pl.id = td.periodo_letivo_id
    where t.id = p_turma_id
      and (
        (
          c.modalidade <> 'TECNICO'
          and (
            public.can_operate_turma_academics(t.id)
            or td.professor_id = public.current_professor_id()
          )
        )
        or (
          c.modalidade = 'TECNICO'
          and t.status = 'EM_ANDAMENTO'
          and pl.status in ('ABERTO', 'EM_FECHAMENTO')
          and (
            public.can_operate_turma_academics(t.id)
            or td.professor_id = public.current_professor_id()
          )
        )
      )
  );
$function$;

create or replace function public.can_access_atividade_extra_turma(p_turma_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.can_student_read_atividade_extra(p_turma_id)
    or public.gestor_can_read_turma(p_turma_id)
    or public.is_professor_assigned_turma(p_turma_id);
$function$;

create or replace function public.can_staff_read_atividade_extra(
  p_turma_id uuid,
  p_disciplina_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.gestor_can_read_turma(p_turma_id)
    or public.is_professor_assigned_disciplina(p_turma_id, p_disciplina_id);
$function$;

create or replace function public.can_prepare_atividade_extra(
  p_turma_id uuid,
  p_disciplina_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.turmas t
    join public.modulos m on m.curso_id = t.curso_id
    join public.disciplinas d on d.modulo_id = m.id
    where t.id = p_turma_id
      and d.id = p_disciplina_id
      and upper(coalesce(t.status, '')) in ('PLANEJADA', 'INSCRICOES_ABERTAS')
      and public.can_operate_turma_academics(t.id)
  );
$function$;

create or replace function public.can_operate_atividade_extra(
  p_turma_id uuid,
  p_disciplina_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.turmas t
    join public.cursos c on c.id = t.curso_id
    join public.turmas_disciplinas td
      on td.turma_id = t.id
     and td.disciplina_id = p_disciplina_id
    left join public.periodos_letivos pl on pl.id = td.periodo_letivo_id
    where t.id = p_turma_id
      and (
        (
          c.modalidade <> 'TECNICO'
          and (
            public.can_operate_turma_academics(t.id)
            or public.is_professor_assigned_disciplina_open(t.id, p_disciplina_id)
          )
        )
        or (
          c.modalidade = 'TECNICO'
          and upper(coalesce(t.status, '')) = 'EM_ANDAMENTO'
          and upper(coalesce(pl.status, '')) in ('ABERTO', 'EM_FECHAMENTO')
          and (
            public.can_operate_turma_academics(t.id)
            or td.professor_id = public.current_professor_id()
          )
        )
      )
  );
$function$;

-- Rebuild only policies whose data is academic/operational. Catalog, class
-- configuration and public enrollment policies intentionally remain unchanged.
do $block$
declare
  policy_row record;
  next_qual text;
  next_check text;
  replacement_function text;
  statement text;
  changed_count integer := 0;
begin
  for policy_row in
    select
      pol.polname,
      pol.polcmd,
      cls.relname as table_name,
      pg_get_expr(pol.polqual, pol.polrelid) as using_expression,
      pg_get_expr(pol.polwithcheck, pol.polrelid) as check_expression
    from pg_policy pol
    join pg_class cls on cls.oid = pol.polrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    where ns.nspname = 'public'
      and cls.relname = any(array[
        'aulas_turma',
        'diario_frequencia',
        'diario_notas',
        'diario_observacoes',
        'diario_praticas',
        'matriculas_estagios',
        'matricula_aproveitamentos',
        'matricula_movimentacoes',
        'matriculas',
        'transferencias_academicas',
        'turmas_disciplinas'
      ])
      and (
        coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') like '%can_write_turma(%'
        or coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') like '%can_write_turma(%'
      )
  loop
    replacement_function := case
      when policy_row.polcmd <> 'r' then
        'public.can_operate_turma_academics('
      when policy_row.table_name in ('diario_frequencia', 'diario_notas') then
        'public.gestor_can_read_diario_results('
      when policy_row.table_name = 'matriculas_estagios' then
        'public.gestor_can_read_estagio_records('
      when policy_row.table_name in ('diario_observacoes', 'diario_praticas') then
        'public.gestor_can_read_diario_internal('
      when policy_row.table_name in (
        'matricula_aproveitamentos',
        'matricula_movimentacoes',
        'transferencias_academicas'
      ) then
        'public.gestor_can_read_enrollment_continuity('
      when policy_row.table_name = 'matriculas' then
        'public.gestor_can_read_academic_roster('
      else null
    end;
    if replacement_function is null then
      raise exception
        'No resource-scoped read helper mapped for %.%',
        policy_row.table_name,
        policy_row.polname;
    end if;
    next_qual := replace(
      replace(policy_row.using_expression,
        'public.can_write_turma(', replacement_function),
      'can_write_turma(', replacement_function
    );
    next_check := replace(
      replace(policy_row.check_expression,
        'public.can_write_turma(', replacement_function),
      'can_write_turma(', replacement_function
    );

    statement := format(
      'alter policy %I on public.%I',
      policy_row.polname,
      policy_row.table_name
    );
    if next_qual is not null then
      statement := statement || format(' using (%s)', next_qual);
    end if;
    if next_check is not null then
      statement := statement || format(' with check (%s)', next_check);
    end if;
    execute statement;
    changed_count := changed_count + 1;
  end loop;

  if changed_count <> 22 then
    raise exception
      'Expected to harden 22 academic policies, changed %.',
      changed_count;
  end if;
end;
$block$;

-- The current roster policy already calls gestor_can_read_turma and therefore
-- is not part of the can_write_turma replacement loop above. Pin it explicitly
-- to the roster allowlist while preserving student and assigned-professor reads.
alter policy "portal_matriculas_select" on public.matriculas
using (
  aluno_id = (select public.current_aluno_id())
  or public.is_professor_assigned_turma(turma_id)
  or public.gestor_can_read_academic_roster(turma_id)
);

-- These two structural policies previously kept can_access_turma(), whose
-- gestor branch is merely polo-based. After module RBAC that would let any
-- scheduled gestor (including Financeiro, Inicio or Cadastros-only profiles)
-- enumerate the private class calendar and discipline/teacher bindings.
-- Keep student and assigned-professor reads. For staff, the result/document
-- helper admits exactly Gestao, Secretaria and Parceiros with schedule+polo;
-- Financeiro, Inicio, Cadastros and Relatorios-only profiles remain denied.
-- The separate *_public_select policies used by the landing pages are not
-- changed here.
alter policy "portal_aulas_turma_select" on public.aulas_turma
to authenticated
using (
  public.is_aluno_matriculado_turma(turma_id)
  or public.is_professor_assigned_disciplina(turma_id, disciplina_id)
  or public.gestor_can_read_diario_results(turma_id)
);

alter policy "portal_turmas_disciplinas_select"
on public.turmas_disciplinas
to authenticated
using (
  public.is_aluno_matriculado_turma(turma_id)
  or professor_id = public.current_professor_id()
  or public.gestor_can_read_diario_results(turma_id)
);
