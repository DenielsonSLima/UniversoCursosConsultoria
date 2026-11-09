BEGIN;
SET LOCAL search_path = '';

CREATE OR REPLACE FUNCTION public.normalize_despesa_descricao_uppercase()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.descricao := pg_catalog.upper(pg_catalog.btrim(NEW.descricao));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.normalize_despesa_descricao_uppercase()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER normalize_despesa_descricao_uppercase
BEFORE INSERT OR UPDATE OF descricao ON public.despesas_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.normalize_despesa_descricao_uppercase();

-- Compatibilidade com clientes anteriores: o replay compara a mesma descrição
-- normalizada gravada pelo trigger. Não altera hashes históricos de edição/convênio.
DO $migration$
DECLARE
  routine record;
  definition text;
  changed integer := 0;
BEGIN
  FOR routine IN SELECT p.oid FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::pg_catalog.regnamespace
      AND p.proname IN ('criar_despesa_secure', 'criar_despesa_com_desdobramento_secure',
        'criar_despesa_rateada_matriz_secure', 'criar_despesa_rateada_matriz_secure_raw')
      AND p.proargnames @> ARRAY['p_descricao']::text[]
  LOOP
    definition := pg_catalog.pg_get_functiondef(routine.oid);
    IF definition !~ '\m(btrim|trim)\(p_descricao\)' THEN
      RAISE EXCEPTION 'Contrato de descrição inesperado na rotina %', routine.oid;
    END IF;
    definition := pg_catalog.regexp_replace(definition,
      '\m(btrim|trim)\(p_descricao\)',
      'pg_catalog.upper(pg_catalog.btrim(p_descricao))', 'g');
    definition := pg_catalog.replace(definition,
      'SET search_path TO ''public''', 'SET search_path TO ''''');
    IF pg_catalog.strpos(definition, 'Autenticação obrigatória.') = 0 THEN
      definition := pg_catalog.regexp_replace(definition, E'BEGIN\n',
        E'BEGIN\n  IF auth.uid() IS NULL AND coalesce(auth.role(), '''') <> ''service_role'' THEN\n    RAISE EXCEPTION ''Autenticação obrigatória.'' USING ERRCODE = ''42501'';\n  END IF;\n');
    END IF;
    EXECUTE definition;
    changed := changed + 1;
  END LOOP;
  IF changed <> 7 THEN
    RAISE EXCEPTION 'Esperadas sete assinaturas de criação de despesas; encontradas %.', changed;
  END IF;
END;
$migration$;

-- Apenas texto/atualização de metadados; mantém IDs, valores, parcelas e baixas.
UPDATE public.despesas_lancamentos
SET descricao = pg_catalog.upper(pg_catalog.btrim(descricao)), updated_at = pg_catalog.now()
WHERE descricao IS DISTINCT FROM pg_catalog.upper(pg_catalog.btrim(descricao));

NOTIFY pgrst, 'reload schema';
COMMIT;
