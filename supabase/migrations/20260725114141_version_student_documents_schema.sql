BEGIN;
-- Versao registrada pelo MCP Supabase: 20260725114141.

-- Modelo imutavel de documentos escolares. A tabela documentos_aluno continua
-- sendo o checklist/projecao compativel com as telas antigas.
CREATE TABLE IF NOT EXISTS public.documentos_aluno_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id uuid NOT NULL REFERENCES public.parceiros(id) ON DELETE RESTRICT,
  modo text NOT NULL CHECK (modo IN ('separado', 'pdf_unico')),
  status text NOT NULL DEFAULT 'preparando'
    CHECK (status IN (
      'preparando',
      'aguardando_mapeamento',
      'finalizado',
      'cancelado',
      'arquivado'
    )),
  documento_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  criado_por_auth_uid uuid NOT NULL DEFAULT auth.uid(),
  criado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz,
  CONSTRAINT documentos_aluno_lotes_documentos_not_empty
    CHECK (cardinality(documento_ids) > 0)
);

CREATE TABLE IF NOT EXISTS public.documentos_aluno_arquivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id uuid NOT NULL REFERENCES public.documentos_aluno_lotes(id) ON DELETE RESTRICT,
  aluno_id uuid NOT NULL REFERENCES public.parceiros(id) ON DELETE RESTRICT,
  bucket text NOT NULL DEFAULT 'documentos-alunos',
  path text NOT NULL,
  nome_original text NOT NULL,
  mime_type text NOT NULL CHECK (
    mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
  ),
  tamanho_declarado bigint NOT NULL CHECK (tamanho_declarado > 0),
  tamanho_confirmado bigint,
  total_paginas integer CHECK (total_paginas IS NULL OR total_paginas > 0),
  status text NOT NULL DEFAULT 'reservado'
    CHECK (status IN ('reservado', 'enviado', 'exclusao_pendente', 'excluido')),
  enviado_em timestamptz,
  excluido_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket, path)
);

CREATE TABLE IF NOT EXISTS public.documentos_aluno_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.documentos_aluno(id) ON DELETE RESTRICT,
  lote_id uuid NOT NULL REFERENCES public.documentos_aluno_lotes(id) ON DELETE RESTRICT,
  numero integer NOT NULL CHECK (numero > 0),
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aprovado', 'recusado', 'arquivado')),
  atual boolean NOT NULL DEFAULT true,
  enviado_por_auth_uid uuid NOT NULL DEFAULT auth.uid(),
  enviado_em timestamptz NOT NULL DEFAULT now(),
  revisado_por uuid REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL,
  revisado_em timestamptz,
  motivo_recusa text,
  motivo_arquivamento text,
  arquivado_por uuid REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL,
  arquivado_em timestamptz,
  UNIQUE (documento_id, numero),
  CONSTRAINT documentos_aluno_versoes_recusa_motivo
    CHECK (status <> 'recusado' OR nullif(btrim(motivo_recusa), '') IS NOT NULL),
  CONSTRAINT documentos_aluno_versoes_arquivo_motivo
    CHECK (status <> 'arquivado' OR nullif(btrim(motivo_arquivamento), '') IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_documentos_aluno_versao_atual
  ON public.documentos_aluno_versoes (documento_id)
  WHERE atual;

CREATE TABLE IF NOT EXISTS public.documentos_aluno_versao_fontes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  versao_id uuid NOT NULL REFERENCES public.documentos_aluno_versoes(id) ON DELETE RESTRICT,
  arquivo_id uuid NOT NULL REFERENCES public.documentos_aluno_arquivos(id) ON DELETE RESTRICT,
  pagina_inicio integer,
  pagina_fim integer,
  ordem smallint NOT NULL DEFAULT 1 CHECK (ordem > 0),
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (versao_id, arquivo_id, ordem),
  CONSTRAINT documentos_aluno_fontes_paginas_validas CHECK (
    (pagina_inicio IS NULL AND pagina_fim IS NULL)
    OR (
      pagina_inicio IS NOT NULL
      AND pagina_fim IS NOT NULL
      AND pagina_inicio > 0
      AND pagina_fim >= pagina_inicio
    )
  )
);

CREATE TABLE IF NOT EXISTS public.documentos_aluno_eventos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aluno_id uuid NOT NULL REFERENCES public.parceiros(id) ON DELETE RESTRICT,
  documento_id uuid REFERENCES public.documentos_aluno(id) ON DELETE SET NULL,
  versao_id uuid REFERENCES public.documentos_aluno_versoes(id) ON DELETE SET NULL,
  arquivo_id uuid REFERENCES public.documentos_aluno_arquivos(id) ON DELETE SET NULL,
  lote_id uuid REFERENCES public.documentos_aluno_lotes(id) ON DELETE SET NULL,
  evento text NOT NULL,
  ator_auth_uid uuid DEFAULT auth.uid(),
  ator_usuario_id uuid REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.documentos_aluno_exclusoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arquivo_id uuid NOT NULL REFERENCES public.documentos_aluno_arquivos(id) ON DELETE RESTRICT,
  aluno_id uuid NOT NULL REFERENCES public.parceiros(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'processando', 'concluida', 'falhou', 'cancelada')),
  motivo text NOT NULL CHECK (nullif(btrim(motivo), '') IS NOT NULL),
  solicitado_por uuid REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL,
  solicitado_por_auth_uid uuid NOT NULL DEFAULT auth.uid(),
  solicitado_em timestamptz NOT NULL DEFAULT now(),
  processamento_iniciado_em timestamptz,
  processado_em timestamptz,
  erro text,
  UNIQUE (arquivo_id, status)
);

ALTER TABLE public.documentos_aluno
  ADD COLUMN IF NOT EXISTS versao_atual_id uuid
    REFERENCES public.documentos_aluno_versoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_aluno_lotes_aluno_criado
  ON public.documentos_aluno_lotes (aluno_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_documentos_aluno_arquivos_lote
  ON public.documentos_aluno_arquivos (lote_id, status);
CREATE INDEX IF NOT EXISTS idx_documentos_aluno_arquivos_aluno
  ON public.documentos_aluno_arquivos (aluno_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_documentos_aluno_versoes_documento
  ON public.documentos_aluno_versoes (documento_id, numero DESC);
CREATE INDEX IF NOT EXISTS idx_documentos_aluno_versoes_lote
  ON public.documentos_aluno_versoes (lote_id);
CREATE INDEX IF NOT EXISTS idx_documentos_aluno_fontes_arquivo
  ON public.documentos_aluno_versao_fontes (arquivo_id);
CREATE INDEX IF NOT EXISTS idx_documentos_aluno_versao_atual
  ON public.documentos_aluno (versao_atual_id)
  WHERE versao_atual_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documentos_aluno_eventos_aluno
  ON public.documentos_aluno_eventos (aluno_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_documentos_aluno_eventos_documento
  ON public.documentos_aluno_eventos (documento_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_documentos_aluno_eventos_versao
  ON public.documentos_aluno_eventos (versao_id)
  WHERE versao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documentos_aluno_eventos_arquivo
  ON public.documentos_aluno_eventos (arquivo_id)
  WHERE arquivo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documentos_aluno_eventos_lote
  ON public.documentos_aluno_eventos (lote_id)
  WHERE lote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documentos_aluno_exclusoes_fila
  ON public.documentos_aluno_exclusoes (
    status,
    processamento_iniciado_em,
    solicitado_em
  )
  WHERE status IN ('pendente', 'processando', 'falhou');

ALTER TABLE public.documentos_aluno_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_aluno_arquivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_aluno_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_aluno_versao_fontes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_aluno_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_aluno_exclusoes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON
  public.documentos_aluno_lotes,
  public.documentos_aluno_arquivos,
  public.documentos_aluno_versoes,
  public.documentos_aluno_versao_fontes,
  public.documentos_aluno_eventos,
  public.documentos_aluno_exclusoes
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON
  public.documentos_aluno_lotes,
  public.documentos_aluno_arquivos,
  public.documentos_aluno_versoes,
  public.documentos_aluno_versao_fontes
TO authenticated, service_role;

GRANT SELECT ON
  public.documentos_aluno_eventos,
  public.documentos_aluno_exclusoes
TO service_role;

DROP POLICY IF EXISTS documentos_aluno_lotes_select ON public.documentos_aluno_lotes;
CREATE POLICY documentos_aluno_lotes_select
ON public.documentos_aluno_lotes FOR SELECT TO authenticated
USING (public.pode_acessar_documento_aluno(aluno_id));

DROP POLICY IF EXISTS documentos_aluno_arquivos_select ON public.documentos_aluno_arquivos;
CREATE POLICY documentos_aluno_arquivos_select
ON public.documentos_aluno_arquivos FOR SELECT TO authenticated
USING (public.pode_acessar_documento_aluno(aluno_id));

DROP POLICY IF EXISTS documentos_aluno_versoes_select ON public.documentos_aluno_versoes;
CREATE POLICY documentos_aluno_versoes_select
ON public.documentos_aluno_versoes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.documentos_aluno documento
    WHERE documento.id = documento_id
      AND public.pode_acessar_documento_aluno(documento.aluno_id)
  )
);

DROP POLICY IF EXISTS documentos_aluno_fontes_select ON public.documentos_aluno_versao_fontes;
CREATE POLICY documentos_aluno_fontes_select
ON public.documentos_aluno_versao_fontes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.documentos_aluno_versoes versao
    JOIN public.documentos_aluno documento ON documento.id = versao.documento_id
    WHERE versao.id = versao_id
      AND public.pode_acessar_documento_aluno(documento.aluno_id)
  )
);

-- Eventos e fila sao lidos somente pelo backend; gestores recebem o historico
-- necessario pelo RPC de painel, sem acesso indiscriminado a metadados.

CREATE OR REPLACE FUNCTION public.gestor_pode_gerenciar_documento_aluno(p_aluno_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.parceiros aluno
    WHERE aluno.id = p_aluno_id
      AND public.is_partner_in_gestor_scope(aluno.polo_id, aluno.polo_ids)
      AND public.current_aluno_id() IS DISTINCT FROM aluno.id
  );
$$;

REVOKE ALL ON FUNCTION public.gestor_pode_gerenciar_documento_aluno(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestor_pode_gerenciar_documento_aluno(uuid)
  TO authenticated, service_role;

-- O INSERT no Storage exige reserva previa. A excecao "legado" existe apenas
-- para permitir uma publicacao sem downtime da tela antiga.
CREATE OR REPLACE FUNCTION public.pode_inserir_objeto_documento_aluno(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_aluno_id uuid;
  v_documento_id uuid;
  v_nome text;
BEGIN
  IF auth.uid() IS NULL
    OR p_name IS NULL
    OR p_name LIKE '%..%'
    OR split_part(p_name, '/', 2) <> 'documentos'
    OR split_part(p_name, '/', 1) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RETURN false;
  END IF;

  v_aluno_id := split_part(p_name, '/', 1)::uuid;
  IF NOT public.pode_acessar_documento_aluno(v_aluno_id) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.documentos_aluno_arquivos arquivo
    JOIN public.documentos_aluno_lotes lote ON lote.id = arquivo.lote_id
    WHERE arquivo.aluno_id = v_aluno_id
      AND arquivo.bucket = 'documentos-alunos'
      AND arquivo.path = p_name
      AND arquivo.status = 'reservado'
      AND lote.status = 'preparando'
      AND (
        lote.criado_por_auth_uid = auth.uid()
        OR public.gestor_pode_gerenciar_documento_aluno(v_aluno_id)
      )
  ) THEN
    RETURN true;
  END IF;

  -- Compatibilidade temporaria: aluno/documentos/<documento_id>_<timestamp>.ext
  v_nome := split_part(p_name, '/', 3);
  IF v_nome !~* '^[0-9a-f-]{36}_[0-9]{10,}\\.[a-z0-9]+$' THEN
    RETURN false;
  END IF;

  BEGIN
    v_documento_id := split_part(v_nome, '_', 1)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  RETURN EXISTS (
    SELECT 1
    FROM public.documentos_aluno documento
    LEFT JOIN public.documentos_aluno_versoes atual
      ON atual.id = documento.versao_atual_id
    WHERE documento.id = v_documento_id
      AND documento.aluno_id = v_aluno_id
      AND (
        atual.id IS NULL
        OR atual.status IN ('recusado', 'arquivado')
      )
      AND (
        public.current_aluno_id() = v_aluno_id
        OR public.gestor_pode_gerenciar_documento_aluno(v_aluno_id)
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pode_inserir_objeto_documento_aluno(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_inserir_objeto_documento_aluno(text)
  TO authenticated, service_role;

UPDATE storage.buckets
SET public = false,
    file_size_limit = 31457280,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]
WHERE id = 'documentos-alunos';

DROP POLICY IF EXISTS documentos_alunos_private_insert ON storage.objects;
CREATE POLICY documentos_alunos_private_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documentos-alunos'
  AND public.pode_inserir_objeto_documento_aluno(name)
);

-- Nenhum cliente autenticado apaga objetos diretamente. A Edge Function
-- autenticada executa a fila com service_role.
DROP POLICY IF EXISTS documentos_alunos_private_update ON storage.objects;
DROP POLICY IF EXISTS documentos_alunos_private_delete ON storage.objects;

COMMIT;
