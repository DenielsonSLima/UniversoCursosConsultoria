-- Lote 2026-08-08: dados eleitorais complementares e Plano de Curso canônico.
-- Datas, encontros, vínculo docente e paginação são derivados no Postgres.

begin;

alter table public.parceiros
  add column if not exists titulo_eleitor_zona text,
  add column if not exists titulo_eleitor_secao text,
  add column if not exists titulo_eleitor_data_emissao date,
  add column if not exists titulo_eleitor_uf text;

comment on column public.parceiros.titulo_eleitor_zona is 'Zona do título eleitoral informada no cadastro.';
comment on column public.parceiros.titulo_eleitor_secao is 'Seção do título eleitoral informada no cadastro.';
comment on column public.parceiros.titulo_eleitor_data_emissao is 'Data de emissão do título eleitoral.';
comment on column public.parceiros.titulo_eleitor_uf is 'UF de emissão do título eleitoral.';

create table if not exists public.planos_curso (
  id uuid primary key default extensions.gen_random_uuid(),
  turma_id uuid not null,
  disciplina_id uuid not null,
  professor_id uuid not null references public.parceiros(id) on delete restrict,
  status text not null default 'RASCUNHO'
    check (status in ('RASCUNHO', 'CONCLUIDO')),
  revisao integer not null default 1 check (revisao > 0),
  objetivos jsonb not null default '[]'::jsonb
    check (jsonb_typeof(objetivos) = 'array'),
  criterios_avaliacao jsonb not null default '[]'::jsonb
    check (jsonb_typeof(criterios_avaliacao) = 'array'),
  insumos_recursos jsonb not null default '[]'::jsonb
    check (jsonb_typeof(insumos_recursos) = 'array'),
  conteudos_aulas jsonb not null default '[]'::jsonb
    check (jsonb_typeof(conteudos_aulas) = 'array'),
  documento_snapshot jsonb,
  template_revision integer,
  documento_fingerprint text,
  concluido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planos_curso_turma_disciplina_fkey
    foreign key (turma_id, disciplina_id)
    references public.turmas_disciplinas(turma_id, disciplina_id)
    on delete restrict,
  constraint planos_curso_vinculo_docente_unique
    unique (turma_id, disciplina_id, professor_id),
  constraint planos_curso_conclusao_check check (
    (
      status = 'RASCUNHO'
      and concluido_em is null
      and documento_snapshot is null
      and template_revision is null
      and documento_fingerprint is null
    )
    or (
      status = 'CONCLUIDO'
      and concluido_em is not null
      and jsonb_typeof(documento_snapshot) = 'object'
      and template_revision is not null
      and documento_fingerprint is not null
    )
  )
);

create index if not exists planos_curso_professor_status_idx
  on public.planos_curso (professor_id, status, updated_at desc);

create index if not exists planos_curso_turma_status_idx
  on public.planos_curso (turma_id, status, disciplina_id);

alter table public.planos_curso enable row level security;
revoke all on table public.planos_curso from public, anon, authenticated, service_role;
grant select on table public.planos_curso to authenticated, service_role;

drop policy if exists planos_curso_select_autorizado on public.planos_curso;
create policy planos_curso_select_autorizado
on public.planos_curso
for select
to authenticated
using (
  (
    professor_id = (select public.current_professor_id())
    and exists (
      select 1
      from public.turmas_disciplinas assignment
      where assignment.turma_id = planos_curso.turma_id
        and assignment.disciplina_id = planos_curso.disciplina_id
        and assignment.professor_id = planos_curso.professor_id
    )
  )
  or public.can_operate_turma_academics(turma_id)
);

-- A assinatura continua privada. Esta autorização existe somente para que a
-- Gestão acadêmica do polo obtenha uma URL assinada do docente de um plano ao
-- qual já possui acesso; não concede upload, update, delete nem URL pública.
create or replace function public.can_read_assinatura_plano_curso_storage(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  with candidate as materialized (
    select case
      when coalesce(p_name, '') ~* (
        '^professores/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(assinatura|envios/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'
      ) then pg_catalog.split_part(p_name, '/', 2)::uuid
      else null::uuid
    end as professor_id
  )
  select exists (
    select 1
    from candidate
    join public.assinaturas_pessoas signature
      on signature.parceiro_id = candidate.professor_id
      and signature.categoria = 'PROFESSOR'
      and signature.ativo
      and signature.assinatura_path = p_name
    join public.planos_curso plan
      on plan.professor_id = candidate.professor_id
    where candidate.professor_id is not null
      and public.can_operate_turma_academics(plan.turma_id)
  );
$function$;

revoke all on function public.can_read_assinatura_plano_curso_storage(text)
  from public, anon, authenticated, service_role;
grant execute on function public.can_read_assinatura_plano_curso_storage(text)
  to authenticated;

drop policy if exists assinaturas_objects_select_plano_curso_gestao on storage.objects;
create policy assinaturas_objects_select_plano_curso_gestao
on storage.objects
for select
to authenticated
using (
  bucket_id = 'assinaturas'
  and public.can_read_assinatura_plano_curso_storage(name)
);

create or replace function public.touch_planos_curso_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists touch_planos_curso_updated_at on public.planos_curso;
create trigger touch_planos_curso_updated_at
before update on public.planos_curso
for each row execute function public.touch_planos_curso_updated_at();

revoke all on function public.touch_planos_curso_updated_at()
  from public, anon, authenticated, service_role;

-- Serializa qualquer mutação de encontro na mesma chave das RPCs de grade.
-- Depois da conclusão, o documento oficial não pode mudar silenciosamente.
create or replace function internal_academic.guard_plano_curso_aula_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old_key text;
  v_new_key text;
begin
  if tg_op <> 'INSERT' then
    v_old_key := old.turma_id::text || ':' || old.disciplina_id::text;
  end if;
  if tg_op <> 'DELETE' then
    v_new_key := new.turma_id::text || ':' || new.disciplina_id::text;
  end if;

  if v_old_key is not null and v_new_key is not null and v_old_key <> v_new_key then
    if v_old_key < v_new_key then
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtext(old.turma_id::text), pg_catalog.hashtext(old.disciplina_id::text)
      );
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtext(new.turma_id::text), pg_catalog.hashtext(new.disciplina_id::text)
      );
    else
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtext(new.turma_id::text), pg_catalog.hashtext(new.disciplina_id::text)
      );
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtext(old.turma_id::text), pg_catalog.hashtext(old.disciplina_id::text)
      );
    end if;
  elsif tg_op = 'INSERT' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(new.turma_id::text), pg_catalog.hashtext(new.disciplina_id::text)
    );
  else
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(old.turma_id::text), pg_catalog.hashtext(old.disciplina_id::text)
    );
  end if;

  if (tg_op <> 'INSERT' and exists (
    select 1
    from public.planos_curso plan
    where plan.turma_id = old.turma_id
      and plan.disciplina_id = old.disciplina_id
      and plan.status = 'CONCLUIDO'
  )) or (tg_op <> 'DELETE' and exists (
    select 1
    from public.planos_curso plan
    where plan.turma_id = new.turma_id
      and plan.disciplina_id = new.disciplina_id
      and plan.status = 'CONCLUIDO'
  )) then
    raise exception 'A grade possui Plano de Curso concluído e não pode ser alterada.'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_plano_curso_aula_mutation on public.aulas_turma;
create trigger guard_plano_curso_aula_mutation
before insert or update or delete on public.aulas_turma
for each row execute function internal_academic.guard_plano_curso_aula_mutation();

revoke all on function internal_academic.guard_plano_curso_aula_mutation()
  from public, anon, authenticated, service_role;

-- Um plano salvo pertence ao docente do vínculo naquele momento. Sem fluxo
-- explícito de descarte/arquivamento neste lote, reatribuir ou excluir o
-- vínculo não pode abandonar o plano silenciosamente.
create or replace function internal_academic.guard_plano_curso_assignment_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE'
    and new.professor_id is not distinct from old.professor_id
    and new.turma_id = old.turma_id
    and new.disciplina_id = old.disciplina_id then
    return new;
  end if;

  -- UPDATE/DELETE já detêm o row lock deste vínculo. As RPCs de salvar e
  -- concluir também travam esta mesma linha antes do lock da grade; não se
  -- adquire advisory lock aqui para evitar inversão linha -> advisory.
  if exists (
    select 1
    from public.planos_curso plan
    where plan.turma_id = old.turma_id
      and plan.disciplina_id = old.disciplina_id
  ) or (tg_op = 'UPDATE' and exists (
    select 1
    from public.planos_curso plan
    where plan.turma_id = new.turma_id
      and plan.disciplina_id = new.disciplina_id
  )) then
    raise exception 'O vínculo possui Plano de Curso e não permite reatribuir ou remover o docente.'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_plano_curso_assignment_mutation on public.turmas_disciplinas;
create trigger guard_plano_curso_assignment_mutation
before update or delete on public.turmas_disciplinas
for each row execute function internal_academic.guard_plano_curso_assignment_mutation();

revoke all on function internal_academic.guard_plano_curso_assignment_mutation()
  from public, anon, authenticated, service_role;

-- Autorização privada do canal de elegibilidade do professor. O tópico é
-- fechado sobre a identidade autenticada e o polo acadêmico autorizado.
create or replace function public.can_subscribe_plano_curso_professor_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  with candidate as materialized (
    select
      case when coalesce(p_topic, '') ~* (
        '^plano-curso:professor:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:polo:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ) then pg_catalog.split_part(p_topic, ':', 3)::uuid end as professor_id,
      case when coalesce(p_topic, '') ~* (
        '^plano-curso:professor:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:polo:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ) then pg_catalog.split_part(p_topic, ':', 5)::uuid end as polo_id
  )
  select exists (
    select 1
    from candidate
    where candidate.professor_id = public.current_professor_id()
      and candidate.polo_id is not null
      and calendar_private.current_professor_can_access_polo(candidate.polo_id)
  );
$function$;

revoke all on function public.can_subscribe_plano_curso_professor_topic(text)
  from public, anon, authenticated, service_role;
grant execute on function public.can_subscribe_plano_curso_professor_topic(text)
  to authenticated;

grant select on table realtime.messages to authenticated;
drop policy if exists plano_curso_professor_broadcast_select on realtime.messages;
create policy plano_curso_professor_broadcast_select
on realtime.messages
for select
to authenticated
using (
  public.can_subscribe_plano_curso_professor_topic(realtime.topic())
);

create or replace function internal_academic.send_plano_curso_eligibility_changed(
  p_professor_id uuid,
  p_polo_id uuid,
  p_turma_id uuid,
  p_disciplina_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_professor_id is null or p_polo_id is null
    or p_turma_id is null or p_disciplina_id is null then
    return;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'changed', true,
      'turmaId', p_turma_id,
      'disciplinaId', p_disciplina_id
    ),
    'eligibility-changed',
    'plano-curso:professor:' || p_professor_id::text || ':polo:' || p_polo_id::text,
    true
  );
end;
$function$;

revoke all on function internal_academic.send_plano_curso_eligibility_changed(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.broadcast_plano_curso_assignment_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old_polo_id uuid;
  v_new_polo_id uuid;
  v_context_changed boolean;
begin
  if tg_op <> 'INSERT' then
    select class.polo_id into v_old_polo_id
    from public.turmas class
    where class.id = old.turma_id;
  end if;
  if tg_op <> 'DELETE' then
    select class.polo_id into v_new_polo_id
    from public.turmas class
    where class.id = new.turma_id;
  end if;

  if tg_op = 'UPDATE' then
    v_context_changed := old.professor_id is distinct from new.professor_id
      or old.turma_id is distinct from new.turma_id
      or old.disciplina_id is distinct from new.disciplina_id
      or v_old_polo_id is distinct from v_new_polo_id;
  else
    v_context_changed := true;
  end if;

  if not v_context_changed then
    return null;
  end if;

  if tg_op <> 'INSERT' then
    if old.professor_id is not null then
      perform internal_academic.send_plano_curso_eligibility_changed(
        old.professor_id, v_old_polo_id, old.turma_id, old.disciplina_id
      );
    end if;
  end if;
  if tg_op <> 'DELETE' then
    if new.professor_id is not null then
      perform internal_academic.send_plano_curso_eligibility_changed(
        new.professor_id, v_new_polo_id, new.turma_id, new.disciplina_id
      );
    end if;
  end if;

  return null;
end;
$function$;

revoke all on function internal_academic.broadcast_plano_curso_assignment_eligibility()
  from public, anon, authenticated, service_role;

drop trigger if exists broadcast_plano_curso_assignment_eligibility
  on public.turmas_disciplinas;
create trigger broadcast_plano_curso_assignment_eligibility
after insert or update or delete on public.turmas_disciplinas
for each row execute function internal_academic.broadcast_plano_curso_assignment_eligibility();

-- Uma disciplina entra/sai da lista do professor somente na transição entre
-- zero e um encontro datado. Alterar uma data dentro do mesmo vínculo não
-- gera ruído; mover encontro avalia os contextos antigo e novo separadamente.
create or replace function internal_academic.broadcast_plano_curso_lesson_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_emit_old boolean := false;
  v_emit_new boolean := false;
  v_count bigint;
  v_professor_id uuid;
  v_polo_id uuid;
begin
  if tg_op = 'DELETE' and old.data_aula is not null then
    select count(*) into v_count
    from public.aulas_turma meeting
    where meeting.turma_id = old.turma_id
      and meeting.disciplina_id = old.disciplina_id
      and meeting.data_aula is not null;
    v_emit_old := v_count = 0;
  elsif tg_op = 'UPDATE'
    and old.data_aula is not null
    and (
      new.data_aula is null
      or old.turma_id is distinct from new.turma_id
      or old.disciplina_id is distinct from new.disciplina_id
    ) then
    select count(*) into v_count
    from public.aulas_turma meeting
    where meeting.turma_id = old.turma_id
      and meeting.disciplina_id = old.disciplina_id
      and meeting.data_aula is not null;
    v_emit_old := v_count = 0;
  end if;

  if tg_op = 'INSERT' and new.data_aula is not null then
    select count(*) into v_count
    from public.aulas_turma meeting
    where meeting.turma_id = new.turma_id
      and meeting.disciplina_id = new.disciplina_id
      and meeting.data_aula is not null;
    v_emit_new := v_count = 1;
  elsif tg_op = 'UPDATE'
    and new.data_aula is not null
    and (
      old.data_aula is null
      or old.turma_id is distinct from new.turma_id
      or old.disciplina_id is distinct from new.disciplina_id
    ) then
    select count(*) into v_count
    from public.aulas_turma meeting
    where meeting.turma_id = new.turma_id
      and meeting.disciplina_id = new.disciplina_id
      and meeting.data_aula is not null;
    v_emit_new := v_count = 1;
  end if;

  if v_emit_old then
    select assignment.professor_id, class.polo_id
    into v_professor_id, v_polo_id
    from public.turmas_disciplinas assignment
    join public.turmas class on class.id = assignment.turma_id
    where assignment.turma_id = old.turma_id
      and assignment.disciplina_id = old.disciplina_id;
    perform internal_academic.send_plano_curso_eligibility_changed(
      v_professor_id, v_polo_id, old.turma_id, old.disciplina_id
    );
  end if;

  if v_emit_new then
    v_professor_id := null;
    v_polo_id := null;
    select assignment.professor_id, class.polo_id
    into v_professor_id, v_polo_id
    from public.turmas_disciplinas assignment
    join public.turmas class on class.id = assignment.turma_id
    where assignment.turma_id = new.turma_id
      and assignment.disciplina_id = new.disciplina_id;
    perform internal_academic.send_plano_curso_eligibility_changed(
      v_professor_id, v_polo_id, new.turma_id, new.disciplina_id
    );
  end if;

  return null;
end;
$function$;

revoke all on function internal_academic.broadcast_plano_curso_lesson_eligibility()
  from public, anon, authenticated, service_role;

drop trigger if exists broadcast_plano_curso_lesson_eligibility on public.aulas_turma;
create trigger broadcast_plano_curso_lesson_eligibility
after insert or update or delete on public.aulas_turma
for each row execute function internal_academic.broadcast_plano_curso_lesson_eligibility();

-- Monta o workspace sempre a partir do vínculo e dos encontros reais.
create or replace function internal_academic.build_plano_curso_workspace(
  p_turma_id uuid,
  p_disciplina_id uuid,
  p_professor_id uuid,
  p_can_edit boolean
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with context as (
    select
      assignment.turma_id,
      assignment.disciplina_id,
      assignment.professor_id,
      coalesce(nullif(teacher.nome, ''), nullif(assignment.professor_nome, ''), 'Docente não informado') as professor_nome,
      class.nome as turma_nome,
      class.codigo as turma_codigo,
      class.polo_id,
      course.nome as curso_nome,
      pole.nome as polo_nome,
      subject.nome as disciplina_nome
    from public.turmas_disciplinas assignment
    join public.turmas class on class.id = assignment.turma_id
    join public.cursos course on course.id = class.curso_id
    join public.polos pole on pole.id = class.polo_id
    join public.disciplinas subject on subject.id = assignment.disciplina_id
    left join public.parceiros teacher on teacher.id = p_professor_id
    where assignment.turma_id = p_turma_id
      and assignment.disciplina_id = p_disciplina_id
      and (
        assignment.professor_id = p_professor_id
        or exists (
          select 1
          from public.planos_curso historical_plan
          where historical_plan.turma_id = assignment.turma_id
            and historical_plan.disciplina_id = assignment.disciplina_id
            and historical_plan.professor_id = p_professor_id
        )
      )
  ), plan as (
    select course_plan.*
    from public.planos_curso course_plan
    where course_plan.turma_id = p_turma_id
      and course_plan.disciplina_id = p_disciplina_id
      and course_plan.professor_id = p_professor_id
  ), contents as (
    select
      item ->> 'aulaId' as aula_id,
      coalesce(item ->> 'conteudo', '') as conteudo
    from plan
    cross join lateral jsonb_array_elements(plan.conteudos_aulas) item
  ), meetings as (
    select
      meeting.id,
      meeting.data_aula,
      meeting.sessao,
      meeting.titulo,
      meeting.carga_horaria,
      meeting.hora_inicio,
      meeting.hora_fim,
      coalesce(content.conteudo, '') as conteudo
    from public.aulas_turma meeting
    left join contents content on content.aula_id = meeting.id::text
    where meeting.turma_id = p_turma_id
      and meeting.disciplina_id = p_disciplina_id
      and meeting.data_aula is not null
  ), summary as (
    select
      count(distinct meeting.data_aula)::integer as total_dias,
      count(*)::integer as total_aulas,
      min(meeting.data_aula) as primeira_aula,
      max(meeting.data_aula) as ultima_aula,
      coalesce((
        select jsonb_agg(to_jsonb(day_row.data_aula) order by day_row.data_aula)
        from (select distinct dated_meeting.data_aula from meetings dated_meeting) day_row
      ), '[]'::jsonb) as dias_aulas
    from meetings meeting
  ), meeting_payload as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'aulaId', meeting.id,
        'dataAula', meeting.data_aula,
        'dataExibicao', to_char(meeting.data_aula, 'DD/MM/YYYY'),
        'sessao', meeting.sessao,
        'titulo', meeting.titulo,
        'cargaHoraria', meeting.carga_horaria,
        'horaInicio', case when meeting.hora_inicio is null then null else to_char(meeting.hora_inicio, 'HH24:MI') end,
        'horaFim', case when meeting.hora_fim is null then null else to_char(meeting.hora_fim, 'HH24:MI') end,
        'conteudo', meeting.conteudo
      ) order by meeting.data_aula, meeting.sessao, meeting.hora_inicio nulls last, meeting.id
    ), '[]'::jsonb) as aulas
    from meetings meeting
  )
  select jsonb_build_object(
    'planoId', plan.id,
    'status', coalesce(plan.status, 'AUSENTE'),
    'revisao', coalesce(plan.revisao, 0),
    'templateRevision', plan.template_revision,
    'documentoFingerprint', plan.documento_fingerprint,
    'turmaId', context.turma_id,
    'disciplinaId', context.disciplina_id,
    'professorId', p_professor_id,
    'turmaNome', context.turma_nome,
    'turmaCodigo', context.turma_codigo,
    'cursoNome', context.curso_nome,
    'poloId', context.polo_id,
    'poloNome', context.polo_nome,
    'disciplinaNome', context.disciplina_nome,
    'professorNome', context.professor_nome,
    'totalDias', summary.total_dias,
    'totalAulas', summary.total_aulas,
    'primeiraAula', summary.primeira_aula,
    'ultimaAula', summary.ultima_aula,
    'diasAulas', summary.dias_aulas,
    'objetivos', coalesce(plan.objetivos, '[]'::jsonb),
    'criteriosAvaliacao', coalesce(plan.criterios_avaliacao, '[]'::jsonb),
    'insumosRecursos', coalesce(plan.insumos_recursos, '[]'::jsonb),
    'aulas', meeting_payload.aulas,
    'updatedAt', plan.updated_at,
    'concluidoEm', plan.concluido_em,
    'canEdit', coalesce(p_can_edit, false) and coalesce(plan.status, 'RASCUNHO') = 'RASCUNHO'
  )
  from context
  cross join summary
  cross join meeting_payload
  left join plan on true;
$function$;

revoke all on function internal_academic.build_plano_curso_workspace(uuid, uuid, uuid, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.listar_planos_curso_professor_secure(p_polo_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_professor_id uuid := public.current_professor_id();
begin
  if v_professor_id is null then
    raise exception 'Professor autenticado não identificado.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'planoId', plan.id,
      'status', coalesce(plan.status, 'AUSENTE'),
      'revisao', coalesce(plan.revisao, 0),
      'turmaId', assignment.turma_id,
      'disciplinaId', assignment.disciplina_id,
      'professorId', v_professor_id,
      'turmaNome', class.nome,
      'turmaCodigo', class.codigo,
      'cursoNome', course.nome,
      'poloId', class.polo_id,
      'poloNome', pole.nome,
      'disciplinaNome', subject.nome,
      'professorNome', coalesce(nullif(teacher.nome, ''), nullif(assignment.professor_nome, '')),
      'totalDias', lessons.total_dias,
      'totalAulas', lessons.total_aulas,
      'primeiraAula', lessons.primeira_aula,
      'ultimaAula', lessons.ultima_aula,
      'updatedAt', plan.updated_at
    ) order by course.nome, class.nome, subject.nome)
    from public.turmas_disciplinas assignment
    join public.turmas class on class.id = assignment.turma_id and class.polo_id = p_polo_id
    join public.cursos course on course.id = class.curso_id
    join public.polos pole on pole.id = class.polo_id
    join public.disciplinas subject on subject.id = assignment.disciplina_id
    join public.parceiros teacher on teacher.id = v_professor_id
    join lateral (
      select count(distinct meeting.data_aula)::integer as total_dias,
        count(*)::integer as total_aulas,
        min(meeting.data_aula) as primeira_aula,
        max(meeting.data_aula) as ultima_aula
      from public.aulas_turma meeting
      where meeting.turma_id = assignment.turma_id
        and meeting.disciplina_id = assignment.disciplina_id
        and meeting.data_aula is not null
    ) lessons on lessons.total_aulas > 0
    left join public.planos_curso plan
      on plan.turma_id = assignment.turma_id
      and plan.disciplina_id = assignment.disciplina_id
      and plan.professor_id = v_professor_id
    where assignment.professor_id = v_professor_id
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.obter_plano_curso_professor_secure(
  p_turma_id uuid,
  p_disciplina_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_professor_id uuid := public.current_professor_id();
  v_allowed boolean;
  v_can_edit boolean;
begin
  select exists (
    select 1
    from public.turmas_disciplinas assignment
    where assignment.turma_id = p_turma_id
      and assignment.disciplina_id = p_disciplina_id
      and assignment.professor_id = v_professor_id
      and exists (
        select 1 from public.aulas_turma meeting
        where meeting.turma_id = assignment.turma_id
          and meeting.disciplina_id = assignment.disciplina_id
          and meeting.data_aula is not null
      )
  ), coalesce((
    select upper(coalesce(class.status, '')) <> 'FINALIZADA'
      and coalesce(assignment.bloqueio_diario, 'ABERTO') <> 'TOTAL'
    from public.turmas_disciplinas assignment
    join public.turmas class on class.id = assignment.turma_id
    where assignment.turma_id = p_turma_id
      and assignment.disciplina_id = p_disciplina_id
      and assignment.professor_id = v_professor_id
  ), false)
  into v_allowed, v_can_edit;

  if v_professor_id is null or not v_allowed then
    raise exception 'Plano de Curso não autorizado para este docente.' using errcode = '42501';
  end if;

  return internal_academic.build_plano_curso_workspace(
    p_turma_id, p_disciplina_id, v_professor_id, v_can_edit
  );
end;
$function$;

create or replace function public.salvar_plano_curso_professor_secure(
  p_turma_id uuid,
  p_disciplina_id uuid,
  p_expected_revision integer,
  p_objetivos jsonb,
  p_criterios_avaliacao jsonb,
  p_insumos_recursos jsonb,
  p_conteudos_aulas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_professor_id uuid := public.current_professor_id();
  v_assignment record;
  v_current public.planos_curso%rowtype;
  v_objetivos jsonb;
  v_criterios_avaliacao jsonb;
  v_insumos_recursos jsonb;
  v_normalized_contents jsonb;
begin
  if v_professor_id is null then
    raise exception 'Professor autenticado não identificado.' using errcode = '42501';
  end if;

  select assignment.*, class.status as turma_status
  into v_assignment
  from public.turmas_disciplinas assignment
  join public.turmas class on class.id = assignment.turma_id
  where assignment.turma_id = p_turma_id
    and assignment.disciplina_id = p_disciplina_id
    and assignment.professor_id = v_professor_id
  for update of assignment;

  if not found then
    raise exception 'Plano de Curso não autorizado para este docente.' using errcode = '42501';
  end if;

  -- Vínculo primeiro, lock canônico depois: mesma ordem do trigger de
  -- reatribuição, evitando deadlock com UPDATE direto ou batch do vínculo.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_turma_id::text),
    pg_catalog.hashtext(p_disciplina_id::text)
  );
  if upper(coalesce(v_assignment.turma_status, '')) = 'FINALIZADA' then
    raise exception 'Turma finalizada não permite alterar o Plano de Curso.' using errcode = '55000';
  end if;
  if coalesce(v_assignment.bloqueio_diario, 'ABERTO') = 'TOTAL' then
    raise exception 'Disciplina fechada não permite alterar o Plano de Curso.' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.aulas_turma meeting
    where meeting.turma_id = p_turma_id
      and meeting.disciplina_id = p_disciplina_id
      and meeting.data_aula is not null
  ) then
    raise exception 'O Plano de Curso exige aulas planejadas na grade.' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_objetivos, 'null'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_criterios_avaliacao, 'null'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_insumos_recursos, 'null'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_conteudos_aulas, 'null'::jsonb)) <> 'array' then
    raise exception 'Objetivos, critérios, insumos e conteúdos devem ser listas.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_objetivos) > 100
    or jsonb_array_length(p_criterios_avaliacao) > 100
    or jsonb_array_length(p_insumos_recursos) > 100
    or jsonb_array_length(p_conteudos_aulas) > 500 then
    raise exception 'O Plano de Curso excede o limite de itens.' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_objetivos || p_criterios_avaliacao || p_insumos_recursos) item
    where jsonb_typeof(item) <> 'string'
      or length(btrim(item #>> '{}')) > 4000
  ) then
    raise exception 'As seções do Plano de Curso devem conter textos válidos.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(btrim(item #>> '{}')) order by ordinality), '[]'::jsonb)
  into v_objetivos
  from jsonb_array_elements(p_objetivos) with ordinality as section_item(item, ordinality)
  where btrim(item #>> '{}') <> '';

  select coalesce(jsonb_agg(to_jsonb(btrim(item #>> '{}')) order by ordinality), '[]'::jsonb)
  into v_criterios_avaliacao
  from jsonb_array_elements(p_criterios_avaliacao) with ordinality as section_item(item, ordinality)
  where btrim(item #>> '{}') <> '';

  select coalesce(jsonb_agg(to_jsonb(btrim(item #>> '{}')) order by ordinality), '[]'::jsonb)
  into v_insumos_recursos
  from jsonb_array_elements(p_insumos_recursos) with ordinality as section_item(item, ordinality)
  where btrim(item #>> '{}') <> '';

  if exists (
    select 1
    from jsonb_array_elements(p_conteudos_aulas) item
    where jsonb_typeof(item) <> 'object'
      or coalesce(item ->> 'aulaId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(coalesce(item -> 'conteudo', 'null'::jsonb)) <> 'string'
      or length(btrim(coalesce(item ->> 'conteudo', ''))) > 8000
  ) then
    raise exception 'Cada conteúdo deve informar aulaId real e texto válido.' using errcode = '22023';
  end if;

  if (
    select count(*) <> count(distinct item ->> 'aulaId')
    from jsonb_array_elements(p_conteudos_aulas) item
  ) then
    raise exception 'A mesma aula não pode aparecer mais de uma vez.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_conteudos_aulas) item
    where not exists (
      select 1 from public.aulas_turma meeting
      where meeting.id = (item ->> 'aulaId')::uuid
        and meeting.turma_id = p_turma_id
        and meeting.disciplina_id = p_disciplina_id
        and meeting.data_aula is not null
    )
  ) then
    raise exception 'O conteúdo referencia aula fora deste Plano de Curso.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'aulaId', meeting.id,
    'conteudo', btrim(item ->> 'conteudo')
  ) order by meeting.data_aula, meeting.sessao, meeting.id), '[]'::jsonb)
  into v_normalized_contents
  from jsonb_array_elements(p_conteudos_aulas) item
  join public.aulas_turma meeting on meeting.id = (item ->> 'aulaId')::uuid
  where btrim(coalesce(item ->> 'conteudo', '')) <> '';

  select plan.* into v_current
  from public.planos_curso plan
  where plan.turma_id = p_turma_id
    and plan.disciplina_id = p_disciplina_id
    and plan.professor_id = v_professor_id
  for update;

  if found then
    if v_current.status = 'CONCLUIDO' then
      raise exception 'Plano de Curso concluído não pode ser alterado.' using errcode = '55000';
    end if;
    if p_expected_revision is null or p_expected_revision <> v_current.revisao then
      raise exception 'O Plano de Curso foi atualizado em outra sessão.' using errcode = '40001';
    end if;
    update public.planos_curso plan
    set objetivos = v_objetivos,
      criterios_avaliacao = v_criterios_avaliacao,
      insumos_recursos = v_insumos_recursos,
      conteudos_aulas = v_normalized_contents,
      revisao = plan.revisao + 1
    where plan.id = v_current.id;
  else
    if coalesce(p_expected_revision, 0) <> 0 then
      raise exception 'O Plano de Curso ainda não existe; a revisão esperada deve ser zero.' using errcode = '40001';
    end if;
    insert into public.planos_curso (
      turma_id, disciplina_id, professor_id,
      objetivos, criterios_avaliacao, insumos_recursos, conteudos_aulas
    ) values (
      p_turma_id, p_disciplina_id, v_professor_id,
      v_objetivos, v_criterios_avaliacao, v_insumos_recursos, v_normalized_contents
    );
  end if;

  return internal_academic.build_plano_curso_workspace(
    p_turma_id, p_disciplina_id, v_professor_id, true
  );
end;
$function$;

-- Declaração antecipada: a implementação canônica é substituída abaixo,
-- depois do seed do modelo. Isto permite que a conclusão resolva a função
-- durante a criação sem duplicar a composição do documento.
create or replace function internal_academic.build_plano_curso_documento_snapshot(
  p_plano_id uuid,
  p_emitido_em timestamptz,
  p_document_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception 'Compositor de snapshot ainda não inicializado.' using errcode = '55000';
end;
$function$;

revoke all on function internal_academic.build_plano_curso_documento_snapshot(uuid, timestamptz, integer)
  from public, anon, authenticated, service_role;

create or replace function public.concluir_plano_curso_professor_secure(
  p_plano_id uuid,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_professor_id uuid := public.current_professor_id();
  v_plan public.planos_curso%rowtype;
  v_assignment record;
  v_concluido_em timestamptz;
  v_snapshot jsonb;
  v_template_revision integer;
  v_documento_fingerprint text;
begin
  select plan.* into v_plan
  from public.planos_curso plan
  where plan.id = p_plano_id
    and plan.professor_id = v_professor_id;

  if not found then
    raise exception 'Conclusão do Plano de Curso não autorizada.' using errcode = '42501';
  end if;

  -- A mesma ordem de lock do salvamento/atribuição impede concluir para um
  -- docente que seja removido do vínculo durante a transação.
  select assignment.*, class.status as turma_status
  into v_assignment
  from public.turmas_disciplinas assignment
  join public.turmas class on class.id = assignment.turma_id
  where assignment.turma_id = v_plan.turma_id
    and assignment.disciplina_id = v_plan.disciplina_id
    and assignment.professor_id = v_professor_id
  for update of assignment;

  if not found then
    raise exception 'Conclusão do Plano de Curso não autorizada.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_plan.turma_id::text),
    pg_catalog.hashtext(v_plan.disciplina_id::text)
  );
  if upper(coalesce(v_assignment.turma_status, '')) = 'FINALIZADA'
    or coalesce(v_assignment.bloqueio_diario, 'ABERTO') = 'TOTAL' then
    raise exception 'O vínculo acadêmico está fechado para conclusão do Plano de Curso.' using errcode = '55000';
  end if;

  select plan.* into v_plan
  from public.planos_curso plan
  where plan.id = p_plano_id
    and plan.professor_id = v_professor_id
  for update;

  if not found then
    raise exception 'Plano de Curso não encontrado.' using errcode = 'P0002';
  end if;
  if v_plan.status = 'CONCLUIDO' then
    return internal_academic.build_plano_curso_workspace(
      v_plan.turma_id, v_plan.disciplina_id, v_plan.professor_id, false
    );
  end if;
  if p_expected_revision is null or p_expected_revision <> v_plan.revisao then
    raise exception 'O Plano de Curso foi atualizado em outra sessão.' using errcode = '40001';
  end if;
  if jsonb_array_length(v_plan.objetivos) = 0
    or jsonb_array_length(v_plan.criterios_avaliacao) = 0
    or jsonb_array_length(v_plan.insumos_recursos) = 0 then
    raise exception 'Preencha objetivos, critérios de avaliação e insumos antes de concluir.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.aulas_turma meeting
    where meeting.turma_id = v_plan.turma_id
      and meeting.disciplina_id = v_plan.disciplina_id
      and meeting.data_aula is not null
  ) then
    raise exception 'O Plano de Curso exige aulas planejadas na grade.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.aulas_turma meeting
    where meeting.turma_id = v_plan.turma_id
      and meeting.disciplina_id = v_plan.disciplina_id
      and meeting.data_aula is not null
      and not exists (
        select 1 from jsonb_array_elements(v_plan.conteudos_aulas) item
        where item ->> 'aulaId' = meeting.id::text
          and btrim(coalesce(item ->> 'conteudo', '')) <> ''
      )
  ) then
    raise exception 'Informe o conteúdo de todas as aulas planejadas antes de concluir.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_plan.conteudos_aulas) item
    where not exists (
      select 1 from public.aulas_turma meeting
      where meeting.id::text = item ->> 'aulaId'
        and meeting.turma_id = v_plan.turma_id
        and meeting.disciplina_id = v_plan.disciplina_id
        and meeting.data_aula is not null
    )
  ) then
    raise exception 'A grade mudou; revise os conteúdos antes de concluir.' using errcode = '55000';
  end if;

  v_concluido_em := clock_timestamp();
  v_snapshot := internal_academic.build_plano_curso_documento_snapshot(
    v_plan.id,
    v_concluido_em,
    v_plan.revisao + 1
  );
  v_template_revision := (v_snapshot #>> '{documento,templateRevision}')::integer;
  v_documento_fingerprint := encode(
    extensions.digest(pg_catalog.convert_to(v_snapshot::text, 'UTF8'), 'sha256'),
    'hex'
  );

  -- Status, snapshot e identidade documental mudam em uma única escrita para
  -- satisfazer a constraint e nunca expor um CONCLUIDO sem documento oficial.
  update public.planos_curso plan
  set status = 'CONCLUIDO',
    concluido_em = v_concluido_em,
    revisao = plan.revisao + 1,
    documento_snapshot = v_snapshot,
    template_revision = v_template_revision,
    documento_fingerprint = v_documento_fingerprint
  where plan.id = v_plan.id;

  return internal_academic.build_plano_curso_workspace(
    v_plan.turma_id, v_plan.disciplina_id, v_plan.professor_id, false
  );
end;
$function$;

create or replace function public.listar_planos_curso_gestao_secure(p_turma_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.can_operate_turma_academics(p_turma_id) then
    raise exception 'Acesso aos Planos de Curso desta turma não autorizado.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'disciplinaId', assignment.disciplina_id,
      'professorId', assignment.professor_id,
      'professorNome', coalesce(nullif(teacher.nome, ''), nullif(assignment.professor_nome, '')),
      'planoId', plan.id,
      'status', coalesce(plan.status, 'AUSENTE'),
      'revisao', coalesce(plan.revisao, 0),
      'templateRevision', plan.template_revision,
      'documentoFingerprint', plan.documento_fingerprint,
      'updatedAt', plan.updated_at
    ) order by coalesce(module.ordem, 999999), coalesce(subject.ordem, 999999), subject.nome)
    from public.turmas_disciplinas assignment
    join public.disciplinas subject on subject.id = assignment.disciplina_id
    left join public.modulos module on module.id = subject.modulo_id
    left join public.parceiros teacher on teacher.id = assignment.professor_id
    left join public.planos_curso plan
      on plan.turma_id = assignment.turma_id
      and plan.disciplina_id = assignment.disciplina_id
      and plan.professor_id = assignment.professor_id
    where assignment.turma_id = p_turma_id
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.obter_plano_curso_gestao_secure(
  p_turma_id uuid,
  p_disciplina_id uuid,
  p_professor_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_professor_id uuid := p_professor_id;
begin
  if not public.can_operate_turma_academics(p_turma_id) then
    raise exception 'Acesso ao Plano de Curso não autorizado.' using errcode = '42501';
  end if;
  if v_professor_id is null then
    select assignment.professor_id into v_professor_id
    from public.turmas_disciplinas assignment
    where assignment.turma_id = p_turma_id
      and assignment.disciplina_id = p_disciplina_id;
  end if;
  if v_professor_id is null then
    raise exception 'A disciplina ainda não possui docente atribuído.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.turmas_disciplinas assignment
    where assignment.turma_id = p_turma_id
      and assignment.disciplina_id = p_disciplina_id
      and (
        assignment.professor_id = v_professor_id
        or exists (
          select 1 from public.planos_curso plan
          where plan.turma_id = p_turma_id
            and plan.disciplina_id = p_disciplina_id
            and plan.professor_id = v_professor_id
        )
      )
  ) then
    raise exception 'Vínculo do Plano de Curso não encontrado.' using errcode = 'P0002';
  end if;
  return internal_academic.build_plano_curso_workspace(
    p_turma_id, p_disciplina_id, v_professor_id, false
  );
end;
$function$;

-- Amplia a infraestrutura versionada sem criar um editor paralelo.
do $constraints$
declare
  v_constraint text;
begin
  for v_constraint in
    select constraint_row.conname
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.documentos_modelos_configuracoes'::regclass
      and constraint_row.contype = 'c'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) ilike '%template_key%'
  loop
    execute format(
      'alter table public.documentos_modelos_configuracoes drop constraint %I',
      v_constraint
    );
  end loop;
end;
$constraints$;

alter table public.documentos_modelos_configuracoes
  add constraint documentos_modelos_configuracoes_template_key_check
  check (template_key in (
    'contrato_aluno',
    'carteirinha_preceptor',
    'calendario_aulas',
    'plano_curso'
  ));

alter table public.documentos_modelos_configuracoes
  add constraint documentos_modelos_configuracoes_template_modalidade_check
  check (
    (template_key = 'carteirinha_preceptor' and modalidade = 'GERAL')
    or (
      template_key = 'contrato_aluno'
      and modalidade in ('TECNICO', 'LIVRE', 'SUPERIOR', 'EAD')
    )
    or (
      template_key = 'calendario_aulas'
      and modalidade in ('GERAL', 'TECNICO', 'LIVRE', 'SUPERIOR', 'EAD')
    )
    or (template_key = 'plano_curso' and modalidade = 'GERAL')
  );

insert into public.documentos_modelos_configuracoes (
  template_key, modalidade, revisao, status, conteudo
)
values (
  'plano_curso',
  'GERAL',
  1,
  'ATIVO',
  jsonb_build_object(
    'nomeModelo', 'Plano de Curso',
    'titulo', 'Plano de Curso',
    'subtitulo', '{{CURSO}} · {{TURMA}}',
    'orientacao', 'A4_RETRATO',
    'exibirMarcaDagua', true,
    'exibirAssinaturaDocente', true,
    'instrucoesConteudo', 'Registre o conteúdo programático previsto para cada encontro, respeitando as datas, os horários e as aulas canônicas da grade.',
    'rotulos', jsonb_build_object(
      'componenteCurricular', 'Componente curricular',
      'docente', 'Professor(a)',
      'diasAulas', 'Dias de aula',
      'objetivosDisciplina', 'Objetivos',
      'criteriosAvaliacao', 'Critérios de avaliação',
      'insumosRecursos', 'Insumos e recursos',
      'conteudoProgramatico', 'Conteúdo programático por encontro',
      'dataLocal', 'Local e data',
      'assinaturaDocente', 'Assinatura do(a) professor(a)'
    ),
    'paginacao', jsonb_build_object(
      'encontrosPrimeiraPagina', 0,
      'encontrosDemaisPaginas', 9
    )
  )
)
on conflict (template_key, modalidade) do nothing;

insert into public.documentos_modelos_historico (
  template_key, modalidade, revisao, status, conteudo, atualizado_por, request_id
)
select
  model.template_key, model.modalidade, model.revisao, model.status,
  model.conteudo, model.atualizado_por, null
from public.documentos_modelos_configuracoes model
where model.template_key = 'plano_curso'
  and model.modalidade = 'GERAL'
on conflict (template_key, modalidade, revisao) do nothing;

create or replace function internal_academic.build_plano_curso_documento_snapshot(
  p_plano_id uuid,
  p_emitido_em timestamptz,
  p_document_revision integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_plan public.planos_curso%rowtype;
  v_context record;
  v_model public.documentos_modelos_configuracoes%rowtype;
  v_workspace jsonb;
  v_first_page integer;
  v_other_pages integer;
  v_first_meetings jsonb;
  v_content_pages jsonb;
  v_pages jsonb;
  v_subtitulo_resolvido text;
  v_today date := (pg_catalog.timezone('America/Maceio', p_emitido_em))::date;
begin
  if p_emitido_em is null or p_document_revision is null or p_document_revision < 1 then
    raise exception 'Identidade temporal do snapshot inválida.' using errcode = '22023';
  end if;

  select plan.* into v_plan
  from public.planos_curso plan
  where plan.id = p_plano_id;

  if not found then
    raise exception 'Plano de Curso não encontrado para o snapshot.' using errcode = 'P0002';
  end if;

  select
    class.id as turma_id,
    class.nome as turma_nome,
    class.codigo as turma_codigo,
    class.polo_id,
    course.nome as curso_nome,
    subject.id as disciplina_id,
    subject.nome as disciplina_nome,
    teacher.id as professor_id,
    teacher.nome as professor_nome,
    pole.nome as polo_nome,
    pole.cnpj as polo_cnpj,
    pole.cidade as polo_cidade,
    pole.estado as polo_uf,
    pole.endereco as polo_endereco,
    pole.numero as polo_numero,
    pole.complemento as polo_complemento,
    pole.bairro as polo_bairro,
    pole.cep as polo_cep,
    coalesce(nullif(pole.logo_url, ''), nullif(company.logo_url, '')) as logo_url,
    coalesce(nullif(pole.watermark_url, ''), nullif(company.watermark_url, '')) as watermark_url,
    coalesce(pole.watermark_opacity, company.watermark_opacity) as watermark_opacity,
    coalesce(pole.watermark_scale, company.watermark_scale) as watermark_scale,
    pole.watermark_rotate,
    company.razao_social,
    company.nome_fantasia,
    company.cnpj as empresa_cnpj,
    signature.assinatura_path
  into v_context
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  join public.disciplinas subject on subject.id = v_plan.disciplina_id
  join public.parceiros teacher on teacher.id = v_plan.professor_id
  join public.polos pole on pole.id = class.polo_id
  join public.empresas company on company.id = pole.company_id
  left join public.assinaturas_pessoas signature
    on signature.parceiro_id = teacher.id
    and signature.categoria = 'PROFESSOR'
    and signature.ativo
  where class.id = v_plan.turma_id;

  select model.* into v_model
  from public.documentos_modelos_configuracoes model
  where model.template_key = 'plano_curso'
    and model.modalidade = 'GERAL';

  if not found or v_model.status <> 'ATIVO' then
    raise exception 'O modelo de Plano de Curso não está ativo.' using errcode = '55000';
  end if;

  v_subtitulo_resolvido := replace(
    replace(
      coalesce(nullif(v_model.conteudo ->> 'subtitulo', ''), '{{CURSO}} · {{TURMA}}'),
      '{{CURSO}}', v_context.curso_nome
    ),
    '{{TURMA}}', concat_ws(' — ', v_context.turma_nome, nullif(v_context.turma_codigo, ''))
  );
  if position('{{' in v_subtitulo_resolvido) > 0
    or position('}}' in v_subtitulo_resolvido) > 0 then
    raise exception 'O subtítulo do modelo possui marcador não permitido.' using errcode = '22023';
  end if;

  v_first_page := case
    when coalesce(v_model.conteudo #>> '{paginacao,encontrosPrimeiraPagina}', '') ~ '^[0-9]+$'
      then least(12, greatest(0, (v_model.conteudo #>> '{paginacao,encontrosPrimeiraPagina}')::integer))
    else 0
  end;
  v_other_pages := case
    when coalesce(v_model.conteudo #>> '{paginacao,encontrosDemaisPaginas}', '') ~ '^[0-9]+$'
      then least(12, greatest(1, (v_model.conteudo #>> '{paginacao,encontrosDemaisPaginas}')::integer))
    else 9
  end;

  v_workspace := internal_academic.build_plano_curso_workspace(
    v_plan.turma_id, v_plan.disciplina_id, v_plan.professor_id, false
  );

  select coalesce(jsonb_agg(meeting order by ordinality), '[]'::jsonb)
  into v_first_meetings
  from jsonb_array_elements(v_workspace -> 'aulas') with ordinality as item(meeting, ordinality)
  where ordinality <= v_first_page;

  select coalesce(jsonb_agg(jsonb_build_object(
    'numero', page_number,
    'tipo', 'CONTEUDO',
    'encontros', meetings
  ) order by page_number), '[]'::jsonb)
  into v_content_pages
  from (
    select
      2 + ((ordinality - v_first_page - 1) / v_other_pages)::integer as page_number,
      jsonb_agg(meeting order by ordinality) as meetings
    from jsonb_array_elements(v_workspace -> 'aulas') with ordinality as item(meeting, ordinality)
    where ordinality > v_first_page
    group by 2 + ((ordinality - v_first_page - 1) / v_other_pages)::integer
  ) pages;

  v_pages := jsonb_build_array(jsonb_build_object(
    'numero', 1,
    'tipo', 'IDENTIFICACAO',
    'encontros', v_first_meetings
  )) || v_content_pages;

  return jsonb_build_object(
    'status', 'CONCLUIDO',
    'planoId', v_plan.id,
    'revisao', p_document_revision,
    'templateRevision', v_model.revisao,
    'documento', jsonb_build_object(
      'arquivoNome', lower(regexp_replace(
        'plano-curso-' || coalesce(v_context.turma_codigo, v_context.turma_nome)
          || '-' || v_context.disciplina_nome,
        '[^a-zA-Z0-9]+', '-', 'g'
      )) || '.pdf',
      'titulo', coalesce(nullif(v_model.conteudo ->> 'titulo', ''), 'Plano de Curso'),
      'subtitulo', v_subtitulo_resolvido,
      'orientacao', 'A4_RETRATO',
      'templateRevision', v_model.revisao,
      'template', jsonb_set(
        v_model.conteudo,
        '{subtitulo}',
        to_jsonb(v_subtitulo_resolvido),
        true
      ),
      'cabecalho', jsonb_build_object(
        'titulo', coalesce(nullif(v_model.conteudo ->> 'titulo', ''), 'Plano de Curso'),
        'subtitulo', v_subtitulo_resolvido,
        'instituicao', v_context.polo_nome,
        'logoUrl', v_context.logo_url,
        'logoDataUri', case when v_context.logo_url like 'data:image/%' then v_context.logo_url else null end
      ),
      'instrucoesConteudo', coalesce(
        nullif(v_model.conteudo ->> 'instrucoesConteudo', ''),
        'Registre o conteúdo programático previsto para cada encontro, respeitando as datas, os horários e as aulas canônicas da grade.'
      ),
      'rotulos', jsonb_build_object(
        'curso', coalesce(nullif(v_model.conteudo #>> '{rotulos,curso}', ''), 'Curso'),
        'turma', coalesce(nullif(v_model.conteudo #>> '{rotulos,turma}', ''), 'Turma'),
        'componenteCurricular', coalesce(nullif(v_model.conteudo #>> '{rotulos,componenteCurricular}', ''), 'Componente curricular'),
        'docente', coalesce(nullif(v_model.conteudo #>> '{rotulos,docente}', ''), 'Professor(a)'),
        'diasAulas', coalesce(nullif(v_model.conteudo #>> '{rotulos,diasAulas}', ''), 'Dias de aula'),
        'objetivos', coalesce(nullif(v_model.conteudo #>> '{rotulos,objetivosDisciplina}', ''), 'Objetivos'),
        'objetivosDisciplina', coalesce(nullif(v_model.conteudo #>> '{rotulos,objetivosDisciplina}', ''), 'Objetivos'),
        'criteriosAvaliacao', coalesce(nullif(v_model.conteudo #>> '{rotulos,criteriosAvaliacao}', ''), 'Critérios de avaliação'),
        'insumosRecursos', coalesce(nullif(v_model.conteudo #>> '{rotulos,insumosRecursos}', ''), 'Insumos e recursos'),
        'conteudoProgramatico', coalesce(nullif(v_model.conteudo #>> '{rotulos,conteudoProgramatico}', ''), 'Conteúdo programático por encontro'),
        'dataLocal', coalesce(nullif(v_model.conteudo #>> '{rotulos,dataLocal}', ''), 'Local e data'),
        'assinaturaDocente', coalesce(nullif(v_model.conteudo #>> '{rotulos,assinaturaDocente}', ''), 'Assinatura do(a) professor(a)')
      ),
      'instituicao', jsonb_build_object(
        'poloId', v_context.polo_id,
        'nome', v_context.polo_nome,
        'razaoSocial', coalesce(nullif(v_context.razao_social, ''), nullif(v_context.nome_fantasia, ''), v_context.polo_nome),
        'cnpj', coalesce(nullif(v_context.polo_cnpj, ''), nullif(v_context.empresa_cnpj, '')),
        'endereco', concat_ws(', ',
          nullif(v_context.polo_endereco, ''),
          nullif(v_context.polo_numero, ''),
          nullif(v_context.polo_complemento, ''),
          nullif(v_context.polo_bairro, ''),
          nullif(v_context.polo_cep, '')
        ),
        'cidade', v_context.polo_cidade,
        'uf', v_context.polo_uf,
        'logoUrl', v_context.logo_url,
        'logoDataUri', case when v_context.logo_url like 'data:image/%' then v_context.logo_url else null end
      ),
      'marcaDagua', jsonb_build_object(
        'exibir', lower(coalesce(v_model.conteudo ->> 'exibirMarcaDagua', 'true')) <> 'false',
        'texto', coalesce(nullif(v_model.conteudo ->> 'watermarkText', ''), v_context.polo_nome),
        'url', v_context.watermark_url,
        'dataUri', case when v_context.watermark_url like 'data:image/%' then v_context.watermark_url else null end,
        'opacidade', coalesce(v_context.watermark_opacity, 0.10),
        'escala', coalesce(v_context.watermark_scale, 50),
        'rotacionar', coalesce(v_context.watermark_rotate, true)
      ),
      'componente', jsonb_build_object(
        'turmaId', v_context.turma_id,
        'turmaNome', v_context.turma_nome,
        'turmaCodigo', v_context.turma_codigo,
        'cursoNome', v_context.curso_nome,
        'disciplinaId', v_context.disciplina_id,
        'disciplinaNome', v_context.disciplina_nome
      ),
      'docente', jsonb_build_object(
        'id', v_context.professor_id,
        'nome', v_context.professor_nome,
        'assinatura', jsonb_build_object(
          'exibir', lower(coalesce(v_model.conteudo ->> 'exibirAssinaturaDocente', 'true')) <> 'false',
          'path', v_context.assinatura_path,
          'url', null
        )
      ),
      'diasAulas', v_workspace -> 'diasAulas',
      'totalDias', v_workspace -> 'totalDias',
      'totalAulas', v_workspace -> 'totalAulas',
      'objetivos', v_plan.objetivos,
      'criteriosAvaliacao', v_plan.criterios_avaliacao,
      'insumosRecursos', v_plan.insumos_recursos,
      'localData', jsonb_build_object(
        'cidade', v_context.polo_cidade,
        'uf', v_context.polo_uf,
        'dataISO', v_today,
        'dataExibicao', to_char(v_today, 'DD/MM/YYYY'),
        'texto', concat_ws(', ', v_context.polo_cidade, v_context.polo_uf) || ', ' || to_char(v_today, 'DD/MM/YYYY')
      ),
      'paginas', v_pages,
      'totalPaginas', jsonb_array_length(v_pages),
      'emitidoEm', to_jsonb(p_emitido_em)
    )
  );
end;
$function$;

revoke all on function internal_academic.build_plano_curso_documento_snapshot(uuid, timestamptz, integer)
  from public, anon, authenticated, service_role;

-- Documento oficial existe somente depois da conclusão. O retorno vem
-- exclusivamente do snapshot persistido: modelo, instituição e relógio atuais
-- não participam de uma reimpressão.
create or replace function public.preparar_plano_curso_documento_secure(p_plano_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_plan public.planos_curso%rowtype;
begin
  select plan.* into v_plan
  from public.planos_curso plan
  where plan.id = p_plano_id;

  if not found or not public.can_operate_turma_academics(v_plan.turma_id) then
    raise exception 'Documento do Plano de Curso não autorizado.' using errcode = '42501';
  end if;
  if v_plan.status <> 'CONCLUIDO'
    or v_plan.documento_snapshot is null
    or v_plan.template_revision is null
    or v_plan.documento_fingerprint is null then
    raise exception 'Conclua o Plano de Curso antes de gerar o documento oficial.'
      using errcode = '55000';
  end if;

  return v_plan.documento_snapshot || jsonb_build_object(
    'templateRevision', v_plan.template_revision,
    'documentoFingerprint', v_plan.documento_fingerprint
  );
end;
$function$;

-- Mantém o contrato jurídico/idempotente vigente e acrescenta somente a nova chave.
create or replace function public.save_modelo_documento_template_secure(
  p_template_key text,
  p_modality text,
  p_expected_revision integer,
  p_content jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_template_key text := lower(btrim(coalesce(p_template_key, '')));
  v_modality text := upper(coalesce(nullif(btrim(p_modality), ''), 'GERAL'));
  v_content jsonb := p_content;
  v_status text;
  v_requested_status text := upper(nullif(btrim(p_content ->> 'status'), ''));
  v_subtitulo_residual text;
  v_fingerprint text;
  v_current public.documentos_modelos_configuracoes%rowtype;
  v_replay public.documentos_modelos_requisicoes%rowtype;
begin
  if not public.can_manage_modelos_documentos() then
    raise exception 'Acesso aos modelos de documentos não autorizado.' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'Informe a chave de idempotência do salvamento.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_content, 'null'::jsonb)) <> 'object' then
    raise exception 'O conteúdo do modelo deve ser um objeto.' using errcode = '22023';
  end if;
  if v_template_key not in (
    'contrato_aluno', 'carteirinha_preceptor', 'calendario_aulas', 'plano_curso'
  ) then
    raise exception 'Tipo de modelo não permitido.' using errcode = '22023';
  end if;
  if (v_template_key = 'carteirinha_preceptor' and v_modality <> 'GERAL')
    or (v_template_key = 'contrato_aluno' and v_modality not in ('TECNICO', 'LIVRE', 'SUPERIOR'))
    or (v_template_key = 'calendario_aulas' and v_modality not in ('GERAL', 'TECNICO', 'LIVRE', 'SUPERIOR', 'EAD'))
    or (v_template_key = 'plano_curso' and v_modality <> 'GERAL') then
    raise exception 'Modalidade incompatível com o modelo.' using errcode = '22023';
  end if;

  if v_template_key = 'plano_curso' then
    if coalesce(v_content ->> 'orientacao', '') <> 'A4_RETRATO'
      or jsonb_typeof(coalesce(v_content -> 'rotulos', 'null'::jsonb)) <> 'object'
      or jsonb_typeof(coalesce(v_content -> 'paginacao', 'null'::jsonb)) <> 'object' then
      raise exception 'O Plano de Curso exige orientação A4 retrato, rótulos e paginação.' using errcode = '22023';
    end if;
    if coalesce(v_content #>> '{paginacao,encontrosPrimeiraPagina}', '') !~ '^[0-9]+$'
      or (v_content #>> '{paginacao,encontrosPrimeiraPagina}')::integer not between 0 and 12
      or coalesce(v_content #>> '{paginacao,encontrosDemaisPaginas}', '') !~ '^[0-9]+$'
      or (v_content #>> '{paginacao,encontrosDemaisPaginas}')::integer not between 1 and 12 then
      raise exception 'A paginação deve usar 0 a 12 encontros na primeira página e 1 a 12 nas demais.' using errcode = '22023';
    end if;

    if v_content ? 'subtitulo'
      and jsonb_typeof(v_content -> 'subtitulo') <> 'string' then
      raise exception 'O subtítulo do Plano de Curso deve ser texto.' using errcode = '22023';
    end if;
    if length(coalesce(v_content ->> 'subtitulo', '')) > 500 then
      raise exception 'O subtítulo do Plano de Curso excede o limite permitido.' using errcode = '22023';
    end if;

    -- Remove somente a whitelist. Qualquer abertura/fechamento restante
    -- representa token desconhecido, typo ou marcador incompleto.
    v_subtitulo_residual := replace(
      replace(coalesce(v_content ->> 'subtitulo', ''), '{{CURSO}}', ''),
      '{{TURMA}}', ''
    );
    if position('{{' in v_subtitulo_residual) > 0
      or position('}}' in v_subtitulo_residual) > 0 then
      raise exception 'Use somente os marcadores {{CURSO}} e {{TURMA}} no subtítulo.'
        using errcode = '22023';
    end if;
  end if;

  if v_template_key = 'contrato_aluno' then
    v_content := v_content - 'status';
    if lower(coalesce(v_content #>> '{qr,habilitado}', 'true')) = 'false' then
      raise exception 'O QR Code é obrigatório para contrato de aluno.' using errcode = '22023';
    end if;
    v_content := jsonb_set(v_content, '{qr,habilitado}', 'true'::jsonb, true);
  end if;

  if v_template_key in ('contrato_aluno', 'carteirinha_preceptor') then
    if v_content ? 'qr' and jsonb_typeof(v_content -> 'qr') <> 'object' then
      raise exception 'A configuração de QR Code deve ser um objeto.' using errcode = '22023';
    end if;
    if coalesce(v_content #>> '{qr,modoValidade}', 'SEM_VENCIMENTO')
      not in ('SEM_VENCIMENTO', 'POR_DIAS') then
      raise exception 'Modo de validade do QR Code inválido.' using errcode = '22023';
    end if;
    if coalesce(v_content #>> '{qr,modoValidade}', 'SEM_VENCIMENTO') = 'POR_DIAS' then
      if coalesce(v_content #>> '{qr,diasValidade}', '') !~ '^[0-9]+$'
        or (v_content #>> '{qr,diasValidade}')::integer not between 1 and 3650 then
        raise exception 'A validade do QR Code deve estar entre 1 e 3650 dias.' using errcode = '22023';
      end if;
    end if;
  end if;

  v_fingerprint := md5(
    v_template_key || '|' || v_modality || '|' || coalesce(p_expected_revision::text, '')
    || '|' || v_content::text
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_request_id::text));

  select replay.* into v_replay
  from public.documentos_modelos_requisicoes replay
  where replay.request_id = p_request_id;
  if found then
    if v_replay.template_key <> v_template_key
      or v_replay.modalidade <> v_modality
      or v_replay.fingerprint <> v_fingerprint then
      raise exception 'A chave de idempotência já foi usada com outro salvamento.' using errcode = '22023';
    end if;
    return public.get_modelo_documento_template_secure(v_template_key, v_modality);
  end if;

  select model.* into v_current
  from public.documentos_modelos_configuracoes model
  where model.template_key = v_template_key and model.modalidade = v_modality
  for update;
  if not found then
    raise exception 'Modelo de documento não encontrado.' using errcode = 'P0002';
  end if;
  if p_expected_revision is null or p_expected_revision <> v_current.revisao then
    raise exception 'O modelo foi atualizado por outra pessoa. Recarregue antes de salvar.' using errcode = '40001';
  end if;

  if v_template_key = 'contrato_aluno' then
    if v_current.status = 'ARQUIVADO' then
      raise exception 'Um modelo de contrato arquivado não pode ser alterado.' using errcode = '55000';
    end if;
    if (v_current.conteudo - 'status') is not distinct from v_content then
      insert into public.documentos_modelos_requisicoes (
        request_id, template_key, modalidade, fingerprint, revisao
      ) values (p_request_id, v_template_key, v_modality, v_fingerprint, v_current.revisao);
      return public.get_modelo_documento_template_secure(v_template_key, v_modality);
    end if;
    v_status := 'EM_REVISAO';
  else
    v_status := coalesce(v_requested_status, v_current.status);
    if v_status not in ('RASCUNHO', 'ATIVO', 'EM_REVISAO', 'ARQUIVADO') then
      raise exception 'Status de modelo inválido.' using errcode = '22023';
    end if;
  end if;

  update public.documentos_modelos_configuracoes model
  set revisao = model.revisao + 1,
    status = v_status,
    conteudo = v_content,
    atualizado_por = (select auth.uid()),
    updated_at = now()
  where model.template_key = v_template_key and model.modalidade = v_modality
  returning model.* into v_current;

  insert into public.documentos_modelos_historico (
    template_key, modalidade, revisao, status, conteudo, atualizado_por, request_id
  ) values (
    v_current.template_key, v_current.modalidade, v_current.revisao,
    v_current.status, v_current.conteudo, v_current.atualizado_por, p_request_id
  );
  insert into public.documentos_modelos_requisicoes (
    request_id, template_key, modalidade, fingerprint, revisao
  ) values (p_request_id, v_template_key, v_modality, v_fingerprint, v_current.revisao);

  return public.get_modelo_documento_template_secure(v_template_key, v_modality);
end;
$function$;

revoke all on function public.save_modelo_documento_template_secure(text, text, integer, jsonb, uuid)
  from public, anon;
grant execute on function public.save_modelo_documento_template_secure(text, text, integer, jsonb, uuid)
  to authenticated, service_role;

revoke all on function public.listar_planos_curso_professor_secure(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.obter_plano_curso_professor_secure(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.salvar_plano_curso_professor_secure(uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.concluir_plano_curso_professor_secure(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.listar_planos_curso_gestao_secure(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.obter_plano_curso_gestao_secure(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.preparar_plano_curso_documento_secure(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.listar_planos_curso_professor_secure(uuid) to authenticated;
grant execute on function public.obter_plano_curso_professor_secure(uuid, uuid) to authenticated;
grant execute on function public.salvar_plano_curso_professor_secure(uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.concluir_plano_curso_professor_secure(uuid, integer) to authenticated;
grant execute on function public.listar_planos_curso_gestao_secure(uuid) to authenticated, service_role;
grant execute on function public.obter_plano_curso_gestao_secure(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.preparar_plano_curso_documento_secure(uuid) to authenticated, service_role;

-- Realtime acompanha a tabela canônica. Não há espelho em gestao_realtime_events.
do $realtime$
begin
  if exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'planos_curso'
  ) then
    alter publication supabase_realtime add table public.planos_curso;
  end if;
end;
$realtime$;

comment on table public.planos_curso is
  'Plano de Curso por vínculo turma, disciplina e docente; datas e encontros pertencem a aulas_turma.';
comment on function public.listar_planos_curso_gestao_secure(uuid) is
  'Resumo batch para a grade da Gestão; evita N+1 e não retorna conteúdo editorial.';
comment on function public.preparar_plano_curso_documento_secure(uuid) is
  'Payload institucional e paginado no backend para uma única composição PDF vetorial.';

commit;
