-- Versão registrada pelo Supabase MCP: 20260728053324.
BEGIN;

CREATE OR REPLACE FUNCTION public.sync_partner_classification_compatibility()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_categoria_nome text;
  v_tipo_parceria_nome text;
BEGIN
  IF lower(NEW.tipo) <> 'pj' THEN
    RETURN NEW;
  END IF;

  IF NEW.categoria_id IS NOT NULL THEN
    SELECT categoria.nome
    INTO v_categoria_nome
    FROM public.categorias categoria
    WHERE categoria.id = NEW.categoria_id;

    IF v_categoria_nome IS NOT NULL THEN
      NEW.tipo_pj := v_categoria_nome;
    END IF;
  END IF;

  IF NEW.tipo_parceria_id IS NOT NULL THEN
    SELECT tipo.nome
    INTO v_tipo_parceria_nome
    FROM public.tipos_parceria tipo
    WHERE tipo.id = NEW.tipo_parceria_id;

    IF v_tipo_parceria_nome IS NOT NULL THEN
      NEW.tipo_convenio := v_tipo_parceria_nome;
    END IF;
  ELSIF nullif(btrim(NEW.tipo_convenio), '') IS NOT NULL THEN
    SELECT tipo.id
    INTO NEW.tipo_parceria_id
    FROM public.tipos_parceria tipo
    WHERE lower(btrim(tipo.nome)) = lower(btrim(NEW.tipo_convenio))
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_partner_classification_compatibility ON public.parceiros;
CREATE TRIGGER trg_sync_partner_classification_compatibility
  BEFORE INSERT OR UPDATE OF tipo, categoria_id, tipo_parceria_id, tipo_pj, tipo_convenio
  ON public.parceiros
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_partner_classification_compatibility();

COMMENT ON FUNCTION public.sync_partner_classification_compatibility() IS
  'Mantém os novos vínculos de categoria/tipo de parceria e os textos legados sincronizados sem apagar classificações históricas.';

COMMIT;
