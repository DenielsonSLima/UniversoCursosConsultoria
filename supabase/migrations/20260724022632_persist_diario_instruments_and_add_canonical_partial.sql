alter table public.turmas_disciplinas
  add column if not exists instrumentos_avaliativos jsonb;

comment on column public.turmas_disciplinas.instrumentos_avaliativos is
  'Instrumentos avaliativos ativos no diário. NULL preserva a configuração legada até a primeira gravação.';

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
    )
  );

create or replace function internal_academic.calculate_diario_partial(
  p_config jsonb,
  p_nota_p numeric,
  p_nota_ti numeric,
  p_nota_tg numeric,
  p_nota_s numeric,
  p_nota_cq numeric,
  p_nota_o numeric
)
returns numeric
language sql
immutable
set search_path to ''
as $function$
  select case
    when not (
      (coalesce((p_config ->> 'p')::boolean, true) and p_nota_p is not null)
      or (coalesce((p_config ->> 'ti')::boolean, true) and p_nota_ti is not null)
      or (coalesce((p_config ->> 'tg')::boolean, true) and p_nota_tg is not null)
      or (coalesce((p_config ->> 's')::boolean, true) and p_nota_s is not null)
      or (coalesce((p_config ->> 'cq')::boolean, true) and p_nota_cq is not null)
      or (coalesce((p_config ->> 'o')::boolean, true) and p_nota_o is not null)
    ) then null
    else least(
      10.00,
      round((
        case when coalesce((p_config ->> 'p')::boolean, true) then coalesce(p_nota_p, 0) else 0 end
        + case when coalesce((p_config ->> 'ti')::boolean, true) then coalesce(p_nota_ti, 0) else 0 end
        + case when coalesce((p_config ->> 'tg')::boolean, true) then coalesce(p_nota_tg, 0) else 0 end
        + case when coalesce((p_config ->> 's')::boolean, true) then coalesce(p_nota_s, 0) else 0 end
        + case when coalesce((p_config ->> 'cq')::boolean, true) then coalesce(p_nota_cq, 0) else 0 end
        + case when coalesce((p_config ->> 'o')::boolean, true) then coalesce(p_nota_o, 0) else 0 end
      )::numeric, 1)
    )
  end;
$function$;

revoke all on function internal_academic.calculate_diario_partial(
  jsonb, numeric, numeric, numeric, numeric, numeric, numeric
) from public;
revoke all on function internal_academic.calculate_diario_partial(
  jsonb, numeric, numeric, numeric, numeric, numeric, numeric
) from anon;
revoke all on function internal_academic.calculate_diario_partial(
  jsonb, numeric, numeric, numeric, numeric, numeric, numeric
) from authenticated;
