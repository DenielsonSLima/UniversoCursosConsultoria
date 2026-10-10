begin;

-- Retain existing assignments. Only a new teacher/class/discipline association
-- must belong to the actual class polo, including the teacher's additional polos.
-- RPC authorization, active Professor eligibility and academic locks stay intact.
create function internal_academic.guard_technical_teacher_polo_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_polo_id uuid;
  v_modalidade text;
begin
  if new.professor_id is null then return new; end if;
  if tg_op = 'UPDATE' and (new.professor_id, new.turma_id, new.disciplina_id)
    is not distinct from (old.professor_id, old.turma_id, old.disciplina_id) then
    return new;
  end if;

  select turma.polo_id, upper(coalesce(curso.modalidade, ''))
  into v_polo_id, v_modalidade
  from public.turmas turma
  join public.cursos curso on curso.id = turma.curso_id
  where turma.id = new.turma_id
  for share of turma, curso;
  if v_modalidade is distinct from 'TECNICO' then return new; end if;

  perform 1 from public.parceiros professor
  where professor.id = new.professor_id
    and (professor.polo_id = v_polo_id
      or v_polo_id = any(coalesce(professor.polo_ids, '{}'::uuid[])))
  for share of professor;
  if not found then
    raise exception 'O docente precisa estar vinculado ao polo da turma técnica.'
      using errcode = '22023';
  end if;
  return new;
end;
$function$;

revoke all on function internal_academic.guard_technical_teacher_polo_scope()
  from public, anon, authenticated, service_role;

create trigger guard_technical_teacher_polo_scope
-- AFTER distinguishes a true INSERT from the UPDATE arm of ON CONFLICT,
-- preserving legacy assignments retained by the canonical grade upsert.
after insert or update of professor_id, turma_id, disciplina_id
on public.turmas_disciplinas
for each row execute function internal_academic.guard_technical_teacher_polo_scope();

comment on function internal_academic.guard_technical_teacher_polo_scope() is
  'Restricts only new technical teacher assignments to the class polo via polo_id or polo_ids; preserves existing assignments and other modalities.';

commit;
