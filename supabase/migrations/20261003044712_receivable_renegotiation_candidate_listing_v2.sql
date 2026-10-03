begin;

-- O resumo lista saldos nominais do escopo inicial, não uma aprovação de
-- elegibilidade. Encargos, bloqueios, seleção e proposta continuam canônicos
-- nas RPCs de detalhe/preview/save. Não chamar helpers por parcela aqui.
create function public.list_receivable_renegotiation_candidate_groups_v2_secure(
  p_polo_id uuid,
  p_search text,
  p_page integer,
  p_page_size integer,
  p_as_of date,
  p_course_type text,
  p_turma_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_as_of date := internal_finance.receivable_renegotiation_public_as_of(p_as_of);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_course_type text := nullif(upper(btrim(coalesce(p_course_type, ''))), '');
  v_result jsonb;
begin
  perform internal_finance.assert_receivable_renegotiation_scope(p_polo_id);
  if length(coalesce(v_search, '')) > 120
    or p_page is null or p_page < 1 or p_page > 1000000
    or p_page_size is null or p_page_size not between 1 and 20
    or (v_course_type is not null
      and v_course_type not in ('TECNICO', 'LIVRE', 'ESPECIALIZACAO', 'EAD'))
  then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_FILTERS';
  end if;

  with scoped as materialized (
    select receivable.id, receivable.polo_id, enrollment.id as matricula_id,
      student.id as aluno_id, student.nome as student_name,
      class.id as turma_id, class.nome as class_name, class.codigo as class_code,
      case upper(course.modalidade)
        when 'TÉCNICO' then 'TECNICO'
        when 'ESPECIALIZAÇÃO' then 'ESPECIALIZACAO'
        else upper(course.modalidade)
      end as course_type,
      receivable.data_vencimento as due_date,
      round(receivable.valor * 100)::bigint as principal_cents
    from public.contas_receber receivable
    join public.matriculas enrollment on enrollment.id = receivable.matricula_id
      and enrollment.aluno_id = receivable.cliente_id
      and enrollment.turma_id = receivable.turma_id
    join public.parceiros student on student.id = enrollment.aluno_id
    join public.turmas class on class.id = enrollment.turma_id
      and class.polo_id = receivable.polo_id
    join public.cursos course on course.id = class.curso_id
    where receivable.status in ('PENDENTE', 'VENCIDO')
      and receivable.data_pagamento is null
      and coalesce(receivable.valor_pago, 0) = 0
      and receivable.valor > 0 and receivable.valor <= 90000000000000
      and round(receivable.valor, 2) = receivable.valor
      and receivable.data_vencimento is not null
      and pg_catalog.isfinite(receivable.data_vencimento)
      and upper(coalesce(receivable.tipo_lancamento, '')) = 'PARCELA'
      and receivable.regra_financeira_dependencia_snapshot is null
      and upper(course.modalidade) in (
        'TECNICO', 'TÉCNICO', 'LIVRE', 'ESPECIALIZACAO', 'ESPECIALIZAÇÃO'
      )
      and (p_polo_id is null or receivable.polo_id = p_polo_id)
      -- Pré-filtro set-based equivalente à origem LOCAL/BANESE; identidade
      -- bancária e demais guardas continuam obrigatórias no detalhe/preview.
      and lower(btrim(coalesce(receivable.gateway_provider, '')))
        in ('', 'banese', 'banese_card')
      and not (lower(btrim(coalesce(receivable.gateway_provider, ''))) = ''
        and (receivable.asaas_payment_id is not null
          or receivable.asaas_payment_link_id is not null))
      and not exists (
        select 1 from internal_proesc.obligation_links link
        where link.receivable_id = receivable.id
      )
  ), course_scoped as materialized (
    select * from scoped
    where v_course_type is null or course_type = v_course_type
  ), filtered as materialized (
    select * from course_scoped
    where (p_turma_id is null or turma_id = p_turma_id)
      and (v_search is null
        or student_name ilike '%' || v_search || '%'
        or class_name ilike '%' || v_search || '%'
        or class_code ilike '%' || v_search || '%'
        or matricula_id::text = v_search)
  ), grouped as materialized (
    select polo_id, aluno_id, student_name, matricula_id,
      turma_id, class_name, class_code, course_type,
      count(*)::integer as open_count,
      count(*) filter (where due_date < v_as_of)::integer as overdue_count,
      count(*) filter (where due_date >= v_as_of)::integer as future_count,
      sum(principal_cents) as principal_cents,
      min(due_date) filter (where due_date < v_as_of) as oldest_due,
      min(due_date) filter (where due_date >= v_as_of) as next_due
    from filtered
    group by polo_id, aluno_id, student_name, matricula_id,
      turma_id, class_name, class_code, course_type
  ), students as materialized (
    select aluno_id, student_name, sum(overdue_count) as overdue_count,
      min(oldest_due) as oldest_due
    from grouped group by aluno_id, student_name
  ), page_students as materialized (
    select * from students
    order by overdue_count desc, oldest_due asc nulls last, student_name, aluno_id
    limit p_page_size offset ((p_page::bigint - 1) * p_page_size)
  ), page_groups as (
    select grouped.*, page_students.overdue_count as student_overdue_count,
      page_students.oldest_due as student_oldest_due
    from grouped join page_students using (aluno_id, student_name)
  ), classes as (
    select distinct turma_id, class_name, class_code, course_type
    from course_scoped
  )
  select jsonb_build_object(
    'version', 2, 'asOf', v_as_of, 'pageBy', 'STUDENT',
    'page', p_page, 'pageSize', p_page_size,
    'totalGroups', (select count(*) from grouped),
    'totalStudents', (select count(*) from students),
    'totalPages', greatest(1, ceil(
      (select count(*) from students)::numeric / p_page_size
    )::integer),
    'summaryKind', 'OPEN_NOMINAL_PENDING_ELIGIBILITY',
    'filterOptions', jsonb_build_object(
      'courseTypes', jsonb_build_array(
        jsonb_build_object('id', 'TECNICO', 'label', 'Técnico'),
        jsonb_build_object('id', 'LIVRE', 'label', 'Curso livre'),
        jsonb_build_object('id', 'ESPECIALIZACAO', 'label', 'Especialização'),
        jsonb_build_object('id', 'EAD', 'label', 'EAD (fora do escopo inicial)')
      ),
      'turmas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', turma_id, 'label', concat_ws(' · ', nullif(class_code, ''), class_name),
        'courseType', course_type
      ) order by class_name, class_code, turma_id), '[]'::jsonb) from classes)
    ),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object(
      'poloId', polo_id, 'alunoId', aluno_id, 'alunoNome', student_name,
      'matriculaId', matricula_id, 'matriculaCodigo', null,
      'turmaId', turma_id, 'turmaNome', class_name, 'turmaCodigo', class_code,
      'courseType', course_type,
      'policyKind', case when course_type = 'TECNICO' then 'TECNICO'
        else 'PLANO_UNICO' end,
      'openCount', open_count, 'eligibilityPending', true,
      'eligibleCount', null, 'blockedCount', null,
      'overdueCount', overdue_count, 'futureCount', future_count,
      'principalCents', principal_cents,
      'accruedInterestCents', null, 'accruedPenaltyCents', null,
      'grossDebtCents', null,
      'oldestDueDate', oldest_due, 'nextDueDate', next_due
    ) order by student_overdue_count desc, student_oldest_due asc nulls last,
      student_name, aluno_id, class_name, matricula_id), '[]'::jsonb)
      from page_groups)
  ) into v_result;
  return v_result;
end;
$function$;

revoke all on function public.list_receivable_renegotiation_candidate_groups_v2_secure(
  uuid, text, integer, integer, date, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.list_receivable_renegotiation_candidate_groups_v2_secure(
  uuid, text, integer, integer, date, text, uuid
) to authenticated, service_role;

comment on function public.list_receivable_renegotiation_candidate_groups_v2_secure(
  uuid, text, integer, integer, date, text, uuid
) is 'Lista nominal paginada por aluno; elegibilidade, encargos e seleção são verificados no detalhe e novamente na prévia/salvamento.';

notify pgrst, 'reload schema';
commit;
