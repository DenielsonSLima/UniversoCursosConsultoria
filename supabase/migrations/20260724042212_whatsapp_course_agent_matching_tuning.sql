create or replace function public.whatsapp_course_agent_match_faq(
  p_connection_id uuid,
  p_query text,
  p_limit integer default 3
)
returns table (
  faq_id uuid,
  curso_id uuid,
  question text,
  answer text,
  category text,
  confidence numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with input as (
    select public.whatsapp_course_agent_normalize(left(coalesce(p_query, ''), 1000)) as query
  ),
  ranked as (
    select
      f.id,
      f.curso_id,
      f.question,
      f.answer,
      f.category,
      greatest(
        extensions.similarity(f.search_text, input.query),
        extensions.word_similarity(input.query, f.search_text)
      )::numeric as score,
      (f.conexao_id is not null) as is_specific,
      f.priority
    from public.whatsapp_course_agent_faq f
    cross join input
    where f.active = true
      and (f.conexao_id is null or f.conexao_id = p_connection_id)
      and input.query <> ''
  )
  select
    ranked.id,
    ranked.curso_id,
    ranked.question,
    ranked.answer,
    ranked.category,
    least(1, greatest(0, ranked.score))::numeric(4,3)
  from ranked
  where ranked.score >= 0.08
  order by ranked.score desc, ranked.is_specific desc, ranked.priority desc
  limit least(greatest(coalesce(p_limit, 3), 1), 10);
$$;

create or replace function public.whatsapp_course_agent_search_catalog(
  p_query text,
  p_limit integer default 5
)
returns table (
  course_id uuid,
  course_name text,
  modality text,
  area text,
  description text,
  workload integer,
  duration_months integer,
  course_price numeric,
  confidence numeric,
  public_classes jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with input as (
    select public.whatsapp_course_agent_normalize(left(coalesce(p_query, ''), 1000)) as query
  ),
  ranked as (
    select
      c.*,
      greatest(
        extensions.similarity(
          public.whatsapp_course_agent_normalize(
            concat_ws(' ', c.nome, c.modalidade, c.area, c.descricao)
          ),
          input.query
        ),
        extensions.word_similarity(
          input.query,
          public.whatsapp_course_agent_normalize(
            concat_ws(' ', c.nome, c.modalidade, c.area, c.descricao)
          )
        )
      )::numeric as score
    from public.cursos c
    cross join input
    where lower(coalesce(c.status, '')) = 'ativo'
      and coalesce(c.publicar_site, false) = true
      and input.query <> ''
  )
  select
    ranked.id,
    ranked.nome,
    ranked.modalidade,
    ranked.area,
    ranked.descricao,
    ranked.carga_horaria,
    ranked.duracao_meses,
    ranked.valor,
    least(1, greatest(0, ranked.score))::numeric(4,3),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'name', t.nome,
          'city', p.cidade,
          'polo', p.nome,
          'shift', t.turno,
          'startDate', t.data_inicio,
          'enrollmentStart', t.data_inicio_inscricao,
          'enrollmentEnd', t.data_fim_inscricao,
          'tuitionPrice', t.valor_parcela,
          'enrollmentPrice', t.valor_matricula
        )
        order by t.data_inicio nulls last, p.cidade
      )
      from public.turmas t
      join public.polos p on p.id = t.polo_id
      where t.curso_id = ranked.id
        and coalesce(t.publicar_no_site, false) = true
        and upper(coalesce(t.status, '')) in (
          'PLANEJADA',
          'EM_ANDAMENTO',
          'ATIVA',
          'ABERTA'
        )
        and (
          t.data_inicio_inscricao is null
          or t.data_inicio_inscricao <= current_date
        )
        and (
          t.data_fim_inscricao is null
          or t.data_fim_inscricao >= current_date
        )
        and lower(coalesce(p.status, '')) = 'ativo'
    ), '[]'::jsonb)
  from ranked
  where ranked.score >= 0.08
  order by ranked.score desc, ranked.nome
  limit least(greatest(coalesce(p_limit, 5), 1), 10);
$$;

revoke all on function public.whatsapp_course_agent_match_faq(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.whatsapp_course_agent_search_catalog(text, integer)
  from public, anon, authenticated;
grant execute on function public.whatsapp_course_agent_match_faq(uuid, text, integer)
  to service_role;
grant execute on function public.whatsapp_course_agent_search_catalog(text, integer)
  to service_role;
