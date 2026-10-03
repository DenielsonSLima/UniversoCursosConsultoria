begin;

create or replace function internal_finance.receivable_renegotiation_public_as_of(
  p_as_of date
) returns date language plpgsql stable security definer set search_path = '' as $function$
declare
  v_today date := (pg_catalog.timezone('America/Maceio', pg_catalog.now()))::date;
begin
  if p_as_of is not null and not pg_catalog.isfinite(p_as_of) then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_AS_OF';
  end if;
  if auth.uid() is not null
    and coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
    and p_as_of is not null and p_as_of <> v_today
  then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_AS_OF',
      detail = 'A data-base pública deve ser a data corrente em America/Maceio.';
  end if;
  return coalesce(p_as_of, v_today);
end;
$function$;

create or replace function public.list_receivable_renegotiation_candidate_groups_secure(
  p_polo_id uuid default null,
  p_search text default null,
  p_page integer default 1,
  p_page_size integer default 20,
  p_as_of date default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_as_of date := internal_finance.receivable_renegotiation_public_as_of(p_as_of);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_total bigint;
  v_groups jsonb;
begin
  perform internal_finance.assert_receivable_renegotiation_scope(p_polo_id);
  if length(coalesce(v_search, '')) > 120
    or p_page is null or p_page < 1 or p_page > 1000000
    or p_page_size is null or p_page_size not between 1 and 100
  then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_FILTERS';
  end if;

  with base as materialized (
    select receivable.*, student.nome as student_name,
      class.nome as class_name, class.codigo as class_code,
      internal_finance.receivable_renegotiation_eligibility(
        receivable, v_as_of
      ) as eligibility
    from public.contas_receber receivable
    join public.matriculas enrollment on enrollment.id = receivable.matricula_id
    join public.parceiros student on student.id = enrollment.aluno_id
    join public.turmas class on class.id = enrollment.turma_id
    where receivable.status in ('PENDENTE', 'VENCIDO')
      and receivable.data_pagamento is null
      and (p_polo_id is null or receivable.polo_id = p_polo_id)
      and (v_search is null
        or student.nome ilike '%' || v_search || '%'
        or class.nome ilike '%' || v_search || '%'
        or class.codigo ilike '%' || v_search || '%'
        or enrollment.id::text = v_search)
  ), eligible_items as materialized (
    select base.*,
      internal_finance.receivable_renegotiation_source_item(base.id, v_as_of) as item
    from base where (base.eligibility ->> 'eligible')::boolean
  ), base_stats as (
    select matricula_id, count(*)::integer as open_count
    from base group by matricula_id
  ), eligible_stats as (
    select
      matricula_id,
      (array_agg(polo_id order by id))[1] as polo_id,
      (array_agg(cliente_id order by id))[1] as aluno_id,
      (array_agg(turma_id order by id))[1] as turma_id,
      (array_agg(student_name order by id))[1] as student_name,
      (array_agg(class_name order by id))[1] as class_name,
      (array_agg(class_code order by id))[1] as class_code,
      min(item ->> 'policyKind') as policy_kind,
      count(*)::integer as eligible_count,
      count(*) filter (where (item ->> 'overdue')::boolean)::integer as overdue_count,
      count(*) filter (where not (item ->> 'overdue')::boolean)::integer as future_count,
      sum((item ->> 'principalCents')::bigint) as principal_cents,
      sum((item ->> 'interestCents')::bigint) as interest_cents,
      sum((item ->> 'penaltyCents')::bigint) as penalty_cents,
      sum((item ->> 'debtCents')::bigint) as gross_cents,
      min((item ->> 'dueDate')::date)
        filter (where (item ->> 'overdue')::boolean) as oldest_due,
      min((item ->> 'dueDate')::date)
        filter (where not (item ->> 'overdue')::boolean) as next_due
    from eligible_items group by matricula_id
  ), grouped as materialized (
    select eligible_stats.*, base_stats.open_count - eligible_stats.eligible_count as blocked_count
    from eligible_stats join base_stats using (matricula_id)
  ), positioned as (
    select * from grouped
    order by overdue_count desc, oldest_due asc nulls last, student_name, matricula_id
    limit p_page_size offset ((p_page::bigint - 1) * p_page_size)
  )
  select
    (select count(*) from grouped),
    coalesce(jsonb_agg(jsonb_build_object(
      'poloId', positioned.polo_id,
      'alunoId', positioned.aluno_id,
      'alunoNome', positioned.student_name,
      'matriculaId', positioned.matricula_id,
      'matriculaCodigo', null,
      'turmaId', positioned.turma_id,
      'turmaNome', positioned.class_name,
      'turmaCodigo', positioned.class_code,
      'policyKind', positioned.policy_kind,
      'eligibleCount', positioned.eligible_count,
      'blockedCount', positioned.blocked_count,
      'overdueCount', positioned.overdue_count,
      'futureCount', positioned.future_count,
      'principalCents', positioned.principal_cents,
      'accruedInterestCents', positioned.interest_cents,
      'accruedPenaltyCents', positioned.penalty_cents,
      'grossDebtCents', positioned.gross_cents,
      'oldestDueDate', positioned.oldest_due,
      'nextDueDate', positioned.next_due
    ) order by positioned.overdue_count desc, positioned.oldest_due asc nulls last,
      positioned.student_name, positioned.matricula_id), '[]'::jsonb)
  into v_total, v_groups from positioned;

  return jsonb_build_object(
    'version', 1, 'asOf', v_as_of,
    'page', p_page, 'pageSize', p_page_size,
    'totalGroups', v_total,
    'totalPages', greatest(1, ceil(v_total::numeric / p_page_size)::integer),
    'groups', v_groups
  );
end;
$function$;

create or replace function public.list_receivable_renegotiation_candidate_items_secure(
  p_matricula_id uuid,
  p_as_of date default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_as_of date := internal_finance.receivable_renegotiation_public_as_of(p_as_of);
  v_identity jsonb;
  v_polo_id uuid;
  v_policy_kind text;
  v_policy_defaults jsonb;
  v_items jsonb;
begin
  perform internal_finance.assert_receivable_renegotiation_identity();
  if p_matricula_id is null then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_SELECTION';
  end if;
  select class.polo_id, jsonb_build_object(
    'poloId', class.polo_id, 'alunoId', enrollment.aluno_id,
    'alunoNome', student.nome, 'matriculaId', enrollment.id,
    'turmaId', class.id, 'turmaNome', class.nome, 'turmaCodigo', class.codigo
  ) into v_polo_id, v_identity
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  join public.parceiros student on student.id = enrollment.aluno_id
  where enrollment.id = p_matricula_id;
  if v_polo_id is null then
    raise exception using errcode = 'P0002', message = 'RENEGOTIATION_ENROLLMENT_NOT_FOUND';
  end if;
  perform internal_finance.assert_receivable_renegotiation_scope(v_polo_id);

  with scored as materialized (
    select receivable.*,
      internal_finance.receivable_renegotiation_eligibility(
        receivable, v_as_of
      ) as eligibility
    from public.contas_receber receivable
    where receivable.matricula_id = p_matricula_id
      and receivable.status in ('PENDENTE', 'VENCIDO')
      and receivable.data_pagamento is null
  ), presented as (
    select scored.*,
      case when (eligibility ->> 'eligible')::boolean
        then internal_finance.receivable_renegotiation_source_item(scored.id, v_as_of)
        else null end as item
    from scored
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'receivableId', presented.id,
    'number', presented.parcela_numero,
    'label', presented.descricao,
    'dueDate', presented.data_vencimento,
    'status', presented.status,
    'overdue', presented.data_vencimento < v_as_of,
    'lateDays', case when presented.data_vencimento < v_as_of
      then v_as_of - presented.data_vencimento else 0 end,
    'principalCents', case when presented.item is not null
      then (presented.item ->> 'principalCents')::bigint else null end,
    'interestCents', case when presented.item is not null
      then (presented.item ->> 'interestCents')::bigint else null end,
    'penaltyCents', case when presented.item is not null
      then (presented.item ->> 'penaltyCents')::bigint else null end,
    'debtCents', case when presented.item is not null
      then (presented.item ->> 'debtCents')::bigint else null end,
    'policyKind', presented.eligibility ->> 'policyKind',
    'sourceSystem', presented.eligibility ->> 'sourceSystem',
    'eligibility', presented.eligibility
  ) order by presented.data_vencimento, presented.parcela_numero nulls last,
    presented.id), '[]'::jsonb)
  into v_items from presented;

  select item ->> 'policyKind' into v_policy_kind
  from jsonb_array_elements(v_items) item
  where (item -> 'eligibility' ->> 'eligible')::boolean limit 1;
  if v_policy_kind is not null then
    v_policy_defaults := internal_finance.resolve_receivable_renegotiation_policy(
      p_matricula_id, v_policy_kind
    );
  end if;
  return jsonb_build_object(
    'version', 1, 'asOf', v_as_of,
    'identity', v_identity,
    'policyDefaults', v_policy_defaults,
    'items', v_items
  );
end;
$function$;

create or replace function public.preview_receivable_renegotiation_secure(
  p_receivable_ids uuid[],
  p_terms jsonb default '{}'::jsonb,
  p_policy_overrides jsonb default '{}'::jsonb,
  p_as_of date default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_ids uuid[] := internal_finance.normalize_receivable_renegotiation_ids(p_receivable_ids);
  v_as_of date := internal_finance.receivable_renegotiation_public_as_of(p_as_of);
  v_polo_id uuid;
  v_count bigint;
begin
  perform internal_finance.assert_receivable_renegotiation_identity();
  select count(*), (array_agg(receivable.polo_id order by receivable.id))[1]
  into v_count, v_polo_id
  from public.contas_receber receivable where receivable.id = any(v_ids)
  having count(distinct receivable.polo_id) = 1;
  if v_count is distinct from cardinality(v_ids)::bigint or v_polo_id is null then
    raise exception using errcode = '23514', message = 'RENEGOTIATION_INVALID_SELECTION';
  end if;
  perform internal_finance.assert_receivable_renegotiation_scope(v_polo_id);
  return internal_finance.build_receivable_renegotiation_snapshot(
    v_ids, p_terms, p_policy_overrides, v_as_of
  );
end;
$function$;

revoke all on function internal_finance.receivable_renegotiation_public_as_of(date),
  public.list_receivable_renegotiation_candidate_groups_secure(uuid, text, integer, integer, date),
  public.list_receivable_renegotiation_candidate_items_secure(uuid, date),
  public.preview_receivable_renegotiation_secure(uuid[], jsonb, jsonb, date)
  from public, anon, authenticated, service_role;
grant execute on function public.list_receivable_renegotiation_candidate_groups_secure(
  uuid, text, integer, integer, date
), public.list_receivable_renegotiation_candidate_items_secure(uuid, date),
  public.preview_receivable_renegotiation_secure(uuid[], jsonb, jsonb, date)
  to authenticated, service_role;

comment on function public.preview_receivable_renegotiation_secure(
  uuid[], jsonb, jsonb, date
) is 'Prévia canônica sem ativar acordo, cancelar títulos ou emitir substitutos.';

notify pgrst, 'reload schema';
commit;
