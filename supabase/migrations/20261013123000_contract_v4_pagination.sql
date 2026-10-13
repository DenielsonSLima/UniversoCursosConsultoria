-- Paginação de novas emissões V4; apresentação e snapshots legados preservados.
begin;

create or replace function public.estimar_linhas_contrato_v4(p_text text)
returns integer language plpgsql immutable set search_path = '' as $function$
declare
  v_text text := coalesce(p_text, '');
  v_line text;
  v_word text;
  v_char text;
  v_width integer;
  v_word_width integer;
  v_line_width integer;
  v_lines integer := 0;
  v_has_words boolean;
begin
  -- Mesma normalização visual do compositor; não devolve texto modificado.
  v_text := replace(replace(v_text, chr(92) || 'r' || chr(92) || 'n', E'\n'), chr(92) || 'n', E'\n');
  v_text := replace(replace(v_text, E'\r\n', E'\n'), E'\r', E'\n');
  v_text := translate(v_text, '‐‑‒–—‘’“”•' || chr(160), '-----' || chr(39) || chr(39) || '""· ');
  foreach v_line in array string_to_array(v_text, E'\n') loop
    v_lines := v_lines + 1;
    v_line_width := 0;
    v_has_words := false;
    for v_word in select x from regexp_split_to_table(v_line, '[[:space:]]+') as x where x <> '' loop
      v_word_width := 0;
      foreach v_char in array regexp_split_to_array(v_word, '') loop
        v_width := case
      when strpos('!()-:;[]`fjt¡¨¯´¸º', v_char) > 0 then 330
      when strpos('"Sbdhknpquµßñùúûü', v_char) > 0 then 550
      when strpos('#$*0123456789?J_agovxy¢£¤¥§«»¿àáâãäåòóôõöøÿ', v_char) > 0 then 500
      when strpos('%WÆ', v_char) > 0 then 1000
      when strpos('&m', v_char) > 0 then 830
      when strpos('''/\ilìíîï', v_char) > 0 then 280
      when strpos('+<=>¬±÷', v_char) > 0 then 570
      when strpos(',.·', v_char) > 0 then 250
      when strpos('@', v_char) > 0 then 930
      when strpos('ACDNRUVXYwÀÁÂÃÄÅÇÑÙÚÛÜæ', v_char) > 0 then 720
      when strpos('BELTZÈÉÊË', v_char) > 0 then 660
      when strpos('FP', v_char) > 0 then 610
      when strpos('GHKOQÒÓÔÕÖØ', v_char) > 0 then 780
      when strpos('IsÌÍÎÏ', v_char) > 0 then 390
      when strpos('M', v_char) > 0 then 940
      when strpos('^', v_char) > 0 then 580
      when strpos('cerzçèéêë', v_char) > 0 then 440
      when strpos('{}', v_char) > 0 then 480
      when strpos('|', v_char) > 0 then 220
      when strpos('~ ¦­²³¶¹¼½¾Ð×ÝÞðýþ', v_char) > 0 then 540
      when strpos('©®', v_char) > 0 then 760
      when strpos('ª', v_char) > 0 then 300
      when strpos('°', v_char) > 0 then 401
          else 1000
        end;
        v_word_width := v_word_width + v_width;
      end loop;
      -- 174 mm, fonte 12 pt: 41.102 unidades; margem contra arredondamento.
      if v_word_width > 41090 then
        raise exception 'O contrato contém uma palavra maior que a largura segura do PDF.';
      end if;
      if v_has_words and v_line_width + 284 + v_word_width > 41090 then
        v_lines := v_lines + 1;
        v_line_width := 0;
        v_has_words := false;
      end if;
      v_line_width := v_line_width + case when v_has_words then 284 else 0 end + v_word_width;
      v_has_words := true;
    end loop;
  end loop;
  return greatest(v_lines, 1);
end;
$function$;

create or replace function public.paginar_contrato_aluno_v4(
  p_header text, p_title text, p_body text, p_footer text
)
returns jsonb language plpgsql immutable set search_path = '' as $function$
declare
  v_text text := coalesce(p_body, '');
  v_part text;
  v_remaining text;
  v_current text := '';
  v_candidate text;
  v_piece text;
  v_pages jsonb := '[]'::jsonb;
  v_budget integer;
  v_low integer;
  v_high integer;
  v_mid integer;
  v_break integer;
  v_last integer;
begin
  v_text := replace(replace(v_text, chr(92) || 'r' || chr(92) || 'n', E'\n'), chr(92) || 'n', E'\n');
  v_text := replace(replace(replace(v_text, E'\r\n', E'\n'), E'\r', E'\n'), chr(160), ' ');
  -- Mantém parágrafos inteiros quando couberem em uma folha. Um parágrafo
  -- excepcionalmente longo é dividido somente em separador de palavras.
  foreach v_part in array regexp_split_to_array(v_text, E'\n[[:blank:]]*\n') loop
    v_remaining := btrim(v_part);
    while v_remaining <> '' loop
      v_budget := case when jsonb_array_length(v_pages) = 0 then 39 else 41 end;
      v_candidate := concat_ws(E'\n\n', nullif(v_current, ''), v_remaining);
      if public.estimar_linhas_contrato_v4(v_candidate) <= v_budget then
        v_current := v_candidate;
        v_remaining := '';
      elsif v_current <> '' then
        v_pages := v_pages || jsonb_build_array(jsonb_build_object(
          'header', p_header, 'title', p_title, 'body', v_current, 'footer', null
        ));
        v_current := '';
      else
        v_low := 0;
        v_high := length(v_remaining);
        while v_low < v_high loop
          v_mid := (v_low + v_high + 1) / 2;
          if public.estimar_linhas_contrato_v4(substr(v_remaining, 1, v_mid)) <= v_budget then
            v_low := v_mid;
          else
            v_high := v_mid - 1;
          end if;
        end loop;
        if substring(v_remaining from v_low + 1 for 1) ~ '[[:space:]]' then
          v_break := v_low;
        else
          v_break := length(regexp_replace(substr(v_remaining, 1, v_low), '[[:space:]]+[^[:space:]]*$', ''));
          if v_break = v_low then
            raise exception 'Não foi possível paginar o contrato sem cortar uma palavra.';
          end if;
        end if;
        if v_break < 1 then raise exception 'Página de contrato sem separador seguro.'; end if;
        v_piece := btrim(substr(v_remaining, 1, v_break));
        v_remaining := btrim(substr(v_remaining, v_break + 1));
        v_pages := v_pages || jsonb_build_array(jsonb_build_object(
          'header', p_header, 'title', p_title, 'body', v_piece, 'footer', null
        ));
      end if;
    end loop;
  end loop;
  if v_current <> '' or jsonb_array_length(v_pages) = 0 then
    v_pages := v_pages || jsonb_build_array(jsonb_build_object(
      'header', p_header, 'title', p_title, 'body', v_current, 'footer', null
    ));
  end if;
  -- O contrato sempre tem QR; reservar encerramento mesmo sem rodapé textual.
  v_last := jsonb_array_length(v_pages) - 1;
  v_budget := case when v_last = 0 then 24 else 27 end;
  if public.estimar_linhas_contrato_v4(v_pages #>> array[v_last::text, 'body']) > v_budget then
    v_pages := v_pages || jsonb_build_array(jsonb_build_object(
      'header', p_header, 'title', p_title, 'body', '', 'footer', p_footer
    ));
  else
    v_pages := jsonb_set(v_pages, array[v_last::text, 'footer'], coalesce(to_jsonb(p_footer), 'null'::jsonb));
  end if;
  return v_pages;
end;
$function$;

revoke all on function public.estimar_linhas_contrato_v4(text) from public, anon, authenticated, service_role;
revoke all on function public.paginar_contrato_aluno_v4(text,text,text,text) from public, anon, authenticated, service_role;
commit;
