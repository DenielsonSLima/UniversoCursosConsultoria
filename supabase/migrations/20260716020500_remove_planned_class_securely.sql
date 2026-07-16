begin;

create or replace function public.remove_turma_aula_planejada(p_aula_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turma_id uuid;
  v_disciplina_id uuid;
  v_deleted_count integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação obrigatória para excluir uma aula.'
      using errcode = '42501';
  end if;

  select aula.turma_id, aula.disciplina_id
    into v_turma_id, v_disciplina_id
  from public.aulas_turma aula
  where aula.id = p_aula_id;

  if v_turma_id is null then
    return false;
  end if;

  if not (
    (select public.can_write_turma(v_turma_id))
    or (select public.can_write_academic_record_open(v_turma_id, v_disciplina_id))
  ) then
    raise exception 'Você não possui permissão para excluir esta aula.'
      using errcode = '42501';
  end if;

  delete from public.aulas_turma
  where id = p_aula_id;

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count = 1;
end;
$$;

revoke all on function public.remove_turma_aula_planejada(uuid) from public, anon;
grant execute on function public.remove_turma_aula_planejada(uuid) to authenticated, service_role;

comment on function public.remove_turma_aula_planejada(uuid) is
  'Exclui uma aula planejada. Gestores no escopo do polo podem excluir durante o planejamento; docentes continuam limitados ao período acadêmico aberto.';

commit;
