-- Somente harness sintético: não executar fixtures em produção.
begin;

insert into public.cursos(id, modalidade) values
  (md5('listing-course-free')::uuid, 'LIVRE'),
  (md5('listing-course-ead')::uuid, 'EAD');
insert into public.turmas(id, codigo, nome, curso_id, polo_id, status) values
  (md5('listing-class-free')::uuid, 'L-1', 'Livre Sintética',
    md5('listing-course-free')::uuid, '00000000-0000-0000-0000-000000000010', 'ATIVO'),
  (md5('listing-class-ead')::uuid, 'E-1', 'EAD Sintética',
    md5('listing-course-ead')::uuid, '00000000-0000-0000-0000-000000000010', 'ATIVO');

insert into public.parceiros(id, nome, polo_id, status)
select md5('listing-student-' || n)::uuid, 'Sintético ' || lpad(n::text, 4, '0'),
  '00000000-0000-0000-0000-000000000010'::uuid, 'ATIVO'
from generate_series(1, 1000) n;
insert into public.matriculas(id, aluno_id, turma_id, status)
select md5('listing-enrollment-' || n || '-' || course)::uuid,
  md5('listing-student-' || n)::uuid,
  case when course = 1 then '00000000-0000-0000-0000-000000000200'::uuid
    else md5('listing-class-free')::uuid end, 'ATIVA'
from generate_series(1, 1000) n cross join generate_series(1, 2) course;
insert into public.contas_receber(id, polo_id, cliente_id, matricula_id,
  turma_id, valor, data_vencimento, status, descricao, parcela_numero, tipo_lancamento)
select md5('listing-item-' || n || '-' || course || '-' || installment)::uuid,
  '00000000-0000-0000-0000-000000000010'::uuid,
  md5('listing-student-' || n)::uuid,
  md5('listing-enrollment-' || n || '-' || course)::uuid,
  case when course = 1 then '00000000-0000-0000-0000-000000000200'::uuid
    else md5('listing-class-free')::uuid end,
  99.99, (now() at time zone 'America/Maceio')::date + installment - 4,
  'PENDENTE', 'Parcela sintética', installment, 'PARCELA'
from generate_series(1, 1000) n cross join generate_series(1, 2) course
cross join generate_series(1, 6) installment;

-- Uma matrícula fora do escopo não torna EAD elegível por causa do filtro.
insert into public.matriculas(id, aluno_id, turma_id, status) values
  (md5('listing-enrollment-ead')::uuid, md5('listing-student-1')::uuid,
    md5('listing-class-ead')::uuid, 'ATIVA');
insert into public.contas_receber(id, polo_id, cliente_id, matricula_id,
  turma_id, valor, data_vencimento, status, tipo_lancamento) values
  (md5('listing-item-ead')::uuid, '00000000-0000-0000-0000-000000000010',
    md5('listing-student-1')::uuid, md5('listing-enrollment-ead')::uuid,
    md5('listing-class-ead')::uuid, 100, current_date, 'PENDENTE', 'PARCELA');

insert into public.polos(id, company_id, nome, status) values
  ('00000000-0000-0000-0000-000000000099',
    '00000000-0000-0000-0000-000000000001', 'Outro polo sintético', 'ATIVO');
insert into public.turmas(id, codigo, nome, curso_id, polo_id, status) values
  (md5('listing-class-other-polo')::uuid, 'X-1', 'Outra turma sintética',
    '00000000-0000-0000-0000-000000000150',
    '00000000-0000-0000-0000-000000000099', 'ATIVO');
insert into public.matriculas(id, aluno_id, turma_id, status) values
  (md5('listing-enrollment-other-polo')::uuid, md5('listing-student-1')::uuid,
    md5('listing-class-other-polo')::uuid, 'ATIVA');
insert into public.contas_receber(id, polo_id, cliente_id, matricula_id,
  turma_id, valor, data_vencimento, status, tipo_lancamento) values
  (md5('listing-item-other-polo')::uuid, '00000000-0000-0000-0000-000000000099',
    md5('listing-student-1')::uuid, md5('listing-enrollment-other-polo')::uuid,
    md5('listing-class-other-polo')::uuid, 100, current_date, 'PENDENTE', 'PARCELA');

set local role authenticated;
do $test$
declare
  v_page jsonb;
  v_second jsonb;
  v_empty jsonb;
  v_filtered jsonb;
  v_first_ids uuid[];
  v_second_ids uuid[];
  v_original_items jsonb;
begin
  v_page := public.list_receivable_renegotiation_candidate_groups_v2_secure(
    '00000000-0000-0000-0000-000000000010', null, 1, 20, null, null, null
  );
  assert v_page ->> 'version' = '2';
  assert v_page ->> 'pageBy' = 'STUDENT';
  assert (v_page ->> 'totalStudents')::int = 1001;
  assert (v_page ->> 'totalGroups')::int = 2001;
  assert (v_page ->> 'totalPages')::int = 51;
  assert jsonb_array_length(v_page -> 'groups') = 40;
  assert jsonb_array_length(v_page #> '{filterOptions,turmas}') = 2;
  assert not exists(select 1 from jsonb_array_elements(v_page #> '{filterOptions,turmas}') t
    where t ->> 'id' = md5('listing-class-other-polo')::uuid::text);
  assert not exists(select 1 from jsonb_array_elements(v_page -> 'groups') g
    where g ->> 'eligibilityPending' <> 'true' or g ->> 'eligibleCount' is not null
      or g ->> 'blockedCount' is not null or g ->> 'grossDebtCents' is not null
      or g ->> 'accruedInterestCents' is not null);
  assert not exists(select 1 from jsonb_array_elements(v_page -> 'groups') g
    where (g ->> 'openCount')::int <> 6 or (g ->> 'principalCents')::int <> 59994
      or (g ->> 'overdueCount')::int <> 3 or (g ->> 'futureCount')::int <> 3);

  v_second := public.list_receivable_renegotiation_candidate_groups_v2_secure(
    '00000000-0000-0000-0000-000000000010', null, 2, 20, null, null, null
  );
  select array_agg(distinct (g ->> 'alunoId')::uuid) into v_first_ids
  from jsonb_array_elements(v_page -> 'groups') g;
  select array_agg(distinct (g ->> 'alunoId')::uuid) into v_second_ids
  from jsonb_array_elements(v_second -> 'groups') g;
  assert cardinality(v_first_ids) = 20 and cardinality(v_second_ids) = 20;
  assert not v_first_ids && v_second_ids, 'Aluno dividido entre páginas';

  v_filtered := public.list_receivable_renegotiation_candidate_groups_v2_secure(
    '00000000-0000-0000-0000-000000000010', null, 1, 20, null, 'LIVRE', null
  );
  assert (v_filtered ->> 'totalStudents')::int = 1000;
  assert (v_filtered ->> 'totalGroups')::int = 1000;
  assert jsonb_array_length(v_filtered #> '{filterOptions,turmas}') = 1;
  assert not exists(select 1 from jsonb_array_elements(v_filtered -> 'groups') g
    where g ->> 'courseType' <> 'LIVRE');
  v_filtered := public.list_receivable_renegotiation_candidate_groups_v2_secure(
    '00000000-0000-0000-0000-000000000010', null, 1, 20, null, null,
    md5('listing-class-free')::uuid
  );
  assert (v_filtered ->> 'totalGroups')::int = 1000;
  assert jsonb_array_length(v_filtered #> '{filterOptions,turmas}') = 2,
    'Opções de turma não podem derivar da turma selecionada/página';
  v_filtered := public.list_receivable_renegotiation_candidate_groups_v2_secure(
    '00000000-0000-0000-0000-000000000010', 'Sintético 1000', 1, 20, null, null, null
  );
  assert (v_filtered ->> 'totalStudents')::int = 1;
  assert jsonb_array_length(v_filtered -> 'groups') = 2;
  v_empty := public.list_receivable_renegotiation_candidate_groups_v2_secure(
    '00000000-0000-0000-0000-000000000010', 'inexistente', 1, 20, null, null, null
  );
  assert (v_empty ->> 'totalStudents')::int = 0 and v_empty -> 'groups' = '[]'::jsonb;
  assert jsonb_array_length(v_empty #> '{filterOptions,turmas}') = 2;
  v_empty := public.list_receivable_renegotiation_candidate_groups_v2_secure(
    '00000000-0000-0000-0000-000000000010', null, 1, 20, null, 'EAD', null
  );
  assert (v_empty ->> 'totalStudents')::int = 0;
  assert v_empty #> '{filterOptions,turmas}' = '[]'::jsonb;
  v_empty := public.list_receivable_renegotiation_candidate_groups_v2_secure(
    '00000000-0000-0000-0000-000000000010', null, 1, 20, null, null,
    md5('listing-class-other-polo')::uuid
  );
  assert v_empty -> 'groups' = '[]'::jsonb;

  -- Detalhe e preview não herdam autorização da lista nominal.
  v_original_items := public.list_receivable_renegotiation_candidate_items_secure(
    '00000000-0000-0000-0000-000000000300', null
  );
  assert jsonb_array_length(v_original_items -> 'items') = 4;
  assert (select count(*) from jsonb_array_elements(v_original_items -> 'items') i
    where (i #>> '{eligibility,eligible}')::boolean) = 3;
  begin
    perform public.preview_receivable_renegotiation_secure(
      array[md5('listing-item-1-1-1')::uuid], '{}'::jsonb, '{}'::jsonb, null
    );
    raise exception 'Preview aceitou política ausente';
  exception when check_violation then null;
  end;
end;
$test$;
reset role;

-- Guardas de origem em lote: exclusão Proesc, Asaas, pagamento parcial e pago.
insert into internal_proesc.obligation_links(receivable_id)
select id from public.contas_receber
where matricula_id = md5('listing-enrollment-1-1')::uuid;
update public.contas_receber set gateway_provider = 'asaas'
where matricula_id = md5('listing-enrollment-1-2')::uuid;
do $test$
declare v_page jsonb;
begin
  v_page := public.list_receivable_renegotiation_candidate_groups_v2_secure(
    '00000000-0000-0000-0000-000000000010', 'Sintético 0001', 1, 20, null, null, null
  );
  assert v_page -> 'groups' = '[]'::jsonb;
end;
$test$;

-- Prova de ausência do N+1: listagem não executa o helper caro por parcela.
create or replace function internal_finance.receivable_renegotiation_eligibility(
  p_receivable public.contas_receber, p_as_of date
) returns jsonb language plpgsql stable security definer set search_path = '' as $guard$
begin
  raise exception 'LISTING_MUST_NOT_CALCULATE_ELIGIBILITY_PER_RECEIVABLE';
end;
$guard$;
select public.list_receivable_renegotiation_candidate_groups_v2_secure(
  '00000000-0000-0000-0000-000000000010', null, 1, 20, null, null, null
) ->> 'totalStudents' as remaining_students;

do $test$
begin
  begin
    perform public.list_receivable_renegotiation_candidate_groups_v2_secure(
      '00000000-0000-0000-0000-000000000099', null, 1, 20, null, null, null
    );
    raise exception 'Escopo de outro polo aceito';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.list_receivable_renegotiation_candidate_groups_v2_secure(
      null, null, 1, 21, null, null, null
    );
    raise exception 'Página acima do limite aceita';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.list_receivable_renegotiation_candidate_groups_v2_secure(
      null, null, 1, 20, null, 'INVALID', null
    );
    raise exception 'Tipo inválido aceito';
  exception when invalid_parameter_value then null;
  end;
end;
$test$;
set local role anon;
do $test$
begin
  begin
    perform public.list_receivable_renegotiation_candidate_groups_v2_secure(
      null, null, 1, 20, null, null, null
    );
    raise exception 'Anon acessou lista';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
do $test$
begin
  begin
    perform public.list_receivable_renegotiation_candidate_groups_v2_secure(
      null, null, 1, 20, null, null, null
    );
    raise exception 'Identidade ausente acessou lista';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
reset role;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000500"}', true);
create or replace function public.is_gestor() returns boolean language sql stable
as $denied$ select false; $denied$;
set local role authenticated;
do $test$
begin
  begin
    perform public.list_receivable_renegotiation_candidate_groups_v2_secure(
      null, null, 1, 20, null, null, null
    );
    raise exception 'Não gestor acessou lista';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
reset role;
rollback;
