-- A fixture vetorial V3 demonstrou que 3.600 caracteres podem ultrapassar a
-- área segura em parágrafos densos. O limite de 2.600 foi validado pelo mesmo
-- compositor usado em download e impressão.

create or replace function public.paginar_contrato_aluno_minuta_completa(
  p_header text,
  p_title text,
  p_body text,
  p_footer text,
  p_max_caracteres integer default 2600
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_part text;
  v_remaining text;
  v_piece text;
  v_prefix text;
  v_current text := '';
  v_pages jsonb := '[]'::jsonb;
  v_parts text[] := regexp_split_to_array(coalesce(p_body, ''), E'\n{2,}');
  v_limit integer := greatest(2200, least(coalesce(p_max_caracteres, 2600), 3000));
  v_available integer;
  v_break integer;
begin
  foreach v_part in array v_parts loop
    v_remaining := btrim(v_part);
    if v_remaining = '' then
      continue;
    end if;

    while v_remaining <> '' loop
      v_available := v_limit - char_length(v_current)
        - case when v_current = '' then 0 else 2 end;

      if v_available < 320 then
        v_pages := v_pages || jsonb_build_array(jsonb_build_object(
          'header', p_header,
          'title', p_title,
          'body', v_current,
          'footer', null
        ));
        v_current := '';
        continue;
      end if;

      if char_length(v_remaining) <= v_available then
        v_current := concat_ws(E'\n\n', nullif(v_current, ''), v_remaining);
        v_remaining := '';
        continue;
      end if;

      v_prefix := substr(v_remaining, 1, v_available);
      v_break := char_length(regexp_replace(v_prefix, E'\s+\S*$', ''));
      if v_break < greatest(1, floor(v_available / 2.0)::integer) then
        v_break := v_available;
      end if;

      v_piece := btrim(substr(v_remaining, 1, v_break));
      v_remaining := btrim(substr(v_remaining, v_break + 1));
      v_current := concat_ws(E'\n\n', nullif(v_current, ''), v_piece);
      v_pages := v_pages || jsonb_build_array(jsonb_build_object(
        'header', p_header,
        'title', p_title,
        'body', v_current,
        'footer', null
      ));
      v_current := '';
    end loop;
  end loop;

  if v_current <> '' or jsonb_array_length(v_pages) = 0 then
    v_pages := v_pages || jsonb_build_array(jsonb_build_object(
      'header', p_header,
      'title', p_title,
      'body', v_current,
      'footer', null
    ));
  end if;

  if nullif(btrim(coalesce(p_footer, '')), '') is not null then
    v_pages := v_pages || jsonb_build_array(jsonb_build_object(
      'header', p_header,
      'title', p_title,
      'body', '',
      'footer', p_footer
    ));
  end if;

  return v_pages;
end;
$function$;

revoke all on function public.paginar_contrato_aluno_minuta_completa(
  text, text, text, text, integer
) from public, anon, authenticated, service_role;
