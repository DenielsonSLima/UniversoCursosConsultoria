begin;

-- RPCs administrativas EAD devem validar o escopo do gestor no banco.
-- As funções públicas de landing page não são alteradas por esta migration.
create or replace function public.ead_buscar_alunos_disponiveis(
  p_turma_id uuid,
  p_search text default ''::text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with turma_curso as (
    select t.id as turma_id, t.curso_id
    from public.turmas t
    join public.cursos c on c.id = t.curso_id
    where t.id = p_turma_id
      and c.modalidade = 'EAD'
      and (
        coalesce(auth.role(), '') = 'service_role'
        or (
          public.gestor_has_module('gestao')
          and public.can_write_turma(t.id)
        )
      )
  ),
  candidatos as (
    select
      p.id,
      p.nome,
      p.email,
      p.cpf_cnpj,
      p.telefone
    from public.parceiros p
    cross join turma_curso tc
    where p.tipo = 'Aluno'
      and p.status = 'ATIVO'
      and not exists (
        select 1
        from public.matriculas m
        join public.turmas mt on mt.id = m.turma_id
        where m.aluno_id = p.id
          and mt.curso_id = tc.curso_id
          and coalesce(m.status, '') not in ('CANCELADO', 'DESISTENTE', 'TRANSFERIDO')
          and (
            m.status in (
              'PENDENTE', 'AGUARDANDO_PAGAMENTO', 'AGUARDANDO_CONFIRMACAO',
              'ATIVO', 'TRANCADO', 'CONCLUIDO'
            )
            or exists (
              select 1
              from public.contas_receber cr
              where cr.matricula_id = m.id
                and cr.tipo_lancamento = 'MATRICULA'
                and (
                  cr.status = 'PAGO'
                  or cr.asaas_status in ('RECEIVED', 'CONFIRMED')
                )
            )
            or exists (
              select 1
              from public.inscricoes_online io
              where io.matricula_id = m.id
                and io.status = 'PAGO'
            )
          )
      )
      and (
        coalesce(p_search, '') = ''
        or p.nome ilike '%' || p_search || '%'
        or p.email ilike '%' || p_search || '%'
        or regexp_replace(coalesce(p.cpf_cnpj, ''), '\D', '', 'g')
          like '%' || regexp_replace(coalesce(p_search, ''), '\D', '', 'g') || '%'
      )
    order by p.nome
    limit 20
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'nome', nome,
        'email', email,
        'cpfCnpj', cpf_cnpj,
        'telefone', telefone
      )
      order by nome
    ),
    '[]'::jsonb
  )
  from candidatos;
$$;

create or replace function public.ead_get_turma_alunos(p_turma_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with turma_curso as (
    select t.id as turma_id, c.id as curso_id, c.ead_config
    from public.turmas t
    join public.cursos c on c.id = t.curso_id
    where t.id = p_turma_id
      and c.modalidade = 'EAD'
      and (
        coalesce(auth.role(), '') = 'service_role'
        or (
          public.gestor_has_module('gestao')
          and public.can_write_turma(t.id)
        )
      )
  ),
  base as (
    select
      m.id as matricula_id,
      m.status as matricula_status,
      m.data_matricula,
      p.id as aluno_id,
      p.nome,
      p.email,
      p.telefone,
      p.cpf_cnpj,
      tc.curso_id,
      coalesce(pr.progress, '{}'::jsonb) as progress,
      ca.status as certificado_status,
      ca.certificado_numero,
      io.status as inscricao_status,
      io.asaas_payment_id,
      io.asaas_payment_link_id,
      coalesce(io.valor, 0) as valor_pago
    from turma_curso tc
    join public.matriculas m on m.turma_id = tc.turma_id
    join public.parceiros p on p.id = m.aluno_id
    left join public.ead_aluno_progresso pr
      on pr.aluno_id = p.id and pr.curso_id = tc.curso_id
    left join public.certificados_academicos ca on ca.matricula_id = m.id
    left join lateral (
      select *
      from public.inscricoes_online i
      where i.matricula_id = m.id
      order by i.updated_at desc nulls last, i.created_at desc nulls last
      limit 1
    ) io on true
  ),
  totals as (
    select
      b.*,
      coalesce(jsonb_array_length(b.progress -> 'completedContentIds'), 0) as aulas_concluidas,
      coalesce(jsonb_array_length(b.progress -> 'completedActivityIds'), 0) as atividades_concluidas,
      coalesce((b.progress ->> 'quizScore')::int, null) as nota_prova,
      (
        select jsonb_array_length(coalesce(tc.ead_config -> 'conteudos', '[]'::jsonb))
        from turma_curso tc
      ) as total_aulas,
      (
        select jsonb_array_length(coalesce(tc.ead_config -> 'atividades', '[]'::jsonb))
        from turma_curso tc
      ) as total_atividades
    from base b
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'matriculaId', matricula_id,
        'alunoId', aluno_id,
        'nome', nome,
        'email', email,
        'telefone', telefone,
        'cpfCnpj', cpf_cnpj,
        'status', matricula_status,
        'inscricaoStatus', inscricao_status,
        'dataMatricula', data_matricula,
        'aulasConcluidas', aulas_concluidas,
        'totalAulas', total_aulas,
        'atividadesConcluidas', atividades_concluidas,
        'totalAtividades', total_atividades,
        'progressoPercentual', case
          when (total_aulas + total_atividades) > 0 then least(
            100,
            round(
              ((aulas_concluidas + atividades_concluidas)::numeric
                / (total_aulas + total_atividades)::numeric) * 100
            )::int
          )
          else 0
        end,
        'notaProva', nota_prova,
        'certificadoStatus', certificado_status,
        'certificadoNumero', certificado_numero,
        'asaasPaymentId', asaas_payment_id,
        'asaasPaymentLinkId', asaas_payment_link_id,
        'valorPago', valor_pago
      )
      order by data_matricula desc, nome
    ),
    '[]'::jsonb
  )
  from totals;
$$;

create or replace function public.ead_get_turma_dashboard(p_turma_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not (
      public.gestor_has_module('gestao')
      and public.can_write_turma(p_turma_id)
    )
  then
    raise exception 'Gestor sem permissão para consultar esta turma EAD.'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'turmaId', t.id,
    'codigo', t.codigo,
    'nome', t.nome,
    'status', t.status,
    'cursoId', c.id,
    'cursoNome', c.nome,
    'area', coalesce(c.area, 'Outros'),
    'valor', coalesce(c.valor, 0),
    'asaasUrl', c.asaas_payment_link_url,
    'vagasTotais', t.vagas_totais,
    'alunosTotal', count(m.id),
    'alunosPendentes', count(*) filter (where m.status = 'PENDENTE'),
    'alunosLiberados', count(*) filter (where m.status = 'ATIVO'),
    'alunosConcluidos', count(*) filter (where m.status = 'CONCLUIDO'),
    'certificadosPendentes', count(ca.id) filter (where ca.status = 'PENDENTE'),
    'certificadosEmitidos', count(ca.id) filter (where ca.status = 'FINALIZADO'),
    'receitaPrevista', coalesce(c.valor, 0) * count(m.id),
    'receitaConfirmada', coalesce(c.valor, 0)
      * count(*) filter (where m.status in ('ATIVO', 'CONCLUIDO')),
    'configuracao', coalesce(c.ead_config, '{}'::jsonb)
  )
  into v_result
  from public.turmas t
  join public.cursos c on c.id = t.curso_id
  left join public.matriculas m on m.turma_id = t.id
  left join public.certificados_academicos ca on ca.matricula_id = m.id
  where t.id = p_turma_id
    and c.modalidade = 'EAD'
  group by t.id, c.id;

  if v_result is null then
    raise exception 'Turma EAD não encontrada';
  end if;

  return v_result;
end;
$$;

-- Catálogo administrativo EAD: somente gestores do módulo Cadastros.
create or replace function public.ead_get_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_cursos int;
  v_cursos_ativos int;
  v_cursos_inativos int;
  v_total_alunos int;
  v_months jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not public.gestor_has_tab('cadastros', 'cadastros-ead')
  then
    raise exception 'Gestor sem permissão para consultar o painel EAD.'
      using errcode = '42501';
  end if;

  select count(*)::int,
         count(*) filter (where status = 'ativo')::int,
         count(*) filter (where status = 'inativo')::int
  into v_total_cursos, v_cursos_ativos, v_cursos_inativos
  from public.cursos
  where modalidade = 'EAD';

  select count(distinct m.aluno_id)::int
  into v_total_alunos
  from public.matriculas m
  join public.turmas t on t.id = m.turma_id
  join public.cursos c on c.id = t.curso_id
  where c.modalidade = 'EAD';

  with months as (
    select (date_trunc('month', current_date) - (interval '1 month' * gs))::date as month_start
    from generate_series(2, 0, -1) gs
  ), counts as (
    select date_trunc('month', m.data_matricula)::date as month_start,
           count(distinct m.aluno_id)::int as total
    from public.matriculas m
    join public.turmas t on t.id = m.turma_id
    join public.cursos c on c.id = t.curso_id
    where c.modalidade = 'EAD'
      and m.data_matricula >= date_trunc('month', current_date) - interval '2 months'
    group by 1
  )
  select jsonb_agg(jsonb_build_object(
    'label', to_char(months.month_start, 'Mon'),
    'month', to_char(months.month_start, 'YYYY-MM'),
    'total', coalesce(counts.total, 0)
  ) order by months.month_start)
  into v_months
  from months
  left join counts on counts.month_start = months.month_start;

  return jsonb_build_object(
    'totalCursos', coalesce(v_total_cursos, 0),
    'cursosAtivos', coalesce(v_cursos_ativos, 0),
    'cursosInativos', coalesce(v_cursos_inativos, 0),
    'totalAlunos', coalesce(v_total_alunos, 0),
    'ultimosTresMeses', coalesce(v_months, '[]'::jsonb)
  );
end;
$$;

create or replace function public.ead_get_cursos_grouped(
  p_status text default 'ativo'::text,
  p_search text default ''::text,
  p_area text default null::text,
  p_group_by text default 'area'::text,
  p_sort text default 'nome_asc'::text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_groups jsonb;
  v_areas jsonb;
  v_total int;
  v_group_mode text := coalesce(nullif(p_group_by, ''), 'area');
  v_sort_mode text := coalesce(nullif(p_sort, ''), 'nome_asc');
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not public.gestor_has_tab('cadastros', 'cadastros-ead')
  then
    raise exception 'Gestor sem permissão para consultar o catálogo administrativo EAD.'
      using errcode = '42501';
  end if;

  with filtered as (
    select c.*
    from public.cursos c
    where c.modalidade = 'EAD'
      and c.status = coalesce(nullif(p_status, ''), c.status)
      and (coalesce(nullif(p_area, ''), 'Todas') = 'Todas' or coalesce(c.area, 'Outros') = p_area)
      and (
        coalesce(nullif(p_search, ''), '') = ''
        or c.nome ilike '%' || p_search || '%'
        or coalesce(c.descricao, '') ilike '%' || p_search || '%'
      )
  ), grouped as (
    select
      case when v_group_mode = 'none' then 'Todos os cursos' else coalesce(area, 'Outros') end as area,
      count(*)::int as total,
      jsonb_agg(
        to_jsonb(filtered)
        order by
          case when v_sort_mode = 'area_asc' then coalesce(filtered.area, 'Outros') end asc,
          case when v_sort_mode = 'nome_desc' then filtered.nome end desc,
          filtered.nome asc
      ) as cursos
    from filtered
    group by case
      when v_group_mode = 'none' then 'Todos os cursos'
      else coalesce(area, 'Outros')
    end
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('area', area, 'total', total, 'cursos', cursos)
      order by case when v_group_mode = 'none' then 0 else 1 end, area
    ),
    '[]'::jsonb
  )
  into v_groups
  from grouped;

  select coalesce(jsonb_agg(area order by area), '[]'::jsonb)
  into v_areas
  from (
    select distinct coalesce(area, 'Outros') as area
    from public.cursos
    where modalidade = 'EAD'
  ) areas;

  select count(*)::int
  into v_total
  from public.cursos
  where modalidade = 'EAD'
    and status = coalesce(nullif(p_status, ''), status);

  return jsonb_build_object(
    'groups', v_groups,
    'areas', v_areas,
    'total', coalesce(v_total, 0)
  );
end;
$$;

-- Compatibilidade da assinatura antiga, com a mesma autorização server-side.
create or replace function public.ead_get_cursos_grouped(
  p_status text default 'ativo'::text,
  p_search text default ''::text,
  p_area text default null::text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.ead_get_cursos_grouped(
    p_status,
    p_search,
    p_area,
    'area',
    'nome_asc'
  );
$$;

commit;
