-- Categorias específicas para lançamentos de Outros Créditos.
-- A categoria macro contas_receber.categoria = 'OUTROS_CREDITOS' permanece
-- inalterada porque é usada pelos gateways, Caixa e conciliação.

ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS categoria_financeira_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.contas_receber'::regclass
      AND conname = 'contas_receber_categoria_financeira_id_fkey'
  ) THEN
    ALTER TABLE public.contas_receber
      ADD CONSTRAINT contas_receber_categoria_financeira_id_fkey
      FOREIGN KEY (categoria_financeira_id)
      REFERENCES public.categorias_financeiras(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_contas_receber_categoria_financeira
  ON public.contas_receber (categoria_financeira_id)
  WHERE categoria_financeira_id IS NOT NULL;

COMMENT ON COLUMN public.contas_receber.categoria_financeira_id IS
  'Subcategoria configurável do lançamento; para Outros Créditos deve apontar para tipo OUTRO_CREDITO.';

INSERT INTO public.categorias_financeiras (nome, tipo, descricao, status)
SELECT seed.nome, 'OUTRO_CREDITO', seed.descricao, 'ativo'
FROM (
  VALUES
    ('JUROS RECEBIDOS', 'JUROS, MULTAS E ENCARGOS RECEBIDOS'),
    ('RENDIMENTOS FINANCEIROS', 'RENDIMENTOS DE CONTAS E APLICAÇÕES'),
    ('REEMBOLSOS E DEVOLUÇÕES', 'VALORES RESTITUÍDOS À INSTITUIÇÃO'),
    ('OUTRAS ENTRADAS', 'DEMAIS ENTRADAS AVULSAS DE CAIXA')
) AS seed(nome, descricao)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.categorias_financeiras existing
  WHERE existing.tipo = 'OUTRO_CREDITO'
    AND upper(btrim(existing.nome)) = seed.nome
);

DROP FUNCTION IF EXISTS public.get_outros_creditos_summary(
  uuid,
  text,
  date,
  date
);

CREATE FUNCTION public.get_outros_creditos_summary(
  p_polo_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_due_start date DEFAULT NULL,
  p_due_end date DEFAULT NULL,
  p_categoria_id uuid DEFAULT NULL
)
RETURNS TABLE(
  pending_count bigint,
  received_count bigint,
  canceled_count bigint,
  overdue_count bigint,
  all_count bigint,
  pending_value numeric,
  received_value numeric,
  canceled_value numeric,
  overdue_value numeric,
  all_value numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH filtered AS (
    SELECT
      cr.status,
      cr.valor,
      cr.valor_pago,
      cr.data_vencimento
    FROM public.contas_receber cr
    LEFT JOIN public.parceiros p ON p.id = cr.cliente_id
    LEFT JOIN public.polos po ON po.id = cr.polo_id
    LEFT JOIN public.categorias_financeiras cf
      ON cf.id = cr.categoria_financeira_id
    WHERE cr.categoria = 'OUTROS_CREDITOS'
      AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
      AND (p_due_start IS NULL OR cr.data_vencimento >= p_due_start)
      AND (p_due_end IS NULL OR cr.data_vencimento <= p_due_end)
      AND (
        p_categoria_id IS NULL
        OR cr.categoria_financeira_id = p_categoria_id
      )
      AND (
        nullif(btrim(coalesce(p_search, '')), '') IS NULL
        OR cr.descricao ILIKE '%' || btrim(p_search) || '%'
        OR cf.nome ILIKE '%' || btrim(p_search) || '%'
        OR p.nome ILIKE '%' || btrim(p_search) || '%'
        OR p.cpf_cnpj ILIKE '%' || btrim(p_search) || '%'
        OR po.nome ILIKE '%' || btrim(p_search) || '%'
        OR po.cnpj ILIKE '%' || btrim(p_search) || '%'
        OR po.cidade ILIKE '%' || btrim(p_search) || '%'
        OR po.estado ILIKE '%' || btrim(p_search) || '%'
        OR cr.forma_pagamento::text ILIKE '%' || btrim(p_search) || '%'
        OR cr.asaas_status::text ILIKE '%' || btrim(p_search) || '%'
      )
  )
  SELECT
    count(*) FILTER (
      WHERE status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO')
    )::bigint,
    count(*) FILTER (WHERE status = 'PAGO')::bigint,
    count(*) FILTER (
      WHERE status IN ('CANCELADO', 'ESTORNADO')
    )::bigint,
    count(*) FILTER (
      WHERE status = 'VENCIDO'
        OR (status = 'PENDENTE' AND data_vencimento < current_date)
    )::bigint,
    count(*)::bigint,
    coalesce(sum(valor) FILTER (
      WHERE status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO')
    ), 0),
    coalesce(sum(coalesce(valor_pago, valor)) FILTER (
      WHERE status = 'PAGO'
    ), 0),
    coalesce(sum(valor) FILTER (
      WHERE status IN ('CANCELADO', 'ESTORNADO')
    ), 0),
    coalesce(sum(valor) FILTER (
      WHERE status = 'VENCIDO'
        OR (status = 'PENDENTE' AND data_vencimento < current_date)
    ), 0),
    coalesce(sum(coalesce(valor_pago, valor)), 0)
  FROM filtered;
$function$;

REVOKE ALL ON FUNCTION public.get_outros_creditos_summary(
  uuid,
  text,
  date,
  date,
  uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_outros_creditos_summary(
  uuid,
  text,
  date,
  date,
  uuid
) TO authenticated, service_role;
