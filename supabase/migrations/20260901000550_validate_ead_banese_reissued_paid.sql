begin;

create or replace function public.banese_ead_reissued_paid_identity_valid(
  p_job_id uuid,
  p_replacement_nosso_numero text
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  v_job public.banese_ead_title_replacement_jobs%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_transaction public.payment_gateway_transactions%rowtype;
  v_inscription public.inscricoes_online%rowtype;
  v_transaction_count integer;
  v_inscription_count integer;
begin
  if coalesce(p_replacement_nosso_numero, '') !~ '^[0-9]{9}$' then
    return false;
  end if;
  select job.* into v_job
  from public.banese_ead_title_replacement_jobs job
  where job.id = p_job_id and job.status = 'REISSUING';
  if not found
    or p_replacement_nosso_numero = v_job.canceled_nosso_numero
    or not exists (select 1
      from public.banese_ead_title_replacement_archive archive
      where archive.job_id = v_job.id) then
    return false;
  end if;

  select receivable.* into v_receivable
  from public.contas_receber receivable
  where receivable.id = v_job.receivable_id;
  if not found
    or v_receivable.gateway_boleto_nosso_numero
      is distinct from p_replacement_nosso_numero
    or v_receivable.gateway_payment_id is distinct from p_replacement_nosso_numero
    or v_receivable.gateway_provider is distinct from 'banese_card'
    or v_receivable.gateway_environment is distinct from v_job.environment
    or v_receivable.gateway_payment_method is distinct from 'BOLETO'
    or v_receivable.gateway_status is distinct from 'PAID'
    or v_receivable.gateway_boleto_convenio is distinct from v_job.convenio
    or regexp_replace(coalesce(v_receivable.gateway_boleto_agencia, ''),
      '\D', '', 'g') is distinct from v_job.agency
    or round(v_receivable.valor, 2) is distinct from round(v_job.expected_amount, 2)
    or v_receivable.data_vencimento is distinct from v_job.expected_due_date
    or v_receivable.status <> 'PAGO' or v_receivable.data_pagamento is null
    or coalesce(v_receivable.valor_pago, 0) <= 0
    or v_receivable.forma_pagamento not in ('PIX', 'BOLETO')
    or v_receivable.origem_pagamento is distinct from 'BANESE'
    or v_receivable.manual_settlement_id is not null
    or v_receivable.gateway_settlement_channel not in (
      'PIX', 'BOLETO', 'NAO_IDENTIFICADO', 'MISTO'
    )
    or v_receivable.gateway_settlement_source is distinct from 'API'
    or (v_receivable.gateway_settlement_channel = 'PIX'
      and v_receivable.forma_pagamento <> 'PIX')
    or (v_receivable.gateway_settlement_channel <> 'PIX'
      and v_receivable.forma_pagamento <> 'BOLETO')
    or jsonb_typeof(v_receivable.gateway_settlement_evidence)
      is distinct from 'object'
    or v_receivable.gateway_settlement_evidence ->> 'classification'
      is distinct from v_receivable.gateway_settlement_channel
    or coalesce(v_receivable.gateway_settlement_evidence ->> 'paymentCount', '')
      !~ '^[1-9][0-9]*$'
    or v_receivable.gateway_settlement_evidence -> 'documentedFields'
      is distinct from jsonb_build_array(
        'BancoRecebedor', 'DataPagamento', 'ValorPago'
      )
    or v_receivable.gateway_settlement_recorded_at is null
    or v_receivable.gateway_submission_channel is distinct from 'API'
    or v_receivable.gateway_submission_status is distinct from 'API_REGISTERED'
    or v_receivable.gateway_creation_token is not null
    or v_receivable.gateway_cnab_file_id is not null
    or v_receivable.gateway_boleto_issued_at is null
    or jsonb_typeof(v_receivable.gateway_financial_terms) is distinct from 'object'
    or v_receivable.gateway_financial_terms_confirmed_at is null
    or v_receivable.asaas_payment_id is not null
    or v_receivable.asaas_payment_link_id is not null
    or v_receivable.asaas_installment_id is not null
    or v_receivable.nosso_numero_asaas is not null
    or v_receivable.asaas_invoice_url is not null
    or v_receivable.asaas_bank_slip_url is not null
    or v_receivable.asaas_transaction_receipt_url is not null
    or v_receivable.asaas_status is not null
    or v_receivable.asaas_synced_at is not null
    or coalesce(v_receivable.gateway_boleto_linha_digitavel, '')
      !~ '^0479[0-9]{43}$'
    or coalesce(v_receivable.gateway_boleto_codigo_barras, '')
      !~ '^0479[0-9]{40}$'
    or substring(v_receivable.gateway_boleto_codigo_barras from 31 for 9)
      is distinct from p_replacement_nosso_numero
    or concat(substring(v_receivable.gateway_boleto_linha_digitavel from 1 for 4),
      substring(v_receivable.gateway_boleto_linha_digitavel from 33 for 1),
      substring(v_receivable.gateway_boleto_linha_digitavel from 34 for 14),
      substring(v_receivable.gateway_boleto_linha_digitavel from 5 for 5),
      substring(v_receivable.gateway_boleto_linha_digitavel from 11 for 10),
      substring(v_receivable.gateway_boleto_linha_digitavel from 22 for 10))
      is distinct from v_receivable.gateway_boleto_codigo_barras
    or (nullif(btrim(coalesce(v_receivable.gateway_pix_payload, '')), '') is null)
      <> (nullif(btrim(coalesce(
        v_receivable.gateway_pix_encoded_image, '')), '') is null)
    or not exists (select 1 from public.matriculas enrollment
      join public.turmas class on class.id = enrollment.turma_id
      join public.cursos course on course.id = class.curso_id
      where enrollment.id = v_receivable.matricula_id
        and enrollment.aluno_id = v_receivable.cliente_id
        and class.id = v_receivable.turma_id
        and upper(coalesce(course.modalidade, '')) = 'EAD') then
    return false;
  end if;

  select count(*) into v_transaction_count
  from public.payment_gateway_transactions transaction
  where transaction.receivable_id = v_receivable.id;
  if v_transaction_count <> 1 then return false; end if;
  select transaction.* into v_transaction
  from public.payment_gateway_transactions transaction
  where transaction.receivable_id = v_receivable.id;
  if v_transaction.provider_code is distinct from 'banese_card'
    or v_transaction.environment is distinct from v_job.environment
    or v_transaction.payment_method is distinct from 'BOLETO'
    or v_transaction.remote_status is distinct from 'PAID'
    or v_transaction.remote_payment_id is distinct from p_replacement_nosso_numero
    or v_transaction.bank_slip_our_number
      is distinct from p_replacement_nosso_numero
    or v_transaction.bank_slip_digitable_line
      is distinct from v_receivable.gateway_boleto_linha_digitavel
    or v_transaction.bank_slip_barcode
      is distinct from v_receivable.gateway_boleto_codigo_barras
    or round(v_transaction.amount, 2) is distinct from round(v_job.expected_amount, 2)
    or v_transaction.origin_polo_id is distinct from v_receivable.polo_id
    or v_transaction.issuer_polo_id
      is distinct from v_receivable.gateway_issuer_polo_id
    or v_transaction.installments
      is distinct from coalesce(v_receivable.gateway_installments, 1)
    or (nullif(btrim(coalesce(v_transaction.pix_payload, '')), '') is null)
      <> (nullif(btrim(coalesce(v_transaction.pix_encoded_image, '')), '') is null)
    or v_transaction.pix_payload
      is distinct from v_receivable.gateway_pix_payload
    or v_transaction.pix_encoded_image
      is distinct from v_receivable.gateway_pix_encoded_image then
    return false;
  end if;

  select count(*) into v_inscription_count
  from public.inscricoes_online inscription
  where inscription.matricula_id = v_receivable.matricula_id
    or inscription.receivable_id = v_receivable.id
    or (inscription.gateway_provider = 'banese_card'
      and inscription.gateway_environment = v_job.environment
      and inscription.gateway_payment_id = p_replacement_nosso_numero);
  if v_inscription_count <> 1 then return false; end if;
  select inscription.* into v_inscription
  from public.inscricoes_online inscription
  where inscription.matricula_id = v_receivable.matricula_id
    or inscription.receivable_id = v_receivable.id
    or (inscription.gateway_provider = 'banese_card'
      and inscription.gateway_environment = v_job.environment
      and inscription.gateway_payment_id = p_replacement_nosso_numero);
  return v_inscription.receivable_id is not distinct from v_receivable.id
    and v_inscription.matricula_id is not distinct from v_receivable.matricula_id
    and v_inscription.aluno_id is not distinct from v_receivable.cliente_id
    and v_inscription.turma_id is not distinct from v_receivable.turma_id
    and v_inscription.gateway_provider is not distinct from 'banese_card'
    and v_inscription.gateway_environment is not distinct from v_job.environment
    and v_inscription.gateway_payment_id
      is not distinct from p_replacement_nosso_numero
    and v_inscription.gateway_payment_link_id is null
    and v_inscription.asaas_payment_id is null
    and v_inscription.asaas_payment_link_id is null
    and round(v_inscription.valor, 2) is not distinct from round(v_job.expected_amount, 2)
    and v_inscription.status is not distinct from 'PAGO'
    and v_transaction.inscricao_online_id is not distinct from v_inscription.id;
end;
$function$;

revoke all on function public.banese_ead_reissued_paid_identity_valid(uuid,text)
  from public, anon, authenticated;
grant execute on function public.banese_ead_reissued_paid_identity_valid(uuid,text)
  to service_role;

commit;
