begin;

create or replace function public.persist_banese_reconciliation_snapshot(
  p_receivable_id uuid, p_environment text, p_nosso_numero text,
  p_expected_updated_at timestamptz, p_expected_status text,
  p_expected_gateway_status text, p_expected_amount numeric,
  p_expected_due_date date, p_expected_convenio text, p_remote_status text,
  p_financial_terms jsonb, p_confirm_api_submission boolean,
  p_remote_paid boolean, p_post_settlement_required boolean,
  p_should_settle boolean, p_payment_total numeric, p_payment_date date,
  p_settlement_method text, p_pix_payload text, p_pix_encoded_image text,
  p_remote_digitable_line text, p_remote_barcode text,
  p_transaction_snapshot jsonb, p_expected_transactions jsonb,
  p_expected_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_receivable public.contas_receber%rowtype;
  v_updated public.contas_receber%rowtype;
  v_transaction public.payment_gateway_transactions%rowtype;
  v_now timestamptz;
  v_line text; v_barcode text;
  v_pix_payload text; v_pix_image text;
  v_current_state jsonb; v_current_transaction jsonb;
  v_expected_transaction jsonb; v_transaction_count integer;
  v_pending_retry boolean; v_preserve_settlement boolean;
  v_marker constant text :=
    'BANESE_POST_SETTLEMENT_PENDING: baixa confirmada; conclusão interna aguardando nova tentativa.';
  v_state_keys constant text[] := array[
    'status', 'origem_pagamento', 'forma_pagamento', 'gateway_status',
    'gateway_creation_token', 'gateway_financial_terms',
    'gateway_financial_terms_confirmed_at', 'gateway_submission_channel',
    'gateway_submission_status', 'gateway_cnab_file_id', 'gateway_boleto_agencia',
    'gateway_boleto_linha_digitavel', 'gateway_boleto_codigo_barras',
    'gateway_pix_payload', 'gateway_pix_encoded_image', 'gateway_last_error',
    'gateway_payment_id', 'gateway_boleto_nosso_numero', 'updated_at'
  ];
  v_transaction_keys constant text[] := array[
    'id', 'amount', 'raw_payload', 'remote_payment_id', 'remote_status', 'last_error',
    'synced_at', 'bank_slip_our_number', 'bank_slip_digitable_line',
    'bank_slip_barcode', 'pix_payload', 'pix_encoded_image', 'updated_at'
  ];
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role')
  then
    raise exception 'Acesso negado a persistencia da conciliacao Banese.'
      using errcode = '42501';
  end if;
  if coalesce(p_environment, '') not in ('sandbox', 'production')
    or coalesce(p_nosso_numero, '') !~ '^[0-9]{9}$'
    or coalesce(p_expected_convenio, '') !~ '^[0-9]{1,20}$'
    or nullif(btrim(coalesce(p_remote_status, '')), '') is null
  then
    raise exception 'Identidade da conciliacao Banese invalida.';
  end if;
  if p_expected_updated_at is null
    or p_expected_amount is null or p_expected_amount <= 0
    or p_expected_due_date is null
    or p_financial_terms is null or p_transaction_snapshot is null
    or p_expected_transactions is null or p_expected_state is null
    or jsonb_typeof(p_financial_terms) <> 'object'
    or jsonb_typeof(p_transaction_snapshot) <> 'object'
    or jsonb_typeof(p_transaction_snapshot -> 'payments') <> 'array'
    or jsonb_typeof(p_expected_transactions) <> 'array'
    or jsonb_array_length(p_expected_transactions) > 1
    or jsonb_typeof(p_expected_state) <> 'object'
    or not (p_expected_state ?& v_state_keys)
    or jsonb_typeof(p_expected_state -> 'updated_at') <> 'string'
    or jsonb_typeof(p_expected_state -> 'gateway_financial_terms_confirmed_at')
      not in ('string', 'null')
  then
    raise exception 'Snapshots da conciliacao Banese invalidos.';
  end if;
  if round((p_financial_terms ->> 'nominalAmount')::numeric, 2)
      is distinct from round(p_expected_amount, 2)
    or (p_financial_terms ->> 'dueDate')::date
      is distinct from p_expected_due_date
  then
    raise exception 'Termos financeiros divergem do titulo Banese.';
  end if;
  if p_confirm_api_submission is null or p_remote_paid is null
    or p_post_settlement_required is null or p_should_settle is null
    or coalesce(p_settlement_method, '') not in (
      'BOLETO', 'PIX', 'NAO_IDENTIFICADO', 'MISTO'
    )
  then
    raise exception 'Decisao de conciliacao Banese invalida.';
  end if;
  if p_remote_paid and (
      p_payment_total is null or p_payment_total <= 0 or p_payment_date is null
    )
  then
    raise exception 'Pagamento Banese sem valor ou data validos.';
  end if;
  if not p_remote_paid
    and (p_payment_total is not null or p_payment_date is not null)
  then
    raise exception 'Titulo Banese nao pago recebeu dados de baixa.';
  end if;
  if (nullif(btrim(coalesce(p_pix_payload, '')), '') is null)
      <> (nullif(btrim(coalesce(p_pix_encoded_image, '')), '') is null)
    or (nullif(p_remote_digitable_line, '') is null)
      <> (nullif(p_remote_barcode, '') is null)
  then
    raise exception 'Pares Pix ou bancario Banese incompletos.';
  end if;

  select receivable.*
  into v_receivable
  from public.contas_receber as receivable
  where receivable.id = p_receivable_id
    and receivable.gateway_provider = 'banese_card'
    and receivable.gateway_environment = p_environment
    and receivable.gateway_payment_method = 'BOLETO'
  for update;
  if not found then
    raise exception 'Titulo Banese nao encontrado para conciliacao.';
  end if;

  v_current_state := jsonb_build_object(
    'status', v_receivable.status,
    'origem_pagamento', v_receivable.origem_pagamento,
    'forma_pagamento', v_receivable.forma_pagamento,
    'gateway_status', v_receivable.gateway_status,
    'gateway_creation_token', v_receivable.gateway_creation_token,
    'gateway_financial_terms', v_receivable.gateway_financial_terms,
    'gateway_submission_channel', v_receivable.gateway_submission_channel,
    'gateway_submission_status', v_receivable.gateway_submission_status,
    'gateway_cnab_file_id', v_receivable.gateway_cnab_file_id,
    'gateway_boleto_agencia', v_receivable.gateway_boleto_agencia,
    'gateway_boleto_linha_digitavel',
      v_receivable.gateway_boleto_linha_digitavel,
    'gateway_boleto_codigo_barras', v_receivable.gateway_boleto_codigo_barras,
    'gateway_pix_payload', v_receivable.gateway_pix_payload,
    'gateway_pix_encoded_image', v_receivable.gateway_pix_encoded_image,
    'gateway_last_error', v_receivable.gateway_last_error,
    'gateway_payment_id', v_receivable.gateway_payment_id,
    'gateway_boleto_nosso_numero', v_receivable.gateway_boleto_nosso_numero
  );
  if v_receivable.updated_at is distinct from p_expected_updated_at
    or v_receivable.status is distinct from p_expected_status
    or v_receivable.gateway_status is distinct from p_expected_gateway_status
    or v_receivable.updated_at is distinct from
      (p_expected_state ->> 'updated_at')::timestamptz
    or v_receivable.gateway_financial_terms_confirmed_at is distinct from
      (p_expected_state ->> 'gateway_financial_terms_confirmed_at')::timestamptz
    or v_current_state is distinct from (
      p_expected_state - array[
        'updated_at', 'gateway_financial_terms_confirmed_at'
      ]
    )
  then
    raise exception 'Titulo Banese mudou durante a consulta.'
      using errcode = '40001';
  end if;
  if upper(coalesce(v_receivable.status, '')) not in (
      'PENDENTE', 'VENCIDO', 'AGUARDANDO_CONFIRMACAO', 'PAGO'
    )
    or round(v_receivable.valor::numeric, 2)
      is distinct from round(p_expected_amount, 2)
    or v_receivable.data_vencimento is distinct from p_expected_due_date
    or regexp_replace(coalesce(v_receivable.gateway_boleto_convenio, ''),
      '\D', '', 'g') is distinct from p_expected_convenio
    or v_receivable.gateway_financial_terms is distinct from p_financial_terms
  then
    raise exception 'Contrato financeiro do titulo Banese divergiu.';
  end if;
  if (
      nullif(v_receivable.gateway_boleto_nosso_numero, '') is not null
      and (
        length(regexp_replace(v_receivable.gateway_boleto_nosso_numero,
          '\D', '', 'g')) > 9
        or lpad(regexp_replace(v_receivable.gateway_boleto_nosso_numero,
          '\D', '', 'g'), 9, '0') <> p_nosso_numero
      )
    ) or (
      nullif(v_receivable.gateway_payment_id, '') is not null
      and (
        length(regexp_replace(v_receivable.gateway_payment_id,
          '\D', '', 'g')) > 9
        or lpad(regexp_replace(v_receivable.gateway_payment_id,
          '\D', '', 'g'), 9, '0') <> p_nosso_numero
      )
    ) or (
      nullif(v_receivable.gateway_boleto_nosso_numero, '') is null
      and nullif(v_receivable.gateway_payment_id, '') is null
    )
  then
    raise exception 'Nosso Numero local diverge da consulta Banese.';
  end if;
  v_pending_retry := upper(v_receivable.status) = 'PAGO'
    and left(coalesce(v_receivable.gateway_last_error, ''),
      char_length('BANESE_POST_SETTLEMENT_PENDING:')) =
      'BANESE_POST_SETTLEMENT_PENDING:';
  v_preserve_settlement := upper(v_receivable.status) = 'PAGO';
  if p_should_settle is distinct from
      (p_remote_paid and upper(v_receivable.status) <> 'PAGO')
    or p_post_settlement_required is distinct from
      (p_remote_paid or v_pending_retry)
  then
    raise exception 'Transicao financeira Banese inconsistente.';
  end if;

  v_line := coalesce(nullif(p_remote_digitable_line, ''),
    nullif(v_receivable.gateway_boleto_linha_digitavel, ''));
  v_barcode := coalesce(nullif(p_remote_barcode, ''),
    nullif(v_receivable.gateway_boleto_codigo_barras, ''));
  if (v_line is null) <> (v_barcode is null) then
    raise exception 'Identidade bancaria local Banese esta incompleta.';
  end if;
  if v_line is not null and (
      v_line !~ '^[0-9]{47}$' or v_barcode !~ '^[0-9]{44}$'
      or left(v_line, 4) <> '0479' or left(v_barcode, 4) <> '0479'
      or substring(v_barcode from 31 for 9) <> p_nosso_numero
      or concat(substring(v_line from 1 for 4), substring(v_line from 33 for 1),
        substring(v_line from 34 for 14), substring(v_line from 5 for 5),
        substring(v_line from 11 for 10), substring(v_line from 22 for 10))
        <> v_barcode
    )
  then
    raise exception 'Linha, barras e Nosso Numero nao representam o mesmo titulo.';
  end if;
  if nullif(v_receivable.gateway_boleto_codigo_barras, '') is not null
      and v_receivable.gateway_boleto_codigo_barras <> v_barcode
    or nullif(v_receivable.gateway_boleto_linha_digitavel, '') is not null
      and v_receivable.gateway_boleto_linha_digitavel <> v_line
      and not (
        v_receivable.gateway_boleto_codigo_barras = v_barcode
        and concat(
          substring(v_receivable.gateway_boleto_linha_digitavel from 1 for 4),
          substring(v_receivable.gateway_boleto_linha_digitavel from 33 for 1),
          substring(v_receivable.gateway_boleto_linha_digitavel from 34 for 14),
          substring(v_receivable.gateway_boleto_linha_digitavel from 5 for 5),
          substring(v_receivable.gateway_boleto_linha_digitavel from 11 for 10),
          substring(v_receivable.gateway_boleto_linha_digitavel from 22 for 10)
        ) = v_barcode
      )
  then
    raise exception 'Numeros bancarios locais divergem do retorno Banese.';
  end if;

  v_pix_payload := coalesce(nullif(btrim(coalesce(p_pix_payload, '')), ''),
    nullif(btrim(coalesce(v_receivable.gateway_pix_payload, '')), ''));
  v_pix_image := coalesce(nullif(btrim(coalesce(p_pix_encoded_image, '')), ''),
    nullif(btrim(coalesce(v_receivable.gateway_pix_encoded_image, '')), ''));
  if (v_pix_payload is null) <> (v_pix_image is null)
    or v_pix_payload is not null and (
      length(v_pix_payload) not between 30 and 600
      or length(v_pix_image) not between 32 and 1500022
    )
    or nullif(v_receivable.gateway_pix_payload, '') is not null
      and v_receivable.gateway_pix_payload <> v_pix_payload
    or nullif(v_receivable.gateway_pix_encoded_image, '') is not null
      and v_receivable.gateway_pix_encoded_image <> v_pix_image
  then
    raise exception 'Snapshot Pix Banese incompleto ou divergente.';
  end if;

  perform 1
  from public.payment_gateway_transactions as transaction
  where transaction.receivable_id = p_receivable_id
    and transaction.provider_code = 'banese_card'
    and transaction.environment = p_environment
    and transaction.payment_method = 'BOLETO'
  for update;
  get diagnostics v_transaction_count = row_count;
  if v_transaction_count > 1 then
    raise exception 'Titulo Banese possui mais de uma transacao canonica.';
  end if;
  if v_transaction_count <> jsonb_array_length(p_expected_transactions) then
    raise exception 'Transacao Banese mudou durante a consulta.'
      using errcode = '40001';
  end if;
  if v_transaction_count = 1 then
    select transaction.* into v_transaction
    from public.payment_gateway_transactions as transaction
    where transaction.receivable_id = p_receivable_id
      and transaction.provider_code = 'banese_card'
      and transaction.environment = p_environment
      and transaction.payment_method = 'BOLETO';
    v_expected_transaction := p_expected_transactions -> 0;
    if jsonb_typeof(v_expected_transaction) <> 'object'
      or not (v_expected_transaction ?& v_transaction_keys)
      or jsonb_typeof(v_expected_transaction -> 'updated_at') <> 'string'
      or jsonb_typeof(v_expected_transaction -> 'synced_at')
        not in ('string', 'null')
    then
      raise exception 'Snapshot esperado da transacao Banese invalido.';
    end if;
    v_current_transaction := jsonb_build_object(
      'id', v_transaction.id, 'amount', v_transaction.amount,
      'raw_payload', v_transaction.raw_payload,
      'remote_payment_id', v_transaction.remote_payment_id,
      'remote_status', v_transaction.remote_status,
      'last_error', v_transaction.last_error,
      'bank_slip_our_number', v_transaction.bank_slip_our_number,
      'bank_slip_digitable_line', v_transaction.bank_slip_digitable_line,
      'bank_slip_barcode', v_transaction.bank_slip_barcode,
      'pix_payload', v_transaction.pix_payload,
      'pix_encoded_image', v_transaction.pix_encoded_image
    );
    if v_current_transaction is distinct from
        (v_expected_transaction - array['updated_at', 'synced_at'])
      or v_transaction.updated_at is distinct from
        (v_expected_transaction ->> 'updated_at')::timestamptz
      or v_transaction.synced_at is distinct from
        (v_expected_transaction ->> 'synced_at')::timestamptz
    then
      raise exception 'Transacao Banese mudou durante a consulta.'
        using errcode = '40001';
    end if;
    if round(v_transaction.amount, 2) is distinct from round(p_expected_amount, 2)
      or nullif(v_transaction.bank_slip_our_number, '') is not null and (
        length(regexp_replace(v_transaction.bank_slip_our_number,
          '\D', '', 'g')) not between 1 and 9
        or lpad(regexp_replace(v_transaction.bank_slip_our_number,
          '\D', '', 'g'), 9, '0') <> p_nosso_numero
      )
      or nullif(v_transaction.remote_payment_id, '') is not null and (
        length(regexp_replace(v_transaction.remote_payment_id,
          '\D', '', 'g')) not between 1 and 9
        or lpad(regexp_replace(v_transaction.remote_payment_id,
          '\D', '', 'g'), 9, '0') <> p_nosso_numero
      )
      or (nullif(v_transaction.pix_payload, '') is null)
        <> (nullif(v_transaction.pix_encoded_image, '') is null)
      or (nullif(v_transaction.bank_slip_digitable_line, '') is null)
        <> (nullif(v_transaction.bank_slip_barcode, '') is null)
      or nullif(v_transaction.pix_payload, '') is not null
        and v_transaction.pix_payload is distinct from v_pix_payload
      or nullif(v_transaction.pix_encoded_image, '') is not null
        and v_transaction.pix_encoded_image is distinct from v_pix_image
      or nullif(v_transaction.bank_slip_barcode, '') is not null
        and v_transaction.bank_slip_barcode is distinct from v_barcode
      or nullif(v_transaction.bank_slip_digitable_line, '') is not null
        and v_transaction.bank_slip_digitable_line is distinct from v_line
        and not (
          v_transaction.bank_slip_barcode = v_barcode
          and concat(
            substring(v_transaction.bank_slip_digitable_line from 1 for 4),
            substring(v_transaction.bank_slip_digitable_line from 33 for 1),
            substring(v_transaction.bank_slip_digitable_line from 34 for 14),
            substring(v_transaction.bank_slip_digitable_line from 5 for 5),
            substring(v_transaction.bank_slip_digitable_line from 11 for 10),
            substring(v_transaction.bank_slip_digitable_line from 22 for 10)
          ) = v_barcode
        )
    then
      raise exception 'Transacao Banese diverge do snapshot canonico.';
    end if;
  end if;

  v_now := clock_timestamp();
  if v_transaction_count = 0 then
    insert into public.payment_gateway_transactions (
      receivable_id, provider_code, environment, payment_method,
      origin_polo_id, issuer_polo_id, installments, remote_payment_id,
      amount, invoice_url, bank_slip_url, bank_slip_digitable_line,
      bank_slip_barcode, bank_slip_our_number, pix_payload,
      pix_encoded_image, remote_status, last_error, synced_at, raw_payload
    ) values (
      v_receivable.id, 'banese_card', p_environment, 'BOLETO',
      v_receivable.polo_id, v_receivable.gateway_issuer_polo_id,
      coalesce(v_receivable.gateway_installments, 1), p_nosso_numero,
      v_receivable.valor, v_receivable.gateway_invoice_url,
      v_receivable.gateway_bank_slip_url, v_line, v_barcode,
      p_nosso_numero, v_pix_payload, v_pix_image,
      case when v_preserve_settlement and not p_remote_paid
        then v_receivable.gateway_status else p_remote_status end,
      null, v_now, p_transaction_snapshot
    );
  else
    update public.payment_gateway_transactions as transaction
    set remote_payment_id = p_nosso_numero,
        bank_slip_our_number = p_nosso_numero,
        bank_slip_digitable_line = v_line,
        bank_slip_barcode = v_barcode,
        pix_payload = v_pix_payload,
        pix_encoded_image = v_pix_image,
        remote_status = case
          when v_preserve_settlement and not p_remote_paid
            then transaction.remote_status
          else p_remote_status
        end,
        last_error = null,
        synced_at = v_now,
        updated_at = v_now,
        raw_payload = coalesce(transaction.raw_payload, '{}'::jsonb) ||
          case
            when v_preserve_settlement and not p_remote_paid then
              jsonb_build_object('postSettlementRetry', p_transaction_snapshot)
            else p_transaction_snapshot
          end
    where transaction.receivable_id = p_receivable_id
      and transaction.provider_code = 'banese_card'
      and transaction.environment = p_environment
      and transaction.payment_method = 'BOLETO';
  end if;

  update public.contas_receber as receivable
  set gateway_payment_id = p_nosso_numero,
      gateway_boleto_nosso_numero = p_nosso_numero,
      gateway_status = case
        when v_preserve_settlement and not p_remote_paid
          then receivable.gateway_status
        else p_remote_status
      end,
      gateway_financial_terms = p_financial_terms,
      gateway_financial_terms_confirmed_at = coalesce(
        receivable.gateway_financial_terms_confirmed_at, v_now
      ),
      gateway_creation_token = case
        when p_confirm_api_submission then null
        else receivable.gateway_creation_token
      end,
      gateway_submission_channel = case
        when p_confirm_api_submission then 'API'
        else receivable.gateway_submission_channel
      end,
      gateway_submission_status = case
        when p_confirm_api_submission then 'API_REGISTERED'
        else receivable.gateway_submission_status
      end,
      gateway_boleto_linha_digitavel = v_line,
      gateway_boleto_codigo_barras = v_barcode,
      gateway_pix_payload = v_pix_payload,
      gateway_pix_encoded_image = v_pix_image,
      gateway_synced_at = v_now,
      gateway_last_error = case
        when p_post_settlement_required then v_marker else null
      end,
      status = case when p_should_settle then 'PAGO' else receivable.status end,
      valor_pago = case
        when p_should_settle then round(p_payment_total, 2)
        else receivable.valor_pago
      end,
      data_pagamento = case
        when p_should_settle then p_payment_date else receivable.data_pagamento
      end,
      forma_pagamento = case
        when p_should_settle and p_settlement_method = 'PIX' then 'PIX'
        when p_should_settle then 'BOLETO'
        else receivable.forma_pagamento
      end,
      origem_pagamento = case
        when p_should_settle then 'BANESE' else receivable.origem_pagamento
      end,
      gateway_settlement_channel = case
        when p_should_settle then p_settlement_method
        else receivable.gateway_settlement_channel
      end,
      gateway_settlement_source = case
        when p_should_settle then 'API'
        else receivable.gateway_settlement_source
      end,
      gateway_settlement_evidence = case
        when p_should_settle then jsonb_build_object(
          'classification', p_settlement_method,
          'paymentCount', jsonb_array_length(p_transaction_snapshot -> 'payments'),
          'documentedFields', jsonb_build_array(
            'BancoRecebedor', 'DataPagamento', 'ValorPago'
          )
        ) else receivable.gateway_settlement_evidence
      end,
      gateway_settlement_recorded_at = case
        when p_should_settle then v_now
        else receivable.gateway_settlement_recorded_at
      end,
      updated_at = v_now
  where receivable.id = p_receivable_id
  returning receivable.* into v_updated;

  return jsonb_build_object(
    'receivable', to_jsonb(v_updated),
    'persistedAt', v_now
  );
end;
$function$;

revoke all on function public.persist_banese_reconciliation_snapshot(
  uuid, text, text, timestamptz, text, text, numeric, date, text, text,
  jsonb, boolean, boolean, boolean, boolean, numeric, date, text, text,
  text, text, text, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.persist_banese_reconciliation_snapshot(
  uuid, text, text, timestamptz, text, text, numeric, date, text, text,
  jsonb, boolean, boolean, boolean, boolean, numeric, date, text, text,
  text, text, text, jsonb, jsonb, jsonb
) to service_role;

commit;
