BEGIN;

UPDATE public.categorias
SET nome = upper(btrim(nome))
WHERE nome IS DISTINCT FROM upper(btrim(nome));

CREATE OR REPLACE FUNCTION public.normalize_categoria_nome_uppercase()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.nome := upper(btrim(NEW.nome));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_categoria_nome_uppercase
ON public.categorias;

CREATE TRIGGER normalize_categoria_nome_uppercase
BEFORE INSERT OR UPDATE OF nome
ON public.categorias
FOR EACH ROW
EXECUTE FUNCTION public.normalize_categoria_nome_uppercase();

COMMIT;
