BEGIN;

-- Dossiê administrativo, sem checklist legal presumido ou efeito acadêmico.
CREATE TABLE public.professor_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL REFERENCES public.parceiros(id),
  nome text NOT NULL CHECK (length(btrim(nome)) BETWEEN 2 AND 160),
  categoria text NOT NULL CHECK (categoria IN ('identificacao','formacao','contrato','outro')),
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','em_analise','aprovado','recusado')),
  instrucao text CHECK (length(instrucao) <= 1000),
  observacao_revisao text CHECK (length(observacao_revisao) <= 1000),
  arquivo_atual_id uuid,
  criado_por uuid NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  atualizado_em timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX professor_documentos_professor_idx
  ON public.professor_documentos(professor_id, criado_em DESC, id);

CREATE TABLE public.professor_documentos_arquivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.professor_documentos(id),
  bucket text NOT NULL DEFAULT 'documentos-professores'
    CHECK (bucket = 'documentos-professores'),
  path text NOT NULL UNIQUE,
  nome_original text NOT NULL CHECK (length(nome_original) BETWEEN 1 AND 240),
  mime_type text NOT NULL CHECK (mime_type IN (
    'application/pdf','image/jpeg','image/png','image/webp')),
  tamanho bigint NOT NULL CHECK (tamanho > 0 AND tamanho <= 10485760),
  criado_por uuid NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  confirmado_em timestamptz,
  UNIQUE(documento_id, id)
);
CREATE INDEX professor_documentos_arquivos_documento_idx
  ON public.professor_documentos_arquivos(documento_id, confirmado_em DESC);
ALTER TABLE public.professor_documentos ADD CONSTRAINT professor_documento_arquivo_atual_fk
  FOREIGN KEY (id, arquivo_atual_id)
  REFERENCES public.professor_documentos_arquivos(documento_id, id);

CREATE TABLE public.professor_documentos_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.professor_documentos(id),
  arquivo_id uuid REFERENCES public.professor_documentos_arquivos(id),
  acao text NOT NULL CHECK (acao IN ('solicitado','enviado','aprovado','recusado')),
  observacao text,
  ator_id uuid NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX professor_documentos_eventos_documento_idx
  ON public.professor_documentos_eventos(documento_id, criado_em DESC);

CREATE TABLE public.professor_documentos_operacoes (
  request_id uuid PRIMARY KEY,
  professor_id uuid NOT NULL REFERENCES public.parceiros(id),
  ator_id uuid NOT NULL,
  acao text NOT NULL,
  payload jsonb NOT NULL,
  resultado jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.professor_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professor_documentos_arquivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professor_documentos_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professor_documentos_operacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.professor_documentos, public.professor_documentos_arquivos,
  public.professor_documentos_eventos, public.professor_documentos_operacoes
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.gestor_pode_gerir_dossie_professor(p_professor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.parceiros p WHERE p.id = p_professor_id AND p.tipo = 'Professor'
      AND public.is_partner_in_gestor_scope(p.polo_id, p.polo_ids)
  );
$$;
REVOKE ALL ON FUNCTION public.gestor_pode_gerir_dossie_professor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestor_pode_gerir_dossie_professor(uuid)
  TO authenticated, service_role;
GRANT SELECT ON public.professor_documentos TO authenticated;
CREATE POLICY professor_documentos_leitura_gestor ON public.professor_documentos
  FOR SELECT TO authenticated USING (public.gestor_pode_gerir_dossie_professor(professor_id));

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('documentos-professores','documentos-professores',false,10485760,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

CREATE FUNCTION public.gestor_pode_acessar_arquivo_professor(p_path text, p_escrita boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.professor_documentos_arquivos a
    JOIN public.professor_documentos d ON d.id = a.documento_id
    WHERE a.path = p_path AND public.gestor_pode_gerir_dossie_professor(d.professor_id)
      AND CASE WHEN p_escrita THEN
        a.confirmado_em IS NULL AND a.criado_por = (SELECT auth.uid())
          AND a.criado_em > clock_timestamp() - interval '24 hours'
        ELSE a.confirmado_em IS NOT NULL OR a.criado_por = (SELECT auth.uid()) END
  );
$$;
REVOKE ALL ON FUNCTION public.gestor_pode_acessar_arquivo_professor(text,boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestor_pode_acessar_arquivo_professor(text,boolean)
  TO anon, authenticated, service_role;
CREATE POLICY professor_documentos_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documentos-professores'
    AND public.gestor_pode_acessar_arquivo_professor(name,false));
CREATE POLICY professor_documentos_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documentos-professores'
    AND public.gestor_pode_acessar_arquivo_professor(name,true));
-- Sem UPDATE/DELETE: envio cria uma nova versão e preserva o histórico.
-- As barreiras restritivas também prevalecem sobre políticas legadas permissivas.
CREATE POLICY professor_documentos_storage_read_boundary ON storage.objects
  AS RESTRICTIVE FOR SELECT TO PUBLIC
  USING (bucket_id <> 'documentos-professores'
    OR public.gestor_pode_acessar_arquivo_professor(name,false));
CREATE POLICY professor_documentos_storage_insert_boundary ON storage.objects
  AS RESTRICTIVE FOR INSERT TO PUBLIC
  WITH CHECK (bucket_id <> 'documentos-professores'
    OR public.gestor_pode_acessar_arquivo_professor(name,true));
CREATE POLICY professor_documentos_storage_update_boundary ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (bucket_id <> 'documentos-professores')
  WITH CHECK (bucket_id <> 'documentos-professores');
CREATE POLICY professor_documentos_storage_delete_boundary ON storage.objects
  AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (bucket_id <> 'documentos-professores');

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
        AND tablename = 'professor_documentos') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.professor_documentos;
  END IF;
END $$;

COMMIT;
