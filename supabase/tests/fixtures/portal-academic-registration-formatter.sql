CREATE OR REPLACE FUNCTION public.formatar_matricula_validacao(p_matricula_id uuid, p_data_matricula timestamp with time zone, p_polo_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_config JSONB;
  v_prefixo TEXT;
  v_digitos INTEGER;
  v_formato_ano TEXT;
  v_usar_polo BOOLEAN;
  v_ano TEXT;
  v_polo TEXT;
  v_hex TEXT;
  v_sequencia BIGINT;
BEGIN
  SELECT conteudo
  INTO v_config
  FROM public.documentos_templates
  WHERE id = 'academicos_config';

  v_config := COALESCE(v_config, '{}'::JSONB);
  v_prefixo := COALESCE(v_config ->> 'matriculaPrefix', 'UNIV-');
  v_digitos := LEAST(10, GREATEST(1, COALESCE((v_config ->> 'matriculaDigits')::INTEGER, 4)));
  v_formato_ano := COALESCE(v_config ->> 'yearFormat', 'yy');
  v_usar_polo := COALESCE((v_config ->> 'usePoloCode')::BOOLEAN, FALSE);

  v_ano := CASE v_formato_ano
    WHEN 'none' THEN ''
    WHEN 'yyyy' THEN TO_CHAR(COALESCE(p_data_matricula, now()), 'YYYY')
    ELSE TO_CHAR(COALESCE(p_data_matricula, now()), 'YY')
  END;

  v_polo := CASE
    WHEN NOT v_usar_polo THEN ''
    WHEN p_polo_id = '55555555-5555-5555-5555-555555555555'::UUID THEN '02'
    ELSE '01'
  END;

  v_hex := RIGHT(REGEXP_REPLACE(p_matricula_id::TEXT, '[^0-9a-f]', '', 'g'), 4);
  v_sequencia := (('x' || LPAD(v_hex, 4, '0'))::BIT(16)::INTEGER)
    % CAST(POWER(10::NUMERIC, v_digitos) AS BIGINT);

  RETURN UPPER(
    v_prefixo ||
    v_ano ||
    v_polo ||
    LPAD(v_sequencia::TEXT, v_digitos, '0')
  );
END;
$function$

