BEGIN;
-- Versão registrada pelo MCP Supabase: 20260729204613.

DO $$
DECLARE
  v_turma_id uuid;
  v_matriculas integer;
  v_documentos integer;
  v_recebimentos integer;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('t41-legacy-document-receipts-v1', 0)
  );

  SELECT id
  INTO v_turma_id
  FROM public.turmas
  WHERE codigo = 'ENF-T41-SEM-AQU'
    AND nome = 'ENF T-41 SEM';

  IF v_turma_id IS NULL THEN
    RAISE EXCEPTION 'A Turma 41 não foi localizada para o backfill documental.'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*)
  INTO v_matriculas
  FROM public.matriculas
  WHERE turma_id = v_turma_id
    AND upper(coalesce(status, '')) = 'PENDENTE';

  IF v_matriculas <> 32 THEN
    RAISE EXCEPTION
      'Esperadas 32 matrículas pendentes na Turma 41; encontradas %.',
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
      'A Turma 41 possui estado financeiro e o backfill foi interrompido.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.matriculas matricula
    WHERE matricula.turma_id = v_turma_id
    GROUP BY matricula.aluno_id
    HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION
      'A Turma 41 possui aluno com quantidade de matrículas diferente de uma.'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*)
  INTO v_documentos
  FROM public.documentos_aluno documento
  JOIN public.matriculas matricula
    ON matricula.aluno_id = documento.aluno_id
  WHERE matricula.turma_id = v_turma_id;

  IF v_documentos <> 288 THEN
    RAISE EXCEPTION
      'Esperados 288 itens de checklist na Turma 41; encontrados %.',
      v_documentos
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.matriculas matricula
    LEFT JOIN public.documentos_aluno documento
      ON documento.aluno_id = matricula.aluno_id
    WHERE matricula.turma_id = v_turma_id
    GROUP BY matricula.id, matricula.aluno_id
    HAVING count(documento.id) <> 9
  ) THEN
    RAISE EXCEPTION
      'Cada matrícula da Turma 41 deve possuir exatamente 9 itens documentais.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.documentos_aluno documento
    JOIN public.matriculas matricula
      ON matricula.aluno_id = documento.aluno_id
    WHERE matricula.turma_id = v_turma_id
      AND (
        documento.versao_atual_id IS NOT NULL
        OR nullif(documento.arquivo_url, '') IS NOT NULL
        OR documento.arquivo_bucket IS NOT NULL
        OR documento.arquivo_path IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION
      'A Turma 41 já possui arquivo ou versão documental; revisão manual necessária.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.documentos_aluno_versoes versao
    JOIN public.documentos_aluno documento
      ON documento.id = versao.documento_id
    JOIN public.matriculas matricula
      ON matricula.aluno_id = documento.aluno_id
    WHERE matricula.turma_id = v_turma_id
  ) OR EXISTS (
    SELECT 1
    FROM public.documentos_aluno_arquivos arquivo
    JOIN public.matriculas matricula
      ON matricula.aluno_id = arquivo.aluno_id
    WHERE matricula.turma_id = v_turma_id
  ) OR EXISTS (
    SELECT 1
    FROM public.documentos_aluno_lotes lote
    JOIN public.matriculas matricula
      ON matricula.aluno_id = lote.aluno_id
    WHERE matricula.turma_id = v_turma_id
  ) THEN
    RAISE EXCEPTION
      'A Turma 41 já possui histórico digital documental; revisão manual necessária.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.documentos_aluno_recebimentos_sem_anexo (
    documento_id,
    aluno_id,
    origem,
    motivo,
    recebido_por_sistema
  )
  SELECT
    documento.id,
    documento.aluno_id,
    'MIGRACAO_LEGADA_T41',
    'Documentação conferida no sistema acadêmico anterior, conforme autorização administrativa para migração da Turma 41.',
    'MCP_SUPABASE_BACKFILL_T41_20260729'
  FROM public.documentos_aluno documento
  JOIN public.matriculas matricula
    ON matricula.aluno_id = documento.aluno_id
  WHERE matricula.turma_id = v_turma_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.documentos_aluno_recebimentos_sem_anexo recebimento
      WHERE recebimento.documento_id = documento.id
        AND recebimento.revogado_em IS NULL
    );

  UPDATE public.documentos_aluno documento
  SET
    status = 'aprovado',
    observacao =
      'Recebido sem anexo (migração legada da Turma 41).',
    revisado_em = now(),
    revisado_por = NULL,
    updated_at = now()
  FROM public.matriculas matricula
  WHERE matricula.aluno_id = documento.aluno_id
    AND matricula.turma_id = v_turma_id;

  INSERT INTO public.documentos_aluno_eventos (
    aluno_id,
    documento_id,
    evento,
    detalhes
  )
  SELECT
    recebimento.aluno_id,
    recebimento.documento_id,
    'documento_recebido_sem_anexo',
    jsonb_build_object(
      'recebimentoId', recebimento.id,
      'origem', recebimento.origem,
      'motivo', recebimento.motivo,
      'registradoPorSistema', recebimento.recebido_por_sistema
    )
  FROM public.documentos_aluno_recebimentos_sem_anexo recebimento
  JOIN public.matriculas matricula
    ON matricula.aluno_id = recebimento.aluno_id
  WHERE matricula.turma_id = v_turma_id
    AND recebimento.origem = 'MIGRACAO_LEGADA_T41'
    AND recebimento.revogado_em IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.documentos_aluno_eventos evento
      WHERE evento.documento_id = recebimento.documento_id
        AND evento.evento = 'documento_recebido_sem_anexo'
        AND evento.detalhes ->> 'recebimentoId' = recebimento.id::text
    );

  SELECT count(*)
  INTO v_recebimentos
  FROM public.documentos_aluno_recebimentos_sem_anexo recebimento
  JOIN public.matriculas matricula
    ON matricula.aluno_id = recebimento.aluno_id
  WHERE matricula.turma_id = v_turma_id
    AND recebimento.revogado_em IS NULL;

  IF v_recebimentos <> 288 THEN
    RAISE EXCEPTION
      'Esperados 288 recebimentos documentais na Turma 41; encontrados %.',
      v_recebimentos
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.matriculas matricula
    LEFT JOIN public.documentos_aluno_recebimentos_sem_anexo recebimento
      ON recebimento.aluno_id = matricula.aluno_id
     AND recebimento.revogado_em IS NULL
    WHERE matricula.turma_id = v_turma_id
    GROUP BY matricula.id, matricula.aluno_id
    HAVING count(recebimento.id) <> 9
  ) THEN
    RAISE EXCEPTION
      'Cada matrícula da Turma 41 deve possuir exatamente 9 recebimentos ativos.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.matriculas
    WHERE turma_id = v_turma_id
      AND upper(coalesce(status, '')) <> 'PENDENTE'
  ) OR EXISTS (
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
      'O backfill alterou status de matrícula ou estado financeiro.'
      USING ERRCODE = '22023';
  END IF;
END;
$$;

COMMIT;
