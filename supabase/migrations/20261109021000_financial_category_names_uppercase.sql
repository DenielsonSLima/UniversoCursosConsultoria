BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_categoria_financeira_nome_uppercase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.nome := pg_catalog.upper(pg_catalog.btrim(NEW.nome));
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_categoria_financeira_nome_uppercase() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER normalize_categoria_financeira_nome_uppercase
BEFORE INSERT OR UPDATE OF nome ON public.categorias_financeiras
FOR EACH ROW EXECUTE FUNCTION public.normalize_categoria_financeira_nome_uppercase();

-- Preserva IDs, tipos, vínculos e a auditoria existente da tabela.
UPDATE public.categorias_financeiras
SET nome = pg_catalog.upper(pg_catalog.btrim(nome)), updated_at = pg_catalog.now()
WHERE nome IS DISTINCT FROM pg_catalog.upper(pg_catalog.btrim(nome));

COMMIT;
