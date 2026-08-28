begin;

create or replace function public.persist_banese_recovered_pix(
  p_receivable_id uuid,
  p_environment text,
  p_nosso_numero text,
  p_pix_payload text,
  p_pix_encoded_image text,
  p_remote_digitable_line text,
  p_remote_barcode text,
  p_expected_amount numeric,
  p_expected_due_date date,
  p_expected_convenio text,
  p_replace_invalid_digitable_line boolean,
  p_reconciliation jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_receivable public.contas_receber%rowtype;
  v_transaction_count integer := 0;
  v_now timestamptz;
begin
  if coalesce(p_environment, '') not in ('sandbox', 'production') then
    raise exception 'Ambiente Banese invalido para persistencia Pix.';
  end if;
  if coalesce(p_nosso_numero, '') !~ '^[0-9]{9}$'
    or coalesce(p_remote_digitable_line, '') !~ '^[0-9]{47}$'
    or coalesce(p_remote_barcode, '') !~ '^[0-9]{44}$'
  then
    raise exception 'Identidade bancaria Banese invalida para persistencia Pix.';
  end if;
  if left(p_remote_digitable_line, 4) <> '0479'
    or left(p_remote_barcode, 4) <> '0479'
    or substring(p_remote_barcode from 31 for 9) <> p_nosso_numero
    or concat(
      substring(p_remote_digitable_line from 1 for 4),
      substring(p_remote_digitable_line from 33 for 1),
      substring(p_remote_digitable_line from 34 for 14),
      substring(p_remote_digitable_line from 5 for 5),
      substring(p_remote_digitable_line from 11 for 10),
      substring(p_remote_digitable_line from 22 for 10)
    ) <> p_remote_barcode
  then
    raise exception 'Linha, barras e Nosso Numero Banese nao representam o mesmo titulo.';
  end if;
  if length(trim(coalesce(p_pix_payload, ''))) not between 30 and 600
    or length(trim(coalesce(p_pix_encoded_image, ''))) not between 32 and 1500022
  then
    raise exception 'Par Pix Banese invalido para persistencia.';
  end if;
  if p_expected_amount is null
    or p_expected_amount <= 0
    or p_expected_due_date is null
    or coalesce(p_expected_convenio, '') !~ '^[0-9]{1,20}$'
  then
    raise exception 'Snapshot canonico Banese invalido para persistencia Pix.';
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
    raise exception 'Titulo Banese nao encontrado para persistencia Pix.';
  end if;
  if (
      nullif(v_receivable.gateway_boleto_nosso_numero, '') is not null
      and (
        length(regexp_replace(v_receivable.gateway_boleto_nosso_numero, '\D', '', 'g')) > 9
        or lpad(
          regexp_replace(v_receivable.gateway_boleto_nosso_numero, '\D', '', 'g'),
          9,
          '0'
        ) <> p_nosso_numero
      )
    )
    or (
      nullif(v_receivable.gateway_payment_id, '') is not null
      and (
        length(regexp_replace(v_receivable.gateway_payment_id, '\D', '', 'g')) > 9
        or lpad(
          regexp_replace(v_receivable.gateway_payment_id, '\D', '', 'g'),
          9,
          '0'
        ) <> p_nosso_numero
      )
    )
    or (
      nullif(v_receivable.gateway_boleto_nosso_numero, '') is null
      and nullif(v_receivable.gateway_payment_id, '') is null
    )
  then
    raise exception 'Identificadores do titulo Banese divergem do Nosso Numero consultado.';
  end if;
  if round(v_receivable.valor::numeric, 2) is distinct from round(p_expected_amount, 2)
    or v_receivable.data_vencimento is distinct from p_expected_due_date
    or regexp_replace(
      coalesce(v_receivable.gateway_boleto_convenio, ''),
      '\D',
      '',
      'g'
    ) is distinct from p_expected_convenio
  then
    raise exception 'Titulo Banese mudou durante a consulta; o Pix nao foi persistido.';
  end if;
  if (
      coalesce(nullif(v_receivable.gateway_boleto_linha_digitavel, ''), p_remote_digitable_line)
        <> p_remote_digitable_line
      and not (
        coalesce(p_replace_invalid_digitable_line, false)
        and nullif(v_receivable.gateway_boleto_codigo_barras, '') = p_remote_barcode
      )
    )
    or coalesce(nullif(v_receivable.gateway_boleto_codigo_barras, ''), p_remote_barcode)
      <> p_remote_barcode
  then
    raise exception 'Numeros bancarios Banese divergentes na persistencia Pix.';
  end if;
  if (nullif(v_receivable.gateway_pix_payload, '') is null)
      <> (nullif(v_receivable.gateway_pix_encoded_image, '') is null)
  then
    raise exception 'Snapshot Pix Banese local esta incompleto.';
  end if;
  if nullif(v_receivable.gateway_pix_payload, '') is not null
    and (
      v_receivable.gateway_pix_payload <> p_pix_payload
      or v_receivable.gateway_pix_encoded_image <> p_pix_encoded_image
    )
  then
    raise exception 'Snapshot Pix Banese local diverge do retorno oficial.';
  end if;

  perform 1
  from public.payment_gateway_transactions as transaction
  where transaction.receivable_id = p_receivable_id
    and transaction.provider_code = 'banese_card'
    and transaction.environment = p_environment
    and transaction.payment_method = 'BOLETO'
  for update;

  if exists (
    select 1
    from public.payment_gateway_transactions as transaction
    where transaction.receivable_id = p_receivable_id
      and transaction.provider_code = 'banese_card'
      and transaction.environment = p_environment
      and transaction.payment_method = 'BOLETO'
      and (
        (
          nullif(transaction.bank_slip_our_number, '') is not null
          and (
            length(regexp_replace(transaction.bank_slip_our_number, '\D', '', 'g')) > 9
            or lpad(
              regexp_replace(transaction.bank_slip_our_number, '\D', '', 'g'),
              9,
              '0'
            ) <> p_nosso_numero
          )
        )
        or (
          nullif(transaction.remote_payment_id, '') is not null
          and (
            length(regexp_replace(transaction.remote_payment_id, '\D', '', 'g')) > 9
            or lpad(
              regexp_replace(transaction.remote_payment_id, '\D', '', 'g'),
              9,
              '0'
            ) <> p_nosso_numero
          )
        )
        or (nullif(transaction.pix_payload, '') is null)
          <> (nullif(transaction.pix_encoded_image, '') is null)
        or (
          nullif(transaction.pix_payload, '') is not null
          and (
            transaction.pix_payload <> p_pix_payload
            or transaction.pix_encoded_image <> p_pix_encoded_image
          )
        )
        or (
          coalesce(nullif(transaction.bank_slip_digitable_line, ''), p_remote_digitable_line)
            <> p_remote_digitable_line
          and not (
            coalesce(p_replace_invalid_digitable_line, false)
            and nullif(transaction.bank_slip_barcode, '') = p_remote_barcode
          )
        )
        or coalesce(nullif(transaction.bank_slip_barcode, ''), p_remote_barcode)
          <> p_remote_barcode
      )
  ) then
    raise exception 'Transacao Banese possui payload Pix divergente do retorno oficial.';
  end if;

  -- O instante canônico é capturado somente depois de obter todos os locks,
  -- evitando timestamps regressivos quando outra transação ficou na frente.
  v_now := clock_timestamp();

  update public.payment_gateway_transactions as transaction
  set pix_payload = p_pix_payload,
      pix_encoded_image = p_pix_encoded_image,
      bank_slip_digitable_line = p_remote_digitable_line,
      bank_slip_barcode = p_remote_barcode,
      bank_slip_our_number = p_nosso_numero,
      remote_payment_id = p_nosso_numero,
      synced_at = v_now,
      updated_at = v_now,
      raw_payload = coalesce(transaction.raw_payload, '{}'::jsonb) ||
        jsonb_build_object('pixRecovery', coalesce(p_reconciliation, '{}'::jsonb))
  where transaction.receivable_id = p_receivable_id
    and transaction.provider_code = 'banese_card'
    and transaction.environment = p_environment
    and transaction.payment_method = 'BOLETO';
  get diagnostics v_transaction_count = row_count;

  if v_transaction_count = 0 then
    insert into public.payment_gateway_transactions (
      receivable_id,
      provider_code,
      environment,
      payment_method,
      origin_polo_id,
      issuer_polo_id,
      installments,
      remote_payment_id,
      amount,
      invoice_url,
      bank_slip_url,
      bank_slip_digitable_line,
      bank_slip_barcode,
      bank_slip_our_number,
      pix_payload,
      pix_encoded_image,
      remote_status,
      synced_at,
      raw_payload
    ) values (
      v_receivable.id,
      'banese_card',
      p_environment,
      'BOLETO',
      v_receivable.polo_id,
      v_receivable.gateway_issuer_polo_id,
      coalesce(v_receivable.gateway_installments, 1),
      p_nosso_numero,
      v_receivable.valor,
      v_receivable.gateway_invoice_url,
      v_receivable.gateway_bank_slip_url,
      p_remote_digitable_line,
      p_remote_barcode,
      p_nosso_numero,
      p_pix_payload,
      p_pix_encoded_image,
      v_receivable.gateway_status,
      v_now,
      jsonb_build_object('pixRecovery', coalesce(p_reconciliation, '{}'::jsonb))
    );
  end if;

  update public.contas_receber as receivable
  set gateway_boleto_linha_digitavel = p_remote_digitable_line,
      gateway_boleto_codigo_barras = p_remote_barcode,
      gateway_pix_payload = p_pix_payload,
      gateway_pix_encoded_image = p_pix_encoded_image,
      gateway_synced_at = v_now,
      updated_at = v_now
  where receivable.id = p_receivable_id;

  return jsonb_build_object(
    'receivableId', p_receivable_id,
    'nossoNumero', p_nosso_numero,
    'persisted', true,
    'persistedAt', v_now,
    'transactionCount', greatest(v_transaction_count, 1)
  );
end;
$function$;

revoke all on function public.persist_banese_recovered_pix(
  uuid, text, text, text, text, text, text, numeric, date, text, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.persist_banese_recovered_pix(
  uuid, text, text, text, text, text, text, numeric, date, text, boolean, jsonb
) to service_role;

-- Títulos pagos só retornam à fila quando uma etapa posterior à baixa bancária
-- ficou explicitamente pendente. O prefixo é comparado literalmente; LIKE não
-- é usado porque os sublinhados seriam curingas.
do $migration$
declare
  v_definition text := pg_get_functiondef(
    'public.prepare_banese_reconciliation_batch_v3()'::regprocedure
  );
  v_changed boolean := false;
  v_old_status constant text := $old$      AND receivable.status IN ('PENDENTE', 'VENCIDO', 'AGUARDANDO_CONFIRMACAO')$old$;
  v_new_status constant text := $new$      AND (
        receivable.status IN ('PENDENTE', 'VENCIDO', 'AGUARDANDO_CONFIRMACAO')
        OR (
          receivable.status = 'PAGO'
          AND left(
            coalesce(receivable.gateway_last_error, ''),
            char_length('BANESE_POST_SETTLEMENT_PENDING:')
          ) = 'BANESE_POST_SETTLEMENT_PENDING:'
        )
      )$new$;
begin
  if position(v_old_status in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_status, v_new_status);
    v_changed := true;
  elsif position(v_new_status in v_definition) = 0 then
    raise exception 'Contrato inesperado na elegibilidade da fila Banese.';
  end if;

  if position('pg_catalog.pg_advisory_xact_lock' in v_definition) = 0
    or position('FOR UPDATE OF locked_queue SKIP LOCKED' in v_definition) = 0
  then
    raise exception 'Guardas atomicas ausentes na fila Banese.';
  end if;

  if v_changed then
    execute v_definition;
  end if;
end;
$migration$;

alter function public.prepare_banese_reconciliation_batch_v3()
  security invoker;
alter function public.prepare_banese_reconciliation_batch_v3()
  set search_path = '';
revoke all on function public.prepare_banese_reconciliation_batch_v3()
  from public, anon, authenticated;
grant execute on function public.prepare_banese_reconciliation_batch_v3()
  to service_role;

comment on function public.prepare_banese_reconciliation_batch_v3() is
  'Reserva atomicamente títulos Banese; PAGO retorna somente com pendência pós-liquidação marcada pelo servidor.';

commit;
