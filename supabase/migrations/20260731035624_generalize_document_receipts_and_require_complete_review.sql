BEGIN;
-- Recebimento administrativo sem anexo deixa de ser uma exceção exclusiva de
-- migração. A autorização continua restrita ao gestor no escopo do aluno e o
-- ledger permanece imutável.

ALTER TABLE public.documentos_aluno_recebimentos_sem_anexo
  DROP CONSTRAINT documentos_recebimentos_origem_chk,
  DROP CONSTRAINT documentos_recebimentos_ator_chk;

ALTER TABLE public.documentos_aluno_recebimentos_sem_anexo
  ADD CONSTRAINT documentos_recebimentos_origem_chk
    CHECK (
      origem IN (
        'GESTOR_CONFIRMACAO_SEM_ANEXO',
        'GESTOR_MIGRACAO_LEGADA',
        'MIGRACAO_LEGADA_T41'
      )
    ),
  ADD CONSTRAINT documentos_recebimentos_ator_chk
    CHECK (
      (
        origem IN (
          'GESTOR_CONFIRMACAO_SEM_ANEXO',
          'GESTOR_MIGRACAO_LEGADA'
        )
        AND recebido_por_auth_uid IS NOT NULL
      )
      OR (
        origem = 'MIGRACAO_LEGADA_T41'
        AND nullif(btrim(recebido_por_sistema), '') IS NOT NULL
      )
    );

COMMENT ON TABLE public.documentos_aluno_recebimentos_sem_anexo IS
  'Ledger auditável de documento conferido pelo gestor sem cópia digital anexada.';

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

  RETURN true;
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
      'GESTOR_CONFIRMACAO_SEM_ANEXO',
      v_motivo,
      auth.uid(),
      v_usuario_id
    )
    RETURNING * INTO v_recebimento;

    UPDATE public.documentos_aluno
    SET
      status = 'aprovado',
      observacao = 'Documento entregue e conferido sem anexo: ' || v_motivo,
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

-- Centraliza a regra usada pela RPC de ativação e pelo trigger que protege
-- qualquer outro caminho de escrita em matrículas.
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
        AND documento.nome_documento !~* '(titulo de eleitor|reservista)'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.documentos_aluno documento
      LEFT JOIN public.documentos_aluno_versoes versao
        ON versao.id = documento.versao_atual_id
      WHERE documento.aluno_id = p_aluno_id
        AND documento.nome_documento !~* '(titulo de eleitor|reservista)'
        AND NOT (
          coalesce(versao.status = 'aprovado', false)
          OR EXISTS (
            SELECT 1
            FROM public.documentos_aluno_recebimentos_sem_anexo recebimento
            WHERE recebimento.documento_id = documento.id
              AND recebimento.revogado_em IS NULL
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

CREATE OR REPLACE FUNCTION
  public.matricula_tecnica_pagamento_confirmado(p_matricula_id uuid)
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
      AND conta.tipo_lancamento = 'MATRICULA'
      AND (
        upper(coalesce(conta.status, '')) = 'PAGO'
        OR upper(coalesce(conta.asaas_status, '')) IN ('RECEIVED', 'CONFIRMED')
      )
    UNION ALL
    SELECT 1
    FROM public.inscricoes_online inscricao
    WHERE inscricao.matricula_id = p_matricula_id
      AND upper(coalesce(inscricao.status, '')) = 'PAGO'
  );
$$;

REVOKE ALL ON FUNCTION
  public.matricula_tecnica_pagamento_confirmado(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.matricula_tecnica_pagamento_confirmado(uuid)
  TO service_role;

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

  IF NOT public.matricula_tecnica_pagamento_confirmado(v_context.matricula_id)
  THEN
    RAISE EXCEPTION 'O pagamento da matrícula ainda não foi confirmado.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.documentacao_obrigatoria_aluno_concluida(v_context.aluno_id)
  THEN
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

REVOKE ALL ON FUNCTION
  public.ativar_matricula_tecnica_apos_documentos(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.ativar_matricula_tecnica_apos_documentos(uuid)
  TO authenticated, service_role;

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

  IF NOT public.documentacao_obrigatoria_aluno_concluida(NEW.aluno_id) THEN
    RAISE EXCEPTION
      'Conclua todos os documentos obrigatórios antes de ativar a matrícula.'
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

REVOKE ALL ON FUNCTION
  public.guard_technical_activation_document_versions()
  FROM PUBLIC, anon, authenticated;

COMMIT;
