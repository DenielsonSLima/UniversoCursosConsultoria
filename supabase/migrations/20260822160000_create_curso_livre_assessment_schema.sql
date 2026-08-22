begin;

create table public.curso_livre_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references public.cursos(id) on delete restrict,
  versao integer not null check (versao > 0),
  revisao integer not null default 1 check (revisao > 0),
  status text not null default 'RASCUNHO'
    check (status in ('RASCUNHO', 'PUBLICADA')),
  titulo text not null,
  nota_minima_percentual numeric(5,2) not null default 70
    check (nota_minima_percentual between 0 and 100),
  quantidade_sorteada smallint not null default 10
    check (quantidade_sorteada = 10),
  minimo_banco smallint not null default 50 check (minimo_banco = 50),
  intervalo_nova_tentativa_horas integer not null default 0
    check (intervalo_nova_tentativa_horas between 0 and 720),
  publicada_em timestamptz,
  publicada_por uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (curso_id, versao)
);

create unique index curso_livre_avaliacoes_rascunho_uidx
  on public.curso_livre_avaliacoes(curso_id)
  where status = 'RASCUNHO';

create index curso_livre_avaliacoes_publicadas_idx
  on public.curso_livre_avaliacoes(curso_id, versao desc)
  where status = 'PUBLICADA';

create table public.curso_livre_questoes (
  id uuid primary key default gen_random_uuid(),
  avaliacao_id uuid not null
    references public.curso_livre_avaliacoes(id) on delete cascade,
  enunciado text not null,
  opcoes jsonb not null,
  resposta_correta smallint not null,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (avaliacao_id, id)
);

create index curso_livre_questoes_sorteio_idx
  on public.curso_livre_questoes(avaliacao_id, id)
  where ativa;

alter table public.curso_livre_avaliacoes enable row level security;
alter table public.curso_livre_questoes enable row level security;
revoke all on table public.curso_livre_avaliacoes
  from public, anon, authenticated;
revoke all on table public.curso_livre_questoes
  from public, anon, authenticated;
grant all on table public.curso_livre_avaliacoes to service_role;
grant all on table public.curso_livre_questoes to service_role;

create or replace function internal_academic.validate_curso_livre_questao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_option_count integer;
begin
  new.enunciado := pg_catalog.btrim(coalesce(new.enunciado, ''));
  if new.enunciado = '' or pg_catalog.char_length(new.enunciado) > 2000 then
    raise exception 'Enunciado da questão Livre inválido.' using errcode = '23514';
  end if;
  if pg_catalog.jsonb_typeof(new.opcoes) <> 'array' then
    raise exception 'As alternativas da questão Livre devem formar uma lista.'
      using errcode = '23514';
  end if;
  v_option_count := pg_catalog.jsonb_array_length(new.opcoes);
  if v_option_count not between 2 and 8 then
    raise exception 'A questão Livre deve possuir entre 2 e 8 alternativas.'
      using errcode = '23514';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(new.opcoes) option_value
    where pg_catalog.jsonb_typeof(option_value) <> 'string'
      or nullif(pg_catalog.btrim(option_value #>> '{}'), '') is null
      or pg_catalog.char_length(option_value #>> '{}') > 1000
  ) then
    raise exception 'A questão Livre possui alternativa inválida.'
      using errcode = '23514';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements_text(new.opcoes) option_value(value)
    group by pg_catalog.lower(pg_catalog.btrim(option_value.value))
    having count(*) > 1
  ) then
    raise exception 'A questão Livre possui alternativas repetidas.'
      using errcode = '23514';
  end if;
  if new.resposta_correta < 0 or new.resposta_correta >= v_option_count then
    raise exception 'O gabarito da questão Livre não corresponde às alternativas.'
      using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function internal_academic.validate_curso_livre_questao()
  from public, anon, authenticated, service_role;

create trigger validate_curso_livre_questao_trigger
before insert or update on public.curso_livre_questoes
for each row execute function internal_academic.validate_curso_livre_questao();

create or replace function internal_academic.protect_curso_livre_avaliacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_modalidade text;
  v_active_questions integer;
begin
  if tg_op = 'DELETE' then
    if old.status = 'PUBLICADA' then
      raise exception 'Avaliação Livre publicada é imutável.' using errcode = '55000';
    end if;
    return old;
  end if;

  select upper(coalesce(course.modalidade, ''))
  into v_modalidade
  from public.cursos course
  where course.id = new.curso_id;
  if v_modalidade is distinct from 'LIVRE' then
    raise exception 'A avaliação final é exclusiva de Curso Livre.'
      using errcode = '23514';
  end if;

  new.titulo := pg_catalog.btrim(coalesce(new.titulo, ''));
  if new.titulo = '' or pg_catalog.char_length(new.titulo) > 200 then
    raise exception 'Título da avaliação Livre inválido.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.status = 'PUBLICADA' and new is distinct from old then
    raise exception 'Avaliação Livre publicada é imutável; crie uma nova versão.'
      using errcode = '55000';
  end if;
  if new.status = 'PUBLICADA' and (tg_op = 'INSERT' or old.status <> 'PUBLICADA') then
    select count(*)::integer
    into v_active_questions
    from public.curso_livre_questoes question
    where question.avaliacao_id = new.id and question.ativa;
    if v_active_questions < new.minimo_banco or v_active_questions < 50 then
      raise exception 'Publique a avaliação Livre somente com ao menos 50 questões ativas.'
        using errcode = '23514';
    end if;
    new.publicada_em := coalesce(new.publicada_em, now());
    new.publicada_por := coalesce(new.publicada_por, auth.uid());
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function internal_academic.protect_curso_livre_avaliacao()
  from public, anon, authenticated, service_role;

create trigger protect_curso_livre_avaliacao_trigger
before insert or update or delete on public.curso_livre_avaliacoes
for each row execute function internal_academic.protect_curso_livre_avaliacao();

create or replace function internal_academic.protect_curso_livre_questao_publicada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_assessment_id uuid := case when tg_op = 'DELETE' then old.avaliacao_id else new.avaliacao_id end;
begin
  if exists (
    select 1 from public.curso_livre_avaliacoes assessment
    where assessment.id = v_assessment_id and assessment.status = 'PUBLICADA'
  ) then
    raise exception 'Questões de avaliação Livre publicada são imutáveis.'
      using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

revoke all on function internal_academic.protect_curso_livre_questao_publicada()
  from public, anon, authenticated, service_role;

create trigger protect_curso_livre_questao_publicada_trigger
before insert or update or delete on public.curso_livre_questoes
for each row execute function internal_academic.protect_curso_livre_questao_publicada();

commit;
