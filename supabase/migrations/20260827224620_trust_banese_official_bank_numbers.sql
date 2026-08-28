begin;

-- O GET oficial por Nosso Numero pode corrigir linha e codigo gerados
-- localmente. A troca continua condicionada ao par remoto autoconsistente,
-- ao Nosso Numero embutido, ao contrato financeiro e ao CAS do recebivel.
do $migration$
declare
  v_definition text := pg_get_functiondef(
    'public.persist_banese_recovered_pix(uuid,text,text,text,text,text,text,numeric,date,text,boolean,jsonb)'::regprocedure
  );
  v_old_receivable constant text := $old$  if (
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
  end if;$old$;
  v_new_receivable constant text := $new$  if (
      coalesce(nullif(v_receivable.gateway_boleto_linha_digitavel, ''), p_remote_digitable_line)
        <> p_remote_digitable_line
      or coalesce(nullif(v_receivable.gateway_boleto_codigo_barras, ''), p_remote_barcode)
        <> p_remote_barcode
    )
    and not coalesce(p_replace_invalid_digitable_line, false)
  then
    raise exception 'Numeros bancarios Banese divergentes na persistencia Pix.';
  end if;$new$;
  v_old_financial_identity constant text := $old$  if p_expected_amount is null
    or p_expected_amount <= 0
    or p_expected_due_date is null
    or coalesce(p_expected_convenio, '') !~ '^[0-9]{1,20}$'
  then
    raise exception 'Snapshot canonico Banese invalido para persistencia Pix.';
  end if;$old$;
  v_new_financial_identity constant text := $new$  if p_expected_amount is null
    or p_expected_amount <= 0
    or p_expected_due_date is null
    or coalesce(p_expected_convenio, '') !~ '^[0-9]{1,20}$'
  then
    raise exception 'Snapshot canonico Banese invalido para persistencia Pix.';
  end if;
  if substring(p_remote_barcode from 10 for 10)::numeric
      is distinct from round(p_expected_amount * 100)
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
    raise exception 'Valor ou vencimento do codigo de barras Banese diverge do titulo.';
  end if;$new$;
  v_old_transaction_amount constant text := $old$      and (
        (
          nullif(transaction.bank_slip_our_number, '') is not null$old$;
  v_new_transaction_amount constant text := $new$      and (
        round(transaction.amount, 2) is distinct from round(p_expected_amount, 2)
        or (
          nullif(transaction.bank_slip_our_number, '') is not null$new$;
  v_old_transaction constant text := $old$        or (
          coalesce(nullif(transaction.bank_slip_digitable_line, ''), p_remote_digitable_line)
            <> p_remote_digitable_line
          and not (
            coalesce(p_replace_invalid_digitable_line, false)
            and nullif(transaction.bank_slip_barcode, '') = p_remote_barcode
          )
        )
        or coalesce(nullif(transaction.bank_slip_barcode, ''), p_remote_barcode)
          <> p_remote_barcode$old$;
  v_new_transaction constant text := $new$        or (
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
        )$new$;
begin
  if position(v_old_receivable in v_definition) = 0
    or position(v_old_financial_identity in v_definition) = 0
    or position(v_old_transaction_amount in v_definition) = 0
    or position(v_old_transaction in v_definition) = 0
  then
    raise exception 'Contrato inesperado em persist_banese_recovered_pix.';
  end if;

  v_definition := replace(v_definition, v_old_receivable, v_new_receivable);
  v_definition := replace(
    v_definition,
    v_old_financial_identity,
    v_new_financial_identity
  );
  v_definition := replace(
    v_definition,
    v_old_transaction_amount,
    v_new_transaction_amount
  );
  v_definition := replace(v_definition, v_old_transaction, v_new_transaction);
  execute v_definition;
end;
$migration$;

alter function public.persist_banese_recovered_pix(
  uuid, text, text, text, text, text, text, numeric, date, text, boolean, jsonb
) set search_path = '';

revoke all on function public.persist_banese_recovered_pix(
  uuid, text, text, text, text, text, text, numeric, date, text, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.persist_banese_recovered_pix(
  uuid, text, text, text, text, text, text, numeric, date, text, boolean, jsonb
) to service_role;

comment on function public.persist_banese_recovered_pix(
  uuid, text, text, text, text, text, text, numeric, date, text, boolean, jsonb
) is
  'Persiste Pix e numeros oficiais do GET Banese por Nosso Numero com identidade, contrato financeiro, CAS e locks.';

commit;
