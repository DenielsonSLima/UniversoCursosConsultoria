BEGIN;

-- Normaliza o contrato final usado pelo frontend e evita que a migration
-- anterior deixe overloads incompatíveis para o PostgREST.
CREATE TABLE IF NOT EXISTS public.historico_turma_financeira (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  matricula_id uuid REFERENCES public.matriculas(id) ON DELETE CASCADE,
  evento text NOT NULL,
  regra jsonb,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS historico_turma_financeira_turma_idx
  ON public.historico_turma_financeira (turma_id, created_at DESC);

CREATE INDEX IF NOT EXISTS historico_turma_financeira_matricula_idx
  ON public.historico_turma_financeira (matricula_id, created_at DESC);

ALTER TABLE public.turmas
  ADD COLUMN IF NOT EXISTS origem_financeira text DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS financeiro_herdado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS gerar_cobrancas_futuras boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sincronizar_asaas_futuro boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS obs_financeira_origem text;

UPDATE public.turmas
SET origem_financeira = COALESCE(origem_financeira, 'NORMAL'),
    financeiro_herdado = COALESCE(financeiro_herdado, false),
    gerar_cobrancas_futuras = COALESCE(gerar_cobrancas_futuras, false),
    sincronizar_asaas_futuro = COALESCE(sincronizar_asaas_futuro, true)
WHERE origem_financeira IS NULL
   OR financeiro_herdado IS NULL
   OR gerar_cobrancas_futuras IS NULL
   OR sincronizar_asaas_futuro IS NULL;

ALTER TABLE public.turmas
  ALTER COLUMN origem_financeira SET DEFAULT 'NORMAL',
  ALTER COLUMN origem_financeira SET NOT NULL,
  ALTER COLUMN financeiro_herdado SET DEFAULT false,
  ALTER COLUMN financeiro_herdado SET NOT NULL,
  ALTER COLUMN gerar_cobrancas_futuras SET DEFAULT false,
  ALTER COLUMN gerar_cobrancas_futuras SET NOT NULL,
  ALTER COLUMN sincronizar_asaas_futuro SET DEFAULT true,
  ALTER COLUMN sincronizar_asaas_futuro SET NOT NULL;

ALTER TABLE public.turmas
  DROP CONSTRAINT IF EXISTS turmas_origem_financeira_check;

ALTER TABLE public.turmas
  ADD CONSTRAINT turmas_origem_financeira_check
  CHECK (origem_financeira IN ('NORMAL', 'LEGADO'));

ALTER TABLE public.matriculas
  ADD COLUMN IF NOT EXISTS financeiro_herdado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS gerar_cobranca_inicial boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS gerar_cobranca_futura boolean,
  ADD COLUMN IF NOT EXISTS sincronizar_asaas boolean;

UPDATE public.matriculas
SET financeiro_herdado = COALESCE(financeiro_herdado, false),
    gerar_cobranca_inicial = COALESCE(gerar_cobranca_inicial, true)
WHERE financeiro_herdado IS NULL
   OR gerar_cobranca_inicial IS NULL;

ALTER TABLE public.matriculas
  ALTER COLUMN financeiro_herdado SET DEFAULT false,
  ALTER COLUMN financeiro_herdado SET NOT NULL,
  ALTER COLUMN gerar_cobranca_inicial SET DEFAULT true,
  ALTER COLUMN gerar_cobranca_inicial SET NOT NULL,
  ALTER COLUMN gerar_cobranca_futura DROP DEFAULT,
  ALTER COLUMN sincronizar_asaas DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.registrar_turma_financeiro_auditoria(
  p_matricula_id uuid,
  p_evento text,
  p_regra jsonb DEFAULT NULL,
  p_observacao text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_turma_id uuid;
BEGIN
  SELECT turma_id INTO v_turma_id
  FROM public.matriculas
  WHERE id = p_matricula_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.historico_turma_financeira (
    turma_id,
    matricula_id,
    evento,
    regra,
    observacao
  ) VALUES (
    v_turma_id,
    p_matricula_id,
    p_evento,
    p_regra,
    p_observacao
  );
END;
$$;

DROP FUNCTION IF EXISTS public.matricular_aluno_turma_financeiro(
  uuid, uuid, uuid, numeric, date, numeric, numeric, integer, boolean, boolean, boolean
);

DROP FUNCTION IF EXISTS public.matricular_aluno_turma_financeiro(
  uuid, uuid, text, text, text, date, uuid, boolean, boolean, boolean, boolean, numeric, numeric, text, text, text
);

DROP FUNCTION IF EXISTS public.get_pagamentos_irpf_aluno(uuid, int, uuid);
DROP FUNCTION IF EXISTS public.prever_geracao_cobrancas_futuras(uuid, date);
DROP FUNCTION IF EXISTS public.prever_geracao_cobrancas_futuras(uuid, date, date);

CREATE OR REPLACE FUNCTION public.resolver_flags_financeiras_turma_matricula(
  p_turma_id uuid,
  p_financeiro_herdado boolean DEFAULT NULL,
  p_gerar_cobranca_inicial boolean DEFAULT NULL,
  p_gerar_cobranca_futura boolean DEFAULT NULL,
  p_sincronizar_asaas boolean DEFAULT NULL
)
RETURNS TABLE(
  origem_financeira text,
  financeiro_herdado boolean,
  gerar_cobranca_inicial boolean,
  gerar_cobranca_futura boolean,
  sincronizar_asaas_futuro boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_turma public.turmas%ROWTYPE;
  v_financeiro_herdado boolean;
BEGIN
  SELECT * INTO v_turma
  FROM public.turmas
  WHERE id = p_turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma % não encontrada', p_turma_id;
  END IF;

  v_financeiro_herdado := COALESCE(
    p_financeiro_herdado,
    v_turma.financeiro_herdado,
    COALESCE(v_turma.origem_financeira, 'NORMAL') = 'LEGADO',
    false
  );

  RETURN QUERY
  SELECT
    COALESCE(v_turma.origem_financeira, 'NORMAL')::text,
    v_financeiro_herdado,
    COALESCE(
      p_gerar_cobranca_inicial,
      CASE
        WHEN v_financeiro_herdado OR COALESCE(v_turma.origem_financeira, 'NORMAL') = 'LEGADO' THEN false
        ELSE true
      END
    ),
    COALESCE(p_gerar_cobranca_futura, v_turma.gerar_cobrancas_futuras, false),
    COALESCE(p_sincronizar_asaas, v_turma.sincronizar_asaas_futuro, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolver_flags_financeiras_turma_matricula(p_matricula_id uuid)
RETURNS TABLE (
  turma_id uuid,
  origem_financeira text,
  financeiro_herdado boolean,
  gerar_cobranca_inicial boolean,
  gerar_cobranca_futura boolean,
  sincronizar_asaas boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.turma_id,
    flags.origem_financeira,
    flags.financeiro_herdado,
    flags.gerar_cobranca_inicial,
    flags.gerar_cobranca_futura,
    flags.sincronizar_asaas_futuro AS sincronizar_asaas
  FROM public.matriculas m
  CROSS JOIN LATERAL public.resolver_flags_financeiras_turma_matricula(
    m.turma_id,
    m.financeiro_herdado,
    m.gerar_cobranca_inicial,
    m.gerar_cobranca_futura,
    m.sincronizar_asaas
  ) flags
  WHERE m.id = p_matricula_id
$$;

CREATE OR REPLACE FUNCTION public.matricular_aluno_turma_financeiro(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_responsavel_id uuid DEFAULT NULL,
  p_valor_matricula numeric DEFAULT NULL,
  p_data_vencimento_matricula date DEFAULT NULL,
  p_valor_parcela numeric DEFAULT NULL,
  p_valor_rematricula numeric DEFAULT NULL,
  p_dia_vencimento integer DEFAULT NULL,
  p_financeiro_herdado boolean DEFAULT NULL,
  p_gerar_cobranca_inicial boolean DEFAULT NULL,
  p_gerar_cobranca_futura boolean DEFAULT NULL,
  p_sincronizar_asaas boolean DEFAULT NULL
)
RETURNS public.matriculas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula public.matriculas%ROWTYPE;
  v_flags record;
BEGIN
  SELECT * INTO v_flags
  FROM public.resolver_flags_financeiras_turma_matricula(
    p_turma_id,
    p_financeiro_herdado,
    p_gerar_cobranca_inicial,
    p_gerar_cobranca_futura,
    p_sincronizar_asaas
  );

  INSERT INTO public.matriculas (
    aluno_id,
    turma_id,
    status,
    valor_matricula_individual,
    valor_rematricula_individual,
    valor_parcela_individual,
    dia_vencimento_individual,
    data_primeiro_vencimento_financeiro,
    financeiro_herdado,
    gerar_cobranca_inicial,
    gerar_cobranca_futura,
    sincronizar_asaas
  )
  VALUES (
    p_aluno_id,
    p_turma_id,
    'ATIVO',
    p_valor_matricula,
    p_valor_rematricula,
    p_valor_parcela,
    p_dia_vencimento,
    COALESCE(p_data_vencimento_matricula, CURRENT_DATE),
    v_flags.financeiro_herdado,
    v_flags.gerar_cobranca_inicial,
    v_flags.gerar_cobranca_futura,
    v_flags.sincronizar_asaas_futuro
  )
  ON CONFLICT (aluno_id, turma_id) DO UPDATE
    SET status = 'ATIVO',
        valor_matricula_individual = EXCLUDED.valor_matricula_individual,
        valor_rematricula_individual = EXCLUDED.valor_rematricula_individual,
        valor_parcela_individual = EXCLUDED.valor_parcela_individual,
        dia_vencimento_individual = EXCLUDED.dia_vencimento_individual,
        data_primeiro_vencimento_financeiro = EXCLUDED.data_primeiro_vencimento_financeiro,
        financeiro_herdado = EXCLUDED.financeiro_herdado,
        gerar_cobranca_inicial = EXCLUDED.gerar_cobranca_inicial,
        gerar_cobranca_futura = EXCLUDED.gerar_cobranca_futura,
        sincronizar_asaas = EXCLUDED.sincronizar_asaas
  RETURNING * INTO v_matricula;

  PERFORM public.gerar_cobranca_matricula(v_matricula.id);

  PERFORM public.registrar_turma_financeiro_auditoria(
    v_matricula.id,
    'MATRICULA_FINANCEIRO_FLAGS',
    jsonb_build_object(
      'origem_financeira', v_flags.origem_financeira,
      'financeiro_herdado', v_flags.financeiro_herdado,
      'gerar_cobranca_inicial', v_flags.gerar_cobranca_inicial,
      'gerar_cobranca_futura', v_flags.gerar_cobranca_futura,
      'sincronizar_asaas', v_flags.sincronizar_asaas_futuro
    ),
    'Flags financeiras resolvidas no backend durante a matrícula.'
  );

  INSERT INTO public.matricula_movimentacoes (
    matricula_id,
    aluno_id,
    tipo,
    status_anterior,
    status_novo,
    turma_destino_id,
    motivo,
    responsavel_id
  ) VALUES (
    v_matricula.id,
    v_matricula.aluno_id,
    'MATRICULA',
    NULL,
    'ATIVO',
    v_matricula.turma_id,
    'Matricula realizada na turma com financeiro individual.',
    p_responsavel_id
  )
  ON CONFLICT DO NOTHING;

  RETURN v_matricula;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pagamentos_irpf_aluno(
  p_aluno_id uuid,
  p_ano int,
  p_turma_id uuid DEFAULT NULL
)
RETURNS TABLE(
  turma_id uuid,
  turma_nome text,
  matricula_id uuid,
  parcela_id uuid,
  status text,
  valor numeric,
  valor_pago numeric,
  data_pagamento date,
  data_vencimento date,
  numero_parcela int,
  total_parcelas int,
  asaas_invoice text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cr.turma_id,
    t.nome AS turma_nome,
    cr.matricula_id,
    cr.id AS parcela_id,
    cr.status,
    COALESCE(cr.valor, 0) AS valor,
    COALESCE(cr.valor_pago, cr.valor, 0) AS valor_pago,
    cr.data_pagamento::date,
    cr.data_vencimento::date,
    cr.parcela_numero AS numero_parcela,
    NULL::int AS total_parcelas,
    COALESCE(cr.asaas_invoice_url, cr.asaas_payment_id) AS asaas_invoice
  FROM public.contas_receber cr
  LEFT JOIN public.turmas t ON t.id = cr.turma_id
  WHERE cr.cliente_id = p_aluno_id
    AND cr.status = 'PAGO'
    AND cr.data_pagamento IS NOT NULL
    AND EXTRACT(YEAR FROM cr.data_pagamento::date) = p_ano
    AND (p_turma_id IS NULL OR cr.turma_id = p_turma_id)
  ORDER BY cr.data_pagamento DESC NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.prever_geracao_cobrancas_futuras(
  p_turma_id uuid,
  p_data_referencia date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  turma_id uuid,
  referencia date,
  gerar_cobrancas_futuras boolean,
  quantidade_prevista bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id AS turma_id,
    p_data_referencia AS referencia,
    COALESCE(t.gerar_cobrancas_futuras, false) AS gerar_cobrancas_futuras,
    CASE
      WHEN COALESCE(t.gerar_cobrancas_futuras, false) THEN GREATEST(COALESCE(t.qtd_parcelas, 0), 0)::bigint
      ELSE 0::bigint
    END AS quantidade_prevista
  FROM public.turmas t
  WHERE t.id = p_turma_id;
$$;

REVOKE EXECUTE ON FUNCTION public.resolver_flags_financeiras_turma_matricula(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolver_flags_financeiras_turma_matricula(uuid, boolean, boolean, boolean, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_pagamentos_irpf_aluno(uuid, int, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prever_geracao_cobrancas_futuras(uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.matricular_aluno_turma_financeiro(uuid, uuid, uuid, numeric, date, numeric, numeric, integer, boolean, boolean, boolean, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.resolver_flags_financeiras_turma_matricula(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolver_flags_financeiras_turma_matricula(uuid, boolean, boolean, boolean, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pagamentos_irpf_aluno(uuid, int, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prever_geracao_cobrancas_futuras(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.matricular_aluno_turma_financeiro(uuid, uuid, uuid, numeric, date, numeric, numeric, integer, boolean, boolean, boolean, boolean) TO authenticated, service_role;

COMMIT;
