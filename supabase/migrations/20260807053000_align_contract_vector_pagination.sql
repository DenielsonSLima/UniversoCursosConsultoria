-- Alinha a paginação canônica do contrato à área física A4 usada pela prévia
-- e pelo PDF vetorial. A repartição acontece no Postgres; o navegador apenas
-- desenha as páginas já devolvidas pela emissão.

create or replace function public.paginar_texto_documento_canonico(
  p_header text,
  p_title text,
  p_body text,
  p_footer text,
  p_max_caracteres integer default 1800
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
  v_index integer := 0;
  v_parts text[] := regexp_split_to_array(coalesce(p_body, ''), E'\n{2,}');
  v_limit integer := greatest(900, least(coalesce(p_max_caracteres, 1800), 2200));
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

      if v_available < 240 then
        v_index := v_index + 1;
        v_pages := v_pages || jsonb_build_array(jsonb_build_object(
          'header', p_header,
          'title', case when v_index = 1 then p_title else p_title || ' — continuação' end,
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

      -- Nunca corta uma palavra quando existe separador razoavelmente próximo.
      -- Um token excepcionalmente longo é cortado para manter a página física
      -- segura, sem mudar ou deduzir nenhum dado do contrato.
      v_prefix := substr(v_remaining, 1, v_available);
      v_break := greatest(
        coalesce(strrpos(v_prefix, E'\n'), 0),
        coalesce(strrpos(v_prefix, ' '), 0)
      );
      if v_break < greatest(1, floor(v_available / 2.0)::integer) then
        v_break := v_available;
      end if;

      v_piece := btrim(substr(v_remaining, 1, v_break));
      v_remaining := btrim(substr(v_remaining, v_break + 1));
      v_current := concat_ws(E'\n\n', nullif(v_current, ''), v_piece);

      v_index := v_index + 1;
      v_pages := v_pages || jsonb_build_array(jsonb_build_object(
        'header', p_header,
        'title', case when v_index = 1 then p_title else p_title || ' — continuação' end,
        'body', v_current,
        'footer', null
      ));
      v_current := '';
    end loop;
  end loop;

  if v_current = '' and jsonb_array_length(v_pages) = 0 then
    v_current := coalesce(p_body, '');
  end if;

  if v_current <> '' or jsonb_array_length(v_pages) = 0 then
    v_index := v_index + 1;
    v_pages := v_pages || jsonb_build_array(jsonb_build_object(
      'header', p_header,
      'title', case when v_index = 1 then p_title else p_title || ' — continuação' end,
      'body', v_current,
      'footer', p_footer
    ));
  elsif jsonb_array_length(v_pages) > 0 then
    -- A última página já existe porque o último trecho completou o limite.
    -- Só ela recebe o rodapé canônico do documento.
    v_pages := jsonb_set(
      v_pages,
      array[(jsonb_array_length(v_pages) - 1)::text, 'footer'],
      coalesce(to_jsonb(p_footer), 'null'::jsonb),
      true
    );
  end if;

  return v_pages;
end;
$function$;

revoke all on function public.paginar_texto_documento_canonico(text, text, text, text, integer)
  from public, anon, authenticated;
