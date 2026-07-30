begin;

create extension if not exists unaccent with schema extensions;

-- Busca canônica de alunos da Secretaria. O SECURITY DEFINER evita depender de
-- combinações de joins expostas pelo PostgREST, mas mantém a mesma autorização
-- operacional e restringe explicitamente os resultados ao polo solicitado.
create or replace function public.search_secretaria_students_secure(
  p_polo_id uuid,
  p_search text,
  p_limit integer default 20,
  p_documento text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_search text := lower(extensions.unaccent(btrim(coalesce(p_search, ''))));
  v_rows jsonb;
begin
  if length(v_search) < 2 then
    return '[]'::jsonb;
  end if;

  if auth.role() <> 'service_role'
     and not (
       p_polo_id is not null
       and public.is_gestor_for_polo(p_polo_id)
       and (
         (p_documento is null and public.gestor_has_tab('secretaria', 'alunos'))
         or (
           p_documento is not null
           and public.can_manage_secretaria_document(p_documento, p_polo_id)
         )
       )
     )
  then
    raise exception 'Busca de alunos da Secretaria nao autorizada.'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(result_row.payload order by result_row.student_name, result_row.student_id),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      student.id as student_id,
      student.nome as student_name,
      jsonb_build_object(
        'id', student.id,
        'nome', student.nome,
        'cpf_cnpj', student.cpf_cnpj,
        'email', student.email,
        'telefone', student.telefone,
        'foto_url', student.foto_url,
        'polo_id', student.polo_id,
        'polo_ids', student.polo_ids,
        'rg', student.rg,
        'data_nascimento', student.data_nascimento,
        'sexo', student.sexo,
        'status', student.status,
        'endereco', student.endereco,
        'matricula_id', enrollment.id,
        'matricula_data', enrollment.data_matricula,
        'matricula_status', enrollment.status,
        'turma_polo_id', enrollment.turma_polo_id,
        'turma_nome', enrollment.turma_nome,
        'turma_codigo', enrollment.turma_codigo,
        'curso_nome', enrollment.curso_nome
      ) as payload
    from public.parceiros as student
    left join lateral (
      select
        registration.id,
        registration.data_matricula,
        registration.status,
        class.polo_id as turma_polo_id,
        class.nome as turma_nome,
        class.codigo as turma_codigo,
        course.nome as curso_nome
      from public.matriculas as registration
      join public.turmas as class on class.id = registration.turma_id
      left join public.cursos as course on course.id = class.curso_id
      where registration.aluno_id = student.id
        and (class.polo_id = p_polo_id or class.polo_id is null)
      order by
        case upper(coalesce(registration.status, ''))
          when 'ATIVO' then 0
          when 'EM_ANDAMENTO' then 1
          when 'CONCLUIDO' then 2
          else 3
        end,
        registration.data_matricula desc nulls last,
        registration.id
      limit 1
    ) as enrollment on true
    where student.tipo = 'Aluno'
      and (
        student.polo_id = p_polo_id
        or p_polo_id = any(coalesce(student.polo_ids, array[]::uuid[]))
        or enrollment.id is not null
      )
      and (
        lower(extensions.unaccent(coalesce(student.nome, ''))) like '%' || v_search || '%'
        or lower(extensions.unaccent(coalesce(student.cpf_cnpj, ''))) like '%' || v_search || '%'
      )
    order by student.nome, student.id
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) as result_row;

  return v_rows;
end;
$function$;

revoke all on function public.search_secretaria_students_secure(uuid, text, integer, text)
  from public, anon;
grant execute on function public.search_secretaria_students_secure(uuid, text, integer, text)
  to authenticated, service_role;

-- Mantém contrato, RBAC, limite e escopo da RPC financeira existente. Somente
-- a comparação passa a usar a forma sem acentos nos dois lados.
create or replace function public.search_secretaria_finance_students_secure(
  p_polo_id uuid,
  p_search text,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_search text := lower(extensions.unaccent(btrim(coalesce(p_search, ''))));
  v_rows jsonb;
begin
  if length(v_search) < 2 then
    return '[]'::jsonb;
  end if;

  if auth.role() <> 'service_role'
     and not (
       (
         (p_polo_id is null and public.is_gestor_global())
         or (p_polo_id is not null and public.is_gestor_for_polo(p_polo_id))
       )
       and (
         public.gestor_has_tab('secretaria', 'recebimentos')
         or public.gestor_has_financeiro_tab('receber')
       )
     )
  then
    raise exception 'Busca financeira de alunos nao autorizada.'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(result_row) order by result_row.nome, result_row.id),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      student.id,
      student.nome,
      student.cpf_cnpj,
      student.email,
      student.telefone,
      enrollment.id as matricula_id,
      enrollment.data_matricula,
      enrollment.status as matricula_status,
      enrollment.turma_polo_id,
      enrollment.turma_nome,
      enrollment.turma_codigo,
      enrollment.curso_nome
    from public.parceiros as student
    left join lateral (
      select
        registration.id,
        registration.data_matricula,
        registration.status,
        class.polo_id as turma_polo_id,
        class.nome as turma_nome,
        class.codigo as turma_codigo,
        course.nome as curso_nome
      from public.matriculas as registration
      join public.turmas as class on class.id = registration.turma_id
      left join public.cursos as course on course.id = class.curso_id
      where registration.aluno_id = student.id
        and (
          p_polo_id is null
          or class.polo_id = p_polo_id
          or class.polo_id is null
        )
      order by
        case upper(coalesce(registration.status, ''))
          when 'ATIVO' then 0
          when 'EM_ANDAMENTO' then 1
          when 'CONCLUIDO' then 2
          else 3
        end,
        registration.data_matricula desc nulls last,
        registration.id
      limit 1
    ) as enrollment on true
    where student.tipo = 'Aluno'
      and (
        p_polo_id is null
        or student.polo_id = p_polo_id
        or p_polo_id = any(coalesce(student.polo_ids, array[]::uuid[]))
        or student.polo_id is null
      )
      and (
        lower(extensions.unaccent(coalesce(student.nome, ''))) like '%' || v_search || '%'
        or lower(extensions.unaccent(coalesce(student.cpf_cnpj, ''))) like '%' || v_search || '%'
      )
    order by student.nome, student.id
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) as result_row;

  return v_rows;
end;
$function$;

revoke all on function public.search_secretaria_finance_students_secure(uuid, text, integer)
  from public, anon;
grant execute on function public.search_secretaria_finance_students_secure(uuid, text, integer)
  to authenticated, service_role;

-- Histórico paginado: mantém o filtro no servidor, o count exato e a mesma
-- forma aninhada consumida pelo frontend.
create or replace function public.search_secretaria_emissions_secure(
  p_polo_id uuid,
  p_documento text default null,
  p_turma_id uuid default null,
  p_search text default null,
  p_offset integer default 0,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_search text := lower(extensions.unaccent(btrim(coalesce(p_search, ''))));
  v_result jsonb;
begin
  if auth.role() <> 'service_role'
     and not (
       p_polo_id is not null
       and public.is_gestor_for_polo(p_polo_id)
       and (
         public.gestor_has_tab('secretaria', 'historico-emissoes')
         or coalesce(
           public.gestor_effective_permissions() -> 'tabs' -> 'secretaria',
           '[]'::jsonb
         ) ? 'historico'
       )
     )
  then
    raise exception 'Historico de emissoes da Secretaria nao autorizado.'
      using errcode = '42501';
  end if;

  with filtered as materialized (
    select
      document_row.ultima_emissao_em,
      document_row.id,
      to_jsonb(document_row)
      || jsonb_build_object(
        'aluno',
        case when student.id is null then null else jsonb_build_object(
          'id', student.id,
          'nome', student.nome,
          'cpf_cnpj', student.cpf_cnpj,
          'rg', student.rg,
          'data_nascimento', student.data_nascimento,
          'foto_url', student.foto_url,
          'sexo', student.sexo,
          'nacionalidade', student.nacionalidade,
          'naturalidade', student.naturalidade,
          'orgao_emissor', student.orgao_emissor,
          'titulo_eleitor', student.titulo_eleitor,
          'reservista', student.reservista,
          'nome_mae', student.nome_mae,
          'nome_pai', student.nome_pai,
          'escola_ensino_medio', student.escola_ensino_medio,
          'ano_conclusao_ensino_medio', student.ano_conclusao_ensino_medio
        ) end,
        'matricula',
        case when enrollment.id is null then null else jsonb_build_object(
          'id', enrollment.id,
          'status', enrollment.status,
          'turma_id', enrollment.turma_id,
          'turma',
          case when class.id is null then null else jsonb_build_object(
            'id', class.id,
            'nome', class.nome,
            'codigo', class.codigo
          ) end
        ) end
      ) as payload
    from public.documentos_validacao as document_row
    left join public.parceiros as student on student.id = document_row.aluno_id
    left join public.matriculas as enrollment on enrollment.id = document_row.matricula_id
    left join public.turmas as class on class.id = enrollment.turma_id
    where document_row.status = 'ATIVO'
      and document_row.polo_id = p_polo_id
      and (nullif(p_documento, '') is null or p_documento = 'todos' or document_row.documento = p_documento)
      and (p_turma_id is null or enrollment.turma_id = p_turma_id)
      and (
        v_search = ''
        or lower(extensions.unaccent(coalesce(document_row.codigo, ''))) like '%' || v_search || '%'
        or lower(extensions.unaccent(coalesce(document_row.dados_emissao ->> 'studentName', ''))) like '%' || v_search || '%'
        or lower(extensions.unaccent(coalesce(document_row.dados_emissao ->> 'studentCpf', ''))) like '%' || v_search || '%'
      )
  ),
  page_rows as (
    select payload, ultima_emissao_em, id
    from filtered
    order by ultima_emissao_em desc, id
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
  )
  select jsonb_build_object(
    'items',
    coalesce(
      (select jsonb_agg(payload order by ultima_emissao_em desc, id) from page_rows),
      '[]'::jsonb
    ),
    'total',
    (select count(*) from filtered)
  )
  into v_result;

  return v_result;
end;
$function$;

revoke all on function public.search_secretaria_emissions_secure(
  uuid, text, uuid, text, integer, integer
) from public, anon;
grant execute on function public.search_secretaria_emissions_secure(
  uuid, text, uuid, text, integer, integer
) to authenticated, service_role;

commit;
