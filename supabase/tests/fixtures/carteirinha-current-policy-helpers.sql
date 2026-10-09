CREATE OR REPLACE FUNCTION public.documento_validade_efetiva(p_documento text, p_validade_emitida timestamp with time zone, p_termino_turma date)
 RETURNS timestamp with time zone
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_documento <> 'carteirinha' or p_termino_turma is null
      then p_validade_emitida
    when p_validade_emitida is null
      then (
        ((p_termino_turma + 1)::timestamp at time zone 'America/Maceio')
        - interval '1 millisecond'
      )
    else least(
      p_validade_emitida,
      (
        ((p_termino_turma + 1)::timestamp at time zone 'America/Maceio')
        - interval '1 millisecond'
      )
    )
  end;
$function$;

CREATE OR REPLACE FUNCTION public.filtrar_dados_publicos_validacao(p_snapshot jsonb, p_campos text[])
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
  from jsonb_each(coalesce(p_snapshot, '{}'::jsonb)) entry
  where entry.key = any(coalesce(p_campos, array[]::text[]));
$function$;

CREATE OR REPLACE FUNCTION public.formatar_cnpj_validacao_publica(p_valor text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_digitos text;
begin
  v_digitos := regexp_replace(coalesce(p_valor, ''), '\D', '', 'g');
  if char_length(v_digitos) <> 14 then
    return null;
  end if;
  return substring(v_digitos from 1 for 2)
    || '.' || substring(v_digitos from 3 for 3)
    || '.' || substring(v_digitos from 6 for 3)
    || '/' || substring(v_digitos from 9 for 4)
    || '-' || substring(v_digitos from 13 for 2);
end;
$function$;

CREATE OR REPLACE FUNCTION public.mascarar_cpf_validacao_publica(p_valor text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_digitos text;
begin
  v_digitos := regexp_replace(coalesce(p_valor, ''), '\D', '', 'g');
  if char_length(v_digitos) < 2 then
    return null;
  end if;
  return '***.***.***-' || right(v_digitos, 2);
end;
$function$;

CREATE OR REPLACE FUNCTION public.mascarar_matricula_validacao_publica(p_valor text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_valor text;
begin
  -- A matrícula pode vir de dados_emissao. Elimina qualquer máscara alegada
  -- pelo chamador e remascara o identificador normalizado do zero.
  v_valor := nullif(
    regexp_replace(
      upper(btrim(coalesce(p_valor, ''))),
      '[^A-Z0-9-]',
      '',
      'g'
    ),
    ''
  );
  if v_valor is null then
    return null;
  end if;
  if char_length(v_valor) <= 4 then
    return repeat('*', char_length(v_valor));
  end if;
  return left(v_valor, greatest(2, char_length(v_valor) - 6))
    || '****'
    || right(v_valor, 2);
end;
$function$;

CREATE OR REPLACE FUNCTION public.mascarar_nascimento_validacao_publica(p_valor text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_ano text;
begin
  v_ano := substring(coalesce(p_valor, '') from '([12][0-9]{3})');
  if v_ano is null then
    return null;
  end if;
  return '**/**/' || v_ano;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mascarar_nome_validacao_publica(p_valor text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_valor text;
begin
  v_valor := nullif(regexp_replace(btrim(coalesce(p_valor, '')), '\s+', ' ', 'g'), '');
  if v_valor is null or lower(v_valor) = 'não informado' then
    return null;
  end if;
  -- Nunca aceite um asterisco fornecido pelo snapshot bruto como prova de que
  -- o valor já está seguro. Remove marcadores e aplica a máscara canônica.
  v_valor := nullif(
    regexp_replace(
      regexp_replace(v_valor, '\*', '', 'g'),
      '\s+',
      ' ',
      'g'
    ),
    ''
  );
  if v_valor is null then
    return null;
  end if;
  return split_part(v_valor, ' ', 1)
    || case
      when position(' ' in v_valor) > 0
        then ' ' || left(split_part(v_valor, ' ', 2), 1) || '***'
      else ''
    end;
end;
$function$;
