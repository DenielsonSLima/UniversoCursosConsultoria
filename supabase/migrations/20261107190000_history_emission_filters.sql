-- Busca e filtros aplicados antes da contagem/paginação; payload e projeção preservados.
CREATE OR REPLACE FUNCTION public.search_secretaria_emissions_filtered_secure(
  p_polo_id uuid, p_documento text, p_turma_id uuid, p_search text,
  p_offset integer, p_limit integer, p_modalidade text, p_curso_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_search text := lower(extensions.unaccent(btrim(coalesce(p_search, ''))));
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not coalesce((
       p_polo_id is not null
       and public.is_gestor_for_polo(p_polo_id)
       and (
         public.gestor_has_tab('secretaria', 'historico-emissoes')
         or coalesce(
           public.gestor_effective_permissions() -> 'tabs' -> 'secretaria',
           '[]'::jsonb
         ) ? 'historico'
       )
     ), false)
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
          'tipo_documento', student.tipo_documento,
          'rg_uf_emissao', student.rg_uf_emissao,
          'rg_data_emissao', student.rg_data_emissao,
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
    left join public.cursos as course on course.id = class.curso_id
    where document_row.status = 'ATIVO'
      and document_row.polo_id = p_polo_id
      and (nullif(p_documento, '') is null or p_documento = 'todos' or document_row.documento = p_documento)
      and (p_turma_id is null or enrollment.turma_id = p_turma_id)
      and (p_curso_id is null or course.id = p_curso_id)
      and (nullif(p_modalidade, '') is null or p_modalidade = 'todos' or course.modalidade::text = p_modalidade)
      and (
        v_search = ''
        or strpos(lower(extensions.unaccent(coalesce(document_row.codigo, ''))), v_search) > 0
        or strpos(lower(extensions.unaccent(coalesce(document_row.dados_emissao ->> 'studentName', ''))), v_search) > 0
        or strpos(lower(extensions.unaccent(coalesce(student.nome, ''))), v_search) > 0
        or strpos(coalesce(document_row.dados_emissao ->> 'studentCpf', ''), v_search) > 0
        or strpos(coalesce(student.cpf_cnpj, ''), v_search) > 0
        or (v_search ~ '^[0-9 ./-]+$' and regexp_replace(v_search, '[^0-9]', '', 'g') <> '' and (
          strpos(regexp_replace(coalesce(document_row.dados_emissao ->> 'studentCpf', ''), '[^0-9]', '', 'g'),
            regexp_replace(v_search, '[^0-9]', '', 'g')) > 0
          or strpos(regexp_replace(coalesce(student.cpf_cnpj, ''), '[^0-9]', '', 'g'),
            regexp_replace(v_search, '[^0-9]', '', 'g')) > 0
        ))
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
      (select jsonb_agg(
        internal_academic.project_contract_identity_emission(payload)
        order by ultima_emissao_em desc, id) from page_rows),
      '[]'::jsonb
    ),
    'total',
    (select count(*) from filtered)
  )
  into v_result;

  return v_result;
end;
$function$;

revoke all on function public.search_secretaria_emissions_filtered_secure(
  uuid, text, uuid, text, integer, integer, text, uuid
) from public, anon;
grant execute on function public.search_secretaria_emissions_filtered_secure(
  uuid, text, uuid, text, integer, integer, text, uuid
) to authenticated, service_role;

-- Mantém clientes existentes e a projeção canônica de segunda via compatíveis.
create or replace function public.search_secretaria_emissions_secure(
  p_polo_id uuid, p_documento text default null, p_turma_id uuid default null,
  p_search text default null, p_offset integer default 0, p_limit integer default 20
)
returns jsonb language sql stable security definer set search_path = ''
as $function$
  select public.search_secretaria_emissions_filtered_secure(
    p_polo_id, p_documento, p_turma_id, p_search, p_offset, p_limit, null, null
  );
$function$;
revoke all on function public.search_secretaria_emissions_secure(uuid, text, uuid, text, integer, integer) from public, anon;
grant execute on function public.search_secretaria_emissions_secure(uuid, text, uuid, text, integer, integer) to authenticated, service_role;
