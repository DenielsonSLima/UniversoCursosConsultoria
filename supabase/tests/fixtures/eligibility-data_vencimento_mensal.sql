CREATE OR REPLACE FUNCTION public.data_vencimento_mensal(p_base date, p_dia integer, p_offset integer)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT (date_trunc('month', p_base) + make_interval(months => p_offset) + (LEAST(GREATEST(COALESCE(p_dia, 10), 1), EXTRACT(DAY FROM (date_trunc('month', p_base) + make_interval(months => p_offset + 1) - interval '1 day'))::INTEGER) - 1) * interval '1 day')::DATE;
$function$
;

