-- Modela encontros de aula com sessões canônicas por turno.
-- A regra acadêmica permanece no banco: 8h => M/4h + T/4h; demais cargas => U/carga total.

alter table public.aulas_turma
  add column if not exists sessao char(1);

-- Remove somente o fechamento realizado como teste em Relações Humanas da T40.
-- A reabertura vem antes do backfill porque a proteção do diário também bloqueia UPDATE técnico.
select set_config('app.diario_lock_rpc', '1', true);

delete from public.diario_fechamento_historico h
using public.turmas t, public.disciplinas d
where h.turma_id = t.id
  and h.disciplina_id = d.id
  and t.codigo = 'ENF-T40-INT-MAT'
  and d.nome = 'Relações Humanas no Trabalho';

update public.turmas_disciplinas td
set bloqueio_diario = 'ABERTO',
    concluida = false,
    diario_bloqueado_em = null,
    diario_bloqueado_por = null,
    diario_bloqueio_motivo = null
from public.turmas t, public.disciplinas d
where td.turma_id = t.id
  and td.disciplina_id = d.id
  and t.codigo = 'ENF-T40-INT-MAT'
  and d.nome = 'Relações Humanas no Trabalho'
  and td.bloqueio_diario = 'TOTAL';

update public.aulas_turma
set sessao = 'U'
where sessao is null;

alter table public.aulas_turma
  alter column sessao set default 'U',
  alter column sessao set not null;

alter table public.aulas_turma
  drop constraint if exists aulas_turma_sessao_check;

alter table public.aulas_turma
  add constraint aulas_turma_sessao_check
  check (sessao in ('M', 'T', 'N', 'U'));

create unique index if not exists aulas_turma_encontro_sessao_uidx
  on public.aulas_turma (turma_id, disciplina_id, data_aula, sessao)
  where data_aula is not null;

create index if not exists diario_frequencia_contexto_idx
  on public.diario_frequencia (turma_id, disciplina_id, aluno_id, aula_id)
  include (status);

-- Converte apenas os diários já lançados da T40. O ID original vira manhã;
-- a sessão da tarde recebe novo ID e herda frequência e prática.
create temporary table _t40_aulas_oito_horas
on commit drop
as
select
  a.id as aula_manha_id,
  gen_random_uuid() as aula_tarde_id,
  a.turma_id,
  a.disciplina_id,
  a.titulo,
  a.data_aula,
  a.created_at
from public.aulas_turma a
join public.turmas t on t.id = a.turma_id
where t.codigo = 'ENF-T40-INT-MAT'
  and a.carga_horaria = 8
  and a.sessao = 'U';

update public.aulas_turma a
set carga_horaria = 4,
    sessao = 'M'
from _t40_aulas_oito_horas s
where a.id = s.aula_manha_id;

insert into public.aulas_turma (
  id,
  turma_id,
  disciplina_id,
  titulo,
  carga_horaria,
  created_at,
  data_aula,
  sessao
)
select
  s.aula_tarde_id,
  s.turma_id,
  s.disciplina_id,
  s.titulo,
  4,
  s.created_at,
  s.data_aula,
  'T'
from _t40_aulas_oito_horas s;

insert into public.diario_frequencia (
  turma_id,
  disciplina_id,
  aula_id,
  aluno_id,
  status
)
select
  f.turma_id,
  f.disciplina_id,
  s.aula_tarde_id,
  f.aluno_id,
  f.status
from public.diario_frequencia f
join _t40_aulas_oito_horas s on s.aula_manha_id = f.aula_id;

insert into public.diario_praticas (
  turma_id,
  disciplina_id,
  aula_id,
  pratica_pedagogica
)
select
  p.turma_id,
  p.disciplina_id,
  s.aula_tarde_id,
  p.pratica_pedagogica
from public.diario_praticas p
join _t40_aulas_oito_horas s on s.aula_manha_id = p.aula_id;

do $migration_validation$
declare
  v_encontros integer;
  v_sessoes integer;
  v_horas numeric;
  v_frequencias integer;
  v_praticas integer;
  v_notas integer;
  v_manha integer;
  v_tarde integer;
  v_unica integer;
  v_fechamentos integer;
begin
  select
    count(distinct (a.disciplina_id, a.data_aula)),
    count(*),
    coalesce(sum(a.carga_horaria), 0),
    count(*) filter (where a.sessao = 'M'),
    count(*) filter (where a.sessao = 'T'),
    count(*) filter (where a.sessao = 'U')
  into v_encontros, v_sessoes, v_horas, v_manha, v_tarde, v_unica
  from public.aulas_turma a
  join public.turmas t on t.id = a.turma_id
  where t.codigo = 'ENF-T40-INT-MAT';

  select count(*)
  into v_frequencias
  from public.diario_frequencia f
  join public.turmas t on t.id = f.turma_id
  where t.codigo = 'ENF-T40-INT-MAT';

  select count(*)
  into v_praticas
  from public.diario_praticas p
  join public.turmas t on t.id = p.turma_id
  where t.codigo = 'ENF-T40-INT-MAT';

  select count(*)
  into v_notas
  from public.diario_notas n
  join public.turmas t on t.id = n.turma_id
  where t.codigo = 'ENF-T40-INT-MAT';

  select count(*)
  into v_fechamentos
  from public.diario_fechamento_historico h
  join public.turmas t on t.id = h.turma_id
  join public.disciplinas d on d.id = h.disciplina_id
  where t.codigo = 'ENF-T40-INT-MAT'
    and d.nome = 'Relações Humanas no Trabalho';

  if v_encontros <> 21
    or v_sessoes <> 39
    or v_horas <> 160
    or v_frequencias <> 1408
    or v_praticas <> 39
    or v_notas <> 142
    or v_manha <> 18
    or v_tarde <> 18
    or v_unica <> 3
    or v_fechamentos <> 0 then
    raise exception
      'Validação T40 falhou: encontros %, sessões %, horas %, frequências %, práticas %, notas %, M %, T %, U %, fechamentos %.',
      v_encontros, v_sessoes, v_horas, v_frequencias, v_praticas, v_notas,
      v_manha, v_tarde, v_unica, v_fechamentos;
  end if;
end;
$migration_validation$;

create or replace function public.salvar_encontro_turma(
  p_turma_id uuid,
  p_disciplina_id uuid,
  p_titulo text,
  p_carga_horaria numeric,
  p_data_aula date,
  p_aula_id uuid default null
)
returns setof public.aulas_turma
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_data_anterior date;
  v_total_anterior numeric;
  v_sessoes_anteriores integer;
  v_sessoes_esperadas integer;
  v_tem_lancamentos boolean;
begin
  if not public.can_write_academic_record_open(p_turma_id, p_disciplina_id) then
    raise exception 'Sem permissão para alterar este encontro de aula.'
      using errcode = '42501';
  end if;

  if nullif(trim(p_titulo), '') is null then
    raise exception 'Informe o conteúdo da aula.' using errcode = '22023';
  end if;

  if p_data_aula is null then
    raise exception 'Informe a data da aula.' using errcode = '22023';
  end if;

  if p_carga_horaria is null or p_carga_horaria <= 0 then
    raise exception 'A carga horária precisa ser maior que zero.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_turma_id::text),
    hashtext(p_disciplina_id::text)
  );

  v_sessoes_esperadas := case when p_carga_horaria = 8 then 2 else 1 end;

  if p_aula_id is not null then
    select a.data_aula
    into v_data_anterior
    from public.aulas_turma a
    where a.id = p_aula_id
      and a.turma_id = p_turma_id
      and a.disciplina_id = p_disciplina_id;

    if not found then
      raise exception 'Encontro de aula não encontrado.' using errcode = 'P0002';
    end if;

    select coalesce(sum(a.carga_horaria), 0), count(*)
    into v_total_anterior, v_sessoes_anteriores
    from public.aulas_turma a
    where a.turma_id = p_turma_id
      and a.disciplina_id = p_disciplina_id
      and a.data_aula = v_data_anterior;

    select exists (
      select 1
      from public.aulas_turma a
      where a.turma_id = p_turma_id
        and a.disciplina_id = p_disciplina_id
        and a.data_aula = v_data_anterior
        and (
          exists (select 1 from public.diario_frequencia f where f.aula_id = a.id)
          or exists (select 1 from public.diario_praticas p where p.aula_id = a.id)
        )
    )
    into v_tem_lancamentos;

    if v_tem_lancamentos
      and (
        v_total_anterior <> p_carga_horaria
        or v_sessoes_anteriores <> v_sessoes_esperadas
      ) then
      raise exception
        'A carga ou os turnos não podem ser alterados depois de lançada a frequência ou prática.';
    end if;

    if v_total_anterior = p_carga_horaria
      and v_sessoes_anteriores = v_sessoes_esperadas then
      update public.aulas_turma a
      set titulo = trim(p_titulo),
          data_aula = p_data_aula,
          carga_horaria = case
            when p_carga_horaria = 8 then 4
            else p_carga_horaria
          end,
          sessao = case
            when p_carga_horaria = 8 then a.sessao
            else 'U'
          end
      where a.turma_id = p_turma_id
        and a.disciplina_id = p_disciplina_id
        and a.data_aula = v_data_anterior;
    else
      delete from public.aulas_turma a
      where a.turma_id = p_turma_id
        and a.disciplina_id = p_disciplina_id
        and a.data_aula = v_data_anterior;

      if p_carga_horaria = 8 then
        insert into public.aulas_turma (
          turma_id, disciplina_id, titulo, carga_horaria, data_aula, sessao
        ) values
          (p_turma_id, p_disciplina_id, trim(p_titulo), 4, p_data_aula, 'M'),
          (p_turma_id, p_disciplina_id, trim(p_titulo), 4, p_data_aula, 'T');
      else
        insert into public.aulas_turma (
          turma_id, disciplina_id, titulo, carga_horaria, data_aula, sessao
        ) values (
          p_turma_id, p_disciplina_id, trim(p_titulo), p_carga_horaria, p_data_aula, 'U'
        );
      end if;
    end if;
  else
    if p_carga_horaria = 8 then
      insert into public.aulas_turma (
        turma_id, disciplina_id, titulo, carga_horaria, data_aula, sessao
      ) values
        (p_turma_id, p_disciplina_id, trim(p_titulo), 4, p_data_aula, 'M'),
        (p_turma_id, p_disciplina_id, trim(p_titulo), 4, p_data_aula, 'T');
    else
      insert into public.aulas_turma (
        turma_id, disciplina_id, titulo, carga_horaria, data_aula, sessao
      ) values (
        p_turma_id, p_disciplina_id, trim(p_titulo), p_carga_horaria, p_data_aula, 'U'
      );
    end if;
  end if;

  return query
  select a.*
  from public.aulas_turma a
  where a.turma_id = p_turma_id
    and a.disciplina_id = p_disciplina_id
    and a.data_aula = p_data_aula
  order by
    case a.sessao when 'M' then 1 when 'T' then 2 when 'N' then 3 else 4 end,
    a.created_at,
    a.id;
end;
$function$;

create or replace function public.remover_encontro_turma(p_aula_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_turma_id uuid;
  v_disciplina_id uuid;
  v_data_aula date;
  v_count integer;
begin
  select a.turma_id, a.disciplina_id, a.data_aula
  into v_turma_id, v_disciplina_id, v_data_aula
  from public.aulas_turma a
  where a.id = p_aula_id;

  if not found then
    return false;
  end if;

  if not public.can_write_academic_record_open(v_turma_id, v_disciplina_id) then
    raise exception 'Sem permissão para remover este encontro de aula.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_turma_id::text),
    hashtext(v_disciplina_id::text)
  );

  delete from public.aulas_turma a
  where a.turma_id = v_turma_id
    and a.disciplina_id = v_disciplina_id
    and a.data_aula = v_data_aula;
  get diagnostics v_count = row_count;

  return v_count > 0;
end;
$function$;

revoke all on function public.salvar_encontro_turma(
  uuid, uuid, text, numeric, date, uuid
) from public, anon;
grant execute on function public.salvar_encontro_turma(
  uuid, uuid, text, numeric, date, uuid
) to authenticated, service_role;

revoke all on function public.remover_encontro_turma(uuid) from public, anon;
grant execute on function public.remover_encontro_turma(uuid)
  to authenticated, service_role;

-- O fechamento exige todas as sessões, mas distingue encontros de sessões no retorno.
create or replace function public.get_pendencias_fechamento_diario(
  p_turma_id uuid,
  p_disciplina_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_alunos integer;
  v_encontros integer;
  v_sessoes integer;
  v_frequencias integer;
  v_notas_pendentes integer;
begin
  if not (
    public.can_operate_turma_academics(p_turma_id)
    or public.is_professor_assigned_disciplina(p_turma_id, p_disciplina_id)
  ) then
    raise exception 'Sem permissão para consultar as pendências deste diário.'
      using errcode = '42501';
  end if;

  with alunos as (
    select aluno_id
    from public.get_diario_alunos(p_turma_id, p_disciplina_id)
    where status = 'ATIVO'
  ), sessoes as (
    select id, data_aula
    from public.aulas_turma
    where turma_id = p_turma_id
      and disciplina_id = p_disciplina_id
      and (data_aula is null or data_aula <= pg_catalog.timezone('America/Maceio', now())::date)
  )
  select
    (select count(*) from alunos),
    (select count(distinct data_aula) from sessoes),
    (select count(*) from sessoes),
    (
      select count(*)
      from public.diario_frequencia f
      join alunos al on al.aluno_id = f.aluno_id
      join sessoes s on s.id = f.aula_id
      where f.turma_id = p_turma_id
        and f.disciplina_id = p_disciplina_id
        and f.status in ('P', 'F', 'J')
    )
  into v_alunos, v_encontros, v_sessoes, v_frequencias;

  with alunos as (
    select aluno_id
    from public.get_diario_alunos(p_turma_id, p_disciplina_id)
    where status = 'ATIVO'
  ), resultados as (
    select r.aluno_id, r.media_parcial
    from public.get_diario_resultados(p_turma_id, p_disciplina_id) r
  )
  select count(*)
  into v_notas_pendentes
  from alunos al
  left join resultados r on r.aluno_id = al.aluno_id
  where r.media_parcial is null;

  return jsonb_build_object(
    'alunosAtivos', v_alunos,
    'aulasRealizadas', v_encontros,
    'encontrosRealizados', v_encontros,
    'sessoesRealizadas', v_sessoes,
    'frequenciasPendentes', greatest(0, v_alunos * v_sessoes - v_frequencias),
    'notasPendentes', v_notas_pendentes,
    'podeFechar', (
      v_alunos > 0
      and v_sessoes > 0
      and v_alunos * v_sessoes = v_frequencias
      and v_notas_pendentes = 0
    )
  );
end;
$function$;

-- A carga continua somando sessões, enquanto "aulas" representa encontros por data.
create or replace function public.get_diarios_turma(p_turma_id uuid)
returns table (
  modulo_id uuid,
  modulo_nome text,
  periodo_letivo_id uuid,
  periodo_status text,
  disciplina_id uuid,
  disciplina_nome text,
  professor_nome text,
  carga_horaria numeric,
  horas_realizadas numeric,
  aulas_count bigint,
  progresso_percent numeric,
  horas_status text,
  horas_diferenca numeric,
  concluida boolean,
  modulo_total_disciplinas bigint,
  modulo_progresso_percent numeric,
  primeira_aula date,
  ultima_aula date,
  presenca_geral_percent numeric
)
language sql
stable
security definer
set search_path to ''
as $function$
  with allowed_turma as (
    select t.id
    from public.turmas t
    where t.id = p_turma_id
      and (select public.can_access_atividade_extra_turma(t.id))
  ), aulas_resumo as (
    select
      disciplina_id,
      sum(carga_horaria) as realizadas,
      count(distinct data_aula) as quantidade,
      min(data_aula) as primeira_aula,
      max(data_aula) as ultima_aula
    from public.aulas_turma
    where turma_id = p_turma_id
      and exists (select 1 from allowed_turma)
    group by disciplina_id
  ), horas_atividades as (
    select disciplina_id, sum(carga_horaria_compensacao) as realizadas
    from public.atividades_extra_classe
    where turma_id = p_turma_id
      and exists (select 1 from allowed_turma)
      and status = 'PUBLICADA'
      and (
        prazo_entrega is null
        or prazo_entrega <= (pg_catalog.timezone('America/Maceio', now()))::date
      )
    group by disciplina_id
  ), horas as (
    select
      coalesce(ar.disciplina_id, he.disciplina_id) as disciplina_id,
      coalesce(ar.realizadas, 0) + coalesce(he.realizadas, 0) as realizadas,
      coalesce(ar.quantidade, 0) as quantidade_aulas,
      ar.primeira_aula,
      ar.ultima_aula
    from aulas_resumo ar
    full join horas_atividades he using (disciplina_id)
  ), presenca as (
    select
      f.disciplina_id,
      round(
        sum(
          case when f.status = 'P'
            then case when a.carga_horaria > 0 then a.carga_horaria else 1 end
            else 0
          end
        )::numeric
        / nullif(
          sum(
            case when f.status in ('P', 'F')
              then case when a.carga_horaria > 0 then a.carga_horaria else 1 end
              else 0
            end
          ),
          0
        ) * 100,
        1
      ) as presenca_geral_percent
    from public.diario_frequencia f
    join public.aulas_turma a
      on a.id = f.aula_id
     and a.turma_id = f.turma_id
     and a.disciplina_id = f.disciplina_id
    where f.turma_id = p_turma_id
      and f.status in ('P', 'F')
      and exists (select 1 from allowed_turma)
    group by f.disciplina_id
  )
  select
    mo.id,
    mo.nome,
    pl.id,
    coalesce(pl.status, 'ABERTO'),
    d.id,
    d.nome,
    coalesce(td.professor_nome, 'Não atribuído'),
    d.carga_horaria,
    coalesce(h.realizadas, 0),
    coalesce(h.quantidade_aulas, 0),
    case when d.carga_horaria > 0 then least(
      100,
      round((coalesce(h.realizadas, 0) / d.carga_horaria) * 100, 1)
    ) else 0 end,
    case when coalesce(h.realizadas, 0) = d.carga_horaria then 'EXATA'
      when coalesce(h.realizadas, 0) > d.carga_horaria then 'EXCESSO'
      else 'PENDENTE'
    end,
    abs(d.carga_horaria - coalesce(h.realizadas, 0)),
    coalesce(td.concluida, false),
    count(*) over (partition by mo.id),
    round(
      avg(
        case when d.carga_horaria > 0 then least(
          100,
          (coalesce(h.realizadas, 0) / d.carga_horaria) * 100
        ) else 0 end
      ) over (partition by mo.id)
    ),
    h.primeira_aula,
    h.ultima_aula,
    p.presenca_geral_percent
  from public.turmas t
  join allowed_turma allowed on allowed.id = t.id
  join public.modulos mo on mo.curso_id = t.curso_id
  join public.disciplinas d on d.modulo_id = mo.id
  left join public.turmas_disciplinas td
    on td.turma_id = t.id and td.disciplina_id = d.id
  left join public.periodos_letivos pl on pl.id = td.periodo_letivo_id
  left join horas h on h.disciplina_id = d.id
  left join presenca p on p.disciplina_id = d.id
  where t.id = p_turma_id
  order by
    mo.ordem nulls last,
    mo.created_at,
    d.ordem nulls last,
    d.created_at,
    d.nome;
$function$;

revoke all on function public.get_diarios_turma(uuid) from public, anon;
grant execute on function public.get_diarios_turma(uuid)
  to authenticated, service_role;

-- A view legada passa a usar a mesma ponderação por carga horária do resultado canônico.
create or replace view public.v_diario_notas_resultados as
with aulas as (
  select
    a.turma_id,
    a.disciplina_id,
    count(distinct a.data_aula) as total_aulas,
    sum(case when a.carga_horaria > 0 then a.carga_horaria else 1 end) as total_horas
  from public.aulas_turma a
  group by a.turma_id, a.disciplina_id
),
frequencias as (
  select
    f.turma_id,
    f.disciplina_id,
    f.aluno_id,
    count(*) as lancamentos,
    count(*) filter (where f.status = 'F') as total_faltas,
    sum(
      case when f.status = 'F'
        then case when a.carga_horaria > 0 then a.carga_horaria else 1 end
        else 0
      end
    ) as horas_falta
  from public.diario_frequencia f
  join public.aulas_turma a on a.id = f.aula_id
  group by f.turma_id, f.disciplina_id, f.aluno_id
),
base as (
  select
    n.*,
    coalesce(a.total_aulas, 0::bigint) as total_aulas,
    coalesce(f.total_faltas, 0::bigint) as total_faltas,
    case
      when coalesce(a.total_horas, 0) > 0
        and coalesce(f.lancamentos, 0) = (
          select count(*)
          from public.aulas_turma sessoes
          where sessoes.turma_id = n.turma_id
            and sessoes.disciplina_id = n.disciplina_id
        )
      then round(
        ((a.total_horas - coalesce(f.horas_falta, 0)) / a.total_horas) * 100,
        2
      )
      else null
    end as frequencia_percent,
    internal_academic.calculate_diario_partial(
      td.instrumentos_avaliativos,
      n.nota_p,
      n.nota_ti,
      n.nota_tg,
      n.nota_s,
      n.nota_cq,
      n.nota_o
    ) as media_parcial
  from public.diario_notas n
  left join aulas a
    on a.turma_id = n.turma_id
   and a.disciplina_id = n.disciplina_id
  left join frequencias f
    on f.turma_id = n.turma_id
   and f.disciplina_id = n.disciplina_id
   and f.aluno_id = n.aluno_id
  left join public.turmas_disciplinas td
    on td.turma_id = n.turma_id
   and td.disciplina_id = n.disciplina_id
),
finais as (
  select
    b.*,
    case
      when b.media_parcial is null then null::numeric
      when b.nota_rec is not null and b.nota_rec > b.media_parcial
        then least(10.00, round(b.nota_rec::numeric, 1))
      else b.media_parcial
    end as media_final
  from base b
)
select
  f.turma_id,
  f.disciplina_id,
  f.aluno_id,
  f.nota_p,
  f.nota_ti,
  f.nota_tg,
  f.nota_s,
  f.nota_cq,
  f.nota_o,
  f.nota_rec,
  f.total_aulas,
  f.total_faltas,
  f.frequencia_percent,
  f.media_parcial,
  f.media_final,
  case
    when f.media_parcial is null then 'SEM_LANCAMENTO'::text
    when f.frequencia_percent is null then 'FREQUENCIA_PENDENTE'::text
    when f.media_final >= 6.0 and f.frequencia_percent >= 75
      then 'APROVADO'::text
    when f.frequencia_percent < 75 then 'REPROVADO_POR_FALTA'::text
    when f.nota_rec is null and f.media_parcial < 6.0
      then 'EM_RECUPERACAO'::text
    else 'REPROVADO'::text
  end as resultado_final
from finais f;

alter view public.v_diario_notas_resultados
  set (security_invoker = true);

notify pgrst, 'reload schema';
