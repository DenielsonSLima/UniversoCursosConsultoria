-- Migration: 20260627180000_add_library_teacher_storage_quota.sql
-- Description: Add per-teacher storage quotas for biblioteca and track document size in bytes.

CREATE TABLE IF NOT EXISTS public.biblioteca_professor_quotas (
  teacher_id UUID PRIMARY KEY REFERENCES public.parceiros(id) ON DELETE CASCADE,
  max_storage_gb NUMERIC(10,3) NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.biblioteca_professor_quotas
  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'biblioteca_professor_quotas'
      AND policyname = 'Acesso total local biblioteca_professor_quotas'
  ) THEN
    CREATE POLICY "Acesso total local biblioteca_professor_quotas"
    ON public.biblioteca_professor_quotas
    FOR ALL
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE public.biblioteca_documentos
ADD COLUMN IF NOT EXISTS tamanho_bytes BIGINT;

WITH parsed AS (
  SELECT
    id,
    lower(trim(COALESCE(tamanho, ''))) AS tamanho_texto,
    NULLIF(regexp_replace(COALESCE(tamanho, ''), '[^0-9,.]', '', 'g'), '') AS valor_texto
  FROM public.biblioteca_documentos
), parsed_with_unit AS (
  SELECT
    id,
    tamanho_texto,
    CASE
      WHEN valor_texto IS NULL THEN NULL
      ELSE NULLIF(REPLACE(valor_texto, ',', '.'), '')::numeric
    END AS tamanho_numero
  FROM parsed
)
UPDATE public.biblioteca_documentos d
SET tamanho_bytes =
  CASE
    WHEN p.tamanho_numero IS NULL THEN 0
    WHEN p.tamanho_texto ~ 'kb\b$' THEN ROUND(p.tamanho_numero * 1024)
    WHEN p.tamanho_texto ~ 'mb\b$' THEN ROUND(p.tamanho_numero * 1024 * 1024)
    WHEN p.tamanho_texto ~ 'gb\b$' THEN ROUND(p.tamanho_numero * 1024 * 1024 * 1024)
    WHEN p.tamanho_texto ~ 'bytes?\b$' THEN ROUND(p.tamanho_numero)
    ELSE ROUND(p.tamanho_numero)
  END
FROM parsed_with_unit p
WHERE p.id = d.id;

ALTER TABLE public.biblioteca_documentos
ALTER COLUMN tamanho_bytes SET NOT NULL,
ALTER COLUMN tamanho_bytes SET DEFAULT 0;
