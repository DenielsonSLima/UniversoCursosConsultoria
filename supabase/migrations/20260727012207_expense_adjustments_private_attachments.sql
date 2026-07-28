ALTER TABLE public.despesas_lancamentos
  ADD COLUMN IF NOT EXISTS valor_base numeric(15, 2),
  ADD COLUMN IF NOT EXISTS juros_valor numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS multa_valor numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desconto_valor numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS anexo_bucket text,
  ADD COLUMN IF NOT EXISTS anexo_path text,
  ADD COLUMN IF NOT EXISTS anexo_nome text,
  ADD COLUMN IF NOT EXISTS anexo_mime text,
  ADD COLUMN IF NOT EXISTS anexo_tamanho bigint;

UPDATE public.despesas_lancamentos
SET valor_base = valor
WHERE valor_base IS NULL;

ALTER TABLE public.despesas_lancamentos
  ALTER COLUMN valor_base SET NOT NULL;

CREATE OR REPLACE FUNCTION public.calcular_ajustes_despesa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.valor_base := round(coalesce(NEW.valor_base, NEW.valor, 0)::numeric, 2);
  NEW.juros_valor := round(coalesce(NEW.juros_valor, 0)::numeric, 2);
  NEW.multa_valor := round(coalesce(NEW.multa_valor, 0)::numeric, 2);
  NEW.desconto_valor := round(coalesce(NEW.desconto_valor, 0)::numeric, 2);

  IF NEW.valor_base <= 0 THEN
    RAISE EXCEPTION 'O valor-base da despesa deve ser maior que zero.';
  END IF;

  IF NEW.juros_valor < 0 OR NEW.multa_valor < 0 OR NEW.desconto_valor < 0 THEN
    RAISE EXCEPTION 'Juros, multa e desconto não podem ser negativos.';
  END IF;

  IF NEW.desconto_valor > NEW.valor_base + NEW.juros_valor + NEW.multa_valor THEN
    RAISE EXCEPTION 'O desconto não pode superar o valor-base acrescido de juros e multa.';
  END IF;

  NEW.valor := round(
    NEW.valor_base + NEW.juros_valor + NEW.multa_valor - NEW.desconto_valor,
    2
  );

  IF NEW.status = 'PAGO'
    AND (
      TG_OP = 'INSERT'
      OR OLD.status IS DISTINCT FROM NEW.status
      OR OLD.valor_base IS DISTINCT FROM NEW.valor_base
      OR OLD.juros_valor IS DISTINCT FROM NEW.juros_valor
      OR OLD.multa_valor IS DISTINCT FROM NEW.multa_valor
      OR OLD.desconto_valor IS DISTINCT FROM NEW.desconto_valor
    )
  THEN
    NEW.valor_pago := NEW.valor;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS despesas_calcular_ajustes_trigger
  ON public.despesas_lancamentos;

CREATE TRIGGER despesas_calcular_ajustes_trigger
BEFORE INSERT OR UPDATE OF
  valor_base,
  juros_valor,
  multa_valor,
  desconto_valor,
  status
ON public.despesas_lancamentos
FOR EACH ROW
EXECUTE FUNCTION public.calcular_ajustes_despesa();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'despesas_valor_base_positivo'
      AND conrelid = 'public.despesas_lancamentos'::regclass
  ) THEN
    ALTER TABLE public.despesas_lancamentos
      ADD CONSTRAINT despesas_valor_base_positivo CHECK (valor_base > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'despesas_ajustes_nao_negativos'
      AND conrelid = 'public.despesas_lancamentos'::regclass
  ) THEN
    ALTER TABLE public.despesas_lancamentos
      ADD CONSTRAINT despesas_ajustes_nao_negativos CHECK (
        juros_valor >= 0
        AND multa_valor >= 0
        AND desconto_valor >= 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'despesas_desconto_valido'
      AND conrelid = 'public.despesas_lancamentos'::regclass
  ) THEN
    ALTER TABLE public.despesas_lancamentos
      ADD CONSTRAINT despesas_desconto_valido CHECK (
        desconto_valor <= valor_base + juros_valor + multa_valor
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'despesas_anexo_metadados_validos'
      AND conrelid = 'public.despesas_lancamentos'::regclass
  ) THEN
    ALTER TABLE public.despesas_lancamentos
      ADD CONSTRAINT despesas_anexo_metadados_validos CHECK (
        (
          anexo_path IS NULL
          AND anexo_bucket IS NULL
          AND anexo_nome IS NULL
          AND anexo_mime IS NULL
          AND anexo_tamanho IS NULL
        )
        OR (
          anexo_path IS NOT NULL
          AND anexo_bucket = 'despesas-anexos'
          AND anexo_nome IS NOT NULL
          AND anexo_mime IN (
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/webp'
          )
          AND anexo_tamanho > 0
          AND anexo_tamanho <= 10485760
          AND polo_id IS NOT NULL
          AND anexo_path LIKE polo_id::text || '/%'
        )
      );
  END IF;
END
$$;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'despesas-anexos',
  'despesas-anexos',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.can_access_despesa_anexo(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_parts text[];
  v_polo_id uuid;
BEGIN
  v_parts := storage.foldername(p_name);

  IF coalesce(array_length(v_parts, 1), 0) < 1 THEN
    RETURN false;
  END IF;

  BEGIN
    v_polo_id := v_parts[1]::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN false;
  END;

  RETURN public.is_financeiro_for_polo(v_polo_id);
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_despesa_anexo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_despesa_anexo(text) TO authenticated;

DROP POLICY IF EXISTS "portal_despesas_anexos_select" ON storage.objects;
CREATE POLICY "portal_despesas_anexos_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'despesas-anexos'
  AND public.can_access_despesa_anexo(name)
);

DROP POLICY IF EXISTS "portal_despesas_anexos_insert" ON storage.objects;
CREATE POLICY "portal_despesas_anexos_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'despesas-anexos'
  AND public.can_access_despesa_anexo(name)
);

DROP POLICY IF EXISTS "portal_despesas_anexos_update" ON storage.objects;
CREATE POLICY "portal_despesas_anexos_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'despesas-anexos'
  AND owner = auth.uid()
  AND public.can_access_despesa_anexo(name)
)
WITH CHECK (
  bucket_id = 'despesas-anexos'
  AND owner = auth.uid()
  AND public.can_access_despesa_anexo(name)
);

DROP POLICY IF EXISTS "portal_despesas_anexos_delete" ON storage.objects;
CREATE POLICY "portal_despesas_anexos_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'despesas-anexos'
  AND public.can_access_despesa_anexo(name)
);

COMMENT ON COLUMN public.despesas_lancamentos.valor_base IS
  'Valor informado antes de juros, multa e desconto.';

COMMENT ON COLUMN public.despesas_lancamentos.valor IS
  'Valor final canônico calculado no banco: valor_base + juros + multa - desconto.';

COMMENT ON COLUMN public.despesas_lancamentos.anexo_path IS
  'Caminho privado do comprovante no bucket despesas-anexos.';
