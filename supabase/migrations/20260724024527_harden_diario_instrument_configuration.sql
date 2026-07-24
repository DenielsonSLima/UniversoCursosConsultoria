alter table public.turmas_disciplinas
  drop constraint if exists turmas_disciplinas_instrumentos_avaliativos_check;

alter table public.turmas_disciplinas
  add constraint turmas_disciplinas_instrumentos_avaliativos_check
  check (
    instrumentos_avaliativos is null
    or (
      jsonb_typeof(instrumentos_avaliativos) = 'object'
      and instrumentos_avaliativos ?& array['p', 'ti', 'tg', 's', 'cq', 'o']
      and instrumentos_avaliativos - 'p' - 'ti' - 'tg' - 's' - 'cq' - 'o' = '{}'::jsonb
      and jsonb_typeof(instrumentos_avaliativos -> 'p') = 'boolean'
      and jsonb_typeof(instrumentos_avaliativos -> 'ti') = 'boolean'
      and jsonb_typeof(instrumentos_avaliativos -> 'tg') = 'boolean'
      and jsonb_typeof(instrumentos_avaliativos -> 's') = 'boolean'
      and jsonb_typeof(instrumentos_avaliativos -> 'cq') = 'boolean'
      and jsonb_typeof(instrumentos_avaliativos -> 'o') = 'boolean'
      and (
        (instrumentos_avaliativos ->> 'p')::boolean
        or (instrumentos_avaliativos ->> 'ti')::boolean
        or (instrumentos_avaliativos ->> 'tg')::boolean
        or (instrumentos_avaliativos ->> 's')::boolean
        or (instrumentos_avaliativos ->> 'cq')::boolean
        or (instrumentos_avaliativos ->> 'o')::boolean
      )
    )
  );

create or replace function public.set_diario_instrumentos_avaliativos(
  p_turma_id uuid,
  p_disciplina_id uuid,
  p_instrumentos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_saved jsonb;
begin
  if not public.can_write_academic_record_open(p_turma_id, p_disciplina_id) then
    raise exception 'O diário está fechado ou o acesso não foi autorizado.'
      using errcode = '42501';
  end if;

  if p_instrumentos is null
    or jsonb_typeof(p_instrumentos) <> 'object'
    or not (p_instrumentos ?& array['p', 'ti', 'tg', 's', 'cq', 'o'])
    or p_instrumentos - 'p' - 'ti' - 'tg' - 's' - 'cq' - 'o' <> '{}'::jsonb
    or jsonb_typeof(p_instrumentos -> 'p') <> 'boolean'
    or jsonb_typeof(p_instrumentos -> 'ti') <> 'boolean'
    or jsonb_typeof(p_instrumentos -> 'tg') <> 'boolean'
    or jsonb_typeof(p_instrumentos -> 's') <> 'boolean'
    or jsonb_typeof(p_instrumentos -> 'cq') <> 'boolean'
    or jsonb_typeof(p_instrumentos -> 'o') <> 'boolean'
    or not (
      (p_instrumentos ->> 'p')::boolean
      or (p_instrumentos ->> 'ti')::boolean
      or (p_instrumentos ->> 'tg')::boolean
      or (p_instrumentos ->> 's')::boolean
      or (p_instrumentos ->> 'cq')::boolean
      or (p_instrumentos ->> 'o')::boolean
    )
  then
    raise exception 'Ative pelo menos um instrumento avaliativo.'
      using errcode = '22023';
  end if;

  update public.turmas_disciplinas td
  set instrumentos_avaliativos = p_instrumentos
  where td.turma_id = p_turma_id
    and td.disciplina_id = p_disciplina_id
  returning td.instrumentos_avaliativos into v_saved;

  if v_saved is null then
    raise exception 'Disciplina não vinculada à turma.'
      using errcode = 'P0002';
  end if;

  return v_saved;
end;
$function$;

