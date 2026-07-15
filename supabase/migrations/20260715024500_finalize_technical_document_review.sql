BEGIN;

-- A reserva de matrícula é uma operação interna do checkout. O cliente web
-- nunca deve escolher outro aluno ou alterar flags financeiras diretamente.
REVOKE EXECUTE ON FUNCTION public.asaas_checkout_upsert_matricula(
  uuid,
  uuid,
  boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asaas_checkout_upsert_matricula(
  uuid,
  uuid,
  boolean
) TO service_role;

CREATE OR REPLACE FUNCTION public.gestor_pode_acessar_objeto_documento_aluno(
  p_name text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_aluno_id uuid;
BEGIN
  IF p_name IS NULL
    OR p_name LIKE '%..%'
    OR split_part(p_name, '/', 2) <> 'documentos'
    OR split_part(p_name, '/', 1) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RETURN false;
  END IF;

  v_aluno_id := split_part(p_name, '/', 1)::uuid;
  RETURN EXISTS (
    SELECT 1
    FROM public.parceiros aluno
    WHERE aluno.id = v_aluno_id
      AND public.is_partner_in_gestor_scope(aluno.polo_id, aluno.polo_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gestor_pode_acessar_objeto_documento_aluno(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestor_pode_acessar_objeto_documento_aluno(text)
  TO authenticated, service_role;

-- O aluno substitui um arquivo criando um novo objeto com nome único e
-- vinculando-o pela RPC registrar_envio_documento_aluno. UPDATE e DELETE de
-- objetos existentes ficam restritos ao gestor para preservar aprovações.
DROP POLICY IF EXISTS documentos_alunos_private_update ON storage.objects;
DROP POLICY IF EXISTS documentos_alunos_private_delete ON storage.objects;

CREATE POLICY documentos_alunos_private_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documentos-alunos'
  AND public.gestor_pode_acessar_objeto_documento_aluno(name)
)
WITH CHECK (
  bucket_id = 'documentos-alunos'
  AND public.gestor_pode_acessar_objeto_documento_aluno(name)
);

CREATE POLICY documentos_alunos_private_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documentos-alunos'
  AND public.gestor_pode_acessar_objeto_documento_aluno(name)
);

-- A ativação é uma decisão explícita do gestor depois do pagamento e da
-- análise. Documentos efetivamente enviados precisam estar todos aprovados;
-- itens condicionais sem arquivo permanecem sob decisão administrativa.
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
    RAISE EXCEPTION 'Autenticacao obrigatoria.' USING ERRCODE = '42501';
  END IF;

  SELECT m.id AS matricula_id,
         m.aluno_id,
         m.status,
         aluno.polo_id,
         aluno.polo_ids,
         c.modalidade
  INTO v_context
  FROM public.matriculas m
  JOIN public.parceiros aluno ON aluno.id = m.aluno_id
  JOIN public.turmas t ON t.id = m.turma_id
  JOIN public.cursos c ON c.id = t.curso_id
  WHERE m.id = p_matricula_id
  FOR UPDATE OF m;

  IF v_context.matricula_id IS NULL
    OR NOT public.is_partner_in_gestor_scope(v_context.polo_id, v_context.polo_ids)
  THEN
    RAISE EXCEPTION 'Matricula nao encontrada ou fora do escopo do gestor.' USING ERRCODE = '42501';
  END IF;

  IF upper(coalesce(v_context.modalidade, '')) <> 'TECNICO' THEN
    RAISE EXCEPTION 'Apenas matriculas tecnicas usam esta analise documental.' USING ERRCODE = '22023';
  END IF;

  IF upper(coalesce(v_context.status, '')) NOT IN ('PENDENTE', 'AGUARDANDO_CONFIRMACAO') THEN
    RAISE EXCEPTION 'A matricula nao esta pendente de ativacao.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.contas_receber cr
    WHERE cr.matricula_id = v_context.matricula_id
      AND cr.tipo_lancamento = 'MATRICULA'
      AND (
        upper(coalesce(cr.status, '')) = 'PAGO'
        OR upper(coalesce(cr.asaas_status, '')) IN ('RECEIVED', 'CONFIRMED')
      )
    UNION ALL
    SELECT 1
    FROM public.inscricoes_online io
    WHERE io.matricula_id = v_context.matricula_id
      AND upper(coalesce(io.status, '')) = 'PAGO'
  ) THEN
    RAISE EXCEPTION 'O pagamento da matricula ainda nao foi confirmado.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.documentos_aluno d
    WHERE d.aluno_id = v_context.aluno_id
      AND (coalesce(d.arquivo_url, '') <> '' OR (d.arquivo_bucket IS NOT NULL AND d.arquivo_path IS NOT NULL))
      AND d.status = 'aprovado'
  ) THEN
    RAISE EXCEPTION 'Aprove ao menos um documento enviado antes de ativar a matricula.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.documentos_aluno d
    WHERE d.aluno_id = v_context.aluno_id
      AND (coalesce(d.arquivo_url, '') <> '' OR (d.arquivo_bucket IS NOT NULL AND d.arquivo_path IS NOT NULL))
      AND d.status <> 'aprovado'
  ) THEN
    RAISE EXCEPTION 'Ainda existem documentos enviados aguardando aprovacao ou recusados.' USING ERRCODE = '22023';
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
