BEGIN;

-- Ajusta defaults e comportamento padrão para turmas importadas/legadas
ALTER TABLE public.turmas
  ALTER COLUMN origem_financeira DROP DEFAULT,
  ALTER COLUMN origem_financeira SET DEFAULT 'NORMAL',
  ALTER COLUMN financeiro_herdado SET DEFAULT false,
  ALTER COLUMN gerar_cobrancas_futuras SET DEFAULT false,
  ALTER COLUMN sincronizar_asaas_futuro SET DEFAULT true,
  ALTER COLUMN obs_financeira_origem SET DEFAULT NULL;

UPDATE public.turmas
SET origem_financeira = COALESCE(origem_financeira, 'NORMAL')
WHERE origem_financeira IS NULL;

ALTER TABLE public.turmas
  ALTER COLUMN origem_financeira SET NOT NULL,
  ADD CONSTRAINT turmas_origem_financeira_ck CHECK (origem_financeira IN ('LEGADO', 'NORMAL'))
  NOT VALID;

UPDATE public.matriculas
SET financeiro_herdado = COALESCE(financeiro_herdado, false),
    gerar_cobranca_inicial = COALESCE(gerar_cobranca_inicial, true),
    gerar_cobranca_futura = CASE
      WHEN gerar_cobranca_futura IS NULL THEN NULL
      ELSE gerar_cobranca_futura
    END,
    sincronizar_asaas = sincronizar_asaas
WHERE financeiro_herdado IS DISTINCT FROM false
   OR gerar_cobranca_inicial IS DISTINCT FROM true
   OR gerar_cobranca_futura IS NOT NULL
   OR sincronizar_asaas IS NOT NULL;

ALTER TABLE public.matriculas
  ALTER COLUMN financeiro_herdado SET DEFAULT false,
  ALTER COLUMN gerar_cobranca_inicial SET DEFAULT true,
  ALTER COLUMN gerar_cobranca_futura DROP DEFAULT,
  ALTER COLUMN sincronizar_asaas DROP DEFAULT;

ALTER TABLE public.matriculas
  ADD CONSTRAINT matriculas_gerar_cobranca_futura_chk CHECK (
    gerar_cobranca_futura IS NULL OR gerar_cobranca_futura IN (true, false)
  )
  NOT VALID,
  ADD CONSTRAINT matriculas_sincronizar_asaas_chk CHECK (
    sincronizar_asaas IS NULL OR sincronizar_asaas IN (true, false)
  )
  NOT VALID;

-- Resolve regras financeiras com prioridade: flags da matrícula > flags da turma.
CREATE OR REPLACE FUNCTION public.resolver_flags_financeiras_turma_matricula(
  p_turma_id uuid,
  p_financeiro_herdado boolean DEFAULT false,
  p_gerar_cobranca_inicial boolean DEFAULT true,
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
AS $$
DECLARE
  v_turma_origem text;
  v_turma_financeiro_herdado boolean;
  v_turma_gerar_futuro boolean;
  v_turma_sync_asaas boolean;
BEGIN
  SELECT
    COALESCE(origem_financeira, 'NORMAL')::text,
    COALESCE(financeiro_herdado, false),
    COALESCE(gerar_cobrancas_futuras, false),
    COALESCE(sincronizar_asaas_futuro, true)
  INTO
    v_turma_origem,
    v_turma_financeiro_herdado,
    v_turma_gerar_futuro,
    v_turma_sync_asaas
  FROM public.turmas
  WHERE id = p_turma_id;

  IF v_turma_origem IS NULL THEN
    RAISE EXCEPTION 'Turma % não encontrada', p_turma_id;
  END IF;

  IF p_financeiro_herdado IS NOT NULL THEN
    p_financeiro_herdado := COALESCE(p_financeiro_herdado, false);
  ELSE
    p_financeiro_herdado := COALESCE(v_turma_financeiro_herdado, false);
  END IF;

  RETURN QUERY
  SELECT
    v_turma_origem::text AS origem_financeira,
    p_financeiro_herdado AS financeiro_herdado,
    CASE
      WHEN p_financeiro_herdado THEN FALSE
      ELSE COALESCE(p_gerar_cobranca_inicial, true)
    END AS gerar_cobranca_inicial,
    CASE
      WHEN p_financeiro_herdado THEN false
      WHEN p_gerar_cobranca_futura IS NULL THEN
        CASE WHEN v_turma_origem = 'LEGADO' THEN false ELSE v_turma_gerar_futuro END
      ELSE p_gerar_cobranca_futura
    END AS gerar_cobranca_futura,
    CASE
      WHEN p_sincronizar_asaas IS NULL THEN v_turma_sync_asaas ELSE p_sincronizar_asaas
    END AS sincronizar_asaas_futuro;
END;
$$;

-- Corrige e garante a assinatura de matrícula financeira com parâmetros de controle.
CREATE OR REPLACE FUNCTION public.matricular_aluno_turma_financeiro(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_modalidade text,
  p_forma_pagamento text,
  p_obs text DEFAULT NULL,
  p_data_matricula date DEFAULT now(),
  p_criado_por uuid DEFAULT auth.uid(),
  p_financeiro_herdado boolean DEFAULT false,
  p_gerar_cobranca_inicial boolean DEFAULT true,
  p_gerar_cobranca_futura boolean DEFAULT NULL,
  p_sincronizar_asaas boolean DEFAULT true,
  p_valor_matricula numeric DEFAULT NULL,
  p_desconto_matricula numeric DEFAULT NULL,
  p_nome_responsavel text DEFAULT NULL,
  p_email_responsavel text DEFAULT NULL,
  p_telefone_responsavel text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_flags record;
  v_matricula_id uuid;
  v_conta_id uuid;
BEGIN
  SELECT * INTO v_flags
  FROM public.resolver_flags_financeiras_turma_matricula(
    p_turma_id,
    p_financeiro_herdado,
    p_gerar_cobranca_inicial,
    p_gerar_cobranca_futura,
    p_sincronizar_asaas
  );

  IF v_flags IS NULL THEN
    RAISE EXCEPTION 'Não foi possível resolver regras de cobrança para a turma %', p_turma_id;
  END IF;

  INSERT INTO public.matriculas (
    aluno_id,
    turma_id,
    modalidade,
    forma_pagamento,
    obs,
    data_matricula,
    criado_por,
    financeiro_herdado,
    gerar_cobranca_inicial,
    gerar_cobranca_futura,
    sincronizar_asaas
  ) VALUES (
    p_aluno_id,
    p_turma_id,
    p_modalidade,
    p_forma_pagamento,
    p_obs,
    p_data_matricula,
    p_criado_por,
    COALESCE(v_flags.financeiro_herdado, false),
    COALESCE(v_flags.gerar_cobranca_inicial, true),
    COALESCE(v_flags.gerar_cobranca_futura, false),
    v_flags.sincronizar_asaas_futuro
  )
  RETURNING id INTO v_matricula_id;

  IF NOT COALESCE(v_flags.financeiro_herdado, false) AND COALESCE(v_flags.gerar_cobranca_inicial, true) THEN
    INSERT INTO public.contas_receber (
      aluno_id,
      turma_id,
      matricula_id,
      valor,
      data_vencimento,
      status,
      tipo,
      origem_financeira,
      origem_evento,
      gerar_cobranca_futura,
      sincronizar_asaas,
      created_by
    )
    SELECT
      p_aluno_id,
      p_turma_id,
      v_matricula_id,
      COALESCE(p_valor_matricula, t.valor),
      LEAST(
        (CURRENT_DATE + INTERVAL '7 days')::date,
        COALESCE(NULLIF(t.data_inicio::text, ''), to_char(p_data_matricula, 'YYYY-MM-DD'))::date
      ),
      'PENDENTE',
      'MATRICULA',
      v_flags.origem_financeira,
      'RPC_MATRICULA',
      COALESCE(v_flags.gerar_cobranca_futura, false),
      v_flags.sincronizar_asaas_futuro,
      p_criado_por
    FROM public.turmas t
    WHERE t.id = p_turma_id
    LIMIT 1;

    SELECT cr.id
    INTO v_conta_id
    FROM public.contas_receber cr
    WHERE cr.matricula_id = v_matricula_id
      AND cr.tipo = 'MATRICULA'
    ORDER BY cr.created_at DESC
    LIMIT 1;
  END IF;

  INSERT INTO public.historico_turma_financeira (
    matricula_id,
    turma_id,
    aluno_id,
    evento,
    detalhes,
    origem_financeira
  ) VALUES (
    v_matricula_id,
    p_turma_id,
    p_aluno_id,
    'vinculo_criado',
    jsonb_build_object(
      'financeiro_herdado', COALESCE(v_flags.financeiro_herdado, false),
      'gerar_cobranca_inicial', COALESCE(v_flags.gerar_cobranca_inicial, true),
      'gerar_cobranca_futura', COALESCE(v_flags.gerar_cobranca_futura, false),
      'sincronizar_asaas_futuro', v_flags.sincronizar_asaas_futuro,
      'conta_matricula_id', v_conta_id
    ),
    COALESCE(v_flags.origem_financeira, 'NORMAL')
  );

  RETURN v_matricula_id;
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
  data_pagamento date,
  data_vencimento date,
  numero_parcela int,
  total_parcelas int,
  asaas_invoice text
)
LANGUAGE sql
AS $$
  SELECT
    cr.turma_id,
    t.nome AS turma_nome,
    cr.matricula_id,
    cr.id AS parcela_id,
    cr.status,
    cr.valor,
    cr.data_pagamento,
    cr.data_vencimento,
    cr.numero_parcela,
    cr.total_parcelas,
    cr.asaas_id AS asaas_invoice
  FROM public.contas_receber cr
  LEFT JOIN public.turmas t ON t.id = cr.turma_id
  WHERE cr.aluno_id = p_aluno_id
    AND EXTRACT(YEAR FROM COALESCE(cr.data_pagamento, cr.created_at)) = p_ano
    AND cr.status = 'PAGO'
    AND (p_turma_id IS NULL OR cr.turma_id = p_turma_id)
  ORDER BY cr.data_pagamento DESC NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.prever_geracao_cobrancas_futuras(
  p_turma_id uuid,
  p_data_referencia date DEFAULT CURRENT_DATE,
  p_data_fim date DEFAULT (CURRENT_DATE + INTERVAL '365 day')
)
RETURNS TABLE(
  turma_id uuid,
  referencia date,
  gerar_cobrancas_futuras boolean,
  quantidade_prevista bigint
)
LANGUAGE sql
AS $$
  WITH turma AS (
    SELECT
      id,
      data_inicio,
      duracao_meses,
      COALESCE(origem_financeira, 'NORMAL') AS origem_financeira,
      COALESCE(gerar_cobrancas_futuras, false) AS gerar_cobrancas_futuras
    FROM public.turmas
    WHERE id = p_turma_id
  ),
  base AS (
    SELECT
      t.id AS turma_id,
      LEAST(GREATEST(t.data_inicio::date, p_data_referencia), COALESCE(p_data_fim, p_data_referencia)) AS referencia,
      t.gerar_cobrancas_futuras
    FROM turma t
  )
  SELECT
    b.turma_id,
    b.referencia,
    CASE
      WHEN b.gerar_cobrancas_futuras AND t.origem_financeira = 'LEGADO' THEN true
      WHEN t.origem_financeira = 'NORMAL' THEN t.gerar_cobrancas_futuras
      ELSE false
    END AS gerar_cobrancas_futuras,
    GREATEST(
      0,
      FLOOR(EXTRACT(MONTH FROM AGE(p_data_fim, b.referencia))::int) / 1
      + CASE WHEN EXTRACT(DAY FROM AGE(p_data_fim, b.referencia)) >= 0 THEN 1 ELSE 0 END
    )::bigint AS quantidade_prevista
  FROM base b
  CROSS JOIN turma t
  WHERE b.turma_id = p_turma_id;
$$;

GRANT EXECUTE ON FUNCTION public.resolver_flags_financeiras_turma_matricula(uuid, boolean, boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pagamentos_irpf_aluno(uuid, int, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prever_geracao_cobrancas_futuras(uuid, date, date) TO authenticated;

COMMIT;
