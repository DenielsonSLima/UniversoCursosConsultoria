BEGIN;

-- Versão local alinhada ao registro criado pelo MCP Supabase.

-- Núcleo acadêmico-financeiro de dependências.
-- Não cria matrícula na turma de reoferta e não emite cobrança em banco/gateway.

ALTER TABLE public.contas_receber
  DROP CONSTRAINT IF EXISTS contas_receber_tipo_lancamento_check;

ALTER TABLE public.contas_receber
  ADD CONSTRAINT contas_receber_tipo_lancamento_check
  CHECK (
    tipo_lancamento IS NULL
    OR tipo_lancamento IN ('MATRICULA', 'PARCELA', 'REMATRICULA', 'DEPENDENCIA')
  );

-- Dependência técnica emite somente boleto Banese. O Pix permanece
-- deliberadamente fora desta rota até a liberação formal do banco.
UPDATE public.payment_gateway_routes AS route
SET enabled = true,
    updated_at = now(),
    notes = trim(both ' |' from concat_ws(
      ' | ',
      nullif(route.notes, ''),
      'DEPENDENCIA_TECNICA: boleto Banese habilitado no ambiente canônico'
    ))
FROM public.payment_gateway_runtime_config runtime,
     public.payment_gateway_credentials credential
WHERE runtime.id
  AND runtime.enabled
  AND route.modalidade = 'TECNICO'
  AND route.payment_method = 'BOLETO'
  AND route.environment = runtime.active_environment
  AND route.provider_code = 'banese_card'
  AND credential.id = route.credential_id
  AND credential.provider_code = route.provider_code
  AND credential.environment = route.environment
  AND credential.configured;

CREATE TABLE public.politicas_cobranca_dependencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  versao integer NOT NULL CHECK (versao > 0),
  curso_id uuid REFERENCES public.cursos(id) ON DELETE RESTRICT,
  polo_id uuid REFERENCES public.polos(id) ON DELETE RESTRICT,
  disciplina_id uuid REFERENCES public.disciplinas(id) ON DELETE RESTRICT,
  carga_horaria_minima integer NOT NULL CHECK (carga_horaria_minima >= 0),
  carga_horaria_maxima integer,
  multiplicador_parcela numeric(8,4) NOT NULL CHECK (multiplicador_parcela > 0),
  status text NOT NULL DEFAULT 'ATIVA' CHECK (status IN ('ATIVA', 'INATIVA')),
  vigencia_inicio date NOT NULL DEFAULT CURRENT_DATE,
  vigencia_fim date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  idempotency_key text,
  CHECK (
    carga_horaria_maxima IS NULL
    OR carga_horaria_maxima >= carga_horaria_minima
  ),
  CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);

CREATE UNIQUE INDEX politicas_cobranca_dependencia_versao_uidx
  ON public.politicas_cobranca_dependencia (
    codigo,
    versao,
    COALESCE(curso_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(polo_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(disciplina_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE UNIQUE INDEX politicas_cobranca_dependencia_idempotency_uidx
  ON public.politicas_cobranca_dependencia (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX politicas_cobranca_dependencia_resolucao_idx
  ON public.politicas_cobranca_dependencia (
    status,
    vigencia_inicio,
    carga_horaria_minima,
    carga_horaria_maxima
  );

INSERT INTO public.politicas_cobranca_dependencia (
  codigo,
  versao,
  carga_horaria_minima,
  carga_horaria_maxima,
  multiplicador_parcela,
  status
) VALUES
  ('DEPENDENCIA_ATE_40H', 1, 0, 40, 0.5000, 'ATIVA'),
  ('DEPENDENCIA_ACIMA_40H', 1, 41, NULL, 1.0000, 'ATIVA');

CREATE TABLE public.matricula_componentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matricula_id uuid NOT NULL
    REFERENCES public.matriculas(id) ON DELETE RESTRICT,
  disciplina_id uuid NOT NULL
    REFERENCES public.disciplinas(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'PENDENTE_DEPENDENCIA'
    CHECK (status IN (
      'PENDENTE_DEPENDENCIA',
      'DEPENDENCIA_AGENDADA',
      'EM_CURSO',
      'APROVADO',
      'APROVEITADO',
      'ENCERRADO'
    )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (matricula_id, disciplina_id)
);

CREATE INDEX matricula_componentes_status_idx
  ON public.matricula_componentes (status, matricula_id);

CREATE TABLE public.matricula_disciplina_tentativas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  componente_id uuid NOT NULL
    REFERENCES public.matricula_componentes(id) ON DELETE RESTRICT,
  turma_id uuid NOT NULL,
  disciplina_id uuid NOT NULL,
  turma_origem_id uuid NOT NULL
    REFERENCES public.turmas(id) ON DELETE RESTRICT,
  numero_tentativa integer NOT NULL CHECK (numero_tentativa > 0),
  status text NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO'
    CHECK (status IN (
      'AGUARDANDO_PAGAMENTO',
      'LIBERADA',
      'EM_CURSO',
      'APROVADA',
      'REPROVADA',
      'CANCELADA'
    )),
  resultado_origem text NOT NULL
    CHECK (resultado_origem IN ('REPROVADO_FREQUENCIA', 'REPROVADO')),
  frequencia_origem numeric(7,2),
  media_parcial_origem numeric(7,2),
  nota_rec_origem numeric(7,2),
  media_final_origem numeric(7,2),
  diario_fechado_em timestamptz NOT NULL,
  politica_id uuid NOT NULL
    REFERENCES public.politicas_cobranca_dependencia(id) ON DELETE RESTRICT,
  politica_codigo text NOT NULL,
  politica_versao integer NOT NULL CHECK (politica_versao > 0),
  carga_horaria_snapshot integer NOT NULL CHECK (carga_horaria_snapshot >= 0),
  valor_parcela_base_snapshot numeric(12,2) NOT NULL
    CHECK (valor_parcela_base_snapshot > 0),
  multiplicador_snapshot numeric(8,4) NOT NULL
    CHECK (multiplicador_snapshot > 0),
  valor_cobrado_snapshot numeric(12,2) NOT NULL
    CHECK (valor_cobrado_snapshot > 0),
  calculo_snapshot jsonb NOT NULL,
  idempotency_key text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (turma_id, disciplina_id)
    REFERENCES public.turmas_disciplinas(turma_id, disciplina_id)
    ON DELETE RESTRICT,
  UNIQUE (componente_id, numero_tentativa),
  UNIQUE (idempotency_key)
);

CREATE UNIQUE INDEX matricula_disciplina_tentativas_ativa_uidx
  ON public.matricula_disciplina_tentativas (componente_id)
  WHERE status IN ('AGUARDANDO_PAGAMENTO', 'LIBERADA', 'EM_CURSO');

CREATE INDEX matricula_disciplina_tentativas_oferta_idx
  ON public.matricula_disciplina_tentativas (turma_id, disciplina_id, status);

CREATE TABLE public.matricula_dependencia_cobrancas (
  tentativa_id uuid NOT NULL
    REFERENCES public.matricula_disciplina_tentativas(id) ON DELETE RESTRICT,
  conta_receber_id uuid NOT NULL
    REFERENCES public.contas_receber(id) ON DELETE RESTRICT,
  principal boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tentativa_id, conta_receber_id)
);

CREATE UNIQUE INDEX matricula_dependencia_cobrancas_principal_uidx
  ON public.matricula_dependencia_cobrancas (tentativa_id)
  WHERE principal;

CREATE UNIQUE INDEX matricula_dependencia_cobrancas_recebivel_uidx
  ON public.matricula_dependencia_cobrancas (conta_receber_id);

CREATE TABLE public.matricula_dependencia_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  componente_id uuid
    REFERENCES public.matricula_componentes(id) ON DELETE RESTRICT,
  tentativa_id uuid
    REFERENCES public.matricula_disciplina_tentativas(id) ON DELETE RESTRICT,
  conta_receber_id uuid
    REFERENCES public.contas_receber(id) ON DELETE RESTRICT,
  evento text NOT NULL CHECK (evento IN (
    'PENDENCIA_REGISTRADA',
    'TENTATIVA_CONFIRMADA',
    'COBRANCA_CRIADA',
    'COBRANCA_SUBSTITUIDA',
    'STATUS_ALTERADO',
    'CANCELADA'
  )),
  actor_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    componente_id IS NOT NULL
    OR tentativa_id IS NOT NULL
    OR conta_receber_id IS NOT NULL
  )
);

CREATE INDEX matricula_dependencia_eventos_componente_idx
  ON public.matricula_dependencia_eventos (componente_id, created_at DESC);

CREATE INDEX matricula_dependencia_eventos_tentativa_idx
  ON public.matricula_dependencia_eventos (tentativa_id, created_at DESC);

ALTER TABLE public.politicas_cobranca_dependencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matricula_componentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matricula_disciplina_tentativas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matricula_dependencia_cobrancas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matricula_dependencia_eventos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.politicas_cobranca_dependencia
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.matricula_componentes
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.matricula_disciplina_tentativas
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.matricula_dependencia_cobrancas
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.matricula_dependencia_eventos
  FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.politicas_cobranca_dependencia TO service_role;
GRANT ALL ON TABLE public.matricula_componentes TO service_role;
GRANT ALL ON TABLE public.matricula_disciplina_tentativas TO service_role;
GRANT ALL ON TABLE public.matricula_dependencia_cobrancas TO service_role;
GRANT ALL ON TABLE public.matricula_dependencia_eventos TO service_role;

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

CREATE TRIGGER protect_dependency_policy_version
BEFORE UPDATE OR DELETE ON public.politicas_cobranca_dependencia
FOR EACH ROW EXECUTE FUNCTION internal_academic.protect_dependency_policy_version();

CREATE OR REPLACE FUNCTION internal_academic.protect_dependency_attempt_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.componente_id IS DISTINCT FROM NEW.componente_id
    OR OLD.turma_id IS DISTINCT FROM NEW.turma_id
    OR OLD.disciplina_id IS DISTINCT FROM NEW.disciplina_id
    OR OLD.turma_origem_id IS DISTINCT FROM NEW.turma_origem_id
    OR OLD.numero_tentativa IS DISTINCT FROM NEW.numero_tentativa
    OR OLD.resultado_origem IS DISTINCT FROM NEW.resultado_origem
    OR OLD.frequencia_origem IS DISTINCT FROM NEW.frequencia_origem
    OR OLD.media_parcial_origem IS DISTINCT FROM NEW.media_parcial_origem
    OR OLD.nota_rec_origem IS DISTINCT FROM NEW.nota_rec_origem
    OR OLD.media_final_origem IS DISTINCT FROM NEW.media_final_origem
    OR OLD.diario_fechado_em IS DISTINCT FROM NEW.diario_fechado_em
    OR OLD.politica_id IS DISTINCT FROM NEW.politica_id
    OR OLD.politica_codigo IS DISTINCT FROM NEW.politica_codigo
    OR OLD.politica_versao IS DISTINCT FROM NEW.politica_versao
    OR OLD.carga_horaria_snapshot IS DISTINCT FROM NEW.carga_horaria_snapshot
    OR OLD.valor_parcela_base_snapshot IS DISTINCT FROM NEW.valor_parcela_base_snapshot
    OR OLD.multiplicador_snapshot IS DISTINCT FROM NEW.multiplicador_snapshot
    OR OLD.valor_cobrado_snapshot IS DISTINCT FROM NEW.valor_cobrado_snapshot
    OR OLD.calculo_snapshot IS DISTINCT FROM NEW.calculo_snapshot
    OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
    OR OLD.created_by IS DISTINCT FROM NEW.created_by
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'O snapshot da tentativa de dependência é imutável.'
      USING ERRCODE = '55000';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_dependency_attempt_snapshot
BEFORE UPDATE ON public.matricula_disciplina_tentativas
FOR EACH ROW EXECUTE FUNCTION internal_academic.protect_dependency_attempt_snapshot();

CREATE OR REPLACE FUNCTION internal_academic.protect_dependency_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Eventos de dependência são imutáveis.'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER protect_dependency_event
BEFORE UPDATE OR DELETE ON public.matricula_dependencia_eventos
FOR EACH ROW EXECUTE FUNCTION internal_academic.protect_dependency_event();

CREATE OR REPLACE FUNCTION internal_academic.can_manage_dependency_workspace(
  p_turma_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT auth.role()), '') = 'service_role'
    OR (
      (
        public.gestor_has_tab('secretaria', 'solicitacoes')
        OR public.gestor_has_tab('gestao', 'alunos')
      )
      AND EXISTS (
        SELECT 1
        FROM public.turmas t
        WHERE t.id = p_turma_id
          AND public.is_gestor_for_polo(t.polo_id)
      )
    );
$$;

CREATE OR REPLACE FUNCTION internal_academic.get_terminal_dependency_failure(
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
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'matriculaId', m.id,
    'alunoId', m.aluno_id,
    'turmaOrigemId', m.turma_id,
    'cursoId', t.curso_id,
    'poloId', t.polo_id,
    'disciplinaId', d.id,
    'disciplinaNome', d.nome,
    'cargaHoraria', d.carga_horaria,
    'resultadoFinal', r.resultado_final,
    'frequenciaPercent', r.frequencia_percent,
    'mediaParcial', r.media_parcial,
    'notaRec', r.nota_rec,
    'mediaFinal', r.media_final,
    'diarioFechadoEm', td.diario_bloqueado_em
  )
  INTO v_result
  FROM public.matriculas m
  JOIN public.turmas t ON t.id = m.turma_id
  JOIN public.cursos c ON c.id = t.curso_id
  JOIN public.turmas_disciplinas td
    ON td.turma_id = t.id
   AND td.disciplina_id = p_disciplina_id
  JOIN public.disciplinas d ON d.id = td.disciplina_id
  CROSS JOIN LATERAL public.get_diario_resultados(
    t.id,
    td.disciplina_id
  ) r
  WHERE m.id = p_matricula_id
    AND r.aluno_id = m.aluno_id
    AND upper(coalesce(c.modalidade, '')) IN ('TECNICO', 'TÉCNICO')
    AND td.bloqueio_diario = 'TOTAL'
    AND td.diario_bloqueado_em IS NOT NULL
    AND r.resultado_final IN ('REPROVADO_FREQUENCIA', 'REPROVADO');

  RETURN v_result;
END;
$$;

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

  RETURN v_failure || jsonb_build_object(
    'politicaId', v_policy.id,
    'politicaCodigo', v_policy.codigo,
    'politicaVersao', v_policy.versao,
    'valorParcelaBase', v_base,
    'multiplicador', v_policy.multiplicador_parcela,
    'valorCobrado', v_value,
    'regra', CASE
      WHEN (v_failure->>'cargaHoraria')::integer <= 40
        THEN 'ATE_40H_MEIA_PARCELA'
      ELSE 'ACIMA_40H_UMA_PARCELA'
    END
  );
END;
$$;

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
  v_result jsonb;
  v_rules jsonb;
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND NOT public.gestor_has_any_module(ARRAY['secretaria', 'gestao'])
  THEN
    RAISE EXCEPTION 'Acesso ao workspace de dependências não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(row_data ORDER BY row_data->>'alunoNome'), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'matriculaId', m.id,
      'alunoId', a.id,
      'alunoNome', a.nome,
      'turmaOrigemId', t.id,
      'turmaOrigemCodigo', t.codigo,
      'turmaOrigemNome', t.nome,
      'cursoId', c.id,
      'cursoNome', c.nome,
      'poloId', t.polo_id,
      'disciplinaId', d.id,
      'disciplinaNome', d.nome,
      'cargaHoraria', d.carga_horaria,
      'resultadoFinal', r.resultado_final,
      'frequenciaPercent', r.frequencia_percent,
      'mediaParcial', r.media_parcial,
      'notaRec', r.nota_rec,
      'mediaFinal', r.media_final,
      'diarioFechadoEm', td.diario_bloqueado_em,
      'componenteId', mc.id,
      'componenteStatus', coalesce(mc.status, 'PENDENTE_DEPENDENCIA'),
      'tentativaId', active_attempt.id,
      'tentativaStatus', active_attempt.status,
      'turmaDestinoId', active_attempt.turma_id,
      'contaReceberId', active_attempt.conta_receber_id,
      'valorCobrado', active_attempt.valor_cobrado_snapshot
    ) AS row_data
    FROM public.matriculas m
    JOIN public.parceiros a ON a.id = m.aluno_id
    JOIN public.turmas t ON t.id = m.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
    JOIN public.turmas_disciplinas td ON td.turma_id = t.id
    JOIN public.disciplinas d ON d.id = td.disciplina_id
    CROSS JOIN LATERAL public.get_diario_resultados(t.id, d.id) r
    LEFT JOIN public.matricula_componentes mc
      ON mc.matricula_id = m.id
     AND mc.disciplina_id = d.id
    LEFT JOIN LATERAL (
      SELECT
        mt.id,
        mt.status,
        mt.turma_id,
        mt.valor_cobrado_snapshot,
        mdc.conta_receber_id
      FROM public.matricula_disciplina_tentativas mt
      LEFT JOIN public.matricula_dependencia_cobrancas mdc
        ON mdc.tentativa_id = mt.id
       AND mdc.principal
      WHERE mt.componente_id = mc.id
        AND mt.status IN ('AGUARDANDO_PAGAMENTO', 'LIBERADA', 'EM_CURSO')
      LIMIT 1
    ) active_attempt ON true
    WHERE r.aluno_id = m.aluno_id
      AND upper(coalesce(c.modalidade, '')) IN ('TECNICO', 'TÉCNICO')
      AND td.bloqueio_diario = 'TOTAL'
      AND td.diario_bloqueado_em IS NOT NULL
      AND r.resultado_final IN ('REPROVADO_FREQUENCIA', 'REPROVADO')
      AND coalesce(mc.status, 'PENDENTE_DEPENDENCIA')
        NOT IN ('APROVADO', 'APROVEITADO', 'ENCERRADO')
      AND (p_polo_id IS NULL OR t.polo_id = p_polo_id)
      AND internal_academic.can_manage_dependency_workspace(t.id)
      AND (
        nullif(btrim(coalesce(p_search, '')), '') IS NULL
        OR lower(a.nome) LIKE '%' || lower(btrim(p_search)) || '%'
        OR lower(d.nome) LIKE '%' || lower(btrim(p_search)) || '%'
        OR lower(t.codigo) LIKE '%' || lower(btrim(p_search)) || '%'
      )
  ) rows;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', policy.id,
        'disciplina_id', policy.disciplina_id,
        'disciplina_nome',
          coalesce(policy_discipline.nome, 'Regra institucional'),
        'carga_horaria',
          coalesce(
            policy_discipline.carga_horaria,
            policy.carga_horaria_maxima
          ),
        'faixa', CASE
          WHEN policy.disciplina_id IS NOT NULL THEN 'Por disciplina'
          WHEN policy.carga_horaria_maxima = 40 THEN 'Até 40h'
          ELSE 'Acima de 40h'
        END,
        'fator', policy.multiplicador_parcela,
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
  LEFT JOIN public.disciplinas policy_discipline
    ON policy_discipline.id = policy.disciplina_id
  WHERE policy.status = 'ATIVA'
    AND policy.vigencia_inicio
      <= pg_catalog.timezone('America/Maceio', now())::date
    AND (
      policy.vigencia_fim IS NULL
      OR policy.vigencia_fim
        >= pg_catalog.timezone('America/Maceio', now())::date
    )
    AND (policy.polo_id IS NULL OR policy.polo_id = p_polo_id);

  RETURN jsonb_build_object(
    'dependencias', v_result,
    'regras_financeiras', v_rules,
    'generated_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dependencia_ofertas_secure(
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
  v_result jsonb;
BEGIN
  SELECT internal_academic.get_terminal_dependency_failure(
    p_matricula_id,
    p_disciplina_id
  ) INTO v_failure;

  IF v_failure IS NULL THEN
    RAISE EXCEPTION
      'A disciplina não possui reprovação terminal em diário totalmente fechado.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT internal_academic.can_manage_dependency_workspace(
    (v_failure->>'turmaOrigemId')::uuid
  ) THEN
    RAISE EXCEPTION 'Acesso à dependência não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(row_data ORDER BY row_data->>'dataInicio'), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'turmaId', t.id,
      'turmaCodigo', t.codigo,
      'turmaNome', t.nome,
      'turmaStatus', t.status,
      'poloId', t.polo_id,
      'dataInicio', t.data_inicio,
      'dataPrevisaoTermino', t.data_previsao_termino,
      'disciplinaId', td.disciplina_id,
      'professorId', td.professor_id,
      'professorNome', td.professor_nome,
      'periodoLetivoId', td.periodo_letivo_id,
      'periodoStatus', pl.status,
      'bloqueioDiario', td.bloqueio_diario
    ) AS row_data
    FROM public.turmas t
    JOIN public.turmas_disciplinas td
      ON td.turma_id = t.id
     AND td.disciplina_id = p_disciplina_id
    LEFT JOIN public.periodos_letivos pl ON pl.id = td.periodo_letivo_id
    WHERE t.curso_id = (v_failure->>'cursoId')::uuid
      AND t.id <> (v_failure->>'turmaOrigemId')::uuid
      AND t.status IN ('PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO')
      AND coalesce(td.bloqueio_diario, 'ABERTO') <> 'TOTAL'
      AND (pl.id IS NULL OR pl.status <> 'FECHADO')
      AND NOT EXISTS (
        SELECT 1
        FROM public.aulas_turma aula
        WHERE aula.turma_id = t.id
          AND aula.disciplina_id = p_disciplina_id
          AND aula.data_aula
            < pg_catalog.timezone('America/Maceio', now())::date
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.matriculas matricula_destino
        WHERE matricula_destino.turma_id = t.id
          AND matricula_destino.aluno_id = (v_failure->>'alunoId')::uuid
          AND matricula_destino.status NOT IN (
            'CANCELADO',
            'DESISTENTE',
            'TRANSFERIDO'
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.matricula_disciplina_tentativas tentativa_duplicada
        JOIN public.matricula_componentes componente_duplicado
          ON componente_duplicado.id = tentativa_duplicada.componente_id
        JOIN public.matriculas matricula_duplicada
          ON matricula_duplicada.id = componente_duplicado.matricula_id
        WHERE tentativa_duplicada.turma_id = t.id
          AND tentativa_duplicada.disciplina_id = p_disciplina_id
          AND tentativa_duplicada.status IN (
            'AGUARDANDO_PAGAMENTO',
            'LIBERADA',
            'EM_CURSO'
          )
          AND matricula_duplicada.aluno_id
            = (v_failure->>'alunoId')::uuid
      )
      AND internal_academic.can_manage_dependency_workspace(t.id)
  ) rows;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.prever_dependencia_reoferta_secure(
  p_matricula_id uuid,
  p_disciplina_id uuid,
  p_turma_destino_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_failure jsonb;
  v_preview jsonb;
  v_compatible boolean;
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

  IF NOT internal_academic.can_manage_dependency_workspace(
    (v_failure->>'turmaOrigemId')::uuid
  ) THEN
    RAISE EXCEPTION 'Acesso à dependência não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  IF p_turma_destino_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.turmas t
      JOIN public.turmas_disciplinas td
        ON td.turma_id = t.id
       AND td.disciplina_id = p_disciplina_id
      LEFT JOIN public.periodos_letivos pl ON pl.id = td.periodo_letivo_id
      WHERE t.id = p_turma_destino_id
        AND t.id <> (v_failure->>'turmaOrigemId')::uuid
        AND t.curso_id = (v_failure->>'cursoId')::uuid
        AND t.status IN ('PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO')
        AND coalesce(td.bloqueio_diario, 'ABERTO') <> 'TOTAL'
        AND (pl.id IS NULL OR pl.status <> 'FECHADO')
        AND NOT EXISTS (
          SELECT 1
          FROM public.aulas_turma aula
          WHERE aula.turma_id = t.id
            AND aula.disciplina_id = p_disciplina_id
            AND aula.data_aula
              < pg_catalog.timezone('America/Maceio', now())::date
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.matriculas matricula_destino
          WHERE matricula_destino.turma_id = t.id
            AND matricula_destino.aluno_id
              = (v_failure->>'alunoId')::uuid
            AND matricula_destino.status NOT IN (
              'CANCELADO',
              'DESISTENTE',
              'TRANSFERIDO'
            )
        )
        AND internal_academic.can_manage_dependency_workspace(t.id)
    ) INTO v_compatible;

    IF NOT coalesce(v_compatible, false) THEN
      RAISE EXCEPTION 'A turma escolhida não é uma reoferta compatível.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  v_preview :=
    internal_academic.resolve_dependency_charge(
      p_matricula_id,
      p_disciplina_id
    );

  RETURN v_preview || jsonb_build_object(
    'turmaDestinoId',
    p_turma_destino_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.confirmar_dependencia_reoferta_secure(
  p_matricula_id uuid,
  p_disciplina_id uuid,
  p_turma_destino_id uuid,
  p_data_vencimento date,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_failure jsonb;
  v_preview jsonb;
  v_matricula public.matriculas%ROWTYPE;
  v_destino public.turmas%ROWTYPE;
  v_disciplina public.disciplinas%ROWTYPE;
  v_component public.matricula_componentes%ROWTYPE;
  v_attempt public.matricula_disciplina_tentativas%ROWTYPE;
  v_charge public.contas_receber%ROWTYPE;
  v_existing record;
  v_number integer;
  v_gateway_environment text;
BEGIN
  IF p_matricula_id IS NULL
    OR p_disciplina_id IS NULL
    OR p_turma_destino_id IS NULL
    OR p_data_vencimento IS NULL
    OR nullif(btrim(coalesce(p_idempotency_key, '')), '') IS NULL
  THEN
    RAISE EXCEPTION 'Matrícula, disciplina, turma, vencimento e idempotência são obrigatórios.'
      USING ERRCODE = '22023';
  END IF;

  IF length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'A chave de idempotência deve ter entre 8 e 200 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  IF p_data_vencimento
    < pg_catalog.timezone('America/Maceio', now())::date
  THEN
    RAISE EXCEPTION 'A data de vencimento não pode estar no passado.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_matricula
  FROM public.matriculas
  WHERE id = p_matricula_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matrícula não encontrada.'
      USING ERRCODE = '22023';
  END IF;

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

  -- A autorização precede inclusive o replay idempotente, para que uma chave
  -- conhecida nunca revele metadados de outro polo ou outra matrícula.
  IF NOT internal_academic.can_manage_dependency_workspace(v_matricula.turma_id)
    OR NOT internal_academic.can_manage_dependency_workspace(p_turma_destino_id)
  THEN
    RAISE EXCEPTION 'Acesso à confirmação da dependência não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_matricula_id::text || ':' || p_disciplina_id::text,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_matricula.aluno_id::text
        || ':' || p_turma_destino_id::text
        || ':' || p_disciplina_id::text,
      0
    )
  );

  SELECT
    mt.*,
    mc.matricula_id,
    mdc.conta_receber_id
  INTO v_existing
  FROM public.matricula_disciplina_tentativas mt
  JOIN public.matricula_componentes mc ON mc.id = mt.componente_id
  LEFT JOIN public.matricula_dependencia_cobrancas mdc
    ON mdc.tentativa_id = mt.id
   AND mdc.principal
  WHERE mt.idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_existing.matricula_id <> p_matricula_id
      OR v_existing.disciplina_id <> p_disciplina_id
      OR v_existing.turma_id <> p_turma_destino_id
    THEN
      RAISE EXCEPTION 'Chave de idempotência já usada em outra operação.'
        USING ERRCODE = '23505';
    END IF;

    RETURN jsonb_build_object(
      'replayed', true,
      'componenteId', v_existing.componente_id,
      'tentativaId', v_existing.id,
      'tentativaStatus', v_existing.status,
      'contaReceberId', v_existing.conta_receber_id,
      'contaReceberStatus', (
        SELECT cr.status
        FROM public.contas_receber cr
        WHERE cr.id = v_existing.conta_receber_id
      ),
      'valorCobrado', v_existing.valor_cobrado_snapshot,
      'turmaDestinoId', v_existing.turma_id,
      'disciplinaId', v_existing.disciplina_id
    );
  END IF;

  SELECT * INTO v_matricula
  FROM public.matriculas
  WHERE id = p_matricula_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matrícula não encontrada.'
      USING ERRCODE = '22023';
  END IF;

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

  SELECT t.* INTO v_destino
  FROM public.turmas t
  JOIN public.turmas_disciplinas td
    ON td.turma_id = t.id
   AND td.disciplina_id = p_disciplina_id
  LEFT JOIN public.periodos_letivos pl ON pl.id = td.periodo_letivo_id
  WHERE t.id = p_turma_destino_id
    AND t.id <> v_matricula.turma_id
    AND t.curso_id = (v_failure->>'cursoId')::uuid
    AND t.status IN ('PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO')
    AND coalesce(td.bloqueio_diario, 'ABERTO') <> 'TOTAL'
    AND (pl.id IS NULL OR pl.status <> 'FECHADO')
    AND NOT EXISTS (
      SELECT 1
      FROM public.aulas_turma aula
      WHERE aula.turma_id = t.id
        AND aula.disciplina_id = p_disciplina_id
        AND aula.data_aula
          < pg_catalog.timezone('America/Maceio', now())::date
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.matriculas matricula_destino
      WHERE matricula_destino.turma_id = t.id
        AND matricula_destino.aluno_id = v_matricula.aluno_id
        AND matricula_destino.status NOT IN (
          'CANCELADO',
          'DESISTENTE',
          'TRANSFERIDO'
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.matricula_disciplina_tentativas tentativa_duplicada
      JOIN public.matricula_componentes componente_duplicado
        ON componente_duplicado.id = tentativa_duplicada.componente_id
      JOIN public.matriculas matricula_duplicada
        ON matricula_duplicada.id = componente_duplicado.matricula_id
      WHERE tentativa_duplicada.turma_id = t.id
        AND tentativa_duplicada.disciplina_id = p_disciplina_id
        AND tentativa_duplicada.status IN (
          'AGUARDANDO_PAGAMENTO',
          'LIBERADA',
          'EM_CURSO'
        )
        AND matricula_duplicada.aluno_id = v_matricula.aluno_id
    )
  FOR UPDATE OF t, td;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A turma escolhida não é uma reoferta compatível.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_disciplina
  FROM public.disciplinas
  WHERE id = p_disciplina_id;

  v_preview :=
    internal_academic.resolve_dependency_charge(
      p_matricula_id,
      p_disciplina_id
    );

  SELECT * INTO v_component
  FROM public.matricula_componentes
  WHERE matricula_id = p_matricula_id
    AND disciplina_id = p_disciplina_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.matricula_componentes (
      matricula_id,
      disciplina_id,
      status
    ) VALUES (
      p_matricula_id,
      p_disciplina_id,
      'PENDENTE_DEPENDENCIA'
    )
    RETURNING * INTO v_component;

    INSERT INTO public.matricula_dependencia_eventos (
      componente_id,
      evento,
      actor_id,
      payload
    ) VALUES (
      v_component.id,
      'PENDENCIA_REGISTRADA',
      auth.uid(),
      v_failure
    );
  ELSIF v_component.status IN ('APROVADO', 'APROVEITADO', 'ENCERRADO') THEN
    RAISE EXCEPTION 'O componente acadêmico já está encerrado.'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.matricula_disciplina_tentativas mt
    WHERE mt.componente_id = v_component.id
      AND mt.status IN ('AGUARDANDO_PAGAMENTO', 'LIBERADA', 'EM_CURSO')
  ) THEN
    RAISE EXCEPTION 'Já existe uma tentativa ativa para esta dependência.'
      USING ERRCODE = '23505';
  END IF;

  SELECT coalesce(max(mt.numero_tentativa), 0) + 1
  INTO v_number
  FROM public.matricula_disciplina_tentativas mt
  WHERE mt.componente_id = v_component.id;

  INSERT INTO public.matricula_disciplina_tentativas (
    componente_id,
    turma_id,
    disciplina_id,
    turma_origem_id,
    numero_tentativa,
    status,
    resultado_origem,
    frequencia_origem,
    media_parcial_origem,
    nota_rec_origem,
    media_final_origem,
    diario_fechado_em,
    politica_id,
    politica_codigo,
    politica_versao,
    carga_horaria_snapshot,
    valor_parcela_base_snapshot,
    multiplicador_snapshot,
    valor_cobrado_snapshot,
    calculo_snapshot,
    idempotency_key,
    created_by
  ) VALUES (
    v_component.id,
    p_turma_destino_id,
    p_disciplina_id,
    v_matricula.turma_id,
    v_number,
    'AGUARDANDO_PAGAMENTO',
    v_failure->>'resultadoFinal',
    (v_failure->>'frequenciaPercent')::numeric,
    (v_failure->>'mediaParcial')::numeric,
    (v_failure->>'notaRec')::numeric,
    (v_failure->>'mediaFinal')::numeric,
    (v_failure->>'diarioFechadoEm')::timestamptz,
    (v_preview->>'politicaId')::uuid,
    v_preview->>'politicaCodigo',
    (v_preview->>'politicaVersao')::integer,
    (v_preview->>'cargaHoraria')::integer,
    (v_preview->>'valorParcelaBase')::numeric,
    (v_preview->>'multiplicador')::numeric,
    (v_preview->>'valorCobrado')::numeric,
    v_preview,
    btrim(p_idempotency_key),
    auth.uid()
  )
  RETURNING * INTO v_attempt;

  SELECT runtime.active_environment
  INTO v_gateway_environment
  FROM public.payment_gateway_runtime_config runtime
  WHERE runtime.id
    AND runtime.enabled;

  IF v_gateway_environment IS NULL THEN
    RAISE EXCEPTION
      'A emissão bancária está desativada na configuração financeira.'
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.payment_gateway_routes route
    JOIN public.payment_gateway_credentials credential
      ON credential.id = route.credential_id
     AND credential.provider_code = route.provider_code
     AND credential.environment = route.environment
    WHERE route.modalidade = 'TECNICO'
      AND route.payment_method = 'BOLETO'
      AND route.environment = v_gateway_environment
      AND route.provider_code = 'banese_card'
      AND route.enabled
      AND credential.configured
  ) THEN
    RAISE EXCEPTION
      'A rota Banese de boleto para curso técnico não está ativa e configurada.'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.contas_receber (
    polo_id,
    descricao,
    valor,
    data_vencimento,
    status,
    categoria,
    cliente_id,
    matricula_id,
    turma_id,
    tipo_lancamento,
    parcela_numero,
    origem_cronograma_id,
    forma_pagamento,
    gateway_provider,
    gateway_environment,
    gateway_payment_method,
    gateway_installments
  ) VALUES (
    v_destino.polo_id,
    'Dependência - ' || v_disciplina.nome || ' - ' || v_destino.codigo,
    v_attempt.valor_cobrado_snapshot,
    p_data_vencimento,
    'PENDENTE',
    'MENSALIDADE',
    v_matricula.aluno_id,
    NULL,
    p_turma_destino_id,
    'DEPENDENCIA',
    NULL,
    'dependencia:' || v_attempt.id::text,
    'BOLETO',
    'banese_card',
    v_gateway_environment,
    'BOLETO',
    1
  )
  RETURNING * INTO v_charge;

  INSERT INTO public.matricula_dependencia_cobrancas (
    tentativa_id,
    conta_receber_id,
    principal
  ) VALUES (
    v_attempt.id,
    v_charge.id,
    true
  );

  UPDATE public.matricula_componentes
  SET status = 'DEPENDENCIA_AGENDADA',
      updated_at = now()
  WHERE id = v_component.id;

  INSERT INTO public.matricula_dependencia_eventos (
    componente_id,
    tentativa_id,
    conta_receber_id,
    evento,
    actor_id,
    payload
  ) VALUES
    (
      v_component.id,
      v_attempt.id,
      NULL,
      'TENTATIVA_CONFIRMADA',
      auth.uid(),
      jsonb_build_object(
        'turmaDestinoId', p_turma_destino_id,
        'numeroTentativa', v_number
      )
    ),
    (
      v_component.id,
      v_attempt.id,
      v_charge.id,
      'COBRANCA_CRIADA',
      auth.uid(),
      jsonb_build_object(
        'valor', v_charge.valor,
        'dataVencimento', v_charge.data_vencimento,
        'status', v_charge.status,
        'emissaoBancariaSolicitada', false
      )
    );

  RETURN jsonb_build_object(
    'replayed', false,
    'componenteId', v_component.id,
    'tentativaId', v_attempt.id,
    'tentativaStatus', v_attempt.status,
    'contaReceberId', v_charge.id,
    'contaReceberStatus', v_charge.status,
    'valorCobrado', v_charge.valor,
    'dataVencimento', v_charge.data_vencimento,
    'turmaDestinoId', p_turma_destino_id,
    'disciplinaId', p_disciplina_id,
    'emissaoBancariaSolicitada', false
  );
END;
$$;

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
  v_policy public.politicas_cobranca_dependencia%ROWTYPE;
  v_version integer;
  v_multiplier numeric(8,4);
BEGIN
  IF p_polo_id IS NULL
    OR p_disciplina_id IS NULL
    OR p_multiplicador_parcela IS NULL
    OR nullif(btrim(coalesce(p_idempotency_key, '')), '') IS NULL
  THEN
    RAISE EXCEPTION
      'Polo, disciplina, multiplicador e idempotência são obrigatórios.'
      USING ERRCODE = '22023';
  END IF;

  IF p_multiplicador_parcela < 0.01
    OR p_multiplicador_parcela > 10
  THEN
    RAISE EXCEPTION
      'O multiplicador deve ficar entre 0,01 e 10 parcelas.'
      USING ERRCODE = '22023';
  END IF;

  IF length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION
      'A chave de idempotência deve ter entre 8 e 200 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  v_multiplier := round(p_multiplicador_parcela, 4);

  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND NOT (
      public.is_gestor_for_polo(p_polo_id)
      AND (
        public.gestor_has_tab('secretaria', 'solicitacoes')
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
      'dependencia-politica:'
        || p_polo_id::text
        || ':' || p_disciplina_id::text,
      0
    )
  );

  SELECT policy.*
  INTO v_policy
  FROM public.politicas_cobranca_dependencia policy
  WHERE policy.idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_policy.polo_id <> p_polo_id
      OR v_policy.disciplina_id <> p_disciplina_id
      OR v_policy.multiplicador_parcela <> v_multiplier
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
    'versao', v_policy.versao
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_secretaria_dependencias_workspace_secure(uuid, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_dependencia_ofertas_secure(uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.prever_dependencia_reoferta_secure(uuid, uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirmar_dependencia_reoferta_secure(uuid, uuid, uuid, date, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.configurar_politica_dependencia_disciplina_secure(uuid, uuid, numeric, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_secretaria_dependencias_workspace_secure(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dependencia_ofertas_secure(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prever_dependencia_reoferta_secure(uuid, uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirmar_dependencia_reoferta_secure(uuid, uuid, uuid, date, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.configurar_politica_dependencia_disciplina_secure(uuid, uuid, numeric, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION internal_academic.can_manage_dependency_workspace(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION internal_academic.get_terminal_dependency_failure(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION internal_academic.resolve_dependency_charge(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.matricula_componentes IS
  'Estado canônico por matrícula e componente curricular, sem criar matrícula na turma de reoferta.';
COMMENT ON TABLE public.matricula_disciplina_tentativas IS
  'Tentativas de dependência em uma oferta identificada pela chave composta turma_id + disciplina_id.';
COMMENT ON TABLE public.matricula_dependencia_cobrancas IS
  'Histórico de recebíveis da tentativa; apenas um vínculo principal por vez.';
COMMENT ON FUNCTION public.get_secretaria_dependencias_workspace_secure(uuid, text) IS
  'Deriva pendências somente de reprovação terminal em diário com bloqueio TOTAL; não faz backfill.';
COMMENT ON FUNCTION public.confirmar_dependencia_reoferta_secure(uuid, uuid, uuid, date, text) IS
  'Confirma reoferta idempotente e cria recebível PENDENTE sem chamar banco ou gateway.';
COMMENT ON FUNCTION public.configurar_politica_dependencia_disciplina_secure(uuid, uuid, numeric, text) IS
  'Cria versão idempotente de multiplicador por disciplina/polo; cálculos continuam exclusivos do backend.';

COMMIT;
