BEGIN;

-- Mantem arquivo_url para documentos legados e passa a guardar novos envios
-- em um bucket privado, sem invalidar os links publicos ja emitidos.
ALTER TABLE public.documentos_aluno
  ADD COLUMN IF NOT EXISTS arquivo_bucket text,
  ADD COLUMN IF NOT EXISTS arquivo_path text,
  ADD COLUMN IF NOT EXISTS revisado_em timestamptz,
  ADD COLUMN IF NOT EXISTS revisado_por uuid REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL;

ALTER TABLE public.documentos_aluno
  DROP CONSTRAINT IF EXISTS documentos_aluno_status_check;

UPDATE public.documentos_aluno
SET status = CASE lower(coalesce(status, ''))
  WHEN 'aprovado' THEN 'aprovado'
  WHEN 'recusado' THEN 'recusado'
  WHEN 'rejeitado' THEN 'recusado'
  ELSE 'pendente'
END;

ALTER TABLE public.documentos_aluno
  ALTER COLUMN status SET DEFAULT 'pendente',
  ALTER COLUMN status SET NOT NULL,
  ADD CONSTRAINT documentos_aluno_status_check
    CHECK (status IN ('pendente', 'aprovado', 'recusado'));

CREATE INDEX IF NOT EXISTS idx_documentos_aluno_aluno_status
  ON public.documentos_aluno (aluno_id, status);

-- O checklist nasce exclusivamente do cadastro do aluno. SECURITY DEFINER e
-- search_path vazio evitam depender da permissao direta do cliente na tabela.
CREATE OR REPLACE FUNCTION public.criar_checklist_documentos_aluno()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.tipo = 'Aluno' THEN
    INSERT INTO public.documentos_aluno (aluno_id, nome_documento)
    VALUES
      (NEW.id, 'RG / CNH (Frente e Verso)'),
      (NEW.id, 'CPF'),
      (NEW.id, 'Comprovante de Residência'),
      (NEW.id, 'Histórico Escolar / Certificado de Conclusão'),
      (NEW.id, 'Certidão de Nascimento ou Casamento'),
      (NEW.id, 'Foto 3x4 Recente'),
      (NEW.id, 'Título de Eleitor (se maior de 18)'),
      (NEW.id, 'Certificado de Reservista (homens)'),
      (NEW.id, 'Declaração de Escolaridade')
    ON CONFLICT (aluno_id, nome_documento) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_checklist_documentos_aluno() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.pode_acessar_documento_aluno(p_aluno_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_aluno_id = public.current_aluno_id()
    OR EXISTS (
      SELECT 1
      FROM public.parceiros aluno
      WHERE aluno.id = p_aluno_id
        AND public.is_partner_in_gestor_scope(aluno.polo_id, aluno.polo_ids)
    );
$$;

REVOKE ALL ON FUNCTION public.pode_acessar_documento_aluno(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pode_acessar_documento_aluno(uuid) TO authenticated, service_role;

-- Bucket privado apenas para novos documentos escolares. O bucket "documentos"
-- continua inalterado para preservar fotos, templates e URLs legadas.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documentos-alunos',
  'documentos-alunos',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.pode_acessar_objeto_documento_aluno(p_name text)
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
  RETURN public.pode_acessar_documento_aluno(v_aluno_id);
END;
$$;

REVOKE ALL ON FUNCTION public.pode_acessar_objeto_documento_aluno(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pode_acessar_objeto_documento_aluno(text) TO authenticated, service_role;

DROP POLICY IF EXISTS documentos_aluno_select ON public.documentos_aluno;
DROP POLICY IF EXISTS portal_documentos_aluno_select ON public.documentos_aluno;
DROP POLICY IF EXISTS documentos_aluno_insert ON public.documentos_aluno;
DROP POLICY IF EXISTS documentos_aluno_update ON public.documentos_aluno;
DROP POLICY IF EXISTS documentos_aluno_delete ON public.documentos_aluno;
DROP POLICY IF EXISTS portal_documentos_aluno_write ON public.documentos_aluno;

ALTER TABLE public.documentos_aluno ENABLE ROW LEVEL SECURITY;

CREATE POLICY documentos_aluno_select
ON public.documentos_aluno
FOR SELECT
TO authenticated
USING (public.pode_acessar_documento_aluno(aluno_id));

-- Mutacoes passam somente pelas RPCs abaixo; o aluno nunca define status.
REVOKE INSERT, UPDATE, DELETE ON public.documentos_aluno FROM anon, authenticated;
GRANT SELECT ON public.documentos_aluno TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.registrar_envio_documento_aluno(
  p_documento_id uuid,
  p_bucket text,
  p_path text
)
RETURNS public.documentos_aluno
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_documento public.documentos_aluno;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_documento
  FROM public.documentos_aluno
  WHERE id = p_documento_id
  FOR UPDATE;

  IF v_documento.id IS NULL
    OR NOT public.pode_acessar_documento_aluno(v_documento.aluno_id)
  THEN
    RAISE EXCEPTION 'Documento nao encontrado ou fora do seu escopo.' USING ERRCODE = '42501';
  END IF;

  IF p_bucket <> 'documentos-alunos'
    OR p_path LIKE '%..%'
    OR split_part(p_path, '/', 1) <> v_documento.aluno_id::text
    OR split_part(p_path, '/', 2) <> 'documentos'
  THEN
    RAISE EXCEPTION 'Caminho de documento invalido.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects objeto
    WHERE objeto.bucket_id = p_bucket
      AND objeto.name = p_path
  ) THEN
    RAISE EXCEPTION 'Arquivo nao encontrado no storage.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.documentos_aluno
  SET arquivo_url = NULL,
      arquivo_bucket = p_bucket,
      arquivo_path = p_path,
      status = 'pendente',
      observacao = NULL,
      revisado_em = NULL,
      revisado_por = NULL,
      updated_at = now()
  WHERE id = v_documento.id
  RETURNING * INTO v_documento;

  RETURN v_documento;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_envio_documento_aluno(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_envio_documento_aluno(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revisar_documento_aluno(
  p_documento_id uuid,
  p_status text,
  p_observacao text DEFAULT NULL
)
RETURNS public.documentos_aluno
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_documento public.documentos_aluno;
  v_revisor_id uuid;
  v_status text := lower(trim(coalesce(p_status, '')));
  v_observacao text := nullif(trim(coalesce(p_observacao, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.' USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('aprovado', 'recusado') THEN
    RAISE EXCEPTION 'Status de revisao invalido.' USING ERRCODE = '22023';
  END IF;

  IF v_status = 'recusado' AND v_observacao IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da recusa.' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_documento
  FROM public.documentos_aluno
  WHERE id = p_documento_id
  FOR UPDATE;

  IF v_documento.id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.parceiros aluno
      WHERE aluno.id = v_documento.aluno_id
        AND public.is_partner_in_gestor_scope(aluno.polo_id, aluno.polo_ids)
    )
  THEN
    RAISE EXCEPTION 'Documento nao encontrado ou fora do escopo do gestor.' USING ERRCODE = '42501';
  END IF;

  IF coalesce(v_documento.arquivo_url, '') = ''
    AND (v_documento.arquivo_bucket IS NULL OR v_documento.arquivo_path IS NULL)
  THEN
    RAISE EXCEPTION 'Nao e possivel revisar um documento sem arquivo.' USING ERRCODE = '22023';
  END IF;

  SELECT usuario.id
  INTO v_revisor_id
  FROM public.usuarios_sistema usuario
  WHERE lower(usuario.email) = public.auth_email()
  LIMIT 1;

  UPDATE public.documentos_aluno
  SET status = v_status,
      observacao = CASE WHEN v_status = 'recusado' THEN v_observacao ELSE NULL END,
      revisado_em = now(),
      revisado_por = v_revisor_id,
      updated_at = now()
  WHERE id = v_documento.id
  RETURNING * INTO v_documento;

  RETURN v_documento;
END;
$$;

REVOKE ALL ON FUNCTION public.revisar_documento_aluno(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisar_documento_aluno(uuid, text, text) TO authenticated, service_role;

DROP POLICY IF EXISTS documentos_alunos_private_select ON storage.objects;
DROP POLICY IF EXISTS documentos_alunos_private_insert ON storage.objects;
DROP POLICY IF EXISTS documentos_alunos_private_update ON storage.objects;
DROP POLICY IF EXISTS documentos_alunos_private_delete ON storage.objects;

CREATE POLICY documentos_alunos_private_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documentos-alunos'
  AND public.pode_acessar_objeto_documento_aluno(name)
);

CREATE POLICY documentos_alunos_private_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documentos-alunos'
  AND public.pode_acessar_objeto_documento_aluno(name)
);

CREATE POLICY documentos_alunos_private_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documentos-alunos'
  AND public.pode_acessar_objeto_documento_aluno(name)
)
WITH CHECK (
  bucket_id = 'documentos-alunos'
  AND public.pode_acessar_objeto_documento_aluno(name)
);

CREATE POLICY documentos_alunos_private_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documentos-alunos'
  AND public.pode_acessar_objeto_documento_aluno(name)
);

COMMIT;
