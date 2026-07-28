begin;

create or replace function public.emit_parceiro_relatorios_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.gestao_realtime_events (
    source_table,
    event_type,
    entity_id,
    turma_id,
    polo_id
  )
  select
    'parceiros',
    tg_op,
    new.id,
    matricula.turma_id,
    turma.polo_id
  from public.matriculas matricula
  join public.turmas turma on turma.id = matricula.turma_id
  where matricula.aluno_id = new.id;

  return new;
end;
$$;

drop trigger if exists parceiros_emit_relatorios_realtime_event
  on public.parceiros;
create trigger parceiros_emit_relatorios_realtime_event
after update of
  nome,
  cpf_cnpj,
  data_nascimento,
  sexo,
  nome_mae,
  raca_cor,
  naturalidade,
  nacionalidade,
  cep,
  endereco,
  cidade,
  uf
on public.parceiros
for each row
execute function public.emit_parceiro_relatorios_realtime_event();

create or replace function public.emit_curso_relatorios_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.gestao_realtime_events (
    source_table,
    event_type,
    entity_id,
    turma_id,
    polo_id
  )
  select
    'cursos',
    tg_op,
    new.id,
    turma.id,
    turma.polo_id
  from public.turmas turma
  where turma.curso_id = new.id;

  return new;
end;
$$;

drop trigger if exists cursos_emit_relatorios_realtime_event
  on public.cursos;
create trigger cursos_emit_relatorios_realtime_event
after update of nome, modalidade
on public.cursos
for each row
execute function public.emit_curso_relatorios_realtime_event();

create or replace function public.emit_polo_relatorios_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.gestao_realtime_events (
    source_table,
    event_type,
    entity_id,
    turma_id,
    polo_id
  )
  select
    'polos',
    tg_op,
    new.id,
    turma.id,
    new.id
  from public.turmas turma
  where turma.polo_id = new.id;

  return new;
end;
$$;

drop trigger if exists polos_emit_relatorios_realtime_event
  on public.polos;
create trigger polos_emit_relatorios_realtime_event
after update of nome, cidade
on public.polos
for each row
execute function public.emit_polo_relatorios_realtime_event();

revoke all on function public.emit_parceiro_relatorios_realtime_event()
  from public, anon, authenticated;
revoke all on function public.emit_curso_relatorios_realtime_event()
  from public, anon, authenticated;
revoke all on function public.emit_polo_relatorios_realtime_event()
  from public, anon, authenticated;

commit;
