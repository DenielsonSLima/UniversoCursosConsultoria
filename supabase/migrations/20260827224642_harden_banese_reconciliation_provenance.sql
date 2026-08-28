begin;

-- A conciliacao automatica por GET pertence exclusivamente ao fluxo que
-- possui prova de POST API. CNAB e estados sem proveniencia seguem seus
-- contratos proprios e nunca podem ser promovidos a BolePix por esta RPC.
do $migration$
declare
  v_definition text := pg_get_functiondef(
    'public.persist_banese_reconciliation_snapshot(uuid,text,text,timestamptz,text,text,numeric,date,text,text,jsonb,boolean,boolean,boolean,boolean,numeric,date,text,text,text,text,text,jsonb,jsonb,jsonb)'::regprocedure
  );
  v_anchor constant text := $old$  get diagnostics v_transaction_count = row_count;
  if v_transaction_count > 1 then$old$;
  v_guard constant text := $new$  get diagnostics v_transaction_count = row_count;
  if coalesce(v_receivable.gateway_submission_channel, '') <> 'API'
    or v_receivable.gateway_cnab_file_id is not null
    or coalesce(v_receivable.gateway_submission_status, '')
      not in ('API_REGISTERED', 'API_AMBIGUOUS')
  then
    raise exception 'Proveniencia do POST Banese insuficiente para conciliacao.';
  end if;
  if v_receivable.gateway_submission_status = 'API_REGISTERED' and (
      nullif(v_receivable.gateway_boleto_linha_digitavel, '') is null
      or nullif(v_receivable.gateway_boleto_codigo_barras, '') is null
      or v_transaction_count <> 1
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
  if v_transaction_count > 1 then$new$;
begin
  if position(v_anchor in v_definition) = 0 then
    raise exception 'Contrato inesperado em persist_banese_reconciliation_snapshot.';
  end if;
  v_definition := replace(v_definition, v_anchor, v_guard);
  execute v_definition;
end;
$migration$;

alter function public.persist_banese_reconciliation_snapshot(
  uuid,text,text,timestamptz,text,text,numeric,date,text,text,jsonb,boolean,
  boolean,boolean,boolean,numeric,date,text,text,text,text,text,jsonb,jsonb,jsonb
) set search_path = '';
revoke all on function public.persist_banese_reconciliation_snapshot(
  uuid,text,text,timestamptz,text,text,numeric,date,text,text,jsonb,boolean,
  boolean,boolean,boolean,numeric,date,text,text,text,text,text,jsonb,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.persist_banese_reconciliation_snapshot(
  uuid,text,text,timestamptz,text,text,numeric,date,text,text,jsonb,boolean,
  boolean,boolean,boolean,numeric,date,text,text,text,text,text,jsonb,jsonb,jsonb
) to service_role;

do $migration$
declare
  v_definition text := pg_get_functiondef(
    'public.banese_reconciliation_queue_receivable()'::regprocedure
  );
  v_anchor constant text := $old$    and new.gateway_environment in ('sandbox', 'production')
    and coalesce(new.gateway_boleto_nosso_numero, '') ~ '^[0-9]{9}$'$old$;
  v_guard constant text := $new$    and new.gateway_environment in ('sandbox', 'production')
    and coalesce(new.gateway_submission_channel, '') = 'API'
    and new.gateway_cnab_file_id is null
    and coalesce(new.gateway_submission_status, '')
      in ('API_REGISTERED', 'API_AMBIGUOUS')
    and (
      new.gateway_submission_status <> 'API_AMBIGUOUS'
      or (
        new.gateway_creation_token is not null
        and upper(coalesce(new.gateway_status, '')) = 'CREATING'
      )
    )
    and coalesce(new.gateway_boleto_nosso_numero, '') ~ '^[0-9]{9}$'$new$;
begin
  if position(v_anchor in v_definition) = 0 then
    raise exception 'Contrato inesperado na fila de conciliacao Banese.';
  end if;
  v_definition := replace(v_definition, v_anchor, v_guard);
  execute v_definition;
end;
$migration$;

alter function public.banese_reconciliation_queue_receivable()
  set search_path = '';
revoke all on function public.banese_reconciliation_queue_receivable()
  from public, anon, authenticated;

drop trigger if exists trg_banese_reconciliation_queue_receivable
  on public.contas_receber;
create trigger trg_banese_reconciliation_queue_receivable
after insert or update of
  gateway_provider,
  gateway_payment_method,
  gateway_environment,
  gateway_boleto_nosso_numero,
  gateway_status,
  gateway_submission_channel,
  gateway_submission_status,
  gateway_cnab_file_id,
  gateway_creation_token,
  gateway_last_error,
  status,
  turma_id,
  matricula_id
on public.contas_receber
for each row
execute function public.banese_reconciliation_queue_receivable();

commit;
