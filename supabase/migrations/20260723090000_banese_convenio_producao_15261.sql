BEGIN;

-- Ajuste cirúrgico: manter convênio homologação de testes e ativar o convenio de produção
-- informado pela equipe operacional (15261), além de alinhar as rotas de cobrança.

CREATE OR REPLACE FUNCTION public.enforce_universo_banese_fixed_banking_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
as $$
DECLARE
  v_convenio TEXT := CASE
    WHEN new.environment = 'production' THEN '15261'
    ELSE '15528'
  END;
begin
  if new.provider_code = 'banese_card'
     and new.environment in ('sandbox', 'production') then
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'baneseBeneficiarioNome', 'UNIVERSO CURSOS E CONSULTORIA LTDA',
      'baneseBeneficiarioInscricao', '13.278.137/0001-54',
      'baneseAgencia', '033',
      'baneseConta', '03/100649-0',
      'baneseContaDisplay', '03/100649-0',
      'baneseCodigoBeneficiario', '03/100649-0',
      'baneseConvenio', v_convenio,
      'baneseBoletoConvenio', v_convenio,
      'banesePixConvenio', v_convenio
    );
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.enforce_universo_banese_fixed_banking_data() FROM public;

UPDATE public.payment_gateway_credentials
SET
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'baneseBeneficiarioNome', 'UNIVERSO CURSOS E CONSULTORIA LTDA',
    'baneseBeneficiarioInscricao', '13.278.137/0001-54',
    'baneseAgencia', '033',
    'baneseConta', '03/100649-0',
    'baneseContaDisplay', '03/100649-0',
    'baneseCodigoBeneficiario', '03/100649-0',
    'baneseConvenio', CASE
      WHEN environment = 'production' THEN '15261'
      ELSE '15528'
    END,
    'baneseBoletoConvenio', CASE
      WHEN environment = 'production' THEN '15261'
      ELSE '15528'
    END,
    'banesePixConvenio', CASE
      WHEN environment = 'production' THEN '15261'
      ELSE '15528'
    END
  ),
  updated_at = now()
WHERE provider_code = 'banese_card'
  AND environment in ('sandbox', 'production');

UPDATE public.payment_gateway_routes AS route
SET
  provider_code = CASE
    WHEN payment_method = 'CREDIT_CARD' THEN 'mercado_pago'
    ELSE 'banese_card'
  END,
  credential_id = (
    SELECT credential.id
    FROM public.payment_gateway_credentials AS credential
    WHERE credential.provider_code = CASE
      WHEN payment_method = 'CREDIT_CARD' THEN 'mercado_pago'
      ELSE 'banese_card'
    END
      AND credential.environment = route.environment
    ORDER BY
      credential.updated_at DESC NULLS LAST,
      credential.created_at DESC NULLS LAST,
      credential.id DESC
    LIMIT 1
  ),
  enabled = CASE
    WHEN payment_method = 'CREDIT_CARD' THEN route.environment = 'sandbox'
    WHEN payment_method IN ('PIX', 'BOLETO') THEN route.environment = 'production'
    ELSE FALSE
  END,
  notes = CASE
    WHEN coalesce(route.notes, '') = '' THEN
      'Fluxo de produção atual: Banese (PIX/BOLETO), Mercado Pago (cartão apenas sandbox).'
    WHEN route.notes LIKE '%ESCOPO_BANESE_MP_20260722%' THEN
      route.notes
    ELSE
      concat_ws(' | ', route.notes, 'ESCOPO_BANESE_MP_20260722: produção com Boleto/Pix no Banese e cartão no sandbox.')
  END,
  updated_at = now()
WHERE route.environment IN ('sandbox', 'production');

COMMIT;
