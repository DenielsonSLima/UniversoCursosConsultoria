begin;

create or replace function public.claim_banese_api_submission_attempt(
  p_receivable_id uuid,
  p_environment text,
  p_convenio text,
  p_agencia text,
  p_nosso_numero text,
  p_expected_amount numeric,
  p_expected_due_date date,
  p_expected_creation_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_receivable_id uuid;
begin
  if p_environment not in ('sandbox', 'production')
    or p_convenio is null or p_convenio !~ '^[0-9]+$'
    or p_agencia is null or p_agencia !~ '^[0-9]{3}$'
    or p_agencia = '000'
    or p_nosso_numero is null or p_nosso_numero !~ '^[0-9]{9}$'
    or p_expected_amount is null or p_expected_amount <= 0
    or p_expected_due_date is null
    or p_expected_creation_token is null
  then
    raise exception 'Parametros invalidos para assumir o POST Banese.';
  end if;

  update public.contas_receber as receivable
  set gateway_submission_channel = 'API',
      gateway_submission_status = 'API_AMBIGUOUS',
      updated_at = pg_catalog.clock_timestamp()
  where receivable.id = p_receivable_id
    and receivable.gateway_provider = 'banese_card'
    and receivable.gateway_environment = p_environment
    and receivable.gateway_payment_method = 'BOLETO'
    and receivable.gateway_creation_token = p_expected_creation_token
    and receivable.gateway_status = 'CREATING'
    and receivable.gateway_submission_channel is null
    and receivable.gateway_submission_status is null
    and receivable.gateway_cnab_file_id is null
    and receivable.gateway_boleto_convenio = p_convenio
    and receivable.gateway_boleto_agencia = p_agencia
    and receivable.gateway_boleto_nosso_numero = p_nosso_numero
    and round(receivable.valor::numeric, 2) = round(p_expected_amount, 2)
    and receivable.data_vencimento = p_expected_due_date
    and receivable.gateway_payment_id is null
    and receivable.gateway_payment_link_id is null
    and receivable.gateway_boleto_codigo_barras is null
    and receivable.gateway_boleto_linha_digitavel is null
    and nullif(btrim(coalesce(receivable.gateway_pix_payload, '')), '') is null
    and nullif(btrim(coalesce(receivable.gateway_pix_encoded_image, '')), '')
      is null
    and receivable.gateway_boleto_issued_at is null
    and receivable.gateway_financial_terms_confirmed_at is null
    and receivable.gateway_settlement_recorded_at is null
    and receivable.data_pagamento is null
    and receivable.valor_pago is null
    and receivable.status in ('PENDENTE', 'VENCIDO')
    and not exists (
      select 1
      from public.payment_gateway_transactions as transaction
      where transaction.receivable_id = receivable.id
    )
  returning receivable.id into v_receivable_id;

  if v_receivable_id is null then
    raise exception
      'Recebivel Banese mudou antes do POST; nenhum titulo foi enviado.';
  end if;
  return true;
end;
$function$;

revoke all on function public.claim_banese_api_submission_attempt(
  uuid, text, text, text, text, numeric, date, uuid
) from public, anon, authenticated;
grant execute on function public.claim_banese_api_submission_attempt(
  uuid, text, text, text, text, numeric, date, uuid
) to service_role;

comment on function public.claim_banese_api_submission_attempt(
  uuid, text, text, text, text, numeric, date, uuid
) is
  'Marca atomicamente a intencao API como ambigua antes do POST Banese; somente conciliacao ou confirmacao pode concluir o titulo.';

commit;
