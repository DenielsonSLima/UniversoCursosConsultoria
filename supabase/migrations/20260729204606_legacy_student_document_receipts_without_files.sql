BEGIN;
-- Versão registrada pelo MCP Supabase: 20260729204606.

-- Registra a conferência de documentos mantidos no sistema anterior sem
-- inventar arquivo, lote ou versão. O upload real continua disponível.

ALTER TABLE public.documentos_aluno
  ADD CONSTRAINT documentos_aluno_id_aluno_key UNIQUE (id, aluno_id);

CREATE TABLE public.documentos_aluno_recebimentos_sem_anexo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL,
  aluno_id uuid NOT NULL,
  origem text NOT NULL DEFAULT 'GESTOR_MIGRACAO_LEGADA',
  motivo text NOT NULL,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  recebido_por_auth_uid uuid,
  recebido_por_usuario_id uuid
    REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL,
  recebido_por_sistema text,
  revogado_em timestamptz,
  revogado_por_auth_uid uuid,
  revogado_por_usuario_id uuid
    REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL,
  revogado_por_sistema text,
  motivo_revogacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documentos_recebimentos_documento_fkey
    FOREIGN KEY (documento_id, aluno_id)
    REFERENCES public.documentos_aluno(id, aluno_id)
    ON DELETE RESTRICT,
  CONSTRAINT documentos_recebimentos_origem_chk
    CHECK (
      origem IN ('GESTOR_MIGRACAO_LEGADA', 'MIGRACAO_LEGADA_T41')
    ),
  CONSTRAINT documentos_recebimentos_motivo_chk
    CHECK (length(btrim(motivo)) BETWEEN 10 AND 1000),
  CONSTRAINT documentos_recebimentos_ator_chk
    CHECK (
      (
        origem = 'GESTOR_MIGRACAO_LEGADA'
        AND recebido_por_auth_uid IS NOT NULL
      )
      OR (
        origem = 'MIGRACAO_LEGADA_T41'
        AND nullif(btrim(recebido_por_sistema), '') IS NOT NULL
      )
    ),
  CONSTRAINT documentos_recebimentos_revogacao_chk
    CHECK (
      (
        revogado_em IS NULL
        AND revogado_por_auth_uid IS NULL
        AND revogado_por_usuario_id IS NULL
        AND revogado_por_sistema IS NULL
        AND motivo_revogacao IS NULL
      )
      OR (
        revogado_em IS NOT NULL
        AND (
          revogado_por_auth_uid IS NOT NULL
          OR nullif(btrim(revogado_por_sistema), '') IS NOT NULL
        )
        AND length(btrim(motivo_revogacao)) BETWEEN 10 AND 1000
      )
    )
);

CREATE UNIQUE INDEX documentos_recebimentos_sem_anexo_ativo_uidx
  ON public.documentos_aluno_recebimentos_sem_anexo (documento_id)
  WHERE revogado_em IS NULL;

CREATE INDEX documentos_recebimentos_sem_anexo_aluno_idx
  ON public.documentos_aluno_recebimentos_sem_anexo
  (aluno_id, recebido_em DESC);

ALTER TABLE public.documentos_aluno_recebimentos_sem_anexo
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.documentos_aluno_recebimentos_sem_anexo
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.documentos_aluno_recebimentos_sem_anexo
  TO service_role;

COMMENT ON TABLE public.documentos_aluno_recebimentos_sem_anexo IS
  'Ledger auditável de documento legado conferido sem cópia digital anexada.';

CREATE OR REPLACE FUNCTION
  public.protect_documentos_recebimentos_sem_anexo_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'O histórico de recebimento documental é imutável.'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.documento_id IS DISTINCT FROM NEW.documento_id
    OR OLD.aluno_id IS DISTINCT FROM NEW.aluno_id
    OR OLD.origem IS DISTINCT FROM NEW.origem
    OR OLD.motivo IS DISTINCT FROM NEW.motivo
    OR OLD.recebido_em IS DISTINCT FROM NEW.recebido_em
    OR OLD.recebido_por_auth_uid IS DISTINCT FROM NEW.recebido_por_auth_uid
    OR OLD.recebido_por_usuario_id IS DISTINCT FROM NEW.recebido_por_usuario_id
    OR OLD.recebido_por_sistema IS DISTINCT FROM NEW.recebido_por_sistema
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
  public.protect_documentos_recebimentos_sem_anexo_audit()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_protect_documentos_recebimentos_sem_anexo_audit
BEFORE UPDATE OR DELETE
ON public.documentos_aluno_recebimentos_sem_anexo
FOR EACH ROW
EXECUTE FUNCTION public.protect_documentos_recebimentos_sem_anexo_audit();

CREATE OR REPLACE FUNCTION
  public.listar_documentos_recebidos_sem_anexo(p_aluno_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  documento_id uuid,
  aluno_id uuid,
  origem text,
  motivo text,
  recebido_em timestamptz,
  recebido_por_nome text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_aluno_id uuid := coalesce(p_aluno_id, public.current_aluno_id());
BEGIN
  IF v_aluno_id IS NULL
    OR (
      coalesce((SELECT auth.role()), '') <> 'service_role'
      AND (
        auth.uid() IS NULL
        OR NOT public.gestor_pode_gerenciar_documento_aluno(v_aluno_id)
      )
    )
  THEN
    RAISE EXCEPTION 'Recebimentos documentais fora do escopo do gestor.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    recebimento.id,
    recebimento.documento_id,
    recebimento.aluno_id,
    recebimento.origem,
    recebimento.motivo,
    recebimento.recebido_em,
    usuario.nome
  FROM public.documentos_aluno_recebimentos_sem_anexo recebimento
  LEFT JOIN public.usuarios_sistema usuario
    ON usuario.id = recebimento.recebido_por_usuario_id
  WHERE recebimento.aluno_id = v_aluno_id
    AND recebimento.revogado_em IS NULL
  ORDER BY recebimento.recebido_em DESC, recebimento.id;
END;
$$;

REVOKE ALL ON FUNCTION
  public.listar_documentos_recebidos_sem_anexo(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.listar_documentos_recebidos_sem_anexo(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION
  public.aluno_pode_registrar_documento_sem_anexo(
    p_aluno_id uuid DEFAULT NULL
  )
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_aluno_id uuid := coalesce(p_aluno_id, public.current_aluno_id());
BEGIN
  IF v_aluno_id IS NULL
    OR (
      coalesce((SELECT auth.role()), '') <> 'service_role'
      AND (
        auth.uid() IS NULL
        OR NOT public.gestor_pode_gerenciar_documento_aluno(v_aluno_id)
      )
    )
  THEN
    RAISE EXCEPTION 'Aluno fora do escopo do gestor.'
      USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.matriculas matricula
    JOIN public.matricula_liberacoes_diario liberacao
      ON liberacao.matricula_id = matricula.id
     AND liberacao.origem = 'MIGRACAO_LEGADA'
     AND liberacao.revogado_em IS NULL
    WHERE matricula.aluno_id = v_aluno_id
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.aluno_pode_registrar_documento_sem_anexo(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.aluno_pode_registrar_documento_sem_anexo(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION
  public.marcar_documento_recebido_sem_anexo(
    p_documento_id uuid,
    p_motivo text
  )
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_documento public.documentos_aluno%ROWTYPE;
  v_recebimento public.documentos_aluno_recebimentos_sem_anexo%ROWTYPE;
  v_usuario_id uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória.' USING ERRCODE = '42501';
  END IF;
  IF v_motivo IS NULL OR length(v_motivo) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'Informe uma justificativa entre 10 e 1000 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_documento
  FROM public.documentos_aluno
  WHERE id = p_documento_id
  FOR UPDATE;

  IF v_documento.id IS NULL
    OR NOT public.gestor_pode_gerenciar_documento_aluno(v_documento.aluno_id)
  THEN
    RAISE EXCEPTION 'Documento não encontrado ou fora do escopo do gestor.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.matriculas matricula
    JOIN public.matricula_liberacoes_diario liberacao
      ON liberacao.matricula_id = matricula.id
     AND liberacao.origem = 'MIGRACAO_LEGADA'
     AND liberacao.revogado_em IS NULL
    WHERE matricula.aluno_id = v_documento.aluno_id
  ) THEN
    RAISE EXCEPTION
      'Recebimento sem anexo permitido apenas para aluno migrado do sistema anterior.'
      USING ERRCODE = '22023';
  END IF;

  IF v_documento.versao_atual_id IS NOT NULL
    OR nullif(v_documento.arquivo_url, '') IS NOT NULL
    OR v_documento.arquivo_bucket IS NOT NULL
    OR v_documento.arquivo_path IS NOT NULL
  THEN
    RAISE EXCEPTION
      'Este item possui arquivo ou versão; use o fluxo normal de revisão.'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_recebimento
  FROM public.documentos_aluno_recebimentos_sem_anexo
  WHERE documento_id = v_documento.id
    AND revogado_em IS NULL
  FOR UPDATE;

  IF v_recebimento.id IS NULL THEN
    v_usuario_id := public.documentos_aluno_usuario_atual_id();

    INSERT INTO public.documentos_aluno_recebimentos_sem_anexo (
      documento_id,
      aluno_id,
      origem,
      motivo,
      recebido_por_auth_uid,
      recebido_por_usuario_id
    )
    VALUES (
      v_documento.id,
      v_documento.aluno_id,
      'GESTOR_MIGRACAO_LEGADA',
      v_motivo,
      auth.uid(),
      v_usuario_id
    )
    RETURNING * INTO v_recebimento;

    UPDATE public.documentos_aluno
    SET
      status = 'aprovado',
      observacao = 'Recebido sem anexo (migração legada): ' || v_motivo,
      revisado_por = v_usuario_id,
      revisado_em = v_recebimento.recebido_em,
      updated_at = now()
    WHERE id = v_documento.id;

    INSERT INTO public.documentos_aluno_eventos (
      aluno_id,
      documento_id,
      evento,
      ator_auth_uid,
      ator_usuario_id,
      detalhes
    )
    VALUES (
      v_documento.aluno_id,
      v_documento.id,
      'documento_recebido_sem_anexo',
      auth.uid(),
      v_usuario_id,
      jsonb_build_object(
        'recebimentoId', v_recebimento.id,
        'origem', v_recebimento.origem,
        'motivo', v_motivo
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_recebimento.id,
    'documentoId', v_recebimento.documento_id,
    'alunoId', v_recebimento.aluno_id,
    'origem', v_recebimento.origem,
    'motivo', v_recebimento.motivo,
    'recebidoEm', v_recebimento.recebido_em
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.marcar_documento_recebido_sem_anexo(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.marcar_documento_recebido_sem_anexo(uuid, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION
  public.revogar_documento_recebido_sem_anexo(
    p_documento_id uuid,
    p_motivo text
  )
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_documento public.documentos_aluno%ROWTYPE;
  v_recebimento public.documentos_aluno_recebimentos_sem_anexo%ROWTYPE;
  v_usuario_id uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória.' USING ERRCODE = '42501';
  END IF;
  IF v_motivo IS NULL OR length(v_motivo) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'Informe um motivo de revogação entre 10 e 1000 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_documento
  FROM public.documentos_aluno
  WHERE id = p_documento_id
  FOR UPDATE;

  IF v_documento.id IS NULL
    OR NOT public.gestor_pode_gerenciar_documento_aluno(v_documento.aluno_id)
  THEN
    RAISE EXCEPTION 'Documento não encontrado ou fora do escopo do gestor.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_recebimento
  FROM public.documentos_aluno_recebimentos_sem_anexo
  WHERE documento_id = v_documento.id
    AND revogado_em IS NULL
  FOR UPDATE;

  IF v_recebimento.id IS NULL THEN
    RAISE EXCEPTION 'O documento não possui recebimento sem anexo ativo.'
      USING ERRCODE = '22023';
  END IF;

  v_usuario_id := public.documentos_aluno_usuario_atual_id();

  UPDATE public.documentos_aluno_recebimentos_sem_anexo
  SET
    revogado_em = now(),
    revogado_por_auth_uid = auth.uid(),
    revogado_por_usuario_id = v_usuario_id,
    motivo_revogacao = v_motivo
  WHERE id = v_recebimento.id;

  IF v_documento.versao_atual_id IS NULL THEN
    UPDATE public.documentos_aluno
    SET
      status = 'pendente',
      observacao = NULL,
      revisado_por = NULL,
      revisado_em = NULL,
      updated_at = now()
    WHERE id = v_documento.id;
  END IF;

  INSERT INTO public.documentos_aluno_eventos (
    aluno_id,
    documento_id,
    evento,
    ator_auth_uid,
    ator_usuario_id,
    detalhes
  )
  VALUES (
    v_documento.aluno_id,
    v_documento.id,
    'documento_recebido_sem_anexo_revogado',
    auth.uid(),
    v_usuario_id,
    jsonb_build_object(
      'recebimentoId', v_recebimento.id,
      'motivo', v_motivo
    )
  );

  RETURN jsonb_build_object(
    'documentoId', v_documento.id,
    'recebimentoId', v_recebimento.id,
    'revogado', true
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.revogar_documento_recebido_sem_anexo(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.revogar_documento_recebido_sem_anexo(uuid, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION
  public.revogar_recebimento_sem_anexo_ao_enviar_arquivo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_recebimento_id uuid;
BEGIN
  IF NEW.versao_atual_id IS NOT NULL
    AND NEW.versao_atual_id IS DISTINCT FROM OLD.versao_atual_id
  THEN
    UPDATE public.documentos_aluno_recebimentos_sem_anexo
    SET
      revogado_em = now(),
      revogado_por_auth_uid = auth.uid(),
      revogado_por_sistema = CASE
        WHEN auth.uid() IS NULL THEN 'TRIGGER_NOVO_UPLOAD'
        ELSE NULL
      END,
      motivo_revogacao =
        'Substituído automaticamente por novo documento digital enviado.'
    WHERE documento_id = NEW.id
      AND revogado_em IS NULL
    RETURNING id INTO v_recebimento_id;

    IF v_recebimento_id IS NOT NULL THEN
      INSERT INTO public.documentos_aluno_eventos (
        aluno_id,
        documento_id,
        versao_id,
        evento,
        ator_auth_uid,
        detalhes
      )
      VALUES (
        NEW.aluno_id,
        NEW.id,
        NEW.versao_atual_id,
        'documento_sem_anexo_substituido_por_upload',
        auth.uid(),
        jsonb_build_object('recebimentoId', v_recebimento_id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  public.revogar_recebimento_sem_anexo_ao_enviar_arquivo()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_revogar_recebimento_sem_anexo_ao_enviar_arquivo
AFTER UPDATE OF versao_atual_id
ON public.documentos_aluno
FOR EACH ROW
EXECUTE FUNCTION public.revogar_recebimento_sem_anexo_ao_enviar_arquivo();

CREATE OR REPLACE FUNCTION public.guard_technical_activation_document_versions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_modalidade text;
BEGIN
  IF upper(coalesce(NEW.status, '')) <> 'ATIVO' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
    AND upper(coalesce(OLD.status, '')) = 'ATIVO'
    AND OLD.aluno_id IS NOT DISTINCT FROM NEW.aluno_id
    AND OLD.turma_id IS NOT DISTINCT FROM NEW.turma_id
  THEN
    RETURN NEW;
  END IF;

  SELECT upper(coalesce(curso.modalidade, ''))
  INTO v_modalidade
  FROM public.turmas turma
  JOIN public.cursos curso ON curso.id = turma.curso_id
  WHERE turma.id = NEW.turma_id;

  IF v_modalidade <> 'TECNICO' THEN
    RETURN NEW;
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.documentos_aluno documento
    LEFT JOIN public.documentos_aluno_versoes versao
      ON versao.id = documento.versao_atual_id
    WHERE documento.aluno_id = NEW.aluno_id
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
    RAISE EXCEPTION
      'Aprove ou registre o recebimento de ao menos um documento antes de ativar a matrícula.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.documentos_aluno documento
    JOIN public.documentos_aluno_versoes versao
      ON versao.id = documento.versao_atual_id
    WHERE documento.aluno_id = NEW.aluno_id
      AND versao.status <> 'aprovado'
  ) THEN
    RAISE EXCEPTION
      'Ainda existem documentos enviados aguardando aprovação ou recusados.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_technical_activation_document_versions()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ativar_matricula_tecnica_apos_documentos(
  p_matricula_id uuid
)
RETURNS public.matriculas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_context record;
  v_matricula public.matriculas%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória.' USING ERRCODE = '42501';
  END IF;

  SELECT
    matricula.id AS matricula_id,
    matricula.aluno_id,
    matricula.status,
    aluno.polo_id,
    aluno.polo_ids,
    curso.modalidade
  INTO v_context
  FROM public.matriculas matricula
  JOIN public.parceiros aluno ON aluno.id = matricula.aluno_id
  JOIN public.turmas turma ON turma.id = matricula.turma_id
  JOIN public.cursos curso ON curso.id = turma.curso_id
  WHERE matricula.id = p_matricula_id
  FOR UPDATE OF matricula;

  IF v_context.matricula_id IS NULL
    OR NOT public.is_partner_in_gestor_scope(
      v_context.polo_id,
      v_context.polo_ids
    )
  THEN
    RAISE EXCEPTION 'Matrícula não encontrada ou fora do escopo do gestor.'
      USING ERRCODE = '42501';
  END IF;

  IF upper(coalesce(v_context.modalidade, '')) <> 'TECNICO' THEN
    RAISE EXCEPTION 'Apenas matrículas técnicas usam esta análise documental.'
      USING ERRCODE = '22023';
  END IF;

  IF upper(coalesce(v_context.status, ''))
    NOT IN ('PENDENTE', 'AGUARDANDO_CONFIRMACAO')
  THEN
    RAISE EXCEPTION 'A matrícula não está pendente de ativação.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.contas_receber conta
    WHERE conta.matricula_id = v_context.matricula_id
      AND conta.tipo_lancamento = 'MATRICULA'
      AND (
        upper(coalesce(conta.status, '')) = 'PAGO'
        OR upper(coalesce(conta.asaas_status, '')) IN ('RECEIVED', 'CONFIRMED')
      )
    UNION ALL
    SELECT 1
    FROM public.inscricoes_online inscricao
    WHERE inscricao.matricula_id = v_context.matricula_id
      AND upper(coalesce(inscricao.status, '')) = 'PAGO'
  ) THEN
    RAISE EXCEPTION 'O pagamento da matrícula ainda não foi confirmado.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.documentos_aluno documento
    LEFT JOIN public.documentos_aluno_versoes versao
      ON versao.id = documento.versao_atual_id
    WHERE documento.aluno_id = v_context.aluno_id
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
    RAISE EXCEPTION
      'Aprove ou registre o recebimento de ao menos um documento antes de ativar a matrícula.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.documentos_aluno documento
    JOIN public.documentos_aluno_versoes versao
      ON versao.id = documento.versao_atual_id
    WHERE documento.aluno_id = v_context.aluno_id
      AND versao.status <> 'aprovado'
  ) THEN
    RAISE EXCEPTION
      'Ainda existem documentos enviados aguardando aprovação ou recusados.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.matriculas
  SET status = 'ATIVO'
  WHERE id = v_context.matricula_id
  RETURNING * INTO v_matricula;

  RETURN v_matricula;
END;
$$;

REVOKE ALL ON FUNCTION public.ativar_matricula_tecnica_apos_documentos(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ativar_matricula_tecnica_apos_documentos(uuid)
  TO authenticated, service_role;

COMMIT;
