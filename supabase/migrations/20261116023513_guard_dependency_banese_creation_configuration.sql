BEGIN;

-- Apenas novas tentativas e a primeira intenção de POST de dependência.
-- Reuso, consulta GET e persistência de retorno remoto mantêm o ambiente do título.
CREATE OR REPLACE FUNCTION private.guard_dependency_banese_creation_configuration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  starts_creation boolean;
  starts_submission boolean;
  runtime public.payment_gateway_runtime_config%ROWTYPE;
  route public.payment_gateway_routes%ROWTYPE;
  credential public.payment_gateway_credentials%ROWTYPE;
BEGIN
  IF NEW.tipo_lancamento IS DISTINCT FROM 'DEPENDENCIA' THEN
    RETURN NEW;
  END IF;

  starts_creation := NEW.gateway_status = 'CREATING'
    AND NEW.gateway_creation_token IS NOT NULL
    AND NEW.gateway_creation_token IS DISTINCT FROM OLD.gateway_creation_token
    AND OLD.gateway_submission_channel IS NULL
    AND OLD.gateway_submission_status IS NULL
    AND OLD.gateway_payment_id IS NULL
    AND OLD.gateway_payment_link_id IS NULL
    AND OLD.gateway_boleto_nosso_numero IS NULL;
  starts_submission := NEW.gateway_submission_channel = 'API'
    AND NEW.gateway_submission_status = 'API_AMBIGUOUS'
    AND OLD.gateway_submission_channel IS NULL
    AND OLD.gateway_submission_status IS NULL;
  IF NOT (coalesce(starts_creation, false) OR coalesce(starts_submission, false)) THEN
    RETURN NEW;
  END IF;

  IF NEW.gateway_provider IS DISTINCT FROM 'banese_card'
    OR NEW.gateway_payment_method IS DISTINCT FROM 'BOLETO'
    OR NEW.gateway_environment IS NULL
    OR NEW.gateway_environment NOT IN ('sandbox', 'production') THEN
    RAISE EXCEPTION 'DEPENDENCY_BANK_CONFIGURATION_INVALID' USING ERRCODE = '55000';
  END IF;

  -- A configuração não pode mudar durante a transação que confirma a intenção.
  SELECT * INTO runtime FROM public.payment_gateway_runtime_config WHERE id FOR SHARE;
  IF NOT FOUND OR runtime.enabled IS NOT TRUE
    OR runtime.active_environment IS DISTINCT FROM NEW.gateway_environment THEN
    RAISE EXCEPTION 'DEPENDENCY_BANK_RUNTIME_UNAVAILABLE' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO route FROM public.payment_gateway_routes
    WHERE modalidade = 'TECNICO' AND payment_method = 'BOLETO'
      AND environment = NEW.gateway_environment FOR SHARE;
  IF NOT FOUND OR route.enabled IS NOT TRUE
    OR route.provider_code IS DISTINCT FROM 'banese_card'
    OR route.credential_id IS NULL THEN
    RAISE EXCEPTION 'DEPENDENCY_BANK_ROUTE_UNAVAILABLE' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO credential FROM public.payment_gateway_credentials
    WHERE id = route.credential_id FOR SHARE;
  IF NOT FOUND OR credential.provider_code IS DISTINCT FROM route.provider_code
    OR credential.environment IS DISTINCT FROM NEW.gateway_environment
    OR credential.client_id_configured IS NOT TRUE
    OR credential.client_secret_configured IS NOT TRUE THEN
    RAISE EXCEPTION 'DEPENDENCY_BANK_CREDENTIAL_UNAVAILABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.guard_dependency_banese_creation_configuration()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_dependency_banese_creation_configuration ON public.contas_receber;
CREATE TRIGGER guard_dependency_banese_creation_configuration
BEFORE UPDATE OF gateway_creation_token, gateway_submission_channel, gateway_submission_status
ON public.contas_receber FOR EACH ROW
EXECUTE FUNCTION private.guard_dependency_banese_creation_configuration();

COMMIT;
