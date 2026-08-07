BEGIN;
-- Versão registrada pelo MCP Supabase: 20260729204559.

-- Separa a elegibilidade operacional do diário da ativação formal da matrícula.
-- A matrícula técnica continua PENDENTE até a análise documental, enquanto uma
-- liberação explícita e auditável permite registrar aulas, frequência e notas.

CREATE TABLE public.matricula_liberacoes_diario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matricula_id uuid NOT NULL
    REFERENCES public.matriculas(id) ON DELETE RESTRICT,
  motivo text NOT NULL,
  origem text NOT NULL DEFAULT 'GESTOR',
  liberado_em timestamptz NOT NULL DEFAULT now(),
  liberado_por uuid,
  liberado_por_sistema text,
  revogado_em timestamptz,
  revogado_por uuid,
  revogado_por_sistema text,
  revogacao_motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT matricula_liberacoes_diario_motivo_chk
    CHECK (length(btrim(motivo)) BETWEEN 10 AND 1000),
  CONSTRAINT matricula_liberacoes_diario_origem_chk
    CHECK (origem IN ('GESTOR', 'MIGRACAO_LEGADA')),
  CONSTRAINT matricula_liberacoes_diario_ator_chk
    CHECK (
      (origem = 'GESTOR' AND liberado_por IS NOT NULL)
      OR (
        origem = 'MIGRACAO_LEGADA'
        AND nullif(btrim(liberado_por_sistema), '') IS NOT NULL
      )
    ),
  CONSTRAINT matricula_liberacoes_diario_revogacao_chk
    CHECK (
      (revogado_em IS NULL AND revogado_por IS NULL AND revogacao_motivo IS NULL)
      OR (
        revogado_em IS NOT NULL
        AND (
          revogado_por IS NOT NULL
          OR nullif(btrim(revogado_por_sistema), '') IS NOT NULL
        )
        AND revogacao_motivo IS NOT NULL
        AND length(btrim(revogacao_motivo)) BETWEEN 10 AND 1000
      )
    )
);

CREATE UNIQUE INDEX matricula_liberacoes_diario_ativa_uidx
  ON public.matricula_liberacoes_diario (matricula_id)
  WHERE revogado_em IS NULL;

CREATE INDEX matricula_liberacoes_diario_historico_idx
  ON public.matricula_liberacoes_diario (matricula_id, liberado_em DESC);

ALTER TABLE public.matricula_liberacoes_diario ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.matricula_liberacoes_diario
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.matricula_liberacoes_diario TO service_role;

COMMENT ON TABLE public.matricula_liberacoes_diario IS
  'Histórico auditável de liberações para diário sem ativar formalmente a matrícula.';
COMMENT ON COLUMN public.matricula_liberacoes_diario.motivo IS
  'Justificativa administrativa para permitir registros acadêmicos antes da ativação formal.';

CREATE OR REPLACE FUNCTION public.protect_matricula_liberacoes_diario_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'O histórico de liberação do diário é imutável.'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.matricula_id IS DISTINCT FROM NEW.matricula_id
    OR OLD.motivo IS DISTINCT FROM NEW.motivo
    OR OLD.origem IS DISTINCT FROM NEW.origem
    OR OLD.liberado_em IS DISTINCT FROM NEW.liberado_em
    OR OLD.liberado_por IS DISTINCT FROM NEW.liberado_por
    OR OLD.liberado_por_sistema IS DISTINCT FROM NEW.liberado_por_sistema
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
    OR OLD.revogado_em IS NOT NULL
    OR NEW.revogado_em IS NULL
  THEN
    RAISE EXCEPTION 'Somente a primeira revogação auditada é permitida.'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  public.protect_matricula_liberacoes_diario_audit()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_protect_matricula_liberacoes_diario_audit
BEFORE UPDATE OR DELETE ON public.matricula_liberacoes_diario
FOR EACH ROW
EXECUTE FUNCTION public.protect_matricula_liberacoes_diario_audit();

CREATE TABLE public.turma_disciplina_carga_excecoes (
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  disciplina_id uuid NOT NULL
    REFERENCES public.disciplinas(id) ON DELETE CASCADE,
  limite_autorizado numeric NOT NULL,
  motivo text NOT NULL,
  origem text NOT NULL DEFAULT 'MIGRACAO_LEGADA',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (turma_id, disciplina_id),
  CONSTRAINT turma_disciplina_carga_excecoes_limite_chk
    CHECK (limite_autorizado > 0),
  CONSTRAINT turma_disciplina_carga_excecoes_motivo_chk
    CHECK (length(btrim(motivo)) BETWEEN 10 AND 1000),
  CONSTRAINT turma_disciplina_carga_excecoes_origem_chk
    CHECK (origem IN ('MIGRACAO_LEGADA'))
);

CREATE INDEX turma_disciplina_carga_excecoes_disciplina_idx
  ON public.turma_disciplina_carga_excecoes (disciplina_id);

ALTER TABLE public.turma_disciplina_carga_excecoes
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.turma_disciplina_carga_excecoes
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.turma_disciplina_carga_excecoes TO service_role;

COMMENT ON TABLE public.turma_disciplina_carga_excecoes IS
  'Exceções auditáveis de carga para preservar horas históricas acima da matriz.';

ALTER TABLE public.matriculas
  ADD CONSTRAINT matriculas_id_turma_aluno_key
  UNIQUE (id, turma_id, aluno_id);

CREATE TABLE public.diario_matriculas_roster (
  turma_id uuid NOT NULL,
  disciplina_id uuid NOT NULL,
  matricula_id uuid NOT NULL,
  aluno_id uuid NOT NULL,
  origem text NOT NULL DEFAULT 'MIGRACAO_LEGADA',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (turma_id, disciplina_id, matricula_id),
  CONSTRAINT diario_matriculas_roster_aluno_uidx
    UNIQUE (turma_id, disciplina_id, aluno_id),
  CONSTRAINT diario_matriculas_roster_disciplina_fkey
    FOREIGN KEY (turma_id, disciplina_id)
    REFERENCES public.turmas_disciplinas(turma_id, disciplina_id)
    ON DELETE CASCADE,
  CONSTRAINT diario_matriculas_roster_matricula_fkey
    FOREIGN KEY (matricula_id, turma_id, aluno_id)
    REFERENCES public.matriculas(id, turma_id, aluno_id)
    ON DELETE CASCADE,
  CONSTRAINT diario_matriculas_roster_origem_chk
    CHECK (origem IN ('MIGRACAO_LEGADA'))
);

CREATE INDEX diario_matriculas_roster_disciplina_idx
  ON public.diario_matriculas_roster (disciplina_id);
CREATE INDEX diario_matriculas_roster_matricula_idx
  ON public.diario_matriculas_roster (matricula_id);
CREATE INDEX diario_matriculas_roster_aluno_idx
  ON public.diario_matriculas_roster (aluno_id);

ALTER TABLE public.diario_matriculas_roster ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.diario_matriculas_roster
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.diario_matriculas_roster TO service_role;

COMMENT ON TABLE public.diario_matriculas_roster IS
  'Roster histórico por disciplina para importações legadas de diário.';

CREATE OR REPLACE FUNCTION public.validate_turma_disciplina_carga_horaria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limite numeric;
  v_total_aulas numeric := 0;
  v_total_atividades numeric := 0;
  v_total_novo numeric := 0;
  v_contribuicao_antiga numeric := 0;
  v_contribuicao_nova numeric := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.turmas turma
    JOIN public.cursos curso ON curso.id = turma.curso_id
    WHERE turma.id = NEW.turma_id
      AND curso.modalidade = 'TECNICO'
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'technical_workload:'
        || NEW.turma_id::text
        || ':'
        || NEW.disciplina_id::text,
      0
    )
  );

  SELECT greatest(
    coalesce(disciplina.carga_horaria, 0),
    coalesce(excecao.limite_autorizado, 0)
  )
  INTO v_limite
  FROM public.disciplinas disciplina
  LEFT JOIN public.turma_disciplina_carga_excecoes excecao
    ON excecao.turma_id = NEW.turma_id
   AND excecao.disciplina_id = disciplina.id
  WHERE disciplina.id = NEW.disciplina_id;

  IF v_limite IS NULL OR v_limite <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(sum(aula.carga_horaria), 0)
  INTO v_total_aulas
  FROM public.aulas_turma aula
  WHERE aula.turma_id = NEW.turma_id
    AND aula.disciplina_id = NEW.disciplina_id
    AND (TG_TABLE_NAME <> 'aulas_turma' OR aula.id <> NEW.id);

  SELECT coalesce(sum(atividade.carga_horaria_compensacao), 0)
  INTO v_total_atividades
  FROM public.atividades_extra_classe atividade
  WHERE atividade.turma_id = NEW.turma_id
    AND atividade.disciplina_id = NEW.disciplina_id
    AND atividade.status = 'PUBLICADA'
    AND (
      TG_TABLE_NAME <> 'atividades_extra_classe'
      OR atividade.id <> NEW.id
    );

  IF TG_TABLE_NAME = 'aulas_turma' THEN
    v_contribuicao_nova := coalesce(NEW.carga_horaria, 0);
    IF TG_OP = 'UPDATE'
      AND OLD.turma_id = NEW.turma_id
      AND OLD.disciplina_id = NEW.disciplina_id
    THEN
      v_contribuicao_antiga := coalesce(OLD.carga_horaria, 0);
    END IF;
  ELSE
    IF NEW.status = 'PUBLICADA' THEN
      v_contribuicao_nova :=
        coalesce(NEW.carga_horaria_compensacao, 0);
    END IF;
    IF TG_OP = 'UPDATE'
      AND OLD.turma_id = NEW.turma_id
      AND OLD.disciplina_id = NEW.disciplina_id
      AND OLD.status = 'PUBLICADA'
    THEN
      v_contribuicao_antiga :=
        coalesce(OLD.carga_horaria_compensacao, 0);
    END IF;
  END IF;

  v_total_novo :=
    v_total_aulas + v_total_atividades + v_contribuicao_nova;

  IF v_total_novo > v_limite
    AND v_contribuicao_nova > v_contribuicao_antiga
  THEN
    RAISE EXCEPTION
      'Carga horaria excedida. Limite: %h; total planejado: %h.',
      trim(to_char(v_limite, 'FM999999990.00')),
      trim(to_char(v_total_novo, 'FM999999990.00'))
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_turma_disciplina_carga_horaria()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION internal_academic.is_student_released_for_diary(
  p_turma_id uuid,
  p_aluno_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matriculas matricula
    WHERE matricula.turma_id = p_turma_id
      AND matricula.aluno_id = p_aluno_id
      AND (
        upper(coalesce(matricula.status, '')) = 'ATIVO'
        OR (
          upper(coalesce(matricula.status, '')) = 'PENDENTE'
          AND EXISTS (
            SELECT 1
            FROM public.matricula_liberacoes_diario liberacao
            WHERE liberacao.matricula_id = matricula.id
              AND liberacao.revogado_em IS NULL
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION
  internal_academic.is_student_released_for_diary(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  internal_academic.is_student_released_for_diary(uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION internal_academic.is_student_in_diary_roster(
  p_turma_id uuid,
  p_disciplina_id uuid,
  p_matricula_id uuid,
  p_aluno_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.diario_matriculas_roster roster
      WHERE roster.turma_id = p_turma_id
        AND roster.disciplina_id = p_disciplina_id
    ) THEN EXISTS (
      SELECT 1
      FROM public.diario_matriculas_roster roster
      WHERE roster.turma_id = p_turma_id
        AND roster.disciplina_id = p_disciplina_id
        AND (
          p_matricula_id IS NULL
          OR roster.matricula_id = p_matricula_id
        )
        AND roster.aluno_id = p_aluno_id
    )
    ELSE
      internal_academic.is_student_released_for_diary(
        p_turma_id,
        p_aluno_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.diario_frequencia frequencia
        WHERE frequencia.turma_id = p_turma_id
          AND frequencia.disciplina_id = p_disciplina_id
          AND frequencia.aluno_id = p_aluno_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.diario_notas nota
        WHERE nota.turma_id = p_turma_id
          AND nota.disciplina_id = p_disciplina_id
          AND nota.aluno_id = p_aluno_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.matricula_aproveitamentos aproveitamento
        WHERE aproveitamento.matricula_id = p_matricula_id
          AND aproveitamento.disciplina_id = p_disciplina_id
      )
  END;
$$;

REVOKE ALL ON FUNCTION
  internal_academic.is_student_in_diary_roster(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  internal_academic.is_student_in_diary_roster(uuid, uuid, uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION internal_academic.can_write_student_in_diary(
  p_turma_id uuid,
  p_disciplina_id uuid,
  p_matricula_id uuid,
  p_aluno_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    internal_academic.is_student_released_for_diary(
      p_turma_id,
      p_aluno_id
    )
    AND (
      NOT EXISTS (
        SELECT 1
        FROM public.diario_matriculas_roster roster
        WHERE roster.turma_id = p_turma_id
          AND roster.disciplina_id = p_disciplina_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.diario_matriculas_roster roster
        WHERE roster.turma_id = p_turma_id
          AND roster.disciplina_id = p_disciplina_id
          AND (
            p_matricula_id IS NULL
            OR roster.matricula_id = p_matricula_id
          )
          AND roster.aluno_id = p_aluno_id
      )
    );
$$;

REVOKE ALL ON FUNCTION
  internal_academic.can_write_student_in_diary(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  internal_academic.can_write_student_in_diary(uuid, uuid, uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_diario_alunos(
  p_turma_id uuid,
  p_disciplina_id uuid
)
RETURNS TABLE (
  matricula_id uuid,
  aluno_id uuid,
  nome text,
  data_matricula timestamptz,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND NOT public.gestor_can_read_diario_results(p_turma_id)
    AND NOT public.is_professor_assigned_disciplina(
      p_turma_id,
      p_disciplina_id
    )
  THEN
    RAISE EXCEPTION 'Acesso ao diário não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT base.*
  FROM internal_academic.p1_get_diario_alunos_20260719(
    p_turma_id,
    p_disciplina_id
  ) base
  WHERE internal_academic.is_student_in_diary_roster(
    p_turma_id,
    p_disciplina_id,
    base.matricula_id,
    base.aluno_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_diario_alunos(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_diario_alunos(uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_diario_resultados(
  p_turma_id uuid,
  p_disciplina_id uuid
)
RETURNS TABLE (
  turma_id uuid,
  disciplina_id uuid,
  aluno_id uuid,
  nota_p numeric,
  nota_ti numeric,
  nota_tg numeric,
  nota_s numeric,
  nota_cq numeric,
  nota_o numeric,
  nota_rec numeric,
  total_aulas bigint,
  total_faltas bigint,
  frequencia_percent numeric,
  media_parcial numeric,
  media_final numeric,
  resultado_final text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_aluno_id uuid := public.current_aluno_id();
  v_full_access boolean;
  v_student_access boolean;
BEGIN
  v_full_access :=
    coalesce((SELECT auth.role()), '') = 'service_role'
    OR public.gestor_can_read_diario_results(p_turma_id)
    OR public.is_professor_assigned_disciplina(
      p_turma_id,
      p_disciplina_id
    );

  SELECT EXISTS (
    SELECT 1
    FROM public.matriculas matricula
    JOIN public.turmas turma ON turma.id = matricula.turma_id
    JOIN public.cursos curso ON curso.id = turma.curso_id
    WHERE matricula.turma_id = p_turma_id
      AND matricula.aluno_id = v_aluno_id
      AND upper(coalesce(curso.modalidade, '')) IN ('TECNICO', 'TÉCNICO')
      AND (
        (
          upper(coalesce(turma.status, '')) = 'EM_ANDAMENTO'
          AND upper(coalesce(matricula.status, '')) = 'ATIVO'
        )
        OR (
          upper(coalesce(turma.status, '')) = 'FINALIZADA'
          AND upper(coalesce(matricula.status, ''))
            IN ('CONCLUIDO', 'REPROVADO')
        )
      )
  )
  INTO v_student_access;

  IF NOT coalesce(v_full_access, false)
    AND NOT coalesce(v_student_access, false)
  THEN
    RAISE EXCEPTION 'Acesso aos resultados não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  IF coalesce(v_full_access, false) THEN
    RETURN QUERY
    SELECT resultado.*
    FROM internal_academic.p1_get_diario_resultados_20260719(
      p_turma_id,
      p_disciplina_id
    ) resultado
    WHERE internal_academic.is_student_in_diary_roster(
      p_turma_id,
      p_disciplina_id,
      NULL,
      resultado.aluno_id
    );
  ELSE
    RETURN QUERY
    SELECT resultado.*
    FROM internal_academic.p1_get_diario_resultados_20260719(
      p_turma_id,
      p_disciplina_id
    ) resultado
    WHERE resultado.aluno_id = v_aluno_id
      AND internal_academic.is_student_in_diary_roster(
        p_turma_id,
        p_disciplina_id,
        NULL,
        resultado.aluno_id
      );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_diario_resultados(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_diario_resultados(uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_matricula_liberacao_diario(
  p_matricula_id uuid,
  p_liberada boolean,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_matricula public.matriculas%ROWTYPE;
  v_turma public.turmas%ROWTYPE;
  v_liberacao_id uuid;
  v_modalidade text;
  v_service_role boolean :=
    coalesce((SELECT auth.role()), '') = 'service_role';
BEGIN
  IF p_matricula_id IS NULL OR p_liberada IS NULL THEN
    RAISE EXCEPTION 'Matrícula e decisão de liberação são obrigatórias.'
      USING ERRCODE = '22023';
  END IF;

  IF length(btrim(coalesce(p_motivo, ''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'Informe uma justificativa entre 10 e 1000 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_matricula
  FROM public.matriculas
  WHERE id = p_matricula_id
  FOR UPDATE;

  IF v_matricula.id IS NULL THEN
    RAISE EXCEPTION 'Matrícula não encontrada.'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_turma
  FROM public.turmas
  WHERE id = v_matricula.turma_id;

  SELECT upper(coalesce(curso.modalidade, ''))
  INTO v_modalidade
  FROM public.cursos curso
  WHERE curso.id = v_turma.curso_id;

  IF NOT v_service_role
    AND (
      (SELECT auth.uid()) IS NULL
      OR v_turma.polo_id IS NULL
      OR NOT public.is_gestor_for_polo(v_turma.polo_id)
    )
  THEN
    RAISE EXCEPTION 'Sem permissão para liberar esta matrícula para o diário.'
      USING ERRCODE = '42501';
  END IF;

  IF p_liberada THEN
    IF v_modalidade NOT IN ('TECNICO', 'TÉCNICO') THEN
      RAISE EXCEPTION
        'A liberação antecipada para diário é exclusiva de curso técnico.'
        USING ERRCODE = '22023';
    END IF;

    IF upper(coalesce(v_turma.status, '')) <> 'EM_ANDAMENTO' THEN
      RAISE EXCEPTION
        'A turma precisa estar em andamento para liberar diário antecipadamente.'
        USING ERRCODE = '22023';
    END IF;

    IF upper(coalesce(v_matricula.status, '')) <> 'PENDENTE' THEN
      RAISE EXCEPTION
        'Somente matrícula pendente de regularização pode receber liberação antecipada para o diário.'
        USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_matricula.gerar_cobranca_inicial, false)
      OR coalesce(v_matricula.gerar_cobranca_futura, false)
      OR coalesce(v_matricula.sincronizar_asaas, false)
      OR EXISTS (
        SELECT 1
        FROM public.contas_receber conta
        WHERE conta.matricula_id = v_matricula.id
      )
    THEN
      RAISE EXCEPTION
        'Desative o financeiro individual antes da liberação antecipada para o diário.'
        USING ERRCODE = '22023';
    END IF;

    SELECT id
    INTO v_liberacao_id
    FROM public.matricula_liberacoes_diario
    WHERE matricula_id = p_matricula_id
      AND revogado_em IS NULL
    FOR UPDATE;

    IF v_liberacao_id IS NULL THEN
      INSERT INTO public.matricula_liberacoes_diario (
        matricula_id,
        motivo,
        origem,
        liberado_por,
        liberado_por_sistema
      )
      VALUES (
        p_matricula_id,
        btrim(p_motivo),
        CASE
          WHEN v_service_role AND (SELECT auth.uid()) IS NULL
            THEN 'MIGRACAO_LEGADA'
          ELSE 'GESTOR'
        END,
        (SELECT auth.uid()),
        CASE
          WHEN v_service_role AND (SELECT auth.uid()) IS NULL
            THEN 'MCP_SUPABASE_SERVICE_ROLE'
          ELSE NULL
        END
      )
      RETURNING id INTO v_liberacao_id;
    END IF;
  ELSE
    UPDATE public.matricula_liberacoes_diario
    SET
      revogado_em = now(),
      revogado_por = (SELECT auth.uid()),
      revogado_por_sistema = CASE
        WHEN (SELECT auth.uid()) IS NULL THEN 'MCP_SUPABASE_SERVICE_ROLE'
        ELSE NULL
      END,
      revogacao_motivo = btrim(p_motivo)
    WHERE matricula_id = p_matricula_id
      AND revogado_em IS NULL
    RETURNING id INTO v_liberacao_id;

    IF v_liberacao_id IS NULL THEN
      RAISE EXCEPTION 'A matrícula não possui liberação ativa para revogar.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'matriculaId', p_matricula_id,
    'liberacaoId', v_liberacao_id,
    'liberada', p_liberada,
    'statusMatricula', v_matricula.status
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.set_matricula_liberacao_diario(uuid, boolean, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.set_matricula_liberacao_diario(uuid, boolean, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revogar_liberacao_diario_ao_mudar_matricula()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
    OR OLD.aluno_id IS DISTINCT FROM NEW.aluno_id
    OR OLD.turma_id IS DISTINCT FROM NEW.turma_id
  THEN
    UPDATE public.matricula_liberacoes_diario
    SET
      revogado_em = now(),
      revogado_por = (SELECT auth.uid()),
      revogado_por_sistema = CASE
        WHEN (SELECT auth.uid()) IS NULL THEN 'TRIGGER_MATRICULA'
        ELSE NULL
      END,
      revogacao_motivo =
        'Revogação automática por alteração do vínculo ou do status da matrícula.'
    WHERE matricula_id = OLD.id
      AND revogado_em IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  public.revogar_liberacao_diario_ao_mudar_matricula()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_revogar_liberacao_diario_ao_mudar_matricula
  ON public.matriculas;
CREATE TRIGGER trg_revogar_liberacao_diario_ao_mudar_matricula
AFTER UPDATE OF status, aluno_id, turma_id
ON public.matriculas
FOR EACH ROW
EXECUTE FUNCTION public.revogar_liberacao_diario_ao_mudar_matricula();

DROP POLICY IF EXISTS "portal_diario_frequencia_insert"
  ON public.diario_frequencia;
DROP POLICY IF EXISTS "portal_diario_frequencia_update"
  ON public.diario_frequencia;
DROP POLICY IF EXISTS "portal_diario_frequencia_delete"
  ON public.diario_frequencia;

CREATE POLICY "portal_diario_frequencia_insert"
  ON public.diario_frequencia
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (
      SELECT internal_academic.can_write_student_in_diary(
        turma_id,
        disciplina_id,
        NULL,
        aluno_id
      )
    )
    AND (
      SELECT internal_academic.is_aula_in_academic_context(
        turma_id,
        disciplina_id,
        aula_id
      )
    )
  );

CREATE POLICY "portal_diario_frequencia_update"
  ON public.diario_frequencia
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (
      SELECT internal_academic.can_write_student_in_diary(
        turma_id,
        disciplina_id,
        NULL,
        aluno_id
      )
    )
    AND (
      SELECT internal_academic.is_aula_in_academic_context(
        turma_id,
        disciplina_id,
        aula_id
      )
    )
  )
  WITH CHECK (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (
      SELECT internal_academic.can_write_student_in_diary(
        turma_id,
        disciplina_id,
        NULL,
        aluno_id
      )
    )
    AND (
      SELECT internal_academic.is_aula_in_academic_context(
        turma_id,
        disciplina_id,
        aula_id
      )
    )
  );

CREATE POLICY "portal_diario_frequencia_delete"
  ON public.diario_frequencia
  FOR DELETE TO authenticated
  USING (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (
      SELECT internal_academic.can_write_student_in_diary(
        turma_id,
        disciplina_id,
        NULL,
        aluno_id
      )
    )
    AND (
      SELECT internal_academic.is_aula_in_academic_context(
        turma_id,
        disciplina_id,
        aula_id
      )
    )
  );

DROP POLICY IF EXISTS "portal_diario_notas_insert"
  ON public.diario_notas;
DROP POLICY IF EXISTS "portal_diario_notas_update"
  ON public.diario_notas;
DROP POLICY IF EXISTS "portal_diario_notas_delete"
  ON public.diario_notas;

CREATE POLICY "portal_diario_notas_insert"
  ON public.diario_notas
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (
      SELECT internal_academic.can_write_student_in_diary(
        turma_id,
        disciplina_id,
        NULL,
        aluno_id
      )
    )
  );

CREATE POLICY "portal_diario_notas_update"
  ON public.diario_notas
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (
      SELECT internal_academic.can_write_student_in_diary(
        turma_id,
        disciplina_id,
        NULL,
        aluno_id
      )
    )
  )
  WITH CHECK (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (
      SELECT internal_academic.can_write_student_in_diary(
        turma_id,
        disciplina_id,
        NULL,
        aluno_id
      )
    )
  );

CREATE POLICY "portal_diario_notas_delete"
  ON public.diario_notas
  FOR DELETE TO authenticated
  USING (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (
      SELECT internal_academic.can_write_student_in_diary(
        turma_id,
        disciplina_id,
        NULL,
        aluno_id
      )
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_diario_frequencia_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT internal_academic.can_write_student_in_diary(
      NEW.turma_id,
      NEW.disciplina_id,
      NULL,
      NEW.aluno_id
    )
    OR NOT internal_academic.is_aula_in_academic_context(
      NEW.turma_id,
      NEW.disciplina_id,
      NEW.aula_id
    )
  THEN
    RAISE EXCEPTION 'Frequência fora do contexto acadêmico válido.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_diario_notas_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT internal_academic.can_write_student_in_diary(
    NEW.turma_id,
    NEW.disciplina_id,
    NULL,
    NEW.aluno_id
  ) THEN
    RAISE EXCEPTION 'Nota sem matrícula ativa ou liberada para o diário.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pendencias_fechamento_diario(
  p_turma_id uuid,
  p_disciplina_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_alunos integer;
  v_encontros integer;
  v_sessoes integer;
  v_frequencias integer;
  v_notas_pendentes integer;
BEGIN
  IF NOT (
    public.can_operate_turma_academics(p_turma_id)
    OR public.is_professor_assigned_disciplina(
      p_turma_id,
      p_disciplina_id
    )
  ) THEN
    RAISE EXCEPTION 'Sem permissão para consultar as pendências deste diário.'
      USING ERRCODE = '42501';
  END IF;

  WITH alunos AS (
    SELECT aluno_id
    FROM public.get_diario_alunos(p_turma_id, p_disciplina_id)
  ),
  sessoes AS (
    SELECT id, data_aula
    FROM public.aulas_turma
    WHERE turma_id = p_turma_id
      AND disciplina_id = p_disciplina_id
      AND (
        data_aula IS NULL
        OR data_aula <= pg_catalog.timezone(
          'America/Maceio',
          now()
        )::date
      )
  )
  SELECT
    (SELECT count(*) FROM alunos),
    (SELECT count(DISTINCT data_aula) FROM sessoes),
    (SELECT count(*) FROM sessoes),
    (
      SELECT count(*)
      FROM public.diario_frequencia frequencia
      JOIN alunos aluno ON aluno.aluno_id = frequencia.aluno_id
      JOIN sessoes sessao ON sessao.id = frequencia.aula_id
      WHERE frequencia.turma_id = p_turma_id
        AND frequencia.disciplina_id = p_disciplina_id
        AND frequencia.status IN ('P', 'F', 'J')
    )
  INTO v_alunos, v_encontros, v_sessoes, v_frequencias;

  WITH alunos AS (
    SELECT aluno_id
    FROM public.get_diario_alunos(p_turma_id, p_disciplina_id)
  ),
  resultados AS (
    SELECT resultado.aluno_id, resultado.media_parcial
    FROM public.get_diario_resultados(
      p_turma_id,
      p_disciplina_id
    ) resultado
  )
  SELECT count(*)
  INTO v_notas_pendentes
  FROM alunos aluno
  LEFT JOIN resultados resultado
    ON resultado.aluno_id = aluno.aluno_id
  WHERE resultado.media_parcial IS NULL;

  RETURN jsonb_build_object(
    'alunosAtivos', v_alunos,
    'aulasRealizadas', v_encontros,
    'encontrosRealizados', v_encontros,
    'sessoesRealizadas', v_sessoes,
    'frequenciasPendentes',
      greatest(0, v_alunos * v_sessoes - v_frequencias),
    'notasPendentes', v_notas_pendentes,
    'podeFechar', (
      v_alunos > 0
      AND v_sessoes > 0
      AND v_alunos * v_sessoes = v_frequencias
      AND v_notas_pendentes = 0
    )
  );
END;
$$;

DO $correct_t41_workload$
DECLARE
  v_turma_id uuid;
  v_aulas integer;
  v_horas numeric;
  v_praticas integer;
  v_aula_primeiros_socorros uuid;
  v_nova_sessao uuid;
  v_praticas_copiadas integer;
BEGIN
  SELECT id
  INTO v_turma_id
  FROM public.turmas
  WHERE codigo = 'ENF-T41-SEM-AQU'
    AND nome = 'ENF T-41 SEM';

  IF v_turma_id IS NULL THEN
    RAISE NOTICE
      'Turma 41 ausente neste ambiente; correção histórica não aplicada.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.diario_frequencia
    WHERE turma_id = v_turma_id
  ) OR EXISTS (
    SELECT 1
    FROM public.diario_notas
    WHERE turma_id = v_turma_id
  ) THEN
    RAISE EXCEPTION
      'A carga da Turma 41 não pode ser corrigida após notas ou frequências.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.turma_disciplina_carga_excecoes (
    turma_id,
    disciplina_id,
    limite_autorizado,
    motivo,
    origem
  )
  SELECT
    v_turma_id,
    disciplina.id,
    esperado.horas,
    'Carga histórica efetivamente ministrada e registrada no diário legado da Turma 41.',
    'MIGRACAO_LEGADA'
  FROM (
    VALUES
      ('Princípios de Nutrição e Dietética'::text, 36::numeric),
      ('Ética Profissional e Legislação em Enfermagem', 24::numeric),
      ('História da Enfermagem', 36::numeric),
      ('Informática Básica', 32::numeric),
      ('Noções de Primeiros Socorros', 48::numeric),
      ('Teoria do Cuidado', 24::numeric),
      ('Relações Humanas no Trabalho', 24::numeric)
  ) esperado(nome, horas)
  JOIN public.disciplinas disciplina
    ON disciplina.nome = esperado.nome;

  IF (
    SELECT count(*)
    FROM public.turma_disciplina_carga_excecoes
    WHERE turma_id = v_turma_id
  ) <> 7 THEN
    RAISE EXCEPTION
      'Não foi possível registrar as sete exceções históricas de carga da Turma 41.'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    count(*),
    coalesce(sum(carga_horaria), 0)
  INTO v_aulas, v_horas
  FROM public.aulas_turma
  WHERE turma_id = v_turma_id;

  SELECT count(*)
  INTO v_praticas
  FROM public.diario_praticas
  WHERE turma_id = v_turma_id;

  IF (v_aulas, v_horas, v_praticas) = (0, 0::numeric, 0) THEN
    RETURN;
  ELSIF (v_aulas, v_horas, v_praticas) =
    (111, 420::numeric, 110)
  THEN
    UPDATE public.aulas_turma aula
    SET carga_horaria = 4
    FROM public.disciplinas disciplina
    WHERE aula.turma_id = v_turma_id
      AND disciplina.id = aula.disciplina_id
      AND disciplina.nome IN (
        'Princípios de Nutrição e Dietética',
        'Ética Profissional e Legislação em Enfermagem',
        'História da Enfermagem',
        'Informática Básica',
        'Noções de Primeiros Socorros',
        'Teoria do Cuidado',
        'Relações Humanas no Trabalho'
      );

    SELECT aula.id
    INTO STRICT v_aula_primeiros_socorros
    FROM public.aulas_turma aula
    JOIN public.disciplinas disciplina
      ON disciplina.id = aula.disciplina_id
    WHERE aula.turma_id = v_turma_id
      AND disciplina.nome = 'Noções de Primeiros Socorros'
      AND aula.data_aula = date '2025-09-24';

    UPDATE public.aulas_turma
    SET sessao = 'M', carga_horaria = 4
    WHERE id = v_aula_primeiros_socorros;

    INSERT INTO public.aulas_turma (
      turma_id,
      disciplina_id,
      titulo,
      carga_horaria,
      data_aula,
      sessao
    )
    SELECT
      turma_id,
      disciplina_id,
      titulo,
      4,
      data_aula,
      'T'
    FROM public.aulas_turma
    WHERE id = v_aula_primeiros_socorros
    RETURNING id INTO v_nova_sessao;

    INSERT INTO public.diario_praticas (
      turma_id,
      disciplina_id,
      aula_id,
      pratica_pedagogica
    )
    SELECT
      pratica.turma_id,
      pratica.disciplina_id,
      v_nova_sessao,
      pratica.pratica_pedagogica
    FROM public.diario_praticas pratica
    WHERE pratica.aula_id = v_aula_primeiros_socorros;

    GET DIAGNOSTICS v_praticas_copiadas = ROW_COUNT;
    IF v_praticas_copiadas <> 1 THEN
      RAISE EXCEPTION
        'A prática da sessão de Primeiros Socorros não foi duplicada corretamente.'
        USING ERRCODE = '22023';
    END IF;
  ELSIF (v_aulas, v_horas, v_praticas) <>
    (112, 454::numeric, 111)
  THEN
    RAISE EXCEPTION
      'Estado estrutural inesperado na Turma 41: aulas %, horas %, práticas %.',
      v_aulas,
      v_horas,
      v_praticas
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    WITH esperado(nome, horas, sessoes, praticas) AS (
      VALUES
        ('Microbiologia, Parasitologia e Patologia'::text, 40::numeric, 10, 10),
        ('Princípios de Nutrição e Dietética', 36::numeric, 9, 9),
        ('Enfermagem em Saúde da Mulher, Obstetrícia e Neonatologia', 70::numeric, 17, 17),
        ('Anatomia e Fisiologia Humana', 70::numeric, 17, 16),
        ('Enfermagem Médica', 50::numeric, 12, 12),
        ('Ética Profissional e Legislação em Enfermagem', 24::numeric, 6, 6),
        ('História da Enfermagem', 36::numeric, 9, 9),
        ('Informática Básica', 32::numeric, 8, 8),
        ('Noções de Primeiros Socorros', 48::numeric, 12, 12),
        ('Teoria do Cuidado', 24::numeric, 6, 6),
        ('Relações Humanas no Trabalho', 24::numeric, 6, 6)
    ),
    atual AS (
      SELECT
        disciplina.nome,
        coalesce(sum(aula.carga_horaria), 0) AS horas,
        count(DISTINCT aula.id) AS sessoes,
        count(DISTINCT pratica.aula_id) AS praticas
      FROM public.disciplinas disciplina
      JOIN public.aulas_turma aula
        ON aula.disciplina_id = disciplina.id
       AND aula.turma_id = v_turma_id
      LEFT JOIN public.diario_praticas pratica
        ON pratica.aula_id = aula.id
       AND pratica.turma_id = aula.turma_id
       AND pratica.disciplina_id = aula.disciplina_id
      GROUP BY disciplina.nome
    )
    SELECT 1
    FROM esperado
    LEFT JOIN atual USING (nome)
    WHERE atual.nome IS NULL
       OR esperado.horas <> atual.horas
       OR esperado.sessoes <> atual.sessoes
       OR esperado.praticas <> atual.praticas
  ) THEN
    RAISE EXCEPTION
      'A estrutura corrigida da Turma 41 diverge dos 11 diários.'
      USING ERRCODE = '22023';
  END IF;
END;
$correct_t41_workload$;

-- A T41 é uma turma migrada de sistema anterior. A liberação abaixo é apenas
-- acadêmica; o vínculo continua pendente de documentação e sem financeiro.
DO $seed_t41$
DECLARE
  v_turma_id uuid;
  v_matriculas integer;
  v_liberacoes integer;
BEGIN
  SELECT id
  INTO v_turma_id
  FROM public.turmas
  WHERE codigo = 'ENF-T41-SEM-AQU'
    AND nome = 'ENF T-41 SEM';

  IF v_turma_id IS NULL THEN
    RAISE NOTICE
      'Turma 41 ausente neste ambiente; liberações acadêmicas não aplicadas.';
    RETURN;
  END IF;

  SELECT count(*)
  INTO v_matriculas
  FROM public.matriculas
  WHERE turma_id = v_turma_id;

  IF v_matriculas <> 32 THEN
    RAISE EXCEPTION
      'Esperadas 32 matrículas na Turma 41; encontradas %.',
      v_matriculas
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contas_receber conta
    LEFT JOIN public.matriculas matricula
      ON matricula.id = conta.matricula_id
    WHERE conta.turma_id = v_turma_id
       OR matricula.turma_id = v_turma_id
  ) OR EXISTS (
    SELECT 1
    FROM public.inscricoes_online inscricao
    LEFT JOIN public.matriculas matricula
      ON matricula.id = inscricao.matricula_id
    WHERE inscricao.turma_id = v_turma_id
       OR matricula.turma_id = v_turma_id
  ) THEN
    RAISE EXCEPTION
      'A Turma 41 possui contas a receber e não pode usar esta liberação sem financeiro.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.matriculas
    WHERE turma_id = v_turma_id
      AND upper(coalesce(status, '')) <> 'PENDENTE'
  ) THEN
    RAISE EXCEPTION
      'A Turma 41 possui matrícula fora do estado documental pendente.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.matriculas
  SET
    gerar_cobranca_inicial = false,
    gerar_cobranca_futura = false,
    sincronizar_asaas = false
  WHERE turma_id = v_turma_id;

  INSERT INTO public.matricula_liberacoes_diario (
    matricula_id,
    motivo,
    origem,
    liberado_por_sistema
  )
  SELECT
    matricula.id,
    'Migração legada: aluno já frequenta aulas; documentação conferida no sistema anterior e financeiro permanece desativado.',
    'MIGRACAO_LEGADA',
    'MCP_SUPABASE_BACKFILL_T41_20260729'
  FROM public.matriculas matricula
  WHERE matricula.turma_id = v_turma_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.matricula_liberacoes_diario liberacao
      WHERE liberacao.matricula_id = matricula.id
        AND liberacao.revogado_em IS NULL
    );

  SELECT count(*)
  INTO v_liberacoes
  FROM public.matricula_liberacoes_diario liberacao
  JOIN public.matriculas matricula
    ON matricula.id = liberacao.matricula_id
  WHERE matricula.turma_id = v_turma_id
    AND liberacao.revogado_em IS NULL;

  IF v_liberacoes <> 32 THEN
    RAISE EXCEPTION
      'Esperadas 32 liberações acadêmicas na Turma 41; encontradas %.',
      v_liberacoes
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.matriculas
    WHERE turma_id = v_turma_id
      AND (
        gerar_cobranca_inicial
        OR gerar_cobranca_futura
        OR sincronizar_asaas
      )
  ) THEN
    RAISE EXCEPTION
      'A proteção financeira da Turma 41 não foi preservada.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contas_receber conta
    LEFT JOIN public.matriculas matricula
      ON matricula.id = conta.matricula_id
    WHERE conta.turma_id = v_turma_id
       OR matricula.turma_id = v_turma_id
  ) OR EXISTS (
    SELECT 1
    FROM public.inscricoes_online inscricao
    LEFT JOIN public.matriculas matricula
      ON matricula.id = inscricao.matricula_id
    WHERE inscricao.turma_id = v_turma_id
       OR matricula.turma_id = v_turma_id
  ) THEN
    RAISE EXCEPTION
      'Foi identificado lançamento financeiro concorrente na Turma 41.'
      USING ERRCODE = '22023';
  END IF;
END;
$seed_t41$;

COMMIT;
