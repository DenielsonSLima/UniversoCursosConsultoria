update public.payment_gateway_credentials
set
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'baneseBeneficiarioNome', 'UNIVERSO CURSOS E CONSULTORIA LTDA',
    'baneseBeneficiarioInscricao', '13.278.137/0001-54',
    'baneseAgencia', '033',
    'baneseConta', '03/100649-0',
    'baneseContaDisplay', '03/100649-0',
    'baneseCodigoBeneficiario', '03/100649-0',
    'baneseConvenio', '15528',
    'baneseBoletoConvenio', '15528'
  ),
  updated_at = now()
where provider_code = 'banese_card'
  and environment in ('sandbox', 'production');
