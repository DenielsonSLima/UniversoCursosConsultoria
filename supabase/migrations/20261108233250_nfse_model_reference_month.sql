BEGIN;

-- Template expansion is deliberately literal: no expressions, SQL or interpolation
-- of student data. The reference is the selected RECEIPT month, not dCompet.
CREATE FUNCTION private.nfse_reference_month_label(p_month text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $function$
BEGIN
  IF p_month IS NULL OR p_month !~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Mês dos recebimentos inválido.' USING ERRCODE = '22023';
  END IF;
  RETURN (ARRAY['janeiro','fevereiro','março','abril','maio','junho',
    'julho','agosto','setembro','outubro','novembro','dezembro'])
    [substring(p_month FROM 6 FOR 2)::integer] || ' de ' || substring(p_month FROM 1 FOR 4);
END;
$function$;
REVOKE ALL ON FUNCTION private.nfse_reference_month_label(text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.render_nfse_model_description(p_description text, p_month text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $function$
DECLARE
  v_month_label text := private.nfse_reference_month_label(p_month);
  v_remaining text;
  v_rendered text;
BEGIN
  IF p_description IS NULL OR btrim(p_description) = '' OR length(p_description) > 1000 THEN
    RAISE EXCEPTION 'Descrição do serviço inválida.' USING ERRCODE = '22023';
  END IF;
  v_remaining := replace(p_description, '{{mes_referencia}}', '');
  IF position('{{' IN v_remaining) > 0 OR position('}}' IN v_remaining) > 0 THEN
    RAISE EXCEPTION 'Variável de descrição inválida. Use {{mes_referencia}}.' USING ERRCODE = '22023';
  END IF;
  v_rendered := replace(btrim(p_description), '{{mes_referencia}}', v_month_label);
  IF length(v_rendered) > 1000 THEN
    RAISE EXCEPTION 'Descrição preenchida excede 1.000 caracteres.' USING ERRCODE = '22023';
  END IF;
  RETURN v_rendered;
END;
$function$;
REVOKE ALL ON FUNCTION private.render_nfse_model_description(text,text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Preserve the already-applied save RPC and its authorization/idempotency contract.
-- Every inserted/updated definition is checked, including direct administrative writes.
CREATE FUNCTION private.validate_nfse_model_description()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  PERFORM private.render_nfse_model_description(NEW.definition->>'serviceDescription', '2000-02');
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.validate_nfse_model_description()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER nfse_models_description_template_check
  BEFORE INSERT OR UPDATE OF definition ON private.nfse_models
  FOR EACH ROW EXECUTE FUNCTION private.validate_nfse_model_description();

CREATE FUNCTION public.preview_nfse_model_description_secure(
  p_context_key uuid, p_polo_id uuid, p_environment text, p_month text, p_description text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
SET statement_timeout = '8s' AS $function$
DECLARE v_description text;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  v_description := private.render_nfse_model_description(p_description,p_month);
  RETURN jsonb_build_object('version',1,
    'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
      'environment',p_environment,'month',p_month),
    'data',jsonb_build_object('description',v_description,
      'monthLabel',private.nfse_reference_month_label(p_month),
      'usesReferenceMonth',position('{{mes_referencia}}' IN p_description) > 0));
END;
$function$;
REVOKE ALL ON FUNCTION public.preview_nfse_model_description_secure(uuid,uuid,text,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_nfse_model_description_secure(uuid,uuid,text,text,text) TO authenticated;
COMMENT ON FUNCTION public.preview_nfse_model_description_secure(uuid,uuid,text,text,text) IS
  'Pilot-scoped literal template preview using receipt reference month in pt-BR. Never changes dCompet, payments or fiscal documents.';

NOTIFY pgrst, 'reload schema';
COMMIT;
