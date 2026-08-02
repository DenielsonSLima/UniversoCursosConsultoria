-- Corrige o ciclo técnico: a matrícula financeira nasce pendente, a ativação
-- usa a máquina de estados, implantação vira estado explícito e o workflow
-- documental passa a compartilhar uma trava transacional por aluno.
-- Versão registrada pelo MCP Supabase: 20260731044628.

ALTER TABLE public.matriculas
  ADD COLUMN IF NOT EXISTS fluxo_operacional text NOT NULL DEFAULT 'REGULAR',
  ADD COLUMN IF NOT EXISTS fluxo_operacional_motivo text,
  ADD COLUMN IF NOT EXISTS fluxo_operacional_definido_em timestamptz,
  ADD COLUMN IF NOT EXISTS fluxo_operacional_definido_por uuid;

ALTER TABLE public.matriculas
  DROP CONSTRAINT IF EXISTS matriculas_fluxo_operacional_chk,
  ADD CONSTRAINT matriculas_fluxo_operacional_chk
    CHECK (fluxo_operacional IN ('REGULAR', 'IMPLANTACAO')),
  DROP CONSTRAINT IF EXISTS matriculas_fluxo_operacional_auditoria_chk,
  ADD CONSTRAINT matriculas_fluxo_operacional_auditoria_chk
    CHECK (
      fluxo_operacional = 'REGULAR'
      OR (
        length(btrim(coalesce(fluxo_operacional_motivo, '')))
          BETWEEN 10 AND 1000
        AND fluxo_operacional_definido_em IS NOT NULL
      )
    ) NOT VALID;

UPDATE public.matriculas matricula
SET
  fluxo_operacional = 'IMPLANTACAO',
  fluxo_operacional_motivo =
    'Implantação legada auditada pela liberação acadêmica existente.',
  fluxo_operacional_definido_em = coalesce(
    liberacao.liberado_em,
    now()
  ),
  fluxo_operacional_definido_por = liberacao.liberado_por
FROM public.matricula_liberacoes_diario liberacao
WHERE liberacao.matricula_id = matricula.id
  AND liberacao.revogado_em IS NULL
  AND matricula.fluxo_operacional <> 'IMPLANTACAO';

ALTER TABLE public.matriculas
  VALIDATE CONSTRAINT matriculas_fluxo_operacional_auditoria_chk;

ALTER TABLE public.matriculas
  DROP CONSTRAINT IF EXISTS matriculas_implantacao_sem_financeiro_chk,
  ADD CONSTRAINT matriculas_implantacao_sem_financeiro_chk
    CHECK (
      fluxo_operacional <> 'IMPLANTACAO'
      OR (
        financeiro_herdado = false
        AND gerar_cobranca_inicial = false
        AND coalesce(gerar_cobranca_futura, false) = false
        AND coalesce(sincronizar_asaas, false) = false
      )
    ) NOT VALID;

ALTER TABLE public.matriculas
  VALIDATE CONSTRAINT matriculas_implantacao_sem_financeiro_chk;

COMMENT ON COLUMN public.matriculas.fluxo_operacional IS
  'Fluxo canônico da matrícula: REGULAR ou IMPLANTACAO sem financeiro.';

CREATE OR REPLACE FUNCTION
  internal_academic.authorize_matricula_control_update(p_matricula_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO internal_academic.transition_authorizations (
    transaction_id,
    backend_pid,
    entity,
    record_id,
    new_status
  )
  VALUES (
    pg_current_xact_id()::text,
    pg_backend_pid(),
    'MATRICULA_CONTROL',
    p_matricula_id,
    'UPDATE'
  )
  ON CONFLICT DO NOTHING;
$$;

REVOKE ALL ON FUNCTION
  internal_academic.authorize_matricula_control_update(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.protect_matricula_control_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_authorized boolean;
BEGIN
  IF OLD.financeiro_herdado IS DISTINCT FROM NEW.financeiro_herdado
    OR OLD.gerar_cobranca_inicial IS DISTINCT FROM NEW.gerar_cobranca_inicial
    OR OLD.gerar_cobranca_futura IS DISTINCT FROM NEW.gerar_cobranca_futura
    OR OLD.sincronizar_asaas IS DISTINCT FROM NEW.sincronizar_asaas
    OR OLD.fluxo_operacional IS DISTINCT FROM NEW.fluxo_operacional
    OR OLD.fluxo_operacional_motivo
      IS DISTINCT FROM NEW.fluxo_operacional_motivo
    OR OLD.fluxo_operacional_definido_em
      IS DISTINCT FROM NEW.fluxo_operacional_definido_em
    OR OLD.fluxo_operacional_definido_por
      IS DISTINCT FROM NEW.fluxo_operacional_definido_por
  THEN
    DELETE FROM internal_academic.transition_authorizations ta
    WHERE ta.transaction_id = pg_current_xact_id()::text
      AND ta.backend_pid = pg_backend_pid()
      AND ta.entity = 'MATRICULA_CONTROL'
      AND ta.record_id = NEW.id
      AND ta.new_status = 'UPDATE'
    RETURNING true INTO v_authorized;

    IF NOT coalesce(v_authorized, false) THEN
      RAISE EXCEPTION
        'Use a ação financeira ou de implantação oficial para alterar a matrícula.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_matricula_control_fields()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_matricula_control_fields_trigger
  ON public.matriculas;
CREATE TRIGGER protect_matricula_control_fields_trigger
BEFORE UPDATE OF
  financeiro_herdado,
  gerar_cobranca_inicial,
  gerar_cobranca_futura,
  sincronizar_asaas,
  fluxo_operacional,
  fluxo_operacional_motivo,
  fluxo_operacional_definido_em,
  fluxo_operacional_definido_por
ON public.matriculas
FOR EACH ROW
EXECUTE FUNCTION public.protect_matricula_control_fields();

ALTER TABLE public.documentos_aluno
  ADD COLUMN IF NOT EXISTS documento_codigo text,
  ADD COLUMN IF NOT EXISTS regra_obrigatoriedade text
    NOT NULL DEFAULT 'OBRIGATORIO';

UPDATE public.documentos_aluno
SET
  documento_codigo = CASE
    WHEN translate(lower(nome_documento), 'áàãâéêíóôõúç', 'aaaaeeiooouc')
      LIKE '%reservista%' THEN 'RESERVISTA'
    WHEN translate(lower(nome_documento), 'áàãâéêíóôõúç', 'aaaaeeiooouc')
      LIKE '%titulo de eleitor%' THEN 'TITULO_ELEITOR'
    WHEN translate(lower(nome_documento), 'áàãâéêíóôõúç', 'aaaaeeiooouc')
      LIKE '%comprovante de residencia%' THEN 'COMPROVANTE_RESIDENCIA'
    WHEN upper(btrim(nome_documento)) = 'CPF' THEN 'CPF'
    WHEN translate(lower(nome_documento), 'áàãâéêíóôõúç', 'aaaaeeiooouc')
      LIKE '%declaracao de escolaridade%' THEN 'DECLARACAO_ESCOLARIDADE'
    WHEN translate(lower(nome_documento), 'áàãâéêíóôõúç', 'aaaaeeiooouc')
      LIKE '%foto 3x4%' THEN 'FOTO_3X4'
    WHEN translate(lower(nome_documento), 'áàãâéêíóôõúç', 'aaaaeeiooouc')
      LIKE '%historico escolar%' THEN 'HISTORICO_ESCOLAR'
    WHEN translate(lower(nome_documento), 'áàãâéêíóôõúç', 'aaaaeeiooouc')
      LIKE '%certidao de nascimento%' THEN 'CERTIDAO_CIVIL'
    WHEN translate(lower(nome_documento), 'áàãâéêíóôõúç', 'aaaaeeiooouc')
      LIKE '%rg / cnh%' THEN 'IDENTIDADE'
    ELSE 'OUTRO_' || upper(substr(md5(nome_documento), 1, 12))
  END,
  regra_obrigatoriedade = CASE
  WHEN translate(
    lower(nome_documento),
    'áàãâéêíóôõúç',
    'aaaaeeiooouc'
  ) LIKE '%titulo de eleitor%'
    THEN 'MAIOR_18'
  WHEN translate(
    lower(nome_documento),
    'áàãâéêíóôõúç',
    'aaaaeeiooouc'
  ) LIKE '%reservista%'
    THEN 'HOMEM_MAIOR_18'
  ELSE 'OBRIGATORIO'
END;

ALTER TABLE public.documentos_aluno
  ALTER COLUMN documento_codigo SET NOT NULL,
  DROP CONSTRAINT IF EXISTS documentos_aluno_regra_obrigatoriedade_chk,
  ADD CONSTRAINT documentos_aluno_regra_obrigatoriedade_chk
    CHECK (
      regra_obrigatoriedade IN (
        'OBRIGATORIO',
        'MAIOR_18',
        'HOMEM_MAIOR_18',
        'OPCIONAL'
      )
    );

CREATE UNIQUE INDEX IF NOT EXISTS documentos_aluno_codigo_aluno_uidx
  ON public.documentos_aluno (aluno_id, documento_codigo);

CREATE OR REPLACE FUNCTION public.criar_checklist_documentos_aluno()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.tipo = 'Aluno' THEN
    INSERT INTO public.documentos_aluno (
      aluno_id,
      nome_documento,
      documento_codigo,
      regra_obrigatoriedade
    )
    VALUES
      (
        NEW.id,
        'RG / CNH (Frente e Verso)',
        'IDENTIDADE',
        'OBRIGATORIO'
      ),
      (NEW.id, 'CPF', 'CPF', 'OBRIGATORIO'),
      (
        NEW.id,
        'Comprovante de Residência',
        'COMPROVANTE_RESIDENCIA',
        'OBRIGATORIO'
      ),
      (
        NEW.id,
        'Histórico Escolar / Certificado de Conclusão',
        'HISTORICO_ESCOLAR',
        'OBRIGATORIO'
      ),
      (
        NEW.id,
        'Certidão de Nascimento (modelo antigo ou novo) ou Certidão de Casamento',
        'CERTIDAO_CIVIL',
        'OBRIGATORIO'
      ),
      (
        NEW.id,
        'Foto 3x4 Recente',
        'FOTO_3X4',
        'OBRIGATORIO'
      ),
      (
        NEW.id,
        'Título de Eleitor (se maior de 18)',
        'TITULO_ELEITOR',
        'MAIOR_18'
      ),
      (
        NEW.id,
        'Certificado de Reservista (homens)',
        'RESERVISTA',
        'HOMEM_MAIOR_18'
      ),
      (
        NEW.id,
        'Declaração de Escolaridade',
        'DECLARACAO_ESCOLARIDADE',
        'OBRIGATORIO'
      )
    ON CONFLICT (aluno_id, documento_codigo) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_document_requirement_rule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.regra_obrigatoriedade
    IS DISTINCT FROM NEW.regra_obrigatoriedade
    AND current_user <> 'postgres'
  THEN
    RAISE EXCEPTION
      'A regra de obrigatoriedade documental é administrada pelo backend.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_document_requirement_rule()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_document_requirement_rule_trigger
  ON public.documentos_aluno;
CREATE TRIGGER protect_document_requirement_rule_trigger
BEFORE UPDATE OF regra_obrigatoriedade
ON public.documentos_aluno
FOR EACH ROW
EXECUTE FUNCTION public.protect_document_requirement_rule();

CREATE OR REPLACE FUNCTION public.documento_aluno_regra_estado(
  p_documento_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE documento.regra_obrigatoriedade
    WHEN 'OBRIGATORIO' THEN 'OBRIGATORIO'
    WHEN 'OPCIONAL' THEN 'DISPENSADO'
    WHEN 'MAIOR_18' THEN CASE
      WHEN aluno.data_nascimento IS NULL THEN 'DADOS_INSUFICIENTES'
      WHEN date_part(
        'year',
        age(
          (timezone('America/Maceio', now()))::date,
          aluno.data_nascimento
        )
      ) >= 18 THEN 'OBRIGATORIO'
      ELSE 'DISPENSADO'
    END
    WHEN 'HOMEM_MAIOR_18' THEN CASE
      WHEN aluno.data_nascimento IS NULL
        OR nullif(btrim(coalesce(aluno.sexo, '')), '') IS NULL
        THEN 'DADOS_INSUFICIENTES'
      WHEN upper(btrim(aluno.sexo)) IN (
        'M',
        'MASCULINO',
        'HOMEM',
        'MALE'
      )
        THEN CASE
          WHEN date_part(
            'year',
            age(
              (timezone('America/Maceio', now()))::date,
              aluno.data_nascimento
            )
          ) >= 18
            THEN 'OBRIGATORIO'
          ELSE 'DISPENSADO'
        END
      WHEN upper(btrim(aluno.sexo)) IN (
        'F',
        'FEMININO',
        'MULHER',
        'FEMALE'
      )
        THEN 'DISPENSADO'
      ELSE 'DADOS_INSUFICIENTES'
    END
    ELSE 'DADOS_INSUFICIENTES'
  END
  FROM public.documentos_aluno documento
  JOIN public.parceiros aluno ON aluno.id = documento.aluno_id
  WHERE documento.id = p_documento_id;
$$;

REVOKE ALL ON FUNCTION public.documento_aluno_regra_estado(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.documento_aluno_regra_estado(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION
  public.documentacao_obrigatoria_aluno_concluida(p_aluno_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.documentos_aluno documento
      WHERE documento.aluno_id = p_aluno_id
        AND public.documento_aluno_regra_estado(documento.id)
          = 'OBRIGATORIO'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.documentos_aluno documento
      LEFT JOIN public.documentos_aluno_versoes versao
        ON versao.id = documento.versao_atual_id
      WHERE documento.aluno_id = p_aluno_id
        AND public.documento_aluno_regra_estado(documento.id)
          IN ('OBRIGATORIO', 'DADOS_INSUFICIENTES')
        AND (
          public.documento_aluno_regra_estado(documento.id)
            = 'DADOS_INSUFICIENTES'
          OR NOT (
            coalesce(versao.status = 'aprovado', false)
            OR EXISTS (
              SELECT 1
              FROM public.documentos_aluno_recebimentos_sem_anexo recebimento
              WHERE recebimento.documento_id = documento.id
                AND recebimento.revogado_em IS NULL
            )
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION
  public.documentacao_obrigatoria_aluno_concluida(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.documentacao_obrigatoria_aluno_concluida(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.lock_student_document_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_aluno_id uuid;
  v_documento_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'documentos_aluno_versoes' THEN
    IF TG_OP = 'DELETE' THEN
      v_documento_id := OLD.documento_id;
    ELSE
      v_documento_id := NEW.documento_id;
    END IF;
    SELECT documento.aluno_id
    INTO v_aluno_id
    FROM public.documentos_aluno documento
    WHERE documento.id = v_documento_id;
  ELSE
    IF TG_OP = 'DELETE' THEN
      v_aluno_id := OLD.aluno_id;
    ELSE
      v_aluno_id := NEW.aluno_id;
    END IF;
  END IF;

  IF v_aluno_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        'student_document_state:' || v_aluno_id::text,
        0
      )
    );
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_student_document_state()
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'documentos_aluno',
    'documentos_aluno_lotes',
    'documentos_aluno_arquivos',
    'documentos_aluno_versoes',
    'documentos_aluno_recebimentos_sem_anexo'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS a_lock_student_document_state ON public.%I',
      v_table
    );
    EXECUTE format(
      'CREATE TRIGGER a_lock_student_document_state
       BEFORE INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.lock_student_document_state()',
      v_table
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_document_evidence_removal_safe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_documento_id uuid;
  v_aluno_id uuid;
  v_remocao_relevante boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'documentos_aluno_recebimentos_sem_anexo' THEN
    v_documento_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.documento_id
      ELSE NEW.documento_id
    END;
    v_remocao_relevante := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.revogado_em IS NULL
      ELSE OLD.revogado_em IS NULL AND NEW.revogado_em IS NOT NULL
    END;
  ELSIF TG_TABLE_NAME = 'documentos_aluno_versoes' THEN
    v_documento_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.documento_id
      ELSE NEW.documento_id
    END;
    v_remocao_relevante := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.status = 'aprovado'
      ELSE OLD.status = 'aprovado' AND NEW.status <> 'aprovado'
    END;
  ELSIF TG_TABLE_NAME = 'documentos_aluno' THEN
    v_documento_id := NEW.id;
    v_remocao_relevante :=
      OLD.versao_atual_id IS DISTINCT FROM NEW.versao_atual_id;
  END IF;

  IF NOT v_remocao_relevante OR v_documento_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT documento.aluno_id
  INTO v_aluno_id
  FROM public.documentos_aluno documento
  WHERE documento.id = v_documento_id;

  IF public.documento_aluno_regra_estado(v_documento_id)
    <> 'OBRIGATORIO'
  THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.documentos_aluno documento
    LEFT JOIN public.documentos_aluno_versoes versao
      ON versao.id = documento.versao_atual_id
    WHERE documento.id = v_documento_id
      AND (
        versao.status = 'aprovado'
        OR EXISTS (
          SELECT 1
          FROM public.documentos_aluno_recebimentos_sem_anexo recebimento
          WHERE recebimento.documento_id = documento.id
            AND recebimento.revogado_em IS NULL
        )
      )
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.matriculas matricula
    JOIN public.turmas turma ON turma.id = matricula.turma_id
    JOIN public.cursos curso ON curso.id = turma.curso_id
    WHERE matricula.aluno_id = v_aluno_id
      AND upper(coalesce(matricula.status, '')) = 'ATIVO'
      AND matricula.fluxo_operacional = 'REGULAR'
      AND upper(coalesce(curso.modalidade, ''))
        IN ('TECNICO', 'TÉCNICO')
  ) THEN
    RAISE EXCEPTION
      'Não é permitido remover a última evidência de documento obrigatório de uma matrícula técnica ativa.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_document_evidence_removal_safe()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS assert_receipt_removal_safe
  ON public.documentos_aluno_recebimentos_sem_anexo;
CREATE CONSTRAINT TRIGGER assert_receipt_removal_safe
AFTER UPDATE OF revogado_em
ON public.documentos_aluno_recebimentos_sem_anexo
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.assert_document_evidence_removal_safe();

DROP TRIGGER IF EXISTS assert_receipt_delete_safe
  ON public.documentos_aluno_recebimentos_sem_anexo;
CREATE CONSTRAINT TRIGGER assert_receipt_delete_safe
AFTER DELETE
ON public.documentos_aluno_recebimentos_sem_anexo
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.assert_document_evidence_removal_safe();

DROP TRIGGER IF EXISTS assert_version_removal_safe
  ON public.documentos_aluno_versoes;
CREATE CONSTRAINT TRIGGER assert_version_removal_safe
AFTER UPDATE OF status
ON public.documentos_aluno_versoes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.assert_document_evidence_removal_safe();

DROP TRIGGER IF EXISTS assert_version_delete_safe
  ON public.documentos_aluno_versoes;
CREATE CONSTRAINT TRIGGER assert_version_delete_safe
AFTER DELETE
ON public.documentos_aluno_versoes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.assert_document_evidence_removal_safe();

DROP TRIGGER IF EXISTS assert_current_version_removal_safe
  ON public.documentos_aluno;
CREATE CONSTRAINT TRIGGER assert_current_version_removal_safe
AFTER UPDATE OF versao_atual_id
ON public.documentos_aluno
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.assert_document_evidence_removal_safe();

DROP TRIGGER IF EXISTS trg_protect_matricula_liberacoes_diario_audit
  ON public.matricula_liberacoes_diario;

ALTER TABLE public.matricula_liberacoes_diario
  DROP CONSTRAINT IF EXISTS matricula_liberacoes_diario_origem_chk,
  ADD CONSTRAINT matricula_liberacoes_diario_origem_chk
    CHECK (
      origem IN (
        'GESTOR',
        'GESTOR_IMPLANTACAO',
        'MIGRACAO_LEGADA'
      )
    ),
  DROP CONSTRAINT IF EXISTS matricula_liberacoes_diario_ator_chk,
  ADD CONSTRAINT matricula_liberacoes_diario_ator_chk
    CHECK (
      (
        origem IN ('GESTOR', 'GESTOR_IMPLANTACAO')
        AND liberado_por IS NOT NULL
      )
      OR (
        origem = 'MIGRACAO_LEGADA'
        AND nullif(btrim(liberado_por_sistema), '') IS NOT NULL
      )
    );

ALTER TABLE public.matricula_liberacoes_diario
  ADD COLUMN IF NOT EXISTS aluno_id uuid,
  ADD COLUMN IF NOT EXISTS turma_id uuid;

UPDATE public.matricula_liberacoes_diario liberacao
SET aluno_id = matricula.aluno_id,
    turma_id = matricula.turma_id
FROM public.matriculas matricula
WHERE matricula.id = liberacao.matricula_id
  AND (
    liberacao.aluno_id IS NULL
    OR liberacao.turma_id IS NULL
  );

ALTER TABLE public.matricula_liberacoes_diario
  ALTER COLUMN aluno_id SET NOT NULL,
  ALTER COLUMN turma_id SET NOT NULL,
  DROP CONSTRAINT IF EXISTS matricula_liberacoes_diario_scope_fkey,
  ADD CONSTRAINT matricula_liberacoes_diario_scope_fkey
    FOREIGN KEY (matricula_id, turma_id, aluno_id)
    REFERENCES public.matriculas(id, turma_id, aluno_id)
    ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS matricula_liberacoes_diario_aluno_idx
  ON public.matricula_liberacoes_diario (aluno_id, liberado_em DESC);

CREATE OR REPLACE FUNCTION public.fill_matricula_liberacao_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT matricula.aluno_id, matricula.turma_id
  INTO NEW.aluno_id, NEW.turma_id
  FROM public.matriculas matricula
  WHERE matricula.id = NEW.matricula_id;

  IF NEW.aluno_id IS NULL OR NEW.turma_id IS NULL THEN
    RAISE EXCEPTION 'Matrícula não encontrada para a liberação acadêmica.'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fill_matricula_liberacao_scope()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a_fill_matricula_liberacao_scope
  ON public.matricula_liberacoes_diario;
CREATE TRIGGER a_fill_matricula_liberacao_scope
BEFORE INSERT ON public.matricula_liberacoes_diario
FOR EACH ROW
EXECUTE FUNCTION public.fill_matricula_liberacao_scope();

CREATE OR REPLACE FUNCTION
  public.protect_matricula_liberacoes_diario_audit()
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
    OR OLD.aluno_id IS DISTINCT FROM NEW.aluno_id
    OR OLD.turma_id IS DISTINCT FROM NEW.turma_id
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

CREATE TRIGGER trg_protect_matricula_liberacoes_diario_audit
BEFORE UPDATE OR DELETE ON public.matricula_liberacoes_diario
FOR EACH ROW
EXECUTE FUNCTION public.protect_matricula_liberacoes_diario_audit();

DROP POLICY IF EXISTS matricula_liberacoes_diario_select
  ON public.matricula_liberacoes_diario;
CREATE POLICY matricula_liberacoes_diario_select
ON public.matricula_liberacoes_diario
FOR SELECT TO authenticated
USING (
  public.gestor_pode_gerenciar_documento_aluno(aluno_id)
);

GRANT SELECT ON public.matricula_liberacoes_diario TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'matricula_liberacoes_diario'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.matricula_liberacoes_diario;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.emit_matricula_liberacao_realtime_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.gestao_realtime_events (
    source_table,
    event_type,
    entity_id,
    turma_id,
    polo_id
  )
  SELECT
    TG_TABLE_NAME,
    TG_OP,
    NEW.id,
    NEW.turma_id,
    turma.polo_id
  FROM public.turmas turma
  WHERE turma.id = NEW.turma_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_matricula_liberacao_realtime_event()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS matricula_liberacoes_emit_gestao_realtime_event
  ON public.matricula_liberacoes_diario;
CREATE TRIGGER matricula_liberacoes_emit_gestao_realtime_event
AFTER INSERT OR UPDATE OF revogado_em
ON public.matricula_liberacoes_diario
FOR EACH ROW
EXECUTE FUNCTION public.emit_matricula_liberacao_realtime_event();

CREATE OR REPLACE FUNCTION public.guard_implantation_receivable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_matricula_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_matricula_id := OLD.matricula_id;
  ELSE
    v_matricula_id := NEW.matricula_id;
  END IF;

  IF v_matricula_id IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'matricula_workflow:' || v_matricula_id::text,
      0
    )
  );

  IF TG_OP <> 'DELETE'
    AND EXISTS (
      SELECT 1
      FROM public.matriculas matricula
      WHERE matricula.id = v_matricula_id
        AND matricula.fluxo_operacional = 'IMPLANTACAO'
    )
  THEN
    RAISE EXCEPTION
      'Matrícula de implantação não pode receber lançamento financeiro.'
      USING ERRCODE = '22023';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_implantation_receivable()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_implantation_receivable_trigger
  ON public.contas_receber;
CREATE TRIGGER guard_implantation_receivable_trigger
BEFORE INSERT OR UPDATE OF matricula_id OR DELETE
ON public.contas_receber
FOR EACH ROW
EXECUTE FUNCTION public.guard_implantation_receivable();

CREATE OR REPLACE FUNCTION public.matricula_possui_vinculo_financeiro(
  p_matricula_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contas_receber conta
    WHERE conta.matricula_id = p_matricula_id
    UNION ALL
    SELECT 1
    FROM public.inscricoes_online inscricao
    WHERE inscricao.matricula_id = p_matricula_id
  );
$$;

REVOKE ALL ON FUNCTION
  public.matricula_possui_vinculo_financeiro(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.matricula_possui_vinculo_financeiro(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.guard_implantation_online_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_matricula_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_matricula_id := OLD.matricula_id;
  ELSE
    v_matricula_id := NEW.matricula_id;
  END IF;

  IF v_matricula_id IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'matricula_workflow:' || v_matricula_id::text,
      0
    )
  );

  IF TG_OP <> 'DELETE'
    AND EXISTS (
      SELECT 1
      FROM public.matriculas matricula
      WHERE matricula.id = v_matricula_id
        AND matricula.fluxo_operacional = 'IMPLANTACAO'
    )
  THEN
    RAISE EXCEPTION
      'Matrícula de implantação não pode receber inscrição financeira.'
      USING ERRCODE = '22023';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_implantation_online_enrollment()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_implantation_online_enrollment_trigger
  ON public.inscricoes_online;
CREATE TRIGGER guard_implantation_online_enrollment_trigger
BEFORE INSERT OR UPDATE OF matricula_id OR DELETE
ON public.inscricoes_online
FOR EACH ROW
EXECUTE FUNCTION public.guard_implantation_online_enrollment();

CREATE OR REPLACE FUNCTION internal_academic.authorize_enrollment_upsert(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_matricula_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.turmas turma
    JOIN public.cursos curso ON curso.id = turma.curso_id
    WHERE turma.id = p_turma_id
      AND upper(coalesce(curso.modalidade, ''))
        IN ('TECNICO', 'TÉCNICO')
  ) THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'technical_matricula:' || p_aluno_id::text || ':' || p_turma_id::text,
      0
    )
  );

  SELECT matricula.id
  INTO v_matricula_id
  FROM public.matriculas matricula
  WHERE matricula.aluno_id = p_aluno_id
    AND matricula.turma_id = p_turma_id;

  PERFORM internal_academic.authorize_transition(
    'MATRICULA_INSERT',
    p_turma_id,
    p_status
  );

  IF v_matricula_id IS NOT NULL THEN
    PERFORM internal_academic.authorize_transition(
      'MATRICULA_STATUS',
      v_matricula_id,
      p_status
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION internal_academic.authorize_enrollment_status(
  p_matricula_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.matriculas matricula
    JOIN public.turmas turma ON turma.id = matricula.turma_id
    JOIN public.cursos curso ON curso.id = turma.curso_id
    WHERE matricula.id = p_matricula_id
      AND upper(coalesce(curso.modalidade, ''))
        IN ('TECNICO', 'TÉCNICO')
  ) THEN
    PERFORM internal_academic.authorize_transition(
      'MATRICULA_STATUS',
      p_matricula_id,
      p_status
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION
  internal_academic.authorize_enrollment_upsert(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION
  internal_academic.authorize_enrollment_status(uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.protect_technical_enrollment_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_tecnico boolean := false;
  v_old_tecnico boolean := false;
  v_service boolean :=
    coalesce((SELECT auth.role()), '') = 'service_role';
  v_activation boolean := TG_OP = 'INSERT';
  v_authorized boolean;
BEGIN
  SELECT
    turma.status,
    upper(coalesce(curso.modalidade, '')) IN ('TECNICO', 'TÉCNICO')
  INTO v_status, v_tecnico
  FROM public.turmas turma
  JOIN public.cursos curso ON curso.id = turma.curso_id
  WHERE turma.id = NEW.turma_id;

  IF TG_OP = 'UPDATE' THEN
    SELECT upper(coalesce(curso.modalidade, ''))
      IN ('TECNICO', 'TÉCNICO')
    INTO v_old_tecnico
    FROM public.turmas turma
    JOIN public.cursos curso ON curso.id = turma.curso_id
    WHERE turma.id = OLD.turma_id;

    IF (coalesce(v_tecnico, false) OR coalesce(v_old_tecnico, false))
      AND NEW.turma_id IS DISTINCT FROM OLD.turma_id
    THEN
      RAISE EXCEPTION
        'Matrícula técnica deve mudar de turma somente pela transferência acadêmica.';
    END IF;

    IF (coalesce(v_tecnico, false) OR coalesce(v_old_tecnico, false))
      AND NEW.aluno_id IS DISTINCT FROM OLD.aluno_id
    THEN
      RAISE EXCEPTION 'O aluno de uma matrícula técnica é imutável.';
    END IF;

    v_activation :=
      NEW.status = 'ATIVO'
      AND OLD.status IS DISTINCT FROM 'ATIVO';
  END IF;

  IF NOT coalesce(v_tecnico, false) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status <> 'PENDENTE' THEN
    RAISE EXCEPTION
      'Matrícula técnica nova deve iniciar pendente.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
    AND v_status = 'FINALIZADA'
    AND (to_jsonb(NEW) - 'status' - 'updated_at')
      IS DISTINCT FROM
      (to_jsonb(OLD) - 'status' - 'updated_at')
  THEN
    RAISE EXCEPTION
      'Dados de matrícula técnica finalizada são imutáveis.';
  END IF;

  IF v_activation THEN
    IF v_status NOT IN (
      'PLANEJADA',
      'INSCRICOES_ABERTAS',
      'EM_ANDAMENTO'
    ) THEN
      RAISE EXCEPTION
        'Turma técnica finalizada não aceita matrícula ou reativação.';
    END IF;

    IF NOT v_service
      AND NOT (SELECT public.can_write_turma(NEW.turma_id))
    THEN
      RAISE EXCEPTION
        'Sem permissão para matricular nesta turma técnica.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'INSERT'
    OR (
      TG_OP = 'UPDATE'
      AND NEW.status IS DISTINCT FROM OLD.status
    )
  THEN
    DELETE FROM internal_academic.transition_authorizations ta
    WHERE ta.transaction_id = pg_current_xact_id()::text
      AND ta.backend_pid = pg_backend_pid()
      AND ta.entity = CASE
        WHEN TG_OP = 'INSERT' THEN 'MATRICULA_INSERT'
        ELSE 'MATRICULA_STATUS'
      END
      AND ta.record_id = CASE
        WHEN TG_OP = 'INSERT' THEN NEW.turma_id
        ELSE NEW.id
      END
      AND ta.new_status = NEW.status
    RETURNING true INTO v_authorized;

    IF NOT coalesce(v_authorized, false) THEN
      RAISE EXCEPTION
        'Use a ação acadêmica oficial para alterar matrícula técnica.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.status IS DISTINCT FROM OLD.status
  THEN
    IF v_status = 'FINALIZADA'
      AND NOT (
        (
          OLD.status = 'ATIVO'
          AND NEW.status IN (
            'CONCLUIDO',
            'REPROVADO',
            'EM_DEPENDENCIA'
          )
        )
        OR (
          OLD.status = 'EM_DEPENDENCIA'
          AND NEW.status = 'CONCLUIDO'
        )
        OR (
          OLD.status = 'REPROVADO'
          AND NEW.status = 'EM_DEPENDENCIA'
        )
      )
    THEN
      RAISE EXCEPTION
        'Matrícula de turma técnica finalizada é somente leitura.';
    END IF;

    IF NEW.status IN (
      'CONCLUIDO',
      'REPROVADO',
      'EM_DEPENDENCIA'
    )
      AND v_status <> 'FINALIZADA'
    THEN
      RAISE EXCEPTION
        'Conclusão, reprovação ou dependência exige a finalização acadêmica oficial.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_technical_enrollment_lifecycle()
  FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.payment_checkout_upsert_matricula(
  uuid,
  uuid,
  boolean
)
RENAME TO p1_payment_checkout_upsert_matricula_20260731;

REVOKE ALL ON FUNCTION
  public.p1_payment_checkout_upsert_matricula_20260731(
    uuid,
    uuid,
    boolean
  )
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.p1_payment_checkout_upsert_matricula_20260731(
    uuid,
    uuid,
    boolean
  )
  TO service_role;

CREATE OR REPLACE FUNCTION public.payment_checkout_upsert_matricula(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_gerar_cobranca_futura boolean DEFAULT false
)
RETURNS public.matriculas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_id uuid;
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND public.current_aluno_id() IS DISTINCT FROM p_aluno_id
  THEN
    RAISE EXCEPTION
      'O checkout só pode alterar a matrícula do próprio aluno.'
      USING ERRCODE = '42501';
  END IF;

  SELECT matricula.id
  INTO v_existing_id
  FROM public.matriculas matricula
  WHERE matricula.aluno_id = p_aluno_id
    AND matricula.turma_id = p_turma_id
  ORDER BY matricula.data_matricula DESC NULLS LAST
  LIMIT 1;

  PERFORM internal_academic.authorize_enrollment_upsert(
    p_aluno_id,
    p_turma_id,
    'PENDENTE'
  );

  IF v_existing_id IS NOT NULL THEN
    PERFORM internal_academic.authorize_matricula_control_update(
      v_existing_id
    );
  END IF;

  RETURN public.p1_payment_checkout_upsert_matricula_20260731(
    p_aluno_id,
    p_turma_id,
    p_gerar_cobranca_futura
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.payment_checkout_upsert_matricula(uuid, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.payment_checkout_upsert_matricula(uuid, uuid, boolean)
  TO authenticated, service_role;

ALTER FUNCTION public.asaas_checkout_upsert_matricula(
  uuid,
  uuid,
  boolean
)
RENAME TO p1_asaas_checkout_upsert_matricula_20260731;

REVOKE ALL ON FUNCTION
  public.p1_asaas_checkout_upsert_matricula_20260731(
    uuid,
    uuid,
    boolean
  )
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.p1_asaas_checkout_upsert_matricula_20260731(
    uuid,
    uuid,
    boolean
  )
  TO service_role;

CREATE OR REPLACE FUNCTION public.asaas_checkout_upsert_matricula(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_gerar_cobranca_futura boolean DEFAULT false
)
RETURNS public.matriculas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_id uuid;
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION
      'O checkout Asaas legado é restrito à integração de encerramento.'
      USING ERRCODE = '42501';
  END IF;

  SELECT matricula.id
  INTO v_existing_id
  FROM public.matriculas matricula
  WHERE matricula.aluno_id = p_aluno_id
    AND matricula.turma_id = p_turma_id
  ORDER BY matricula.data_matricula DESC NULLS LAST
  LIMIT 1;

  PERFORM internal_academic.authorize_enrollment_upsert(
    p_aluno_id,
    p_turma_id,
    'PENDENTE'
  );

  IF v_existing_id IS NOT NULL THEN
    PERFORM internal_academic.authorize_matricula_control_update(
      v_existing_id
    );
  END IF;

  RETURN public.p1_asaas_checkout_upsert_matricula_20260731(
    p_aluno_id,
    p_turma_id,
    p_gerar_cobranca_futura
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.asaas_checkout_upsert_matricula(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.asaas_checkout_upsert_matricula(uuid, uuid, boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.guard_technical_activation_document_versions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_modalidade text;
BEGIN
  IF TG_OP <> 'UPDATE'
    OR upper(coalesce(NEW.status, '')) <> 'ATIVO'
    OR upper(coalesce(OLD.status, '')) = 'ATIVO'
  THEN
    RETURN NEW;
  END IF;

  SELECT upper(coalesce(curso.modalidade, ''))
  INTO v_modalidade
  FROM public.turmas turma
  JOIN public.cursos curso ON curso.id = turma.curso_id
  WHERE turma.id = NEW.turma_id;

  IF v_modalidade NOT IN ('TECNICO', 'TÉCNICO') THEN
    RETURN NEW;
  END IF;

  IF NEW.fluxo_operacional <> 'REGULAR' THEN
    RAISE EXCEPTION
      'Matrícula de implantação não pode ser ativada como matrícula regular.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.matricula_tecnica_pagamento_confirmado(NEW.id) THEN
    RAISE EXCEPTION
      'O pagamento da matrícula ainda não foi confirmado.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.documentos_aluno_lotes lote
    WHERE lote.aluno_id = NEW.aluno_id
      AND (
        lote.status = 'aguardando_mapeamento'
        OR (
          lote.status = 'preparando'
          AND lote.criado_em >= now() - interval '24 hours'
        )
      )
  ) THEN
    RAISE EXCEPTION
      'Existe envio documental incompleto ou PDF aguardando mapeamento.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.documentacao_obrigatoria_aluno_concluida(NEW.aluno_id)
  THEN
    RAISE EXCEPTION
      'Conclua todos os documentos obrigatórios antes de ativar a matrícula.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION
  internal_academic.legacy_matricular_aluno_turma_financeiro(
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
SET search_path = ''
AS $$
DECLARE
  v_matricula public.matriculas%ROWTYPE;
  v_flags record;
  v_turma public.turmas%ROWTYPE;
  v_modalidade text;
  v_target_status text;
  v_existing_id uuid;
BEGIN
  SELECT turma.*
  INTO v_turma
  FROM public.turmas turma
  WHERE turma.id = p_turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma não encontrada.' USING ERRCODE = '22023';
  END IF;

  SELECT upper(coalesce(curso.modalidade, ''))
  INTO v_modalidade
  FROM public.cursos curso
  WHERE curso.id = v_turma.curso_id;

  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND NOT public.is_financeiro_for_polo(v_turma.polo_id)
  THEN
    RAISE EXCEPTION
      'Apenas gestor autorizado pode matricular aluno com financeiro nesta turma.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.parceiros aluno
    WHERE aluno.id = p_aluno_id
      AND aluno.tipo = 'Aluno'
  ) THEN
    RAISE EXCEPTION 'Aluno não encontrado.' USING ERRCODE = '22023';
  END IF;

  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND p_responsavel_id IS NOT NULL
    AND NOT public.is_parceiro_in_financeiro_scope(
      p_responsavel_id,
      v_turma.polo_id
    )
  THEN
    RAISE EXCEPTION 'Responsável financeiro fora do escopo do polo.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_aluno_sem_matricula_curso_duplicada(
    p_aluno_id,
    v_turma.curso_id,
    p_turma_id
  );

  SELECT *
  INTO v_flags
  FROM public.resolver_flags_financeiras_turma_matricula(
    p_turma_id,
    p_financeiro_herdado,
    p_gerar_cobranca_inicial,
    p_gerar_cobranca_futura,
    p_sincronizar_asaas
  );

  v_target_status := CASE
    WHEN v_modalidade IN ('TECNICO', 'TÉCNICO') THEN 'PENDENTE'
    ELSE 'ATIVO'
  END;

  SELECT matricula.id
  INTO v_existing_id
  FROM public.matriculas matricula
  WHERE matricula.aluno_id = p_aluno_id
    AND matricula.turma_id = p_turma_id
  FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        'matricula_workflow:' || v_existing_id::text,
        0
      )
    );
    IF EXISTS (
      SELECT 1
      FROM public.matricula_liberacoes_diario liberacao
      WHERE liberacao.matricula_id = v_existing_id
        AND liberacao.revogado_em IS NULL
    ) THEN
      RAISE EXCEPTION
        'Revogue a liberação de implantação antes de configurar financeiro.'
        USING ERRCODE = '22023';
    END IF;

    PERFORM internal_academic.authorize_matricula_control_update(
      v_existing_id
    );
  END IF;

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
    sincronizar_asaas,
    fluxo_operacional
  )
  VALUES (
    p_aluno_id,
    p_turma_id,
    v_target_status,
    p_valor_matricula,
    p_valor_rematricula,
    p_valor_parcela,
    p_dia_vencimento,
    coalesce(p_data_vencimento_matricula, current_date),
    v_flags.financeiro_herdado,
    v_flags.gerar_cobranca_inicial,
    v_flags.gerar_cobranca_futura,
    v_flags.sincronizar_asaas_futuro,
    'REGULAR'
  )
  ON CONFLICT (aluno_id, turma_id) DO UPDATE
    SET status = CASE
          WHEN v_modalidade IN ('TECNICO', 'TÉCNICO')
            AND upper(coalesce(matriculas.status, ''))
              IN ('ATIVO', 'CONCLUIDO')
            THEN matriculas.status
          ELSE EXCLUDED.status
        END,
        valor_matricula_individual = EXCLUDED.valor_matricula_individual,
        valor_rematricula_individual = EXCLUDED.valor_rematricula_individual,
        valor_parcela_individual = EXCLUDED.valor_parcela_individual,
        dia_vencimento_individual = EXCLUDED.dia_vencimento_individual,
        data_primeiro_vencimento_financeiro =
          EXCLUDED.data_primeiro_vencimento_financeiro,
        financeiro_herdado = EXCLUDED.financeiro_herdado,
        gerar_cobranca_inicial = EXCLUDED.gerar_cobranca_inicial,
        gerar_cobranca_futura = EXCLUDED.gerar_cobranca_futura,
        sincronizar_asaas = EXCLUDED.sincronizar_asaas,
        fluxo_operacional = 'REGULAR',
        fluxo_operacional_motivo = NULL,
        fluxo_operacional_definido_em = NULL,
        fluxo_operacional_definido_por = NULL
  RETURNING * INTO v_matricula;

  PERFORM public.sync_aluno_polo_scope(
    v_matricula.aluno_id,
    v_turma.polo_id
  );
  PERFORM public.gerar_cobranca_matricula(v_matricula.id);

  PERFORM public.registrar_turma_financeiro_auditoria(
    v_matricula.id,
    'MATRICULA_FINANCEIRO_FLAGS',
    jsonb_build_object(
      'origem_financeira', v_flags.origem_financeira,
      'financeiro_herdado', v_flags.financeiro_herdado,
      'gerar_cobranca_inicial', v_flags.gerar_cobranca_inicial,
      'gerar_cobranca_futura', v_flags.gerar_cobranca_futura,
      'sincronizar_asaas', v_flags.sincronizar_asaas_futuro,
      'status_inicial', v_matricula.status
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
  )
  VALUES (
    v_matricula.id,
    v_matricula.aluno_id,
    'MATRICULA',
    NULL,
    v_matricula.status,
    v_matricula.turma_id,
    'Matrícula realizada na turma com financeiro individual.',
    p_responsavel_id
  )
  ON CONFLICT DO NOTHING;

  RETURN v_matricula;
END;
$$;

CREATE OR REPLACE FUNCTION public.matricular_aluno_turma(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_responsavel_id uuid DEFAULT NULL
)
RETURNS public.matriculas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_modalidade text;
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND NOT (
      public.gestor_has_module('gestao')
      AND public.can_write_turma(p_turma_id)
    )
  THEN
    RAISE EXCEPTION 'Sem permissão para matricular aluno nesta turma.'
      USING ERRCODE = '42501';
  END IF;

  SELECT upper(coalesce(curso.modalidade, ''))
  INTO v_modalidade
  FROM public.turmas turma
  JOIN public.cursos curso ON curso.id = turma.curso_id
  WHERE turma.id = p_turma_id;

  IF v_modalidade IS NULL THEN
    RAISE EXCEPTION 'Turma não encontrada.' USING ERRCODE = '22023';
  END IF;
  IF v_modalidade IN ('TECNICO', 'TÉCNICO') THEN
    RAISE EXCEPTION
      'Matrícula técnica deve ser criada pelo fluxo financeiro pendente ou pela implantação explícita.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM internal_academic.authorize_enrollment_upsert(
    p_aluno_id,
    p_turma_id,
    'ATIVO'
  );

  RETURN internal_academic.legacy_matricular_aluno_turma(
    p_aluno_id,
    p_turma_id,
    p_responsavel_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.matricular_aluno_turma(
  uuid,
  uuid,
  uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.matricular_aluno_turma(
  uuid,
  uuid,
  uuid
) TO authenticated, service_role;

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
SET search_path = ''
AS $$
DECLARE
  v_target_status text;
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND NOT (
      public.gestor_has_module('gestao')
      AND public.can_write_turma(p_turma_id)
    )
  THEN
    RAISE EXCEPTION 'Sem permissão para matricular aluno nesta turma.'
      USING ERRCODE = '42501';
  END IF;

  SELECT CASE
    WHEN upper(coalesce(curso.modalidade, ''))
      IN ('TECNICO', 'TÉCNICO') THEN 'PENDENTE'
    ELSE 'ATIVO'
  END
  INTO v_target_status
  FROM public.turmas turma
  JOIN public.cursos curso ON curso.id = turma.curso_id
  WHERE turma.id = p_turma_id;

  IF v_target_status IS NULL THEN
    RAISE EXCEPTION 'Turma não encontrada.' USING ERRCODE = '22023';
  END IF;

  PERFORM internal_academic.authorize_enrollment_upsert(
    p_aluno_id,
    p_turma_id,
    v_target_status
  );

  RETURN internal_academic.legacy_matricular_aluno_turma_financeiro(
    p_aluno_id,
    p_turma_id,
    p_responsavel_id,
    p_valor_matricula,
    coalesce(
      p_data_vencimento_matricula,
      (pg_catalog.timezone('America/Maceio', now()))::date
    ),
    p_valor_parcela,
    p_valor_rematricula,
    p_dia_vencimento,
    p_financeiro_herdado,
    p_gerar_cobranca_inicial,
    p_gerar_cobranca_futura,
    p_sincronizar_asaas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.matricular_aluno_turma_financeiro(
  uuid, uuid, uuid, numeric, date, numeric, numeric, integer,
  boolean, boolean, boolean, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.matricular_aluno_turma_financeiro(
  uuid, uuid, uuid, numeric, date, numeric, numeric, integer,
  boolean, boolean, boolean, boolean
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.matricula_tecnica_workflow_snapshot(
  p_matricula_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_context record;
  v_pagamento_confirmado boolean;
  v_documentos_total integer := 0;
  v_documentos_concluidos integer := 0;
  v_dados_insuficientes integer := 0;
  v_envio_em_andamento boolean := false;
  v_liberacao record;
  v_pode_operar boolean := false;
  v_sem_financeiro boolean := false;
  v_documentacao_concluida boolean := false;
  v_bloqueios_regular text[] := ARRAY[]::text[];
  v_bloqueios_implantacao text[] := ARRAY[]::text[];
BEGIN
  SELECT
    matricula.id,
    matricula.aluno_id,
    matricula.turma_id,
    matricula.status,
    matricula.fluxo_operacional,
    turma.nome AS turma_nome,
    turma.status AS turma_status,
    turma.polo_id,
    curso.nome AS curso_nome,
    upper(coalesce(curso.modalidade, '')) AS modalidade
  INTO v_context
  FROM public.matriculas matricula
  JOIN public.turmas turma ON turma.id = matricula.turma_id
  JOIN public.cursos curso ON curso.id = turma.curso_id
  WHERE matricula.id = p_matricula_id;

  IF v_context.id IS NULL
    OR v_context.modalidade NOT IN ('TECNICO', 'TÉCNICO')
  THEN
    RETURN NULL;
  END IF;

  v_pode_operar :=
    coalesce((SELECT auth.role()), '') = 'service_role'
    OR public.can_operate_turma_academics(v_context.turma_id);

  v_pagamento_confirmado :=
    public.matricula_tecnica_pagamento_confirmado(v_context.id);

  SELECT
    count(*) FILTER (
      WHERE public.documento_aluno_regra_estado(documento.id)
        = 'OBRIGATORIO'
    )::integer,
    count(*) FILTER (
      WHERE public.documento_aluno_regra_estado(documento.id)
        = 'OBRIGATORIO'
        AND (
          versao.status = 'aprovado'
          OR EXISTS (
            SELECT 1
            FROM public.documentos_aluno_recebimentos_sem_anexo recebimento
            WHERE recebimento.documento_id = documento.id
              AND recebimento.revogado_em IS NULL
          )
        )
    )::integer,
    count(*) FILTER (
      WHERE public.documento_aluno_regra_estado(documento.id)
        = 'DADOS_INSUFICIENTES'
    )::integer
  INTO
    v_documentos_total,
    v_documentos_concluidos,
    v_dados_insuficientes
  FROM public.documentos_aluno documento
  LEFT JOIN public.documentos_aluno_versoes versao
    ON versao.id = documento.versao_atual_id
  WHERE documento.aluno_id = v_context.aluno_id;

  v_documentacao_concluida :=
    v_documentos_total > 0
    AND v_documentos_concluidos = v_documentos_total
    AND v_dados_insuficientes = 0;

  SELECT EXISTS (
    SELECT 1
    FROM public.documentos_aluno_lotes lote
    WHERE lote.aluno_id = v_context.aluno_id
      AND (
        lote.status = 'aguardando_mapeamento'
        OR (
          lote.status = 'preparando'
          AND lote.criado_em >= now() - interval '24 hours'
        )
      )
  )
  INTO v_envio_em_andamento;

  SELECT
    liberacao.id,
    liberacao.motivo,
    liberacao.liberado_em,
    usuario.nome AS liberado_por_nome
  INTO v_liberacao
  FROM public.matricula_liberacoes_diario liberacao
  LEFT JOIN public.usuarios_sistema usuario
    ON usuario.auth_user_id = liberacao.liberado_por
  WHERE liberacao.matricula_id = v_context.id
    AND liberacao.revogado_em IS NULL
  LIMIT 1;

  v_sem_financeiro :=
    NOT public.matricula_possui_vinculo_financeiro(v_context.id);

  IF NOT v_pode_operar THEN
    v_bloqueios_regular :=
      array_append(v_bloqueios_regular, 'SEM_PERMISSAO');
    v_bloqueios_implantacao :=
      array_append(v_bloqueios_implantacao, 'SEM_PERMISSAO');
  END IF;
  IF v_context.fluxo_operacional <> 'REGULAR' THEN
    v_bloqueios_regular :=
      array_append(v_bloqueios_regular, 'FLUXO_NAO_REGULAR');
  END IF;
  IF upper(coalesce(v_context.status, ''))
    NOT IN ('PENDENTE', 'AGUARDANDO_CONFIRMACAO')
  THEN
    v_bloqueios_regular :=
      array_append(v_bloqueios_regular, 'STATUS_INCOMPATIVEL');
  END IF;
  IF NOT v_pagamento_confirmado THEN
    v_bloqueios_regular :=
      array_append(v_bloqueios_regular, 'PAGAMENTO_PENDENTE');
  END IF;
  IF NOT v_documentacao_concluida THEN
    v_bloqueios_regular :=
      array_append(v_bloqueios_regular, 'DOCUMENTACAO_INCOMPLETA');
  END IF;
  IF v_dados_insuficientes > 0 THEN
    v_bloqueios_regular :=
      array_append(v_bloqueios_regular, 'DADOS_PESSOAIS_INCOMPLETOS');
  END IF;
  IF v_envio_em_andamento THEN
    v_bloqueios_regular :=
      array_append(v_bloqueios_regular, 'ENVIO_DOCUMENTAL_EM_ANDAMENTO');
  END IF;

  IF upper(coalesce(v_context.status, '')) <> 'PENDENTE' THEN
    v_bloqueios_implantacao :=
      array_append(v_bloqueios_implantacao, 'STATUS_INCOMPATIVEL');
  END IF;
  IF upper(coalesce(v_context.turma_status, '')) <> 'EM_ANDAMENTO' THEN
    v_bloqueios_implantacao :=
      array_append(v_bloqueios_implantacao, 'TURMA_FORA_DE_ANDAMENTO');
  END IF;
  IF NOT v_sem_financeiro THEN
    v_bloqueios_implantacao :=
      array_append(v_bloqueios_implantacao, 'COBRANCA_EXISTENTE');
  END IF;
  IF v_liberacao.id IS NOT NULL THEN
    v_bloqueios_implantacao :=
      array_append(v_bloqueios_implantacao, 'LIBERACAO_JA_ATIVA');
  END IF;

  RETURN jsonb_build_object(
    'matriculaId', v_context.id,
    'alunoId', v_context.aluno_id,
    'turmaId', v_context.turma_id,
    'cursoNome', v_context.curso_nome,
    'turmaNome', v_context.turma_nome,
    'status', upper(coalesce(v_context.status, '')),
    'turmaStatus', upper(coalesce(v_context.turma_status, '')),
    'fluxo', v_context.fluxo_operacional,
    'pagamento', jsonb_build_object(
      'estado',
      CASE
        WHEN v_context.fluxo_operacional = 'IMPLANTACAO'
          THEN 'NAO_APLICAVEL'
        WHEN v_pagamento_confirmado THEN 'CONFIRMADO'
        ELSE 'PENDENTE'
      END
    ),
    'documentacao', jsonb_build_object(
      'concluida', v_documentacao_concluida,
      'obrigatoriosTotal', v_documentos_total,
      'concluidos', v_documentos_concluidos,
      'pendentes', greatest(
        v_documentos_total - v_documentos_concluidos,
        0
      ),
      'dadosPessoaisPendentes', v_dados_insuficientes > 0,
      'envioEmAndamento', v_envio_em_andamento
    ),
    'liberacaoAcademica', CASE
      WHEN v_liberacao.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', v_liberacao.id,
        'ativa', true,
        'liberadoEm', v_liberacao.liberado_em,
        'liberadoPorNome', v_liberacao.liberado_por_nome,
        'motivo', v_liberacao.motivo
      )
    END,
    'acoes', jsonb_build_object(
      'ativarRegular', jsonb_build_object(
        'permitida', cardinality(v_bloqueios_regular) = 0,
        'bloqueios', to_jsonb(v_bloqueios_regular)
      ),
      'liberarImplantacao', jsonb_build_object(
        'permitida', cardinality(v_bloqueios_implantacao) = 0,
        'bloqueios', to_jsonb(v_bloqueios_implantacao)
      ),
      'revogarLiberacao', jsonb_build_object(
        'permitida', v_pode_operar AND v_liberacao.id IS NOT NULL,
        'bloqueios', CASE
          WHEN v_pode_operar AND v_liberacao.id IS NOT NULL
            THEN '[]'::jsonb
          ELSE jsonb_build_array('LIBERACAO_INATIVA_OU_SEM_PERMISSAO')
        END
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.matricula_tecnica_workflow_snapshot(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.matricula_tecnica_workflow_snapshot(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.listar_fluxos_matriculas_tecnicas(
  p_aluno_id uuid
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
  IF auth.uid() IS NULL
    OR p_aluno_id IS NULL
    OR NOT public.gestor_pode_gerenciar_documento_aluno(p_aluno_id)
  THEN
    RAISE EXCEPTION 'Aluno fora do escopo do gestor.'
      USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      public.matricula_tecnica_workflow_snapshot(matricula.id)
      ORDER BY matricula.data_matricula DESC NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.matriculas matricula
  JOIN public.turmas turma ON turma.id = matricula.turma_id
  JOIN public.cursos curso ON curso.id = turma.curso_id
  WHERE matricula.aluno_id = p_aluno_id
    AND upper(coalesce(curso.modalidade, ''))
      IN ('TECNICO', 'TÉCNICO')
    AND upper(coalesce(matricula.status, '')) IN (
      'PENDENTE',
      'AGUARDANDO_CONFIRMACAO',
      'ATIVO'
    );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_fluxos_matriculas_tecnicas(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_fluxos_matriculas_tecnicas(uuid)
  TO authenticated, service_role;

DROP FUNCTION IF EXISTS
  public.ativar_matricula_tecnica_apos_documentos(uuid);

CREATE OR REPLACE FUNCTION public.ativar_matricula_tecnica_apos_documentos(
  p_matricula_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_context record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória.' USING ERRCODE = '42501';
  END IF;

  SELECT
    matricula.id,
    matricula.aluno_id,
    matricula.turma_id,
    matricula.status,
    matricula.fluxo_operacional,
    upper(coalesce(curso.modalidade, '')) AS modalidade
  INTO v_context
  FROM public.matriculas matricula
  JOIN public.turmas turma ON turma.id = matricula.turma_id
  JOIN public.cursos curso ON curso.id = turma.curso_id
  WHERE matricula.id = p_matricula_id
  FOR UPDATE OF matricula;

  IF v_context.id IS NULL THEN
    RAISE EXCEPTION 'Matrícula não encontrada.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'matricula_workflow:' || v_context.id::text,
      0
    )
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'student_document_state:' || v_context.aluno_id::text,
      0
    )
  );

  IF NOT public.can_operate_turma_academics(v_context.turma_id) THEN
    RAISE EXCEPTION
      'A permissão de Gestão acadêmica é obrigatória para ativar a matrícula.'
      USING ERRCODE = '42501';
  END IF;
  IF v_context.modalidade NOT IN ('TECNICO', 'TÉCNICO') THEN
    RAISE EXCEPTION 'Apenas matrículas técnicas usam esta análise.'
      USING ERRCODE = '22023';
  END IF;
  IF v_context.fluxo_operacional <> 'REGULAR' THEN
    RAISE EXCEPTION
      'Matrícula de implantação não pode ser ativada como regular.'
      USING ERRCODE = '22023';
  END IF;

  IF upper(coalesce(v_context.status, '')) = 'ATIVO' THEN
    RETURN public.matricula_tecnica_workflow_snapshot(v_context.id);
  END IF;
  IF upper(coalesce(v_context.status, ''))
    NOT IN ('PENDENTE', 'AGUARDANDO_CONFIRMACAO')
  THEN
    RAISE EXCEPTION 'A matrícula não está pendente de ativação.'
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.matricula_tecnica_pagamento_confirmado(v_context.id)
  THEN
    RAISE EXCEPTION 'O pagamento da matrícula ainda não foi confirmado.'
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.documentacao_obrigatoria_aluno_concluida(
    v_context.aluno_id
  ) THEN
    RAISE EXCEPTION
      'Conclua todos os documentos obrigatórios antes de ativar a matrícula.'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.documentos_aluno_lotes lote
    WHERE lote.aluno_id = v_context.aluno_id
      AND (
        lote.status = 'aguardando_mapeamento'
        OR (
          lote.status = 'preparando'
          AND lote.criado_em >= now() - interval '24 hours'
        )
      )
  ) THEN
    RAISE EXCEPTION
      'Existe envio documental incompleto ou PDF aguardando mapeamento.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM internal_academic.authorize_enrollment_status(
    v_context.id,
    'ATIVO'
  );

  UPDATE public.matriculas
  SET status = 'ATIVO'
  WHERE id = v_context.id;

  RETURN public.matricula_tecnica_workflow_snapshot(v_context.id);
END;
$$;

REVOKE ALL ON FUNCTION
  public.ativar_matricula_tecnica_apos_documentos(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.ativar_matricula_tecnica_apos_documentos(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.liberar_matricula_implantacao(
  p_matricula_id uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_context record;
  v_liberacao_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória.' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_motivo, ''))) NOT BETWEEN 10 AND 1000
  THEN
    RAISE EXCEPTION 'Informe uma justificativa entre 10 e 1000 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    matricula.id,
    matricula.aluno_id,
    matricula.turma_id,
    matricula.status,
    turma.status AS turma_status,
    upper(coalesce(curso.modalidade, '')) AS modalidade
  INTO v_context
  FROM public.matriculas matricula
  JOIN public.turmas turma ON turma.id = matricula.turma_id
  JOIN public.cursos curso ON curso.id = turma.curso_id
  WHERE matricula.id = p_matricula_id
  FOR UPDATE OF matricula;

  IF v_context.id IS NULL THEN
    RAISE EXCEPTION 'Matrícula não encontrada.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'matricula_workflow:' || v_context.id::text,
      0
    )
  );

  IF NOT public.can_operate_turma_academics(v_context.turma_id) THEN
    RAISE EXCEPTION
      'A permissão de Gestão acadêmica é obrigatória para liberar implantação.'
      USING ERRCODE = '42501';
  END IF;
  IF v_context.modalidade NOT IN ('TECNICO', 'TÉCNICO')
    OR upper(coalesce(v_context.status, '')) <> 'PENDENTE'
    OR upper(coalesce(v_context.turma_status, '')) <> 'EM_ANDAMENTO'
  THEN
    RAISE EXCEPTION
      'Implantação exige matrícula técnica pendente em turma em andamento.'
      USING ERRCODE = '22023';
  END IF;
  IF public.matricula_possui_vinculo_financeiro(v_context.id) THEN
    RAISE EXCEPTION
      'Matrícula com vínculo financeiro não pode virar implantação.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM internal_academic.authorize_matricula_control_update(
    v_context.id
  );

  UPDATE public.matriculas
  SET
    fluxo_operacional = 'IMPLANTACAO',
    fluxo_operacional_motivo = btrim(p_motivo),
    fluxo_operacional_definido_em = now(),
    fluxo_operacional_definido_por = auth.uid(),
    financeiro_herdado = false,
    gerar_cobranca_inicial = false,
    gerar_cobranca_futura = false,
    sincronizar_asaas = false
  WHERE id = v_context.id;

  SELECT liberacao.id
  INTO v_liberacao_id
  FROM public.matricula_liberacoes_diario liberacao
  WHERE liberacao.matricula_id = v_context.id
    AND liberacao.revogado_em IS NULL
  FOR UPDATE;

  IF v_liberacao_id IS NULL THEN
    INSERT INTO public.matricula_liberacoes_diario (
      matricula_id,
      aluno_id,
      turma_id,
      motivo,
      origem,
      liberado_por
    )
    VALUES (
      v_context.id,
      v_context.aluno_id,
      v_context.turma_id,
      btrim(p_motivo),
      'GESTOR_IMPLANTACAO',
      auth.uid()
    )
    RETURNING id INTO v_liberacao_id;
  END IF;

  RETURN public.matricula_tecnica_workflow_snapshot(v_context.id);
END;
$$;

REVOKE ALL ON FUNCTION
  public.liberar_matricula_implantacao(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.liberar_matricula_implantacao(uuid, text)
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
  v_turma_id uuid;
  v_fluxo text;
BEGIN
  SELECT matricula.turma_id, matricula.fluxo_operacional
  INTO v_turma_id, v_fluxo
  FROM public.matriculas matricula
  WHERE matricula.id = p_matricula_id;

  IF v_turma_id IS NULL THEN
    RAISE EXCEPTION 'Matrícula não encontrada.' USING ERRCODE = '22023';
  END IF;
  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND NOT public.can_operate_turma_academics(v_turma_id)
  THEN
    RAISE EXCEPTION
      'A permissão de Gestão acadêmica é obrigatória para liberar ou revogar acesso ao diário.'
      USING ERRCODE = '42501';
  END IF;
  IF p_liberada AND v_fluxo <> 'IMPLANTACAO' THEN
    RAISE EXCEPTION
      'Use a ação oficial de implantação antes de liberar o diário.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM internal_academic.p1_set_matricula_liberacao_diario_20260729(
    p_matricula_id,
    p_liberada,
    p_motivo
  );

  RETURN public.matricula_tecnica_workflow_snapshot(p_matricula_id);
END;
$$;

REVOKE ALL ON FUNCTION
  public.set_matricula_liberacao_diario(uuid, boolean, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.set_matricula_liberacao_diario(uuid, boolean, text)
  TO authenticated, service_role;

ALTER FUNCTION public.listar_painel_documentos_aluno(uuid)
  RENAME TO p1_listar_painel_documentos_aluno_20260731;

REVOKE ALL ON FUNCTION
  public.p1_listar_painel_documentos_aluno_20260731(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.p1_listar_painel_documentos_aluno_20260731(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.listar_painel_documentos_aluno(
  p_aluno_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_painel jsonb;
  v_itens jsonb;
BEGIN
  v_painel :=
    public.p1_listar_painel_documentos_aluno_20260731(p_aluno_id);

  SELECT coalesce(
    jsonb_agg(
      item
      || jsonb_build_object(
        'codigo',
        documento.documento_codigo,
        'regraObrigatoriedade',
        documento.regra_obrigatoriedade,
        'aplicavel',
        CASE public.documento_aluno_regra_estado(documento.id)
          WHEN 'OBRIGATORIO' THEN to_jsonb(true)
          WHEN 'DISPENSADO' THEN to_jsonb(false)
          ELSE 'null'::jsonb
        END,
        'obrigatorio',
        public.documento_aluno_regra_estado(documento.id)
          <> 'DISPENSADO'
      )
      ORDER BY item ->> 'nome'
    ),
    '[]'::jsonb
  )
  INTO v_itens
  FROM jsonb_array_elements(v_painel -> 'itens') item
  JOIN public.documentos_aluno documento
    ON documento.id = (item ->> 'id')::uuid;

  RETURN jsonb_set(v_painel, '{itens}', v_itens, true);
END;
$$;

REVOKE ALL ON FUNCTION public.listar_painel_documentos_aluno(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_painel_documentos_aluno(uuid)
  TO authenticated, service_role;
