-- Mantem a disponibilidade publica exatamente na mesma semantica do checkout:
-- qtd_vagas_minima e meta pedagogica/comercial; apenas vagas_totais limita entradas.
-- Reservas aguardando pagamento/confirmacao tambem ocupam uma vaga.

create or replace function public.list_public_technical_classes(
  p_limit integer default 3,
  p_turma_id uuid default null
)
returns table (
  turma_id uuid,
  curso_id uuid,
  curso_nome text,
  curso_descricao text,
  curso_area text,
  curso_carga_horaria integer,
  curso_duracao_meses integer,
  curso_imagem_url text,
  landing_template_key text,
  turma_nome text,
  turma_codigo text,
  turma_status text,
  turno text,
  data_inicio date,
  data_previsao_termino date,
  data_inicio_inscricao date,
  data_fim_inscricao date,
  vagas_totais integer,
  vagas_ocupadas bigint,
  vagas_disponiveis integer,
  inscricoes_online_disponiveis boolean,
  situacao_vagas text,
  valor_matricula numeric,
  valor_rematricula numeric,
  qtd_parcelas integer,
  valor_parcela numeric,
  desconto_pontualidade numeric,
  aplicar_desconto_mensalidade boolean,
  valor_parcela_com_desconto numeric,
  dia_vencimento_padrao integer,
  aceita_concomitante boolean,
  aceita_subsequente boolean,
  serie_minima_ensino_medio smallint,
  polo_id uuid,
  polo_nome text,
  polo_cidade text,
  polo_estado text,
  polo_endereco text,
  polo_numero text,
  polo_bairro text
)
language sql
stable
security definer
set search_path = ''
as $$
  with public_turmas as (
    select
      t.*,
      c.nome as c_nome,
      c.descricao as c_descricao,
      c.area as c_area,
      c.carga_horaria as c_carga_horaria,
      c.duracao_meses as c_duracao_meses,
      c.imagem_url as c_imagem_url,
      c.landing_template_key as c_template_key,
      p.nome as p_nome,
      p.cidade as p_cidade,
      p.estado as p_estado,
      p.endereco as p_endereco,
      p.numero as p_numero,
      p.bairro as p_bairro,
      count(distinct m.aluno_id) filter (
        where upper(coalesce(m.status, '')) in (
          'PENDENTE',
          'ATIVO',
          'CONCLUIDO',
          'AGUARDANDO_PAGAMENTO',
          'AGUARDANDO_CONFIRMACAO'
        )
      ) as ocupadas,
      coalesce(t.vagas_totais, 0) as capacidade_online,
      (pg_catalog.timezone('America/Maceio', now()))::date as hoje
    from public.turmas t
    join public.cursos c on c.id = t.curso_id
    join public.polos p on p.id = t.polo_id
    left join public.matriculas m on m.turma_id = t.id
    where c.modalidade = 'TECNICO'
      and lower(coalesce(c.status, '')) = 'ativo'
      and coalesce(c.publicar_site, false)
      and coalesce(t.publicar_no_site, false)
      and t.status in ('PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO')
      and (p_turma_id is null or t.id = p_turma_id)
    group by t.id, c.id, p.id
  ), evaluated as (
    select
      pt.*,
      (
        coalesce(pt.permitir_inscricoes_online, false)
        and pt.status in ('INSCRICOES_ABERTAS', 'EM_ANDAMENTO')
        and (pt.data_inicio_inscricao is null or pt.data_inicio_inscricao <= pt.hoje)
        and (pt.data_fim_inscricao is null or pt.data_fim_inscricao >= pt.hoje)
        and (
          not coalesce(pt.bloquear_matriculas_apos_completar_vagas, true)
          or pt.capacidade_online <= 0
          or pt.ocupadas < pt.capacidade_online
        )
      ) as online_disponivel
    from public_turmas pt
  )
  select
    pt.id,
    pt.curso_id,
    pt.c_nome::text,
    coalesce(pt.c_descricao, '')::text,
    coalesce(pt.c_area, 'Formação técnica')::text,
    coalesce(pt.c_carga_horaria, 0)::integer,
    pt.c_duracao_meses::integer,
    pt.c_imagem_url::text,
    pt.c_template_key::text,
    pt.nome::text,
    coalesce(pt.codigo, '')::text,
    pt.status::text,
    coalesce(pt.turno, 'A DEFINIR')::text,
    pt.data_inicio,
    pt.data_previsao_termino,
    pt.data_inicio_inscricao,
    pt.data_fim_inscricao,
    coalesce(pt.vagas_totais, 0)::integer,
    pt.ocupadas,
    greatest(pt.capacidade_online - pt.ocupadas::integer, 0)::integer,
    pt.online_disponivel,
    case
      when not coalesce(pt.permitir_inscricoes_online, false) then 'ATENDIMENTO PRESENCIAL'
      when pt.status = 'PLANEJADA'
        or (pt.data_inicio_inscricao is not null and pt.data_inicio_inscricao > pt.hoje)
        then 'INSCRIÇÕES EM BREVE'
      when pt.data_fim_inscricao is not null and pt.data_fim_inscricao < pt.hoje
        then 'INSCRIÇÕES ENCERRADAS'
      when coalesce(pt.bloquear_matriculas_apos_completar_vagas, true)
        and pt.capacidade_online > 0 and pt.ocupadas >= pt.capacidade_online
        then 'VAGAS ESGOTADAS'
      when not coalesce(pt.bloquear_matriculas_apos_completar_vagas, true)
        then 'VAGAS DISPONÍVEIS'
      when pt.capacidade_online > 0 and pt.capacidade_online - pt.ocupadas <= 5
        then 'ÚLTIMAS VAGAS'
      else 'VAGAS DISPONÍVEIS'
    end::text,
    coalesce(pt.valor_matricula, 0)::numeric,
    coalesce(pt.valor_rematricula, 0)::numeric,
    coalesce(pt.qtd_parcelas, 0)::integer,
    coalesce(pt.valor_parcela, 0)::numeric,
    preview.desconto_aplicado,
    coalesce(pt.aplicar_desconto_mensalidade, false),
    preview.valor_com_desconto,
    coalesce(pt.dia_vencimento_padrao, 10)::integer,
    coalesce(pt.aceita_concomitante, false),
    coalesce(pt.aceita_subsequente, true),
    coalesce(pt.serie_minima_ensino_medio, 2)::smallint,
    pt.polo_id,
    pt.p_nome::text,
    coalesce(pt.p_cidade, '')::text,
    coalesce(pt.p_estado, '')::text,
    pt.p_endereco::text,
    pt.p_numero::text,
    pt.p_bairro::text
  from evaluated pt
  cross join lateral public.calculate_gestao_technical_financial_preview(
    coalesce(pt.valor_parcela, 0),
    coalesce(pt.desconto_pontualidade, 0),
    0,
    0,
    coalesce(pt.aplicar_desconto_mensalidade, false),
    false
  ) preview
  order by pt.data_inicio nulls last, pt.c_nome, pt.nome
  limit greatest(1, least(coalesce(p_limit, 3), 20));
$$;

revoke all on function public.list_public_technical_classes(integer, uuid)
  from public;
grant execute on function public.list_public_technical_classes(integer, uuid)
  to anon, authenticated, service_role;

comment on function public.list_public_technical_classes(integer, uuid) is
  'Lista turmas técnicas publicadas com disponibilidade, capacidade e condição financeira alinhadas ao checkout canônico.';
