-- Mantem o escopo de alunos sincronizado com as turmas/matriculas.
-- Aluno nao deve ficar como "Todos os Polos" apenas por ter vindo de inscricao online.

CREATE OR REPLACE FUNCTION public.sync_aluno_polo_scope(
  p_aluno_id uuid,
  p_polo_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_aluno_id IS NULL OR p_polo_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.parceiros p
  SET
    polo_id = COALESCE(p.polo_id, p_polo_id),
    polo_ids = (
      SELECT COALESCE(array_agg(DISTINCT scoped_polo_id ORDER BY scoped_polo_id), ARRAY[]::uuid[])
      FROM unnest(
        COALESCE(p.polo_ids, ARRAY[]::uuid[])
        || ARRAY[p_polo_id]
        || CASE WHEN p.polo_id IS NULL THEN ARRAY[]::uuid[] ELSE ARRAY[p.polo_id] END
      ) AS scoped(scoped_polo_id)
      WHERE scoped_polo_id IS NOT NULL
    ),
    updated_at = now()
  WHERE p.id = p_aluno_id
    AND p.tipo = 'Aluno';
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_aluno_polo_scope_from_matricula()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_polo_id uuid;
BEGIN
  SELECT t.polo_id
    INTO v_polo_id
    FROM public.turmas t
    WHERE t.id = NEW.turma_id;

  PERFORM public.sync_aluno_polo_scope(NEW.aluno_id, v_polo_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_aluno_polo_scope_on_matricula ON public.matriculas;
CREATE TRIGGER trg_sync_aluno_polo_scope_on_matricula
AFTER INSERT OR UPDATE OF aluno_id, turma_id, status ON public.matriculas
FOR EACH ROW
EXECUTE FUNCTION public.sync_aluno_polo_scope_from_matricula();

WITH enrollment_scope AS (
  SELECT
    m.aluno_id,
    COALESCE(
      t.polo_id,
      CASE
        WHEN upper(COALESCE(c.modalidade, '')) = 'EAD'
          THEN '44444444-4444-4444-4444-444444444444'::uuid
        ELSE NULL::uuid
      END
    ) AS polo_id,
    MIN(COALESCE(m.data_matricula, now())) AS first_seen_at
  FROM public.matriculas m
  JOIN public.turmas t ON t.id = m.turma_id
  LEFT JOIN public.cursos c ON c.id = t.curso_id
  JOIN public.parceiros p ON p.id = m.aluno_id
  WHERE p.tipo = 'Aluno'
  GROUP BY m.aluno_id, COALESCE(
    t.polo_id,
    CASE
      WHEN upper(COALESCE(c.modalidade, '')) = 'EAD'
        THEN '44444444-4444-4444-4444-444444444444'::uuid
      ELSE NULL::uuid
    END
  )
),
valid_scope AS (
  SELECT *
  FROM enrollment_scope
  WHERE polo_id IS NOT NULL
),
aluno_scope AS (
  SELECT
    aluno_id,
    (array_agg(polo_id ORDER BY first_seen_at, polo_id))[1] AS primary_polo_id,
    array_agg(DISTINCT polo_id ORDER BY polo_id) AS enrollment_polo_ids
  FROM valid_scope
  GROUP BY aluno_id
)
UPDATE public.parceiros p
SET
  polo_id = COALESCE(p.polo_id, s.primary_polo_id),
  polo_ids = (
    SELECT COALESCE(array_agg(DISTINCT scoped_polo_id ORDER BY scoped_polo_id), ARRAY[]::uuid[])
    FROM unnest(
      COALESCE(p.polo_ids, ARRAY[]::uuid[])
      || s.enrollment_polo_ids
      || CASE
        WHEN p.polo_id IS NULL THEN ARRAY[s.primary_polo_id]
        ELSE ARRAY[p.polo_id]
      END
    ) AS scoped(scoped_polo_id)
    WHERE scoped_polo_id IS NOT NULL
  ),
  updated_at = now()
FROM aluno_scope s
WHERE p.id = s.aluno_id
  AND p.tipo = 'Aluno';

CREATE OR REPLACE FUNCTION public.buscar_aluno_global_para_vinculo(p_identifier text)
RETURNS TABLE (
  id uuid,
  nome text,
  cpf_masked text,
  email_masked text,
  status text,
  polo_id uuid,
  polo_ids uuid[],
  ja_vinculado_polo boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_identifier text := trim(COALESCE(p_identifier, ''));
  v_digits text := regexp_replace(COALESCE(p_identifier, ''), '[^0-9]', '', 'g');
  v_email text := lower(trim(COALESCE(p_identifier, '')));
  v_allowed_polos uuid[] := COALESCE(public.gestor_allowed_polo_ids(), ARRAY[]::uuid[]);
  v_can_lookup boolean := public.gestor_has_all_polos()
    OR cardinality(COALESCE(public.gestor_allowed_polo_ids(), ARRAY[]::uuid[])) > 0;
BEGIN
  IF NOT v_can_lookup
     OR NOT (public.gestor_has_module('parceiros') OR public.gestor_has_module('gestao')) THEN
    RAISE EXCEPTION 'Gestor sem permissao para localizar aluno.';
  END IF;

  IF length(v_digits) < 11 AND position('@' IN v_email) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH matches AS (
    SELECT
      p.*,
      regexp_replace(COALESCE(p.cpf_cnpj, ''), '[^0-9]', '', 'g') AS cpf_digits
    FROM public.parceiros p
    WHERE p.tipo = 'Aluno'
      AND (
        (length(v_digits) >= 11 AND regexp_replace(COALESCE(p.cpf_cnpj, ''), '[^0-9]', '', 'g') = v_digits)
        OR (position('@' IN v_email) > 0 AND lower(COALESCE(p.email, '')) = v_email)
      )
    ORDER BY p.created_at DESC NULLS LAST
    LIMIT 5
  )
  SELECT
    m.id,
    m.nome,
    CASE
      WHEN length(m.cpf_digits) = 11
        THEN '***.' || substr(m.cpf_digits, 4, 3) || '.' || substr(m.cpf_digits, 7, 3) || '-**'
      WHEN length(m.cpf_digits) = 14
        THEN substr(m.cpf_digits, 1, 2) || '.***.***/' || substr(m.cpf_digits, 9, 4) || '-**'
      ELSE NULL::text
    END AS cpf_masked,
    CASE
      WHEN nullif(m.email, '') IS NULL THEN NULL::text
      ELSE left(lower(m.email), 1) || '***@' || split_part(lower(m.email), '@', 2)
    END AS email_masked,
    m.status,
    m.polo_id,
    COALESCE(m.polo_ids, ARRAY[]::uuid[]) AS polo_ids,
    (
      public.gestor_has_all_polos()
      OR m.polo_id = ANY(v_allowed_polos)
      OR EXISTS (
        SELECT 1
        FROM unnest(COALESCE(m.polo_ids, ARRAY[]::uuid[])) AS scoped(scoped_polo_id)
        WHERE scoped.scoped_polo_id = ANY(v_allowed_polos)
      )
    ) AS ja_vinculado_polo
  FROM matches m;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.buscar_aluno_global_para_vinculo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_aluno_global_para_vinculo(text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.sync_aluno_polo_scope(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_aluno_polo_scope(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.matricular_aluno_turma(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_responsavel_id uuid DEFAULT NULL::uuid
)
RETURNS public.matriculas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v public.matriculas%ROWTYPE;
  v_turma public.turmas%ROWTYPE;
BEGIN
  SELECT * INTO v_turma
  FROM public.turmas
  WHERE id = p_turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma nao encontrada.';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.can_write_turma(p_turma_id) THEN
    RAISE EXCEPTION 'Gestor sem permissao para matricular nesta turma.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.parceiros p
    WHERE p.id = p_aluno_id
      AND p.tipo = 'Aluno'
  ) THEN
    RAISE EXCEPTION 'Aluno nao encontrado.';
  END IF;

  INSERT INTO public.matriculas(aluno_id, turma_id, status)
  VALUES(p_aluno_id, p_turma_id, 'ATIVO')
  ON CONFLICT(aluno_id, turma_id) DO UPDATE
    SET status = 'ATIVO'
  RETURNING * INTO v;

  PERFORM public.sync_aluno_polo_scope(v.aluno_id, v_turma.polo_id);

  INSERT INTO public.matricula_movimentacoes(
    matricula_id,
    aluno_id,
    tipo,
    status_anterior,
    status_novo,
    turma_destino_id,
    motivo,
    responsavel_id
  )
  VALUES(
    v.id,
    v.aluno_id,
    'MATRICULA',
    NULL,
    'ATIVO',
    v.turma_id,
    'Matricula realizada na turma.',
    p_responsavel_id
  )
  ON CONFLICT DO NOTHING;

  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.matricular_aluno_turma_financeiro(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_responsavel_id uuid DEFAULT NULL::uuid,
  p_valor_matricula numeric DEFAULT NULL::numeric,
  p_data_vencimento_matricula date DEFAULT NULL::date,
  p_valor_parcela numeric DEFAULT NULL::numeric,
  p_valor_rematricula numeric DEFAULT NULL::numeric,
  p_dia_vencimento integer DEFAULT NULL::integer,
  p_financeiro_herdado boolean DEFAULT NULL::boolean,
  p_gerar_cobranca_inicial boolean DEFAULT NULL::boolean,
  p_gerar_cobranca_futura boolean DEFAULT NULL::boolean,
  p_sincronizar_asaas boolean DEFAULT NULL::boolean
)
RETURNS public.matriculas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.is_financeiro_for_polo(v_turma.polo_id) THEN
    RAISE EXCEPTION 'Apenas gestor autorizado pode matricular aluno com financeiro nesta turma.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.parceiros p
    WHERE p.id = p_aluno_id
      AND p.tipo = 'Aluno'
  ) THEN
    RAISE EXCEPTION 'Aluno nao encontrado.';
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

  PERFORM public.sync_aluno_polo_scope(v_matricula.aluno_id, v_turma.polo_id);
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

CREATE OR REPLACE FUNCTION public.ead_matricular_aluno_manual(
  p_turma_id uuid,
  p_aluno_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_turma record;
  v_matricula record;
BEGIN
  SELECT t.id, t.curso_id, t.polo_id, c.modalidade
  INTO v_turma
  FROM public.turmas t
  JOIN public.cursos c ON c.id = t.curso_id
  WHERE t.id = p_turma_id;

  IF NOT FOUND OR v_turma.modalidade <> 'EAD' THEN
    RAISE EXCEPTION 'Turma EAD nao encontrada';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.can_write_turma(p_turma_id) THEN
    RAISE EXCEPTION 'Gestor sem permissao para matricular nesta turma EAD.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.parceiros WHERE id = p_aluno_id AND tipo = 'Aluno') THEN
    RAISE EXCEPTION 'Aluno nao encontrado';
  END IF;

  INSERT INTO public.matriculas (aluno_id, turma_id, status)
  VALUES (p_aluno_id, p_turma_id, 'ATIVO')
  ON CONFLICT (aluno_id, turma_id) DO UPDATE
    SET status = 'ATIVO'
  RETURNING * INTO v_matricula;

  PERFORM public.sync_aluno_polo_scope(p_aluno_id, v_turma.polo_id);
  PERFORM public.ead_get_aluno_progress(p_aluno_id, v_turma.curso_id);

  RETURN jsonb_build_object(
    'success', true,
    'matriculaId', v_matricula.id,
    'status', v_matricula.status
  );
END;
$$;
