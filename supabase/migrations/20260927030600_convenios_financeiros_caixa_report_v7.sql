BEGIN;

ALTER FUNCTION public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date)
  RENAME TO get_caixa_relatorio_mensal_detalhado_v6_core;

REVOKE ALL ON FUNCTION public.get_caixa_relatorio_mensal_detalhado_v6_core(uuid, date)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_caixa_relatorio_mensal_detalhado_secure(
  p_polo_id uuid DEFAULT NULL,
  p_competencia date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_relatorio jsonb;
  v_convenios jsonb;
BEGIN
  v_relatorio := public.get_caixa_relatorio_mensal_detalhado_v6_core(
    p_polo_id,
    p_competencia
  );

  BEGIN
    v_convenios := jsonb_build_object(
      'disponivel', true,
      'dados', public.get_caixa_convenios_resumo_secure(p_polo_id, p_competencia)
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_convenios := jsonb_build_object(
      'disponivel', false,
      'motivo', 'ACESSO_RESTRITO'
    );
  END;

  RETURN v_relatorio || jsonb_build_object(
    'versao', 7,
    'convenios', v_convenios
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date) IS
  'Prestação mensal detalhada do Caixa v7 com recorte analítico de convênios, sem duplicar movimentos físicos.';

NOTIFY pgrst, 'reload schema';

COMMIT;
