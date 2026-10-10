begin;

-- Each active instrument contributes only its explicitly recorded value.
-- Missing notes stay NULL; zero is included only when entered as a grade.
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
  with instrumentos(ativo, nota) as (
    values
      (coalesce((p_config ->> 'p')::boolean, true), p_nota_p),
      (coalesce((p_config ->> 'ti')::boolean, true), p_nota_ti),
      (coalesce((p_config ->> 'tg')::boolean, true), p_nota_tg),
      (coalesce((p_config ->> 's')::boolean, true), p_nota_s),
      (coalesce((p_config ->> 'cq')::boolean, true), p_nota_cq),
      (coalesce((p_config ->> 'o')::boolean, true), p_nota_o)
  )
  select case
    when not exists (
      select 1 from instrumentos where ativo and nota is not null
    ) then null::numeric
    else least(10.00, round((
      select sum(nota) from instrumentos where ativo and nota is not null
    ), 2))
  end;
$function$;
-- CREATE OR REPLACE preserves owner, ACL and the existing read/closing callers.

commit;
