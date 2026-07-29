begin;

create or replace function public.atualizar_titulo_encontro_professor(
  p_aula_id uuid,
  p_titulo text
)
returns setof public.aulas_turma
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_turma_id uuid;
  v_disciplina_id uuid;
  v_data_aula date;
  v_titulo text := trim(p_titulo);
begin
  if nullif(v_titulo, '') is null then
    raise exception 'Informe o título ou conteúdo programático da aula.'
      using errcode = '22023';
  end if;

  if char_length(v_titulo) > 1000 then
    raise exception 'O conteúdo programático deve ter no máximo 1000 caracteres.'
      using errcode = '22023';
  end if;

  select aula.turma_id, aula.disciplina_id, aula.data_aula
  into v_turma_id, v_disciplina_id, v_data_aula
  from public.aulas_turma aula
  where aula.id = p_aula_id;

  if not found then
    raise exception 'Encontro de aula não encontrado.'
      using errcode = 'P0002';
  end if;

  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.is_professor_assigned_disciplina_open(
      v_turma_id,
      v_disciplina_id
    ) then
    raise exception
      'Somente o professor vinculado pode preencher o conteúdo deste encontro.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_turma_id::text),
    hashtext(v_disciplina_id::text)
  );

  update public.aulas_turma aula
  set titulo = v_titulo
  where aula.turma_id = v_turma_id
    and aula.disciplina_id = v_disciplina_id
    and aula.data_aula is not distinct from v_data_aula;

  return query
  select aula.*
  from public.aulas_turma aula
  where aula.turma_id = v_turma_id
    and aula.disciplina_id = v_disciplina_id
    and aula.data_aula is not distinct from v_data_aula
  order by
    case aula.sessao when 'M' then 1 when 'T' then 2 when 'N' then 3 else 4 end,
    aula.created_at,
    aula.id;
end;
$function$;

revoke all on function public.atualizar_titulo_encontro_professor(uuid, text)
  from public, anon;
grant execute on function public.atualizar_titulo_encontro_professor(uuid, text)
  to authenticated, service_role;

comment on function public.atualizar_titulo_encontro_professor(uuid, text) is
  'Permite ao professor vinculado preencher somente o título/conteúdo de um encontro planejado pela Gestão, preservando data, carga horária e sessões.';

commit;
