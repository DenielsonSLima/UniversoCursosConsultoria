begin;

-- O GET por Nosso Numero so pode completar uma prova de POST preexistente.
-- API_REGISTERED preserva o par bancario local; API_AMBIGUOUS nasce sem par
-- local e exige a tentativa UUID ainda em CREATING.
do $migration$
declare
  v_definition text := pg_get_functiondef(
    'public.persist_banese_recovered_pix(uuid,text,text,text,text,text,text,numeric,date,text,boolean,jsonb)'::regprocedure
  );
  v_old_receivable constant text := $old$  if (
      coalesce(nullif(v_receivable.gateway_boleto_linha_digitavel, ''), p_remote_digitable_line)
        <> p_remote_digitable_line
      or coalesce(nullif(v_receivable.gateway_boleto_codigo_barras, ''), p_remote_barcode)
        <> p_remote_barcode
    )
    and not coalesce(p_replace_invalid_digitable_line, false)
  then
    raise exception 'Numeros bancarios Banese divergentes na persistencia Pix.';
  end if;$old$;
  v_new_receivable constant text := $new$  if
    v_receivable.gateway_submission_status = 'API_REGISTERED'
  then
    if nullif(v_receivable.gateway_boleto_codigo_barras, '') is null
      or v_receivable.gateway_boleto_codigo_barras <> p_remote_barcode
      or nullif(v_receivable.gateway_boleto_linha_digitavel, '') is null
      or (
        v_receivable.gateway_boleto_linha_digitavel <> p_remote_digitable_line
        and not (
          coalesce(p_replace_invalid_digitable_line, false)
          and v_receivable.gateway_boleto_linha_digitavel ~ '^[0-9]{47}$'
          and concat(
            substring(v_receivable.gateway_boleto_linha_digitavel from 1 for 4),
            substring(v_receivable.gateway_boleto_linha_digitavel from 33 for 1),
            substring(v_receivable.gateway_boleto_linha_digitavel from 34 for 14),
            substring(v_receivable.gateway_boleto_linha_digitavel from 5 for 5),
            substring(v_receivable.gateway_boleto_linha_digitavel from 11 for 10),
            substring(v_receivable.gateway_boleto_linha_digitavel from 22 for 10)
          ) = p_remote_barcode
        )
      )
    then
      raise exception 'Numeros bancarios Banese divergentes na persistencia Pix.';
    end if;
  elsif v_receivable.gateway_submission_status = 'API_AMBIGUOUS' then
    if nullif(v_receivable.gateway_boleto_codigo_barras, '') is not null
      or nullif(v_receivable.gateway_boleto_linha_digitavel, '') is not null
    then
      raise exception 'Titulo Banese ambiguo ja possui identidade bancaria local.';
    end if;
  else
    raise exception 'Estado de submissao Banese invalido para persistencia Pix.';
  end if;$new$;
  v_old_transaction constant text := $old$        or (
          (
            coalesce(nullif(transaction.bank_slip_digitable_line, ''), p_remote_digitable_line)
              <> p_remote_digitable_line
            or coalesce(nullif(transaction.bank_slip_barcode, ''), p_remote_barcode)
              <> p_remote_barcode
          )
          and not (
            coalesce(p_replace_invalid_digitable_line, false)
            and (
              (
                nullif(transaction.bank_slip_our_number, '') is not null
                and length(regexp_replace(
                  transaction.bank_slip_our_number, '\D', '', 'g'
                )) between 1 and 9
                and lpad(regexp_replace(
                  transaction.bank_slip_our_number, '\D', '', 'g'
                ), 9, '0') = p_nosso_numero
              )
              or (
                nullif(transaction.remote_payment_id, '') is not null
                and length(regexp_replace(
                  transaction.remote_payment_id, '\D', '', 'g'
                )) between 1 and 9
                and lpad(regexp_replace(
                  transaction.remote_payment_id, '\D', '', 'g'
                ), 9, '0') = p_nosso_numero
              )
            )
          )
        )$old$;
  v_new_transaction constant text := $new$        or (
          (nullif(transaction.bank_slip_barcode, '') is null)
            <> (nullif(transaction.bank_slip_digitable_line, '') is null)
          or (
            nullif(transaction.bank_slip_barcode, '') is not null
            and (
              transaction.bank_slip_barcode <> p_remote_barcode
              or (
                transaction.bank_slip_digitable_line <> p_remote_digitable_line
                and not (
                  coalesce(p_replace_invalid_digitable_line, false)
                  and transaction.bank_slip_digitable_line ~ '^[0-9]{47}$'
                  and concat(
                    substring(transaction.bank_slip_digitable_line from 1 for 4),
                    substring(transaction.bank_slip_digitable_line from 33 for 1),
                    substring(transaction.bank_slip_digitable_line from 34 for 14),
                    substring(transaction.bank_slip_digitable_line from 5 for 5),
                    substring(transaction.bank_slip_digitable_line from 11 for 10),
                    substring(transaction.bank_slip_digitable_line from 22 for 10)
                  ) = p_remote_barcode
                )
              )
            )
          )
        )$new$;
  v_provenance_anchor constant text := $old$  perform 1
  from public.payment_gateway_transactions as transaction
  where transaction.receivable_id = p_receivable_id
    and transaction.provider_code = 'banese_card'
    and transaction.environment = p_environment
    and transaction.payment_method = 'BOLETO'
  for update;

  if exists ($old$;
  v_provenance_guard constant text := $new$  perform 1
  from public.payment_gateway_transactions as transaction
  where transaction.receivable_id = p_receivable_id
    and transaction.provider_code = 'banese_card'
    and transaction.environment = p_environment
    and transaction.payment_method = 'BOLETO'
  for update;
  get diagnostics v_transaction_count = row_count;

  if coalesce(v_receivable.gateway_submission_channel, '') <> 'API'
    or v_receivable.gateway_cnab_file_id is not null
    or coalesce(v_receivable.gateway_submission_status, '')
      not in ('API_REGISTERED', 'API_AMBIGUOUS')
  then
    raise exception 'Proveniencia do POST Banese insuficiente para persistir Pix.';
  end if;
  if v_receivable.gateway_submission_status = 'API_REGISTERED' and (
      v_transaction_count <> 1
      or not exists (
        select 1
        from public.payment_gateway_transactions as transaction
        where transaction.receivable_id = p_receivable_id
          and transaction.provider_code = 'banese_card'
          and transaction.environment = p_environment
          and transaction.payment_method = 'BOLETO'
          and round(transaction.amount::numeric, 2) = round(p_expected_amount, 2)
          and (
            (
              length(regexp_replace(coalesce(
                transaction.bank_slip_our_number, ''
              ), '\D', '', 'g')) between 1 and 9
              and lpad(regexp_replace(
                transaction.bank_slip_our_number, '\D', '', 'g'
              ), 9, '0') = p_nosso_numero
            )
            or (
              length(regexp_replace(coalesce(
                transaction.remote_payment_id, ''
              ), '\D', '', 'g')) between 1 and 9
              and lpad(regexp_replace(
                transaction.remote_payment_id, '\D', '', 'g'
              ), 9, '0') = p_nosso_numero
            )
          )
      )
    )
  then
    raise exception 'Titulo Banese registrado sem transacao canonica do POST.';
  end if;
  if v_receivable.gateway_submission_status = 'API_AMBIGUOUS' and (
      v_receivable.gateway_creation_token is null
      or upper(coalesce(v_receivable.gateway_status, '')) <> 'CREATING'
      or nullif(v_receivable.gateway_boleto_codigo_barras, '') is not null
      or nullif(v_receivable.gateway_boleto_linha_digitavel, '') is not null
      or v_transaction_count > 1
      or exists (
        select 1
        from public.payment_gateway_transactions as transaction
        where transaction.receivable_id = p_receivable_id
          and transaction.provider_code = 'banese_card'
          and transaction.environment = p_environment
          and transaction.payment_method = 'BOLETO'
          and (
            round(transaction.amount::numeric, 2)
              is distinct from round(p_expected_amount, 2)
            or nullif(transaction.bank_slip_our_number, '') is not null and (
              length(regexp_replace(
                transaction.bank_slip_our_number, '\D', '', 'g'
              )) not between 1 and 9
              or lpad(regexp_replace(
                transaction.bank_slip_our_number, '\D', '', 'g'
              ), 9, '0') <> p_nosso_numero
            )
            or nullif(transaction.remote_payment_id, '') is not null and (
              length(regexp_replace(
                transaction.remote_payment_id, '\D', '', 'g'
              )) not between 1 and 9
              or lpad(regexp_replace(
                transaction.remote_payment_id, '\D', '', 'g'
              ), 9, '0') <> p_nosso_numero
            )
          )
      )
    )
  then
    raise exception 'Titulo Banese ambiguo sem tentativa canonica compativel.';
  end if;

  if exists ($new$;
  v_identity_anchor constant text := $old$  select receivable.*
  into v_receivable$old$;
  v_identity_guard constant text := $new$  if substring(
      p_remote_barcode from 10 for 10
    )::numeric is distinct from round(p_expected_amount * 100)
    or substring(p_remote_barcode from 6 for 4)::integer is distinct from (
      case
        when p_expected_due_date between date '2000-07-03' and date '2025-02-21'
          then p_expected_due_date - date '1997-10-07'
        when p_expected_due_date between date '2025-02-22' and date '2049-10-13'
          then 1000 + (p_expected_due_date - date '2025-02-22')
        else null
      end
    )
  then
    raise exception 'Valor ou vencimento codificado diverge do titulo Banese.';
  end if;
  if lower(btrim(coalesce(
      p_reconciliation #>> '{response,NumeroDocumento}',
      p_reconciliation #>> '{response,numeroDocumento}', ''
    ))) <> lower(left(p_receivable_id::text, 15))
    or lower(btrim(coalesce(
      p_reconciliation #>> '{response,IdTituloEmpresa}',
      p_reconciliation #>> '{response,idTituloEmpresa}', ''
    ))) <> lower(left(p_receivable_id::text, 25))
  then
    raise exception 'Identificadores empresariais do GET Banese divergem do recebivel.';
  end if;

  select receivable.*
  into v_receivable$new$;
begin
  if position(v_old_receivable in v_definition) = 0
    or position(v_old_transaction in v_definition) = 0
    or position(v_provenance_anchor in v_definition) = 0
    or position(v_identity_anchor in v_definition) = 0
  then
    raise exception 'Contrato inesperado em persist_banese_recovered_pix.';
  end if;

  v_definition := replace(v_definition, v_old_receivable, v_new_receivable);
  v_definition := replace(v_definition, v_old_transaction, v_new_transaction);
  v_definition := replace(v_definition, v_provenance_anchor, v_provenance_guard);
  v_definition := replace(v_definition, v_identity_anchor, v_identity_guard);
  execute v_definition;
end;
$migration$;

alter function public.persist_banese_recovered_pix(
  uuid,text,text,text,text,text,text,numeric,date,text,boolean,jsonb
) set search_path = '';
revoke all on function public.persist_banese_recovered_pix(
  uuid,text,text,text,text,text,text,numeric,date,text,boolean,jsonb
) from public, anon, authenticated;
grant execute on function public.persist_banese_recovered_pix(
  uuid,text,text,text,text,text,text,numeric,date,text,boolean,jsonb
) to service_role;
comment on function public.persist_banese_recovered_pix(
  uuid,text,text,text,text,text,text,numeric,date,text,boolean,jsonb
) is
  'Persiste Pix do GET Banese com identidade empresarial, financeira, bancaria e proveniencia atomica do POST.';

commit;
