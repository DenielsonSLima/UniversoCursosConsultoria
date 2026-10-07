-- Paginação V3 usa orçamento de linhas e larguras conservadoras Times 8,5 pt.
-- Não altera modelos, aprovações, dados financeiros ou snapshots já emitidos.
begin;

create or replace function public.estimar_linhas_contrato_v3(p_text text)
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
      -- 174 mm, fonte 8,5 pt: 58.028 unidades; margem contra arredondamento.
      if v_word_width > 58000 then
        raise exception 'O contrato contém uma palavra maior que a largura segura do PDF.';
      end if;
      if v_has_words and v_line_width + 401 + v_word_width > 58000 then
        v_lines := v_lines + 1;
        v_line_width := 0;
        v_has_words := false;
      end if;
      v_line_width := v_line_width + case when v_has_words then 401 else 0 end + v_word_width;
      v_has_words := true;
    end loop;
  end loop;
  return greatest(v_lines, 1);
end;
$function$;

create or replace function public.paginar_contrato_aluno_minuta_completa(
  p_header text, p_title text, p_body text, p_footer text,
  p_max_caracteres integer default 4000
)
returns jsonb language plpgsql immutable set search_path = '' as $function$
declare
  v_remaining text := btrim(coalesce(p_body, ''));
  v_pages jsonb := '[]'::jsonb;
  v_limit integer := greatest(900, least(coalesce(p_max_caracteres, 4000), 4200));
  v_low integer;
  v_high integer;
  v_mid integer;
  v_break integer;
  v_piece text;
  v_last integer;
  v_budget integer;
begin
  -- Formas equivalentes de espaço/quebra aceitas pelo compositor oficial.
  -- Normalizar antes de procurar separadores evita cortar escapes ou NBSP.
  v_remaining := replace(replace(v_remaining, chr(92) || 'r' || chr(92) || 'n', E'\n'), chr(92) || 'n', E'\n');
  v_remaining := replace(replace(replace(v_remaining, E'\r\n', E'\n'), E'\r', E'\n'), chr(160), ' ');
  -- 54 linhas cabem inclusive na primeira folha com título de duas linhas.
  -- Novas páginas pertencem ao servidor; o frontend continua sem repaginar.
  loop
    v_budget := case when jsonb_array_length(v_pages) = 0 then 54 else 60 end;
    if length(v_remaining) <= v_limit and public.estimar_linhas_contrato_v3(v_remaining) <= v_budget then
      v_piece := v_remaining;
      v_remaining := '';
    else
      v_low := 0;
      v_high := least(length(v_remaining), v_limit);
      while v_low < v_high loop
        v_mid := (v_low + v_high + 1) / 2;
        if public.estimar_linhas_contrato_v3(substr(v_remaining, 1, v_mid)) <= v_budget then
          v_low := v_mid;
        else
          v_high := v_mid - 1;
        end if;
      end loop;
      -- Quebra somente em separador, sem cortar uma palavra/cláusula.
      v_break := length(regexp_replace(substr(v_remaining, 1, v_low), E'\\s+\\S*$', ''));
      if v_break = v_low and substring(v_remaining from v_low + 1 for 1) !~ '[[:space:]]' then
        raise exception 'Não foi possível paginar o contrato sem cortar uma palavra.';
      end if;
      if v_break < 1 then raise exception 'Página de contrato sem separador seguro.'; end if;
      v_piece := btrim(substr(v_remaining, 1, v_break));
      v_remaining := btrim(substr(v_remaining, v_break + 1));
    end if;
    v_pages := v_pages || jsonb_build_array(jsonb_build_object(
      'header', p_header, 'title', p_title, 'body', v_piece, 'footer', null
    ));
    exit when v_remaining = '';
  end loop;

  -- 32 linhas reservam assinaturas/QR mesmo em documento de uma só página.
  if nullif(btrim(coalesce(p_footer, '')), '') is not null then
    v_last := jsonb_array_length(v_pages) - 1;
    if public.estimar_linhas_contrato_v3(v_pages #>> array[v_last::text, 'body']) <= 32 then
      v_pages := jsonb_set(v_pages, array[v_last::text, 'footer'], to_jsonb(p_footer));
    else
      v_pages := v_pages || jsonb_build_array(jsonb_build_object(
        'header', p_header, 'title', p_title, 'body', '', 'footer', p_footer
      ));
    end if;
  end if;
  return v_pages;
end;
$function$;

-- Projeção pura para contratos V3 já preparados. O registro histórico é imutável.
create or replace function public.repaginar_render_contrato_v3(p_rendered jsonb, p_version text)
returns jsonb language plpgsql immutable set search_path = '' as $function$
declare
  v_pages jsonb := '[]'::jsonb;
  v_page jsonb;
  v_index integer := 0;
  v_total integer;
  v_closing boolean;
  v_budget integer;
begin
  if p_version is distinct from 'CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA' then return p_rendered; end if;
  if jsonb_typeof(p_rendered -> 'pages') is distinct from 'array' then
    raise exception 'O contrato não possui páginas canônicas congeladas.';
  end if;
  v_total := jsonb_array_length(p_rendered -> 'pages');
  for v_page in select value from jsonb_array_elements(p_rendered -> 'pages') loop
    v_index := v_index + 1;
    v_closing := v_index = v_total and (
      nullif(btrim(coalesce(v_page ->> 'footer', '')), '') is not null
      or coalesce((p_rendered #>> '{qr,enabled}')::boolean, false)
    );
    v_budget := case when v_closing then 32
      when jsonb_array_length(v_pages) = 0 then 54 else 60 end;
    if public.estimar_linhas_contrato_v3(v_page ->> 'body') > v_budget then
      v_pages := v_pages || public.paginar_contrato_aluno_minuta_completa(
        v_page ->> 'header', v_page ->> 'title', v_page ->> 'body', v_page ->> 'footer'
      );
      if v_closing and nullif(btrim(coalesce(v_page ->> 'footer', '')), '') is null then
        v_pages := v_pages || jsonb_build_array(v_page || jsonb_build_object('body', ''));
      end if;
    else
      v_pages := v_pages || jsonb_build_array(v_page);
    end if;
  end loop;
  return jsonb_set(p_rendered, '{pages}', v_pages);
end;
$function$;

revoke all on function public.estimar_linhas_contrato_v3(text) from public, anon, authenticated, service_role;
revoke all on function public.paginar_contrato_aluno_minuta_completa(text,text,text,text,integer) from public, anon, authenticated, service_role;
revoke all on function public.repaginar_render_contrato_v3(jsonb,text) from public, anon, authenticated, service_role;
commit;
