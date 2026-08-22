begin;

create table public.curso_livre_tentativas (
  id uuid primary key default gen_random_uuid(),
  matricula_id uuid not null references public.matriculas(id) on delete restrict,
  avaliacao_id uuid not null references public.curso_livre_avaliacoes(id) on delete restrict,
  inicio_request_id uuid not null unique,
  status text not null default 'EM_ANDAMENTO'
    check (status in ('EM_ANDAMENTO', 'APROVADA', 'REPROVADA')),
  liberada_em timestamptz not null,
  iniciada_em timestamptz not null default now(),
  enviada_em timestamptz,
  acertos smallint,
  total smallint not null default 10 check (total = 10),
  nota_percentual numeric(5,2),
  respostas jsonb,
  resposta_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index curso_livre_tentativa_em_andamento_uidx
  on public.curso_livre_tentativas(matricula_id)
  where status = 'EM_ANDAMENTO';
create index curso_livre_tentativas_matricula_idx
  on public.curso_livre_tentativas(matricula_id, iniciada_em desc);
create index curso_livre_tentativas_avaliacao_idx
  on public.curso_livre_tentativas(avaliacao_id);

create table public.curso_livre_tentativa_questoes (
  id uuid primary key default gen_random_uuid(),
  tentativa_id uuid not null references public.curso_livre_tentativas(id) on delete restrict,
  questao_id uuid not null references public.curso_livre_questoes(id) on delete restrict,
  ordem smallint not null check (ordem between 1 and 10),
  enunciado text not null,
  opcoes jsonb not null,
  resposta_correta smallint not null,
  unique (tentativa_id, ordem),
  unique (tentativa_id, questao_id)
);

create index curso_livre_tentativa_questoes_origem_idx
  on public.curso_livre_tentativa_questoes(questao_id);

alter table public.curso_livre_tentativas enable row level security;
alter table public.curso_livre_tentativa_questoes enable row level security;
revoke all on table public.curso_livre_tentativas
  from public, anon, authenticated;
revoke all on table public.curso_livre_tentativa_questoes
  from public, anon, authenticated;
grant all on table public.curso_livre_tentativas to service_role;
grant all on table public.curso_livre_tentativa_questoes to service_role;

create table internal_academic.curso_livre_tentativa_requests (
  request_id uuid primary key,
  operacao text not null check (operacao in ('INICIAR', 'ENTREGAR')),
  actor_id uuid,
  payload_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);
revoke all on table internal_academic.curso_livre_tentativa_requests
  from public, anon, authenticated, service_role;

create or replace function internal_academic.curso_livre_carga_planejada_exata(
  p_turma_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  with context as (
    select class.id as turma_id, class.curso_id, course.carga_horaria::numeric as curso_carga
    from public.turmas class
    join public.cursos course on course.id = class.curso_id
    where class.id = p_turma_id and upper(coalesce(course.modalidade, '')) = 'LIVRE'
  ), grade as (
    select discipline.id, discipline.carga_horaria::numeric as carga
    from context
    join public.modulos module on module.curso_id = context.curso_id
    join public.disciplinas discipline on discipline.modulo_id = module.id
  ), planned as (
    select meeting.disciplina_id, coalesce(sum(meeting.carga_horaria), 0)::numeric as carga
    from public.aulas_turma meeting
    where meeting.turma_id = p_turma_id
    group by meeting.disciplina_id
  )
  select coalesce((
    select
      (select count(*) from grade) > 0
      and not exists (
        select 1 from grade where not exists (
          select 1 from public.turmas_disciplinas binding
          where binding.turma_id = p_turma_id and binding.disciplina_id = grade.id
        )
      )
      and not exists (
        select 1 from public.turmas_disciplinas binding
        where binding.turma_id = p_turma_id
          and not exists (select 1 from grade where grade.id = binding.disciplina_id)
      )
      and not exists (
        select 1 from grade
        left join planned on planned.disciplina_id = grade.id
        where coalesce(planned.carga, 0) <> grade.carga
      )
      and not exists (
        select 1 from planned
        left join grade on grade.id = planned.disciplina_id
        where grade.id is null
      )
      and (select coalesce(sum(planned.carga), 0) from planned)
        = (select context.curso_carga from context)
  ), false);
$function$;

revoke all on function internal_academic.curso_livre_carga_planejada_exata(uuid)
  from public, anon, authenticated;

create or replace function internal_academic.curso_livre_liberacao_em(p_turma_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $function$
  select (meeting.data_aula + coalesce(meeting.hora_inicio, time '00:00'))
    at time zone 'America/Maceio'
  from public.aulas_turma meeting
  where meeting.turma_id = p_turma_id and meeting.data_aula is not null
  order by meeting.data_aula desc,
    coalesce(meeting.hora_inicio, time '00:00') desc,
    case meeting.sessao when 'N' then 4 when 'T' then 3 when 'M' then 2 else 1 end desc,
    meeting.id desc
  limit 1;
$function$;

revoke all on function internal_academic.curso_livre_liberacao_em(uuid)
  from public, anon, authenticated;

create or replace function internal_academic.validate_turma_livre_academico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_course_id uuid;
begin
  select class.curso_id into v_course_id
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.id = new.turma_id
    and upper(coalesce(course.modalidade, '')) = 'LIVRE';
  if not found then
    raise exception 'A configuração acadêmica exige uma turma de Curso Livre.'
      using errcode = '23514';
  end if;
  if new.avaliacao_id is not null and not exists (
    select 1 from public.curso_livre_avaliacoes assessment
    where assessment.id = new.avaliacao_id
      and assessment.curso_id = v_course_id
      and assessment.status = 'PUBLICADA'
  ) then
    raise exception 'A turma Livre deve fixar uma avaliação publicada do próprio curso.'
      using errcode = '23514';
  end if;
  if new.professor_id is not null and not exists (
    select 1 from public.parceiros professor
    where professor.id = new.professor_id
      and upper(coalesce(professor.tipo, '')) = 'PROFESSOR'
      and upper(coalesce(professor.status, '')) = 'ATIVO'
  ) then
    raise exception 'A turma Livre exige um professor ativo.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE'
    and (new.avaliacao_id, new.professor_id)
      is distinct from (old.avaliacao_id, old.professor_id)
    and exists (
      select 1 from public.curso_livre_tentativas attempt
      join public.matriculas enrollment on enrollment.id = attempt.matricula_id
      where enrollment.turma_id = new.turma_id
    )
  then
    raise exception 'Avaliação e professor não mudam após o início de uma tentativa.'
      using errcode = '55000';
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

commit;
