-- Defesa em profundidade: a alteração isolada de horário deve respeitar a
-- mesma guarda de período letivo e bloqueio de diário da RPC de grade.

create or replace function public.definir_horario_encontro_turma(
  p_aula_id uuid,
  p_hora_inicio time,
  p_hora_fim time
)
returns public.aulas_turma
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_aula public.aulas_turma%rowtype;
begin
  select aula.*
  into v_aula
  from public.aulas_turma aula
  where aula.id = p_aula_id
  for update;

  if not found then
    raise exception 'Encontro de aula não encontrado.' using errcode = 'P0002';
  end if;

  if not public.can_write_academic_record_open(v_aula.turma_id, v_aula.disciplina_id) then
    raise exception 'Sem permissão para ajustar o horário deste encontro.'
      using errcode = '42501';
  end if;

  if (p_hora_inicio is null) <> (p_hora_fim is null)
    or (p_hora_inicio is not null and p_hora_fim <= p_hora_inicio) then
    raise exception 'Informe início e fim do horário em ordem válida.'
      using errcode = '22023';
  end if;

  update public.aulas_turma aula
  set hora_inicio = p_hora_inicio,
      hora_fim = p_hora_fim
  where aula.id = p_aula_id
  returning aula.* into v_aula;

  return v_aula;
end;
$function$;

revoke all on function public.definir_horario_encontro_turma(uuid, time, time)
  from public, anon;
grant execute on function public.definir_horario_encontro_turma(uuid, time, time)
  to authenticated, service_role;
