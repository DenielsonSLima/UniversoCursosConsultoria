-- Mantém polos vinculados à empresa matriz e fecha leituras financeiras entre polos.

UPDATE public.polos AS polo
SET company_id = matriz.company_id
FROM (
  SELECT company_id
  FROM public.polos
  WHERE is_matriz IS TRUE
    AND company_id IS NOT NULL
  ORDER BY created_at
  LIMIT 1
) AS matriz
WHERE polo.company_id IS NULL;

DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM public.polos WHERE company_id IS NULL) THEN
    RAISE EXCEPTION 'Não foi possível vincular todos os polos a uma empresa matriz.';
  END IF;
END;
$block$;

ALTER TABLE public.polos
  ALTER COLUMN company_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.is_gestor_for_polo(p_polo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_gestor_global()
    OR (
      p_polo_id IS NOT NULL
      AND public.is_gestor()
      AND p_polo_id = ANY(coalesce(public.gestor_allowed_polo_ids(), ARRAY[]::uuid[]))
    );
$function$;

DROP POLICY IF EXISTS portal_contas_bancarias_gestor_read
  ON public.contas_bancarias;

CREATE POLICY portal_contas_bancarias_gestor_read
  ON public.contas_bancarias
  FOR SELECT
  TO authenticated
  USING (public.is_gestor_for_polo(polo_id));

CREATE OR REPLACE FUNCTION public.get_transferencias_contas(
  p_polo_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_conta_origem_id uuid DEFAULT NULL,
  p_conta_destino_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL,
  p_mes_atual boolean DEFAULT false
)
RETURNS TABLE(
  id uuid,
  polo_origem_id uuid,
  polo_origem_nome text,
  polo_origem_cnpj text,
  polo_origem_cidade text,
  polo_origem_uf text,
  conta_origem_id uuid,
  conta_origem_banco text,
  conta_origem_titular text,
  conta_origem_agencia text,
  conta_origem_conta text,
  polo_destino_id uuid,
  polo_destino_nome text,
  polo_destino_cnpj text,
  polo_destino_cidade text,
  polo_destino_uf text,
  conta_destino_id uuid,
  conta_destino_banco text,
  conta_destino_titular text,
  conta_destino_agencia text,
  conta_destino_conta text,
  valor numeric,
  data_transferencia date,
  observacao text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    tc.id,
    co.polo_id,
    COALESCE(po.nome, ''),
    COALESCE(po.cnpj, ''),
    COALESCE(po.cidade, ''),
    COALESCE(po.estado, ''),
    co.id,
    co.banco,
    co.titular,
    co.agencia,
    co.conta,
    cd.polo_id,
    COALESCE(pd.nome, ''),
    COALESCE(pd.cnpj, ''),
    COALESCE(pd.cidade, ''),
    COALESCE(pd.estado, ''),
    cd.id,
    cd.banco,
    cd.titular,
    cd.agencia,
    cd.conta,
    tc.valor,
    tc.data_transferencia,
    tc.observacao,
    tc.created_at,
    tc.updated_at
  FROM public.transferencias_contas AS tc
  JOIN public.contas_bancarias AS co ON co.id = tc.conta_origem_id
  JOIN public.contas_bancarias AS cd ON cd.id = tc.conta_destino_id
  LEFT JOIN public.polos AS po ON po.id = co.polo_id
  LEFT JOIN public.polos AS pd ON pd.id = cd.polo_id
  WHERE (p_polo_id IS NULL OR co.polo_id = p_polo_id OR cd.polo_id = p_polo_id)
    AND (p_conta_origem_id IS NULL OR co.id = p_conta_origem_id)
    AND (p_conta_destino_id IS NULL OR cd.id = p_conta_destino_id)
    AND public.is_gestor_for_polo(co.polo_id)
    AND public.is_gestor_for_polo(cd.polo_id)
    AND (p_data_inicio IS NULL OR tc.data_transferencia >= p_data_inicio)
    AND (p_data_fim IS NULL OR tc.data_transferencia <= p_data_fim)
    AND (
      p_mes_atual IS FALSE
      OR (
        tc.data_transferencia >= date_trunc('month', CURRENT_DATE)::date
        AND tc.data_transferencia < (date_trunc('month', CURRENT_DATE) + interval '1 month')::date
      )
    )
    AND (
      NULLIF(BTRIM(COALESCE(p_search, '')), '') IS NULL
      OR tc.observacao ILIKE '%' || BTRIM(p_search) || '%'
      OR co.banco ILIKE '%' || BTRIM(p_search) || '%'
      OR co.titular ILIKE '%' || BTRIM(p_search) || '%'
      OR co.agencia ILIKE '%' || BTRIM(p_search) || '%'
      OR co.conta ILIKE '%' || BTRIM(p_search) || '%'
      OR cd.banco ILIKE '%' || BTRIM(p_search) || '%'
      OR cd.titular ILIKE '%' || BTRIM(p_search) || '%'
      OR cd.agencia ILIKE '%' || BTRIM(p_search) || '%'
      OR cd.conta ILIKE '%' || BTRIM(p_search) || '%'
      OR po.nome ILIKE '%' || BTRIM(p_search) || '%'
      OR po.cnpj ILIKE '%' || BTRIM(p_search) || '%'
      OR pd.nome ILIKE '%' || BTRIM(p_search) || '%'
      OR pd.cnpj ILIKE '%' || BTRIM(p_search) || '%'
    )
  ORDER BY tc.data_transferencia DESC, tc.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.get_transferencias_contas(
  uuid, text, uuid, uuid, date, date, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_transferencias_contas(
  uuid, text, uuid, uuid, date, date, boolean
) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_gestor_for_polo(uuid) IS
  'Autoriza gestor global ou gestor explicitamente vinculado a um polo não nulo.';

COMMENT ON FUNCTION public.get_transferencias_contas(uuid, text, uuid, uuid, date, date, boolean) IS
  'Lista transferências somente quando o gestor pode acessar simultaneamente os polos de origem e destino.';
