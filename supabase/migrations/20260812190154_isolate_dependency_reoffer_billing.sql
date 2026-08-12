BEGIN;

-- A disciplina refeita é uma cobrança avulsa: seus encargos não pertencem à
-- turma de reoferta nem à matrícula técnica de origem.
ALTER TABLE public.politicas_cobranca_dependencia
  ADD COLUMN IF NOT EXISTS desconto_pontualidade numeric(12, 2),
  ADD COLUMN IF NOT EXISTS juros_atraso_percentual numeric(8, 4),
  ADD COLUMN IF NOT EXISTS multa_atraso_percentual numeric(8, 4);

UPDATE public.politicas_cobranca_dependencia
SET
  desconto_pontualidade = COALESCE(desconto_pontualidade, 19.90),
  juros_atraso_percentual = COALESCE(juros_atraso_percentual, 1.0000),
  multa_atraso_percentual = COALESCE(multa_atraso_percentual, 2.0000)
WHERE desconto_pontualidade IS NULL
   OR juros_atraso_percentual IS NULL
   OR multa_atraso_percentual IS NULL;

ALTER TABLE public.politicas_cobranca_dependencia
  ALTER COLUMN desconto_pontualidade SET DEFAULT 19.90,
  ALTER COLUMN desconto_pontualidade SET NOT NULL,
  ALTER COLUMN juros_atraso_percentual SET DEFAULT 1.0000,
  ALTER COLUMN juros_atraso_percentual SET NOT NULL,
  ALTER COLUMN multa_atraso_percentual SET DEFAULT 2.0000,
  ALTER COLUMN multa_atraso_percentual SET NOT NULL,
  DROP CONSTRAINT IF EXISTS politicas_dependencia_desconto_check,
  DROP CONSTRAINT IF EXISTS politicas_dependencia_juros_check,
  DROP CONSTRAINT IF EXISTS politicas_dependencia_multa_check,
  ADD CONSTRAINT politicas_dependencia_desconto_check
    CHECK (desconto_pontualidade >= 0),
  ADD CONSTRAINT politicas_dependencia_juros_check
    CHECK (juros_atraso_percentual >= 0 AND juros_atraso_percentual < 100),
  ADD CONSTRAINT politicas_dependencia_multa_check
    CHECK (multa_atraso_percentual >= 0 AND multa_atraso_percentual < 100);

COMMENT ON COLUMN public.politicas_cobranca_dependencia.desconto_pontualidade IS
  'Desconto fixo exclusivo da cobrança avulsa da disciplina refeita.';
COMMENT ON COLUMN public.politicas_cobranca_dependencia.juros_atraso_percentual IS
  'Juros mensais exclusivos da cobrança avulsa da disciplina refeita.';
COMMENT ON COLUMN public.politicas_cobranca_dependencia.multa_atraso_percentual IS
  'Multa percentual única exclusiva da cobrança avulsa da disciplina refeita.';

-- A política continua versionada: termos financeiros não podem ser alterados
-- retroativamente em uma versão já usada por uma tentativa.
CREATE OR REPLACE FUNCTION internal_academic.protect_dependency_policy_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Políticas versionadas de dependência não podem ser excluídas.'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.codigo IS DISTINCT FROM NEW.codigo
    OR OLD.versao IS DISTINCT FROM NEW.versao
    OR OLD.curso_id IS DISTINCT FROM NEW.curso_id
    OR OLD.polo_id IS DISTINCT FROM NEW.polo_id
    OR OLD.disciplina_id IS DISTINCT FROM NEW.disciplina_id
    OR OLD.carga_horaria_minima IS DISTINCT FROM NEW.carga_horaria_minima
    OR OLD.carga_horaria_maxima IS DISTINCT FROM NEW.carga_horaria_maxima
    OR OLD.multiplicador_parcela IS DISTINCT FROM NEW.multiplicador_parcela
    OR OLD.desconto_pontualidade IS DISTINCT FROM NEW.desconto_pontualidade
    OR OLD.juros_atraso_percentual IS DISTINCT FROM NEW.juros_atraso_percentual
    OR OLD.multa_atraso_percentual IS DISTINCT FROM NEW.multa_atraso_percentual
    OR OLD.vigencia_inicio IS DISTINCT FROM NEW.vigencia_inicio
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
    OR OLD.created_by IS DISTINCT FROM NEW.created_by
    OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
  THEN
    RAISE EXCEPTION 'Crie uma nova versão para alterar uma política de dependência.'
      USING ERRCODE = '55000';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION internal_academic.protect_dependency_policy_version()
  FROM PUBLIC, anon, authenticated;

-- A prévia canônica fixa valor, descrição neutra e encargos antes de qualquer
-- emissão bancária. A base continua sendo a matrícula de origem somente para
-- calcular o valor da disciplina; nunca para gerar parcelas ou encargos.
CREATE OR REPLACE FUNCTION internal_academic.resolve_dependency_charge(
  p_matricula_id uuid,
  p_disciplina_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_failure jsonb;
  v_policy public.politicas_cobranca_dependencia%ROWTYPE;
  v_base numeric;
  v_value numeric;
  v_description text;
BEGIN
  v_failure :=
    internal_academic.get_terminal_dependency_failure(
      p_matricula_id,
      p_disciplina_id
    );

  IF v_failure IS NULL THEN
    RAISE EXCEPTION
      'A disciplina não possui reprovação terminal em diário totalmente fechado.'
      USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(m.valor_parcela_individual, t.valor_parcela)
  INTO v_base
  FROM public.matriculas m
  JOIN public.turmas t ON t.id = m.turma_id
  WHERE m.id = p_matricula_id;

  IF coalesce(v_base, 0) <= 0 THEN
    RAISE EXCEPTION 'A matrícula não possui valor-base de parcela válido.'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.*
  INTO v_policy
  FROM public.politicas_cobranca_dependencia p
  WHERE p.status = 'ATIVA'
    AND p.vigencia_inicio
      <= pg_catalog.timezone('America/Maceio', now())::date
    AND (
      p.vigencia_fim IS NULL
      OR p.vigencia_fim
        >= pg_catalog.timezone('America/Maceio', now())::date
    )
    AND (
      p.curso_id IS NULL
      OR p.curso_id = (v_failure->>'cursoId')::uuid
    )
    AND (
      p.polo_id IS NULL
      OR p.polo_id = (v_failure->>'poloId')::uuid
    )
    AND (
      p.disciplina_id IS NULL
      OR p.disciplina_id = p_disciplina_id
    )
    AND (v_failure->>'cargaHoraria')::integer >= p.carga_horaria_minima
    AND (
      p.carga_horaria_maxima IS NULL
      OR (v_failure->>'cargaHoraria')::integer <= p.carga_horaria_maxima
    )
  ORDER BY
    (p.disciplina_id IS NOT NULL) DESC,
    (p.curso_id IS NOT NULL) DESC,
    (p.polo_id IS NOT NULL) DESC,
    p.vigencia_inicio DESC,
    p.versao DESC
  LIMIT 1;

  IF v_policy.id IS NULL THEN
    RAISE EXCEPTION
      'Nenhuma política ativa cobre a carga horária da disciplina.'
      USING ERRCODE = '22023';
  END IF;

  v_value := round(v_base * v_policy.multiplicador_parcela, 2);
  IF v_value <= 0 THEN
    RAISE EXCEPTION 'O valor da cobrança de dependência deve ser positivo.'
      USING ERRCODE = '22023';
  END IF;

  IF v_policy.desconto_pontualidade > 0
    AND v_policy.desconto_pontualidade >= v_value
  THEN
    RAISE EXCEPTION
      'O desconto da dependência deve ser menor que o valor cobrado. Ajuste a regra da disciplina.'
      USING ERRCODE = '22023';
  END IF;

  v_description := 'Disciplina: ' || coalesce(
    nullif(btrim(v_failure->>'disciplinaNome'), ''),
    'Disciplina'
  );

  RETURN v_failure || jsonb_build_object(
    'politicaId', v_policy.id,
    'politicaCodigo', v_policy.codigo,
    'politicaVersao', v_policy.versao,
    'valorParcelaBase', v_base,
    'multiplicador', v_policy.multiplicador_parcela,
    'valorCobrado', v_value,
    'descricaoCobranca', v_description,
    'financeiro', jsonb_build_object(
      'origem', 'DEPENDENCIA',
      'descontoPontualidade', v_policy.desconto_pontualidade,
      'jurosAtrasoPercentual', v_policy.juros_atraso_percentual,
      'multaAtrasoPercentual', v_policy.multa_atraso_percentual,
      'aplicarDesconto', v_policy.desconto_pontualidade > 0,
      'aplicarMultaJuros', (
        v_policy.juros_atraso_percentual > 0
        OR v_policy.multa_atraso_percentual > 0
      ),
      'diasBaixaDevolucao', 60,
      'instrucaoBoleto',
        'SR.(A) CAIXA: NÃO RECEBER ESTE TÍTULO APÓS 60 (SESSENTA) DIAS DO VENCIMENTO.'
    ),
    'regra', CASE
      WHEN (v_failure->>'cargaHoraria')::integer <= 40
        THEN 'ATE_40H_MEIA_PARCELA'
      ELSE 'ACIMA_40H_UMA_PARCELA'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION internal_academic.resolve_dependency_charge(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- Configuração por disciplina: cria sempre uma nova versão e mantém os
-- encargos separados do formulário financeiro da turma técnica.
CREATE OR REPLACE FUNCTION
  public.configurar_politica_dependencia_disciplina_financeira_secure(
    p_polo_id uuid,
    p_disciplina_id uuid,
    p_multiplicador_parcela numeric,
    p_desconto_pontualidade numeric,
    p_juros_atraso_percentual numeric,
    p_multa_atraso_percentual numeric,
    p_idempotency_key text
  )
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_policy public.politicas_cobranca_dependencia%ROWTYPE;
  v_version integer;
  v_multiplier numeric(8,4);
  v_discount numeric(12,2);
  v_interest numeric(8,4);
  v_penalty numeric(8,4);
BEGIN
  IF p_polo_id IS NULL
    OR p_disciplina_id IS NULL
    OR p_multiplicador_parcela IS NULL
    OR p_desconto_pontualidade IS NULL
    OR p_juros_atraso_percentual IS NULL
    OR p_multa_atraso_percentual IS NULL
    OR nullif(btrim(coalesce(p_idempotency_key, '')), '') IS NULL
  THEN
    RAISE EXCEPTION
      'Polo, disciplina, percentual, encargos e idempotência são obrigatórios.'
      USING ERRCODE = '22023';
  END IF;

  IF p_multiplicador_parcela < 0.01
    OR p_multiplicador_parcela > 10
  THEN
    RAISE EXCEPTION
      'O multiplicador deve ficar entre 0,01 e 10 parcelas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_desconto_pontualidade < 0
    OR p_juros_atraso_percentual < 0
    OR p_juros_atraso_percentual >= 100
    OR p_multa_atraso_percentual < 0
    OR p_multa_atraso_percentual >= 100
  THEN
    RAISE EXCEPTION
      'Desconto não pode ser negativo; juros e multa devem ficar entre 0 e 99,9999%%.'
      USING ERRCODE = '22023';
  END IF;

  IF length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION
      'A chave de idempotência deve ter entre 8 e 200 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  v_multiplier := round(p_multiplicador_parcela, 4);
  v_discount := round(p_desconto_pontualidade, 2);
  v_interest := round(p_juros_atraso_percentual, 4);
  v_penalty := round(p_multa_atraso_percentual, 4);

  IF v_interest >= 100 OR v_penalty >= 100 THEN
    RAISE EXCEPTION
      'Juros e multa devem continuar abaixo de 100%% após o arredondamento.'
      USING ERRCODE = '22023';
  END IF;

  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND NOT (
      public.is_gestor_for_polo(p_polo_id)
      AND (
        public.gestor_has_tab('secretaria', 'dependencias-academicas')
        OR public.gestor_has_tab('secretaria', 'solicitacoes')
        OR public.gestor_has_financeiro_tab('receber')
      )
    )
  THEN
    RAISE EXCEPTION
      'Acesso à configuração financeira da dependência não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.turmas turma
    JOIN public.cursos curso ON curso.id = turma.curso_id
    JOIN public.turmas_disciplinas oferta
      ON oferta.turma_id = turma.id
     AND oferta.disciplina_id = p_disciplina_id
    WHERE turma.polo_id = p_polo_id
      AND upper(coalesce(curso.modalidade, ''))
        IN ('TECNICO', 'TÉCNICO')
  ) THEN
    RAISE EXCEPTION
      'A disciplina não pertence a uma oferta técnica deste polo.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'dependencia-politica:' || p_polo_id::text || ':' || p_disciplina_id::text,
      0
    )
  );

  SELECT policy.*
  INTO v_policy
  FROM public.politicas_cobranca_dependencia policy
  WHERE policy.idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_policy.polo_id IS DISTINCT FROM p_polo_id
      OR v_policy.disciplina_id IS DISTINCT FROM p_disciplina_id
      OR v_policy.multiplicador_parcela IS DISTINCT FROM v_multiplier
      OR v_policy.desconto_pontualidade IS DISTINCT FROM v_discount
      OR v_policy.juros_atraso_percentual IS DISTINCT FROM v_interest
      OR v_policy.multa_atraso_percentual IS DISTINCT FROM v_penalty
    THEN
      RAISE EXCEPTION
        'Chave de idempotência já usada em outra configuração.'
        USING ERRCODE = '23505';
    END IF;

    RETURN jsonb_build_object(
      'replayed', true,
      'id', v_policy.id,
      'poloId', v_policy.polo_id,
      'disciplinaId', v_policy.disciplina_id,
      'multiplicador', v_policy.multiplicador_parcela,
      'percentual', v_policy.multiplicador_parcela * 100,
      'descontoPontualidade', v_policy.desconto_pontualidade,
      'jurosAtrasoPercentual', v_policy.juros_atraso_percentual,
      'multaAtrasoPercentual', v_policy.multa_atraso_percentual,
      'versao', v_policy.versao
    );
  END IF;

  SELECT coalesce(max(policy.versao), 0) + 1
  INTO v_version
  FROM public.politicas_cobranca_dependencia policy
  WHERE policy.codigo = 'DEPENDENCIA_DISCIPLINA'
    AND policy.polo_id = p_polo_id
    AND policy.disciplina_id = p_disciplina_id;

  UPDATE public.politicas_cobranca_dependencia policy
  SET
    status = 'INATIVA',
    vigencia_fim = greatest(
      policy.vigencia_inicio,
      pg_catalog.timezone('America/Maceio', now())::date
    ),
    updated_at = now()
  WHERE policy.status = 'ATIVA'
    AND policy.polo_id = p_polo_id
    AND policy.disciplina_id = p_disciplina_id;

  INSERT INTO public.politicas_cobranca_dependencia (
    codigo,
    versao,
    polo_id,
    disciplina_id,
    carga_horaria_minima,
    carga_horaria_maxima,
    multiplicador_parcela,
    desconto_pontualidade,
    juros_atraso_percentual,
    multa_atraso_percentual,
    status,
    vigencia_inicio,
    created_by,
    idempotency_key
  ) VALUES (
    'DEPENDENCIA_DISCIPLINA',
    v_version,
    p_polo_id,
    p_disciplina_id,
    0,
    NULL,
    v_multiplier,
    v_discount,
    v_interest,
    v_penalty,
    'ATIVA',
    pg_catalog.timezone('America/Maceio', now())::date,
    auth.uid(),
    btrim(p_idempotency_key)
  )
  RETURNING * INTO v_policy;

  RETURN jsonb_build_object(
    'replayed', false,
    'id', v_policy.id,
    'poloId', v_policy.polo_id,
    'disciplinaId', v_policy.disciplina_id,
    'multiplicador', v_policy.multiplicador_parcela,
    'percentual', v_policy.multiplicador_parcela * 100,
    'descontoPontualidade', v_policy.desconto_pontualidade,
    'jurosAtrasoPercentual', v_policy.juros_atraso_percentual,
    'multaAtrasoPercentual', v_policy.multa_atraso_percentual,
    'versao', v_policy.versao
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.configurar_politica_dependencia_disciplina_financeira_secure(
    uuid, uuid, numeric, numeric, numeric, numeric, text
  ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.configurar_politica_dependencia_disciplina_financeira_secure(
    uuid, uuid, numeric, numeric, numeric, numeric, text
  ) TO authenticated, service_role;

-- Compatibilidade para clientes já instalados: o contrato antigo pode alterar
-- o multiplicador, mas preserva os encargos próprios que já estavam ativos na
-- disciplina. Assim ele não repõe silenciosamente 19,90/1%/2% sobre uma
-- personalização feita no formulário novo.
CREATE OR REPLACE FUNCTION public.configurar_politica_dependencia_disciplina_secure(
  p_polo_id uuid,
  p_disciplina_id uuid,
  p_multiplicador_parcela numeric,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current public.politicas_cobranca_dependencia%ROWTYPE;
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND NOT (
      public.is_gestor_for_polo(p_polo_id)
      AND (
        public.gestor_has_tab('secretaria', 'dependencias-academicas')
        OR public.gestor_has_tab('secretaria', 'solicitacoes')
        OR public.gestor_has_financeiro_tab('receber')
      )
    )
  THEN
    RAISE EXCEPTION
      'Acesso à configuração financeira da dependência não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'dependencia-politica:' || p_polo_id::text || ':' || p_disciplina_id::text,
      0
    )
  );

  -- No retry, os termos da própria versão prevalecem sobre a regra que possa
  -- ter sido ativada depois da primeira resposta.
  SELECT policy.*
  INTO v_current
  FROM public.politicas_cobranca_dependencia policy
  WHERE policy.idempotency_key = btrim(p_idempotency_key);

  IF NOT FOUND THEN
    SELECT policy.*
    INTO v_current
    FROM public.politicas_cobranca_dependencia policy
    WHERE policy.codigo = 'DEPENDENCIA_DISCIPLINA'
    AND policy.polo_id = p_polo_id
    AND policy.disciplina_id = p_disciplina_id
    AND policy.status = 'ATIVA'
      AND policy.vigencia_inicio
        <= pg_catalog.timezone('America/Maceio', now())::date
      AND (
        policy.vigencia_fim IS NULL
        OR policy.vigencia_fim
          >= pg_catalog.timezone('America/Maceio', now())::date
      )
    ORDER BY policy.vigencia_inicio DESC, policy.versao DESC
    LIMIT 1;
  END IF;

  RETURN public.configurar_politica_dependencia_disciplina_financeira_secure(
    p_polo_id,
    p_disciplina_id,
    p_multiplicador_parcela,
    coalesce(v_current.desconto_pontualidade, 19.90),
    coalesce(v_current.juros_atraso_percentual, 1.0000),
    coalesce(v_current.multa_atraso_percentual, 2.0000),
    p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.configurar_politica_dependencia_disciplina_secure(
    uuid, uuid, numeric, text
  ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.configurar_politica_dependencia_disciplina_secure(
    uuid, uuid, numeric, text
  ) TO authenticated, service_role;

-- A aba de regras mostra os termos que serão snapshotados na cobrança, sem
-- consultar ou editar a configuração financeira da turma técnica.
CREATE OR REPLACE FUNCTION public.get_secretaria_dependencias_workspace_secure(
  p_polo_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_workspace jsonb;
  v_disciplines jsonb;
  v_rules jsonb;
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND (
      NOT (
        public.gestor_has_tab('secretaria', 'dependencias-academicas')
        OR public.gestor_has_tab('secretaria', 'solicitacoes')
      )
      OR (
        p_polo_id IS NOT NULL
        AND NOT public.is_gestor_for_polo(p_polo_id)
      )
    )
  THEN
    RAISE EXCEPTION
      'Acesso ao workspace de dependências não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  v_workspace :=
    public.p3_get_secretaria_dependencias_workspace_secure_20260731(
      p_polo_id,
      p_search
    );

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', policy.id,
        'disciplina_id', policy.disciplina_id,
        'disciplina_nome', coalesce(disciplina.nome, 'Regra institucional'),
        'carga_horaria', coalesce(disciplina.carga_horaria, policy.carga_horaria_maxima),
        'faixa', CASE
          WHEN policy.disciplina_id IS NOT NULL THEN 'Por disciplina'
          WHEN policy.carga_horaria_maxima = 40 THEN 'Até 40h'
          ELSE 'Acima de 40h'
        END,
        'fator', policy.multiplicador_parcela,
        'desconto_pontualidade', policy.desconto_pontualidade,
        'juros_atraso_percentual', policy.juros_atraso_percentual,
        'multa_atraso_percentual', policy.multa_atraso_percentual,
        'valor_referencia', NULL,
        'vigencia_inicio', policy.vigencia_inicio,
        'origem', policy.codigo || ' v' || policy.versao::text,
        'updated_at', policy.updated_at
      )
      ORDER BY policy.carga_horaria_minima, policy.versao DESC
    ),
    '[]'::jsonb
  )
  INTO v_rules
  FROM public.politicas_cobranca_dependencia policy
  LEFT JOIN public.disciplinas disciplina
    ON disciplina.id = policy.disciplina_id
  WHERE policy.status = 'ATIVA'
    AND policy.vigencia_inicio
      <= pg_catalog.timezone('America/Maceio', now())::date
    AND (
      policy.vigencia_fim IS NULL
      OR policy.vigencia_fim
        >= pg_catalog.timezone('America/Maceio', now())::date
    )
    AND (policy.polo_id IS NULL OR policy.polo_id = p_polo_id);

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', catalog.disciplina_id,
        'nome', catalog.disciplina_nome,
        'carga_horaria', catalog.carga_horaria,
        'cursoId', catalog.curso_id,
        'cursoNome', catalog.curso_nome
      )
      ORDER BY catalog.curso_nome, catalog.disciplina_nome
    ),
    '[]'::jsonb
  )
  INTO v_disciplines
  FROM (
    SELECT DISTINCT
      disciplina.id AS disciplina_id,
      disciplina.nome AS disciplina_nome,
      disciplina.carga_horaria,
      curso.id AS curso_id,
      curso.nome AS curso_nome
    FROM public.turmas turma
    JOIN public.cursos curso ON curso.id = turma.curso_id
    JOIN public.turmas_disciplinas oferta
      ON oferta.turma_id = turma.id
    JOIN public.disciplinas disciplina
      ON disciplina.id = oferta.disciplina_id
    WHERE p_polo_id IS NOT NULL
      AND turma.polo_id = p_polo_id
      AND upper(coalesce(curso.modalidade, ''))
        IN ('TECNICO', 'TÉCNICO')
      AND internal_academic.can_manage_dependency_workspace(turma.id)
  ) catalog;

  RETURN v_workspace || jsonb_build_object(
    'regras_financeiras', v_rules,
    'disciplinas_configuraveis', v_disciplines
  );
END;
$$;

-- Um snapshot próprio impede que qualquer leitor posterior da cobrança volte
-- a derivar termos da turma de reoferta. A descrição também é normalizada no
-- banco, inclusive se um chamador antigo ainda enviar o texto legado.
ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS regra_financeira_dependencia_snapshot jsonb;

ALTER TABLE public.contas_receber
  DROP CONSTRAINT IF EXISTS contas_receber_regra_financeira_dependencia_snapshot_check,
  ADD CONSTRAINT contas_receber_regra_financeira_dependencia_snapshot_check
    CHECK (
      regra_financeira_dependencia_snapshot IS NULL
      OR (
        upper(coalesce(tipo_lancamento, '')) = 'DEPENDENCIA'
        AND
        jsonb_typeof(regra_financeira_dependencia_snapshot) = 'object'
        AND regra_financeira_dependencia_snapshot->>'origem' = 'DEPENDENCIA'
      )
    );

COMMENT ON COLUMN public.contas_receber.regra_financeira_dependencia_snapshot IS
  'Snapshot imutável da cobrança avulsa de uma disciplina refeita; não herda termos de turma ou matrícula.';

CREATE OR REPLACE FUNCTION internal_academic.guard_dependency_receivable_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt record;
  v_attempt_id uuid;
  v_terms jsonb;
  v_snapshot jsonb;
  v_description text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF upper(coalesce(NEW.tipo_lancamento, '')) <> 'DEPENDENCIA' THEN
      RETURN NEW;
    END IF;

    IF NEW.matricula_id IS NOT NULL
      OR NEW.parcela_numero IS NOT NULL
      OR coalesce(NEW.gateway_installments, 1) <> 1
    THEN
      RAISE EXCEPTION
        'Cobrança de dependência deve ser avulsa, sem matrícula e sem cronograma de parcelas.'
        USING ERRCODE = '23514';
    END IF;

    IF coalesce(NEW.origem_cronograma_id, '') !~
      '^dependencia:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN
      RAISE EXCEPTION
        'Cobrança de dependência exige origem vinculada à tentativa acadêmica.'
        USING ERRCODE = '23514';
    END IF;

    v_attempt_id := substring(NEW.origem_cronograma_id FROM 13)::uuid;
    SELECT
      tentativa.id,
      tentativa.turma_id,
      tentativa.disciplina_id,
      tentativa.calculo_snapshot,
      matricula.aluno_id,
      disciplina.nome AS disciplina_nome
    INTO v_attempt
    FROM public.matricula_disciplina_tentativas tentativa
    JOIN public.matricula_componentes componente
      ON componente.id = tentativa.componente_id
    JOIN public.matriculas matricula
      ON matricula.id = componente.matricula_id
    JOIN public.disciplinas disciplina
      ON disciplina.id = tentativa.disciplina_id
    WHERE tentativa.id = v_attempt_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tentativa acadêmica da dependência não encontrada.'
        USING ERRCODE = '23503';
    END IF;

    IF NEW.turma_id IS DISTINCT FROM v_attempt.turma_id
      OR NEW.cliente_id IS DISTINCT FROM v_attempt.aluno_id
      OR NEW.valor IS DISTINCT FROM (
        SELECT valor_cobrado_snapshot
        FROM public.matricula_disciplina_tentativas
        WHERE id = v_attempt.id
      )
    THEN
      RAISE EXCEPTION
        'A cobrança de dependência diverge da tentativa acadêmico-financeira.'
        USING ERRCODE = '23514';
    END IF;

    v_terms := v_attempt.calculo_snapshot->'financeiro';
    IF jsonb_typeof(v_terms) <> 'object'
      OR v_terms->>'origem' <> 'DEPENDENCIA'
    THEN
      RAISE EXCEPTION
        'A tentativa não possui termos financeiros canônicos de dependência.'
        USING ERRCODE = '23514';
    END IF;

    v_description := 'Disciplina: ' || coalesce(
      nullif(btrim(v_attempt.disciplina_nome), ''),
      'Disciplina'
    );
    v_snapshot := jsonb_build_object(
      'origem', 'DEPENDENCIA',
      'versao', 1,
      'tentativaId', v_attempt.id,
      'disciplinaId', v_attempt.disciplina_id,
      'disciplinaNome', v_attempt.disciplina_nome,
      'descricaoCobranca', v_description,
      'descontoPontualidade',
        greatest(0, coalesce((v_terms->>'descontoPontualidade')::numeric, 0)),
      'jurosAtrasoPercentual',
        greatest(0, coalesce((v_terms->>'jurosAtrasoPercentual')::numeric, 0)),
      'multaAtrasoPercentual',
        greatest(0, coalesce((v_terms->>'multaAtrasoPercentual')::numeric, 0)),
      'aplicarDesconto',
        coalesce((v_terms->>'aplicarDesconto')::boolean, false),
      'aplicarMultaJuros',
        coalesce((v_terms->>'aplicarMultaJuros')::boolean, false),
      'diasBaixaDevolucao', 60,
      'instrucaoBoleto',
        'SR.(A) CAIXA: NÃO RECEBER ESTE TÍTULO APÓS 60 (SESSENTA) DIAS DO VENCIMENTO.'
    );

    IF coalesce((v_snapshot->>'descontoPontualidade')::numeric, 0) >= NEW.valor
      AND coalesce((v_snapshot->>'descontoPontualidade')::numeric, 0) > 0
    THEN
      RAISE EXCEPTION
        'O desconto da dependência deve ser menor que o valor da disciplina.'
        USING ERRCODE = '23514';
    END IF;

    NEW.descricao := v_description;
    NEW.regra_financeira_dependencia_snapshot := v_snapshot;
    NEW.forma_pagamento := 'BOLETO';
    NEW.gateway_provider := 'banese_card';
    NEW.gateway_payment_method := 'BOLETO';
    NEW.gateway_installments := 1;
    RETURN NEW;
  END IF;

  -- Títulos históricos já emitidos não podem ser reinterpretados com termos
  -- novos. Eles continuam no fluxo legado até conciliação; somente títulos
  -- criados após esta migração recebem o snapshot obrigatório.
  IF upper(coalesce(OLD.tipo_lancamento, '')) = 'DEPENDENCIA'
    AND OLD.regra_financeira_dependencia_snapshot IS NULL
  THEN
    IF NEW.regra_financeira_dependencia_snapshot IS NOT NULL THEN
      RAISE EXCEPTION
        'Cobrança de dependência legada não pode receber snapshot retroativo.'
        USING ERRCODE = '23514';
    END IF;
    IF upper(coalesce(OLD.status, '')) <> 'PAGO'
      AND upper(coalesce(NEW.status, '')) = 'PAGO'
    THEN
      IF upper(coalesce(NEW.origem_pagamento, '')) = 'PRESENCIAL' THEN
        IF NEW.manual_settlement_id IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM public.receivable_manual_settlements settlement
            WHERE settlement.id = NEW.manual_settlement_id
              AND settlement.receivable_id = NEW.id
              AND settlement.payment_method = upper(NEW.forma_pagamento)
              AND settlement.payment_date = NEW.data_pagamento
              AND (
                settlement.created_at AT TIME ZONE 'America/Maceio'
              )::date <= NEW.data_vencimento + 60
              AND settlement.state IN (
                'REMOTE_CANCELED_LOCAL_PENDING',
                'COMPLETED'
              )
          )
        THEN
          RAISE EXCEPTION
            'A baixa presencial da dependência legada exige tentativa auditável.'
            USING ERRCODE = '23514';
        END IF;
      ELSIF upper(coalesce(NEW.origem_pagamento, '')) IN (
        'BANESE', 'BANESE_CNAB240'
      ) THEN
        IF upper(coalesce(NEW.gateway_status, '')) NOT IN (
          'PAID', 'PAGO', 'RECEIVED', 'CONFIRMED', 'LIQUIDATED'
        )
        THEN
          RAISE EXCEPTION
            'A baixa bancária da dependência legada exige confirmação protegida.'
            USING ERRCODE = '23514';
        END IF;
      ELSE
        RAISE EXCEPTION
          'Origem de pagamento inválida para a dependência legada.'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF upper(coalesce(OLD.tipo_lancamento, '')) <> 'DEPENDENCIA'
    AND OLD.regra_financeira_dependencia_snapshot IS NULL
    AND upper(coalesce(NEW.tipo_lancamento, '')) <> 'DEPENDENCIA'
    AND NEW.regra_financeira_dependencia_snapshot IS NULL
  THEN
    RETURN NEW;
  END IF;

  IF upper(coalesce(NEW.tipo_lancamento, '')) <> 'DEPENDENCIA'
    OR NEW.matricula_id IS NOT NULL
    OR NEW.parcela_numero IS NOT NULL
    OR NEW.gateway_installments IS DISTINCT FROM 1
    OR lower(coalesce(NEW.gateway_provider, '')) <> 'banese_card'
    OR upper(coalesce(NEW.gateway_payment_method, '')) <> 'BOLETO'
  THEN
    RAISE EXCEPTION
      'A cobrança de dependência deve permanecer uma parcela avulsa de boleto Banese.'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.regra_financeira_dependencia_snapshot IS NULL
    OR NEW.regra_financeira_dependencia_snapshot IS NULL
    OR NEW.regra_financeira_dependencia_snapshot
      IS DISTINCT FROM OLD.regra_financeira_dependencia_snapshot
    OR NEW.descricao IS DISTINCT FROM OLD.descricao
    OR NEW.valor IS DISTINCT FROM OLD.valor
    OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
    OR NEW.turma_id IS DISTINCT FROM OLD.turma_id
    OR NEW.origem_cronograma_id IS DISTINCT FROM OLD.origem_cronograma_id
  THEN
    RAISE EXCEPTION
      'O snapshot, a descrição e a identidade da cobrança de dependência são imutáveis.'
      USING ERRCODE = '23514';
  END IF;

  -- Até a liquidação, esta continua sendo estritamente uma cobrança BOLETO.
  -- A baixa presencial pode registrar como Dinheiro, Cartão, Pix ou Boleto,
  -- mas somente no ato auditável de pagamento; o preflight da Edge Function
  -- ocorre antes do cancelamento remoto e esta regra é a barreira canônica.
  IF upper(coalesce(NEW.status, '')) <> 'PAGO' THEN
    IF upper(coalesce(NEW.forma_pagamento, '')) <> 'BOLETO' THEN
      RAISE EXCEPTION
        'A cobrança da disciplina deve permanecer BOLETO até a liquidação.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.data_vencimento IS NULL
    OR NEW.data_pagamento IS NULL
    OR NEW.data_pagamento > NEW.data_vencimento + 60
  THEN
    RAISE EXCEPTION
      'A cobrança da disciplina não pode receber baixa após 60 dias do vencimento.'
      USING ERRCODE = '23514';
  END IF;

  IF upper(coalesce(NEW.origem_pagamento, '')) = 'PRESENCIAL' THEN
    IF upper(coalesce(NEW.forma_pagamento, '')) NOT IN (
      'BOLETO', 'PIX', 'DINHEIRO', 'CARTAO'
    )
      OR NEW.manual_settlement_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.receivable_manual_settlements settlement
        WHERE settlement.id = NEW.manual_settlement_id
          AND settlement.receivable_id = NEW.id
          AND settlement.payment_method = upper(NEW.forma_pagamento)
          AND settlement.payment_date = NEW.data_pagamento
          AND (
            settlement.created_at AT TIME ZONE 'America/Maceio'
          )::date <= NEW.data_vencimento + 60
          AND settlement.state IN (
            'REMOTE_CANCELED_LOCAL_PENDING',
            'COMPLETED'
          )
      )
    THEN
      RAISE EXCEPTION
        'A baixa presencial da disciplina exige a tentativa financeira auditável.'
        USING ERRCODE = '23514';
    END IF;
  ELSIF upper(coalesce(NEW.origem_pagamento, '')) IN (
    'BANESE', 'BANESE_CNAB240'
  ) THEN
    IF upper(coalesce(NEW.forma_pagamento, '')) <> 'BOLETO'
      OR upper(coalesce(NEW.gateway_status, '')) NOT IN (
        'PAID', 'PAGO', 'RECEIVED', 'CONFIRMED', 'LIQUIDATED'
      )
    THEN
      RAISE EXCEPTION
        'A liquidação Banese da disciplina exige confirmação bancária protegida.'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION
      'Origem de pagamento inválida para a cobrança isolada da disciplina.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION internal_academic.guard_dependency_receivable_snapshot()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_dependency_receivable_snapshot
  ON public.contas_receber;
CREATE TRIGGER guard_dependency_receivable_snapshot
BEFORE INSERT OR UPDATE ON public.contas_receber
FOR EACH ROW
EXECUTE FUNCTION internal_academic.guard_dependency_receivable_snapshot();

-- O portal do aluno recebe o mesmo snapshot do título. Sem isso, o resumo
-- visual voltaria a calcular os encargos pela turma de destino.
ALTER FUNCTION public.get_aluno_financeiro_portal_secure(uuid)
RENAME TO p2_get_aluno_financeiro_portal_secure_20260812;

REVOKE ALL ON FUNCTION
  public.p2_get_aluno_financeiro_portal_secure_20260812(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_aluno_financeiro_portal_secure(
  p_aluno_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_base jsonb;
  v_rows jsonb;
BEGIN
  v_base := public.p2_get_aluno_financeiro_portal_secure_20260812(p_aluno_id);

  WITH source_rows AS (
    SELECT
      element.row_data,
      element.position,
      recebivel.*,
      CASE
        WHEN upper(coalesce(recebivel.tipo_lancamento, '')) = 'DEPENDENCIA'
          AND recebivel.regra_financeira_dependencia_snapshot->>'origem'
            = 'DEPENDENCIA'
          THEN recebivel.regra_financeira_dependencia_snapshot
        ELSE NULL
      END AS dependency_snapshot
    FROM jsonb_array_elements(coalesce(v_base->'rows', '[]'::jsonb))
      WITH ORDINALITY AS element(row_data, position)
    LEFT JOIN public.contas_receber recebivel
      ON recebivel.id = (element.row_data->>'id')::uuid
  ),
  dependency_values AS (
    SELECT
      source_rows.*,
      dependency_snapshot IS NOT NULL AS is_dependency,
      (
        lower(coalesce(gateway_provider, '')) = 'banese_card'
        AND upper(coalesce(gateway_payment_method, '')) = 'BOLETO'
        AND length(regexp_replace(coalesce(gateway_boleto_linha_digitavel, ''), '\D', '', 'g')) = 47
        AND length(regexp_replace(coalesce(gateway_boleto_codigo_barras, ''), '\D', '', 'g')) = 44
      ) AS has_registered_banese_boleto,
      (
        status = 'VENCIDO'
        OR (status = 'PENDENTE' AND data_vencimento < current_date)
      ) AS is_overdue,
      greatest(0, coalesce((dependency_snapshot->>'descontoPontualidade')::numeric, 0))
        AS discount_policy_value,
      greatest(0, coalesce((dependency_snapshot->>'jurosAtrasoPercentual')::numeric, 0))
        AS interest_policy_percent,
      greatest(0, coalesce((dependency_snapshot->>'multaAtrasoPercentual')::numeric, 0))
        AS penalty_policy_percent,
      dependency_snapshot IS NOT NULL
        AND coalesce((dependency_snapshot->>'aplicarDesconto')::boolean, false)
        AS can_discount,
      dependency_snapshot IS NOT NULL
        AND coalesce((dependency_snapshot->>'aplicarMultaJuros')::boolean, false)
        AS can_late_charge
    FROM source_rows
  ),
  dependency_amounts AS (
    SELECT
      dependency_values.*,
      CASE
        WHEN has_registered_banese_boleto OR status = 'PAGO' OR NOT can_discount
          THEN 0::numeric
        ELSE least(coalesce(valor, 0), discount_policy_value)
      END AS punctual_discount,
      CASE
        WHEN has_registered_banese_boleto OR NOT is_overdue OR NOT can_late_charge
          THEN 0::numeric
        ELSE round(
          coalesce(valor, 0) * interest_policy_percent / 30.0 / 100.0
            * greatest(current_date - data_vencimento, 0),
          2
        )
      END AS interest_value,
      CASE
        WHEN has_registered_banese_boleto OR NOT is_overdue OR NOT can_late_charge
          THEN 0::numeric
        ELSE round(coalesce(valor, 0) * penalty_policy_percent / 100.0, 2)
      END AS penalty_value
    FROM dependency_values
  ),
  patched AS (
    SELECT
      position,
      CASE
        WHEN is_dependency THEN row_data || jsonb_build_object(
          'tipo_lancamento', 'DISCIPLINA',
          'categoria', 'DISCIPLINA',
          'cobranca_disciplina_avulsa', true,
          'matricula_id', NULL,
          'turma_id', NULL,
          'turmas', NULL,
          'financial_summary', jsonb_build_object(
            'baseValue', coalesce(valor, 0),
            'paidValue', coalesce(valor_pago, valor, 0),
            'punctualDiscount', punctual_discount,
            'totalUntilDue', CASE
              WHEN has_registered_banese_boleto THEN coalesce(valor, 0)
              ELSE round(greatest(0, coalesce(valor, 0) - punctual_discount), 2)
            END,
            'interestPercent', CASE
              WHEN has_registered_banese_boleto OR NOT can_late_charge THEN 0
              ELSE interest_policy_percent
            END,
            'interestValue', interest_value,
            'lateFeeValue', penalty_value,
            'totalWithLate', CASE
              WHEN has_registered_banese_boleto THEN coalesce(valor, 0)
              ELSE round(coalesce(valor, 0) + interest_value + penalty_value, 2)
            END,
            'highlightValue', CASE
              WHEN status = 'PAGO' THEN coalesce(valor_pago, valor, 0)
              WHEN has_registered_banese_boleto THEN coalesce(valor, 0)
              WHEN is_overdue THEN round(coalesce(valor, 0) + interest_value + penalty_value, 2)
              ELSE round(greatest(0, coalesce(valor, 0) - punctual_discount), 2)
            END,
            'highlightLabel', CASE
              WHEN status = 'PAGO' THEN 'Valor pago'
              WHEN has_registered_banese_boleto THEN 'Valor do boleto'
              WHEN is_overdue THEN 'Total em atraso'
              ELSE 'Total até o vencimento'
            END,
            'hasDiscount', punctual_discount > 0,
            'hasLateCharge', interest_value > 0 OR penalty_value > 0,
            'canLateCharge', can_late_charge AND NOT has_registered_banese_boleto
          )
        )
        ELSE row_data
      END AS row_data
    FROM dependency_amounts
  )
  SELECT coalesce(jsonb_agg(row_data ORDER BY position), '[]'::jsonb)
  INTO v_rows
  FROM patched;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'summary', (
      WITH elements AS (
        SELECT value AS row_data
        FROM jsonb_array_elements(v_rows)
      ),
      open_by_modality AS (
        SELECT
          CASE
            WHEN coalesce(
              (row_data->>'cobranca_disciplina_avulsa')::boolean,
              false
            )
              THEN 'DISCIPLINA'
            ELSE coalesce(
              nullif(row_data #>> '{turmas,cursos,modalidade}', ''),
              'OUTROS'
            )
          END AS modality,
          count(*)::integer AS item_count,
          coalesce(sum((row_data #>> '{financial_summary,highlightValue}')::numeric), 0)
            AS total_value
        FROM elements
        WHERE row_data->>'status' IN ('PENDENTE', 'VENCIDO')
        GROUP BY 1
      )
      SELECT jsonb_build_object(
        'totalPaid', coalesce(sum(
          CASE
            WHEN row_data->>'status' = 'PAGO'
              THEN (row_data #>> '{financial_summary,paidValue}')::numeric
            ELSE 0
          END
        ), 0),
        'totalPending', coalesce(sum(
          CASE
            WHEN row_data->>'status' IN ('PENDENTE', 'VENCIDO')
              THEN (row_data #>> '{financial_summary,highlightValue}')::numeric
            ELSE 0
          END
        ), 0),
        'openByModality', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'modality', modality,
            'count', item_count,
            'total', total_value
          ) ORDER BY modality)
          FROM open_by_modality
        ), '[]'::jsonb)
      )
      FROM elements
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_aluno_financeiro_portal_secure(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_aluno_financeiro_portal_secure(uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
