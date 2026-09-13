-- Share the importer's discipline lock before checking either side of a write.
-- This blocks a concurrent import/write from mixing historical and regular data.
create function internal_academic.guard_diario_historical_operational_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old_turma uuid; v_old_disciplina uuid; v_old_aluno uuid;
  v_new_turma uuid; v_new_disciplina uuid; v_new_aluno uuid;
  v_scope record;
begin
  if tg_op in ('UPDATE','DELETE') then
    v_old_turma := old.turma_id;
    v_old_disciplina := old.disciplina_id;
    v_old_aluno := old.aluno_id;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    v_new_turma := new.turma_id;
    v_new_disciplina := new.disciplina_id;
    v_new_aluno := new.aluno_id;
  end if;

  for v_scope in
    select distinct s.turma_id, s.disciplina_id
    from (values (v_old_turma, v_old_disciplina), (v_new_turma, v_new_disciplina))
      s(turma_id, disciplina_id)
    where s.turma_id is not null and s.disciplina_id is not null
    order by s.turma_id, s.disciplina_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'diario-history:' || v_scope.turma_id::text || ':' || v_scope.disciplina_id::text, 0
    ));
  end loop;

  if exists (
    select 1 from internal_academic.diario_resultados_importados h
    join (values (v_old_turma, v_old_disciplina, v_old_aluno),
      (v_new_turma, v_new_disciplina, v_new_aluno)) s(turma_id, disciplina_id, aluno_id)
      on s.turma_id = h.turma_id and s.disciplina_id = h.disciplina_id and s.aluno_id = h.aluno_id
    where h.ativo
  ) then
    raise exception 'Este aluno possui diário histórico nesta disciplina. Revise a fonte histórica antes de lançar dados regulares.'
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function internal_academic.guard_diario_historical_operational_write()
  from public, anon, authenticated, service_role;

create trigger guard_diario_historical_notes_write
  before insert or update or delete on public.diario_notas
  for each row execute function internal_academic.guard_diario_historical_operational_write();
create trigger guard_diario_historical_attendance_write
  before insert or update or delete on public.diario_frequencia
  for each row execute function internal_academic.guard_diario_historical_operational_write();

-- Lessons may be planned after an import. Serialize their presence check with
-- ingestion, without turning historical evidence into a ban on future lessons.
create function internal_academic.lock_diario_historical_lesson_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old_turma uuid; v_old_disciplina uuid;
  v_new_turma uuid; v_new_disciplina uuid;
  v_scope record;
begin
  if tg_op in ('UPDATE','DELETE') then
    v_old_turma := old.turma_id;
    v_old_disciplina := old.disciplina_id;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    v_new_turma := new.turma_id;
    v_new_disciplina := new.disciplina_id;
  end if;
  for v_scope in
    select distinct s.turma_id, s.disciplina_id
    from (values (v_old_turma, v_old_disciplina), (v_new_turma, v_new_disciplina))
      s(turma_id, disciplina_id)
    where s.turma_id is not null and s.disciplina_id is not null
    order by s.turma_id, s.disciplina_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'diario-history:' || v_scope.turma_id::text || ':' || v_scope.disciplina_id::text, 0
    ));
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function internal_academic.lock_diario_historical_lesson_scope()
  from public, anon, authenticated, service_role;
create trigger lock_diario_historical_lesson_scope
  before insert or update or delete on public.aulas_turma
  for each row execute function internal_academic.lock_diario_historical_lesson_scope();
