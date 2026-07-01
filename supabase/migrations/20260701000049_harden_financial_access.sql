-- Blindagem de acesso financeiro: RLS, RPCs e execucao direta de rotinas automaticas.

-- ---------------------------------------------------------------------------
-- RLS: categorias financeiras e despesas
-- ---------------------------------------------------------------------------
ALTER TABLE public.categorias_financeiras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas_lancamentos ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_financeiro_operador()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema u
    WHERE lower(u.email) = public.auth_email()
      AND lower(coalesce(u.status, '')) IN ('ativo', 'active')
      AND lower(coalesce(u.perfil, '')) IN ('gestor', 'financeiro')
  );
$$;

CREATE OR REPLACE FUNCTION public.financeiro_polo_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN u.context ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN u.context::uuid
    ELSE NULL::uuid
  END
  FROM public.usuarios_sistema u
  WHERE lower(u.email) = public.auth_email()
    AND lower(coalesce(u.status, '')) IN ('ativo', 'active')
    AND lower(coalesce(u.perfil, '')) IN ('gestor', 'financeiro')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_financeiro_global()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema u
    LEFT JOIN public.polos p
      ON p.id = CASE
        WHEN u.context ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN u.context::uuid
        ELSE NULL::uuid
      END
    WHERE lower(u.email) = public.auth_email()
      AND lower(coalesce(u.status, '')) IN ('ativo', 'active')
      AND lower(coalesce(u.perfil, '')) IN ('gestor', 'financeiro')
      AND (
        lower(coalesce(u.context, '')) = 'global'
        OR coalesce(p.is_matriz, false) = true
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_financeiro_for_polo(p_polo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_financeiro_global()
    OR (
      p_polo_id IS NOT NULL
      AND public.is_financeiro_operador()
      AND public.financeiro_polo_id() = p_polo_id
    );
$$;

CREATE OR REPLACE FUNCTION public.is_parceiro_in_financeiro_scope(
  p_parceiro_id uuid,
  p_polo_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_financeiro_global()
    OR EXISTS (
      SELECT 1
      FROM public.parceiros p
      WHERE p.id = p_parceiro_id
        AND p_polo_id IS NOT NULL
        AND (
          p.polo_id = p_polo_id
          OR p_polo_id = ANY(coalesce(p.polo_ids, ARRAY[]::uuid[]))
        )
        AND public.financeiro_polo_id() = p_polo_id
    );
$$;

DROP POLICY IF EXISTS "Acesso total categorias_financeiras" ON public.categorias_financeiras;
DROP POLICY IF EXISTS "portal_categorias_financeiras_gestor_read" ON public.categorias_financeiras;
DROP POLICY IF EXISTS "portal_categorias_financeiras_global_write" ON public.categorias_financeiras;

CREATE POLICY "portal_categorias_financeiras_gestor_read"
  ON public.categorias_financeiras
  FOR SELECT
  TO authenticated
  USING (public.is_financeiro_operador());

CREATE POLICY "portal_categorias_financeiras_global_write"
  ON public.categorias_financeiras
  FOR ALL
  TO authenticated
  USING (public.is_financeiro_global())
  WITH CHECK (public.is_financeiro_global());

DROP POLICY IF EXISTS "Acesso total despesas_lancamentos" ON public.despesas_lancamentos;
DROP POLICY IF EXISTS "portal_despesas_lancamentos_gestor_select" ON public.despesas_lancamentos;
DROP POLICY IF EXISTS "portal_despesas_lancamentos_gestor_insert" ON public.despesas_lancamentos;
DROP POLICY IF EXISTS "portal_despesas_lancamentos_gestor_update" ON public.despesas_lancamentos;
DROP POLICY IF EXISTS "portal_despesas_lancamentos_gestor_delete" ON public.despesas_lancamentos;

CREATE POLICY "portal_despesas_lancamentos_gestor_select"
  ON public.despesas_lancamentos
  FOR SELECT
  TO authenticated
  USING (public.is_financeiro_for_polo(polo_id));

CREATE POLICY "portal_despesas_lancamentos_gestor_insert"
  ON public.despesas_lancamentos
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_financeiro_for_polo(polo_id));

CREATE POLICY "portal_despesas_lancamentos_gestor_update"
  ON public.despesas_lancamentos
  FOR UPDATE
  TO authenticated
  USING (public.is_financeiro_for_polo(polo_id))
  WITH CHECK (public.is_financeiro_for_polo(polo_id));

CREATE POLICY "portal_despesas_lancamentos_gestor_delete"
  ON public.despesas_lancamentos
  FOR DELETE
  TO authenticated
  USING (public.is_financeiro_for_polo(polo_id));

-- ---------------------------------------------------------------------------
-- RPC: extrato financeiro do aluno com autorizacao interna
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_aluno_extrato_financeiro(p_matricula_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH matricula_base AS (
  SELECT
    m.id,
    m.status,
    m.data_matricula,
    p.nome AS aluno_nome,
    p.cpf_cnpj AS aluno_cpf,
    t.nome AS turma_nome,
    t.codigo AS turma_codigo,
    t.polo_id,
    c.nome AS curso_nome,
    po.nome AS polo_nome
  FROM public.matriculas m
  LEFT JOIN public.parceiros p ON p.id = m.aluno_id
  LEFT JOIN public.turmas t ON t.id = m.turma_id
  LEFT JOIN public.cursos c ON c.id = t.curso_id
  LEFT JOIN public.polos po ON po.id = t.polo_id
  WHERE m.id = p_matricula_id
    AND (
      COALESCE(auth.role(), '') = 'service_role'
      OR m.aluno_id = public.current_aluno_id()
      OR public.is_financeiro_for_polo(t.polo_id)
    )
), recebiveis AS (
  SELECT
    cr.id,
    cr.descricao,
    cr.valor,
    cr.valor_pago,
    cr.data_vencimento,
    cr.data_pagamento,
    cr.status,
    cr.forma_pagamento,
    cr.origem_pagamento,
    cr.tipo_lancamento,
    cr.parcela_numero,
    cr.asaas_status,
    cr.asaas_invoice_url,
    cr.asaas_payment_id,
    cr.created_at
  FROM public.contas_receber cr
  WHERE cr.matricula_id = p_matricula_id
    AND EXISTS (SELECT 1 FROM matricula_base)
  ORDER BY cr.data_vencimento ASC, cr.created_at ASC
), totais AS (
  SELECT
    COALESCE(SUM(valor), 0)::numeric AS total,
    COALESCE(SUM(CASE WHEN status = 'PAGO' THEN COALESCE(valor_pago, valor) ELSE 0 END), 0)::numeric AS recebido,
    COALESCE(SUM(CASE WHEN status IN ('PENDENTE', 'VENCIDO') THEN valor ELSE 0 END), 0)::numeric AS pendente,
    COALESCE(SUM(CASE WHEN status = 'VENCIDO' THEN valor ELSE 0 END), 0)::numeric AS vencido,
    COUNT(*) FILTER (WHERE status = 'PAGO')::integer AS pagos,
    COUNT(*) FILTER (WHERE status IN ('PENDENTE', 'VENCIDO'))::integer AS pendentes
  FROM recebiveis
)
SELECT jsonb_build_object(
  'matriculaId', mb.id,
  'dataMatricula', mb.data_matricula,
  'poloId', mb.polo_id,
  'alunoNome', COALESCE(mb.aluno_nome, 'Aluno'),
  'alunoCpf', COALESCE(mb.aluno_cpf, ''),
  'turmaNome', COALESCE(mb.turma_nome, mb.turma_codigo, ''),
  'cursoNome', COALESCE(mb.curso_nome, ''),
  'poloNome', COALESCE(mb.polo_nome, ''),
  'statusMatricula', mb.status,
  'total', t.total,
  'recebido', t.recebido,
  'pendente', t.pendente,
  'vencido', t.vencido,
  'pagos', t.pagos,
  'pendentes', t.pendentes,
  'recebiveis', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM recebiveis r), '[]'::jsonb)
)
FROM matricula_base mb
CROSS JOIN totais t;
$$;

REVOKE EXECUTE ON FUNCTION public.get_aluno_extrato_financeiro(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_aluno_extrato_financeiro(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC: IRPF do aluno com autorizacao interna
-- ---------------------------------------------------------------------------
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
    AND (
      COALESCE(auth.role(), '') = 'service_role'
      OR p_aluno_id = public.current_aluno_id()
      OR public.is_financeiro_for_polo(cr.polo_id)
    )
    AND cr.status = 'PAGO'
    AND cr.data_pagamento IS NOT NULL
    AND EXTRACT(YEAR FROM cr.data_pagamento::date) = p_ano
    AND (p_turma_id IS NULL OR cr.turma_id = p_turma_id)
  ORDER BY cr.data_pagamento DESC NULLS LAST;
$$;

REVOKE EXECUTE ON FUNCTION public.get_pagamentos_irpf_aluno(uuid, int, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pagamentos_irpf_aluno(uuid, int, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC: matricula financeira so por gestor do polo ou service_role
-- ---------------------------------------------------------------------------
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
  v_turma public.turmas%ROWTYPE;
BEGIN
  SELECT * INTO v_turma
  FROM public.turmas
  WHERE id = p_turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma nao encontrada.';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.is_financeiro_for_polo(v_turma.polo_id) THEN
    RAISE EXCEPTION 'Apenas gestor autorizado pode matricular aluno com financeiro nesta turma.';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.is_parceiro_in_financeiro_scope(p_aluno_id, v_turma.polo_id) THEN
    RAISE EXCEPTION 'Aluno fora do escopo financeiro do polo.';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND p_responsavel_id IS NOT NULL
     AND NOT public.is_parceiro_in_financeiro_scope(p_responsavel_id, v_turma.polo_id) THEN
    RAISE EXCEPTION 'Responsavel financeiro fora do escopo do polo.';
  END IF;

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
    'Flags financeiras resolvidas no backend durante a matricula.'
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

DROP FUNCTION IF EXISTS public.matricular_aluno_turma_financeiro(uuid, uuid, uuid, numeric, date, numeric, numeric, integer);
DROP FUNCTION IF EXISTS public.matricular_aluno_turma_financeiro(uuid, uuid, uuid, numeric, date, numeric, numeric, integer, boolean, boolean, boolean);

REVOKE EXECUTE ON FUNCTION public.matricular_aluno_turma_financeiro(uuid, uuid, uuid, numeric, date, numeric, numeric, integer, boolean, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.matricular_aluno_turma_financeiro(uuid, uuid, uuid, numeric, date, numeric, numeric, integer, boolean, boolean, boolean, boolean) TO authenticated, service_role;

-- Rotinas automaticas de ciclo devem ser chamadas por trigger/funcoes internas,
-- nao diretamente pelo cliente autenticado.
REVOKE EXECUTE ON FUNCTION public.gerar_cobranca_matricula(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gerar_parcelas_matricula(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gerar_rematricula_apos_parcelas(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gerar_ciclo_financeiro_apos_pagamento() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolver_flags_financeiras_turma_matricula(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolver_flags_financeiras_turma_matricula(uuid, boolean, boolean, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_despesas_summary(text, uuid, uuid, text, date, date, text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.gerar_cobranca_matricula(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gerar_parcelas_matricula(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gerar_rematricula_apos_parcelas(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gerar_ciclo_financeiro_apos_pagamento() TO service_role;
GRANT EXECUTE ON FUNCTION public.resolver_flags_financeiras_turma_matricula(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolver_flags_financeiras_turma_matricula(uuid, boolean, boolean, boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_despesas_summary(text, uuid, uuid, text, date, date, text, uuid) TO authenticated, service_role;
