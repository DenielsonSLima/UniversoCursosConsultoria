begin;
set local lock_timeout = '5s';

create unique index if not exists
  payment_gateway_transactions_banese_receivable_uidx
on public.payment_gateway_transactions(receivable_id)
where provider_code = 'banese_card' and receivable_id is not null;

create or replace function
internal_academic.technical_manual_receivable_issuance_fingerprint(
  p_receivable public.contas_receber
)
returns text
language sql
immutable
security invoker
set search_path = ''
as $function$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        case
          when coalesce(
            (p_receivable.regra_financeira_tecnica_snapshot
              ->> 'versao')::integer,
            1
          ) >= 2
          then jsonb_build_object(
            'versao', 2,
            'receivableId', p_receivable.id,
            'matriculaId', p_receivable.matricula_id,
            'turmaId', p_receivable.turma_id,
            'poloId', p_receivable.polo_id,
            'clienteId', p_receivable.cliente_id,
            'tipo', p_receivable.tipo_lancamento,
            'parcelaNumero', p_receivable.parcela_numero,
            'origem', p_receivable.origem_cronograma_id,
            'descricao', p_receivable.descricao,
            'valor', pg_catalog.round(p_receivable.valor::numeric, 2),
            'vencimento', p_receivable.data_vencimento,
            'formaPagamento', p_receivable.forma_pagamento,
            'gatewayMetodo', p_receivable.gateway_payment_method,
            'snapshot', p_receivable.regra_financeira_tecnica_snapshot
          )
          else jsonb_build_object(
            'versao', 1,
            'receivableId', p_receivable.id,
            'matriculaId', p_receivable.matricula_id,
            'turmaId', p_receivable.turma_id,
            'poloId', p_receivable.polo_id,
            'clienteId', p_receivable.cliente_id,
            'tipo', p_receivable.tipo_lancamento,
            'parcelaNumero', p_receivable.parcela_numero,
            'origem', p_receivable.origem_cronograma_id,
            'descricao', p_receivable.descricao,
            'valor', pg_catalog.round(p_receivable.valor::numeric, 2),
            'vencimento', p_receivable.data_vencimento
          )
        end::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$function$;

revoke all on function
  internal_academic.technical_manual_receivable_issuance_fingerprint(
    public.contas_receber
  ) from public, anon, authenticated, service_role;

create or replace function
public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(
  p_matricula_id uuid,
  p_ciclo_numero integer,
  p_primeiro_vencimento date,
  p_request_id uuid,
  p_expected_regra_fingerprint text,
  p_expected_politica_fingerprint text,
  p_expected_cronograma_fingerprint text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_receivable jsonb;
  v_receivable_id uuid;
  v_updated integer := 0;
  v_receivables jsonb := '[]'::jsonb;
begin
  v_result := public.gerar_ciclo_financeiro_tecnico_manual_secure(
    p_matricula_id,
    p_ciclo_numero,
    p_primeiro_vencimento,
    p_request_id,
    p_expected_regra_fingerprint,
    p_expected_politica_fingerprint,
    p_expected_cronograma_fingerprint
  );

  for v_receivable in
    select item from jsonb_array_elements(v_result -> 'ciclo' -> 'recebiveis')
      as item
  loop
    v_receivable_id := (v_receivable ->> 'id')::uuid;
    update public.contas_receber receivable
    set forma_pagamento = 'BOLETO',
        gateway_payment_method = 'BOLETO',
        updated_at = case
          when receivable.forma_pagamento is distinct from 'BOLETO'
            or receivable.gateway_payment_method is distinct from 'BOLETO'
          then clock_timestamp()
          else receivable.updated_at
        end
    where receivable.id = v_receivable_id
      and receivable.matricula_id = p_matricula_id
      and upper(coalesce(receivable.status, '')) in ('PENDENTE', 'VENCIDO')
      and coalesce(receivable.forma_pagamento, 'BOLETO') = 'BOLETO'
      and coalesce(receivable.gateway_payment_method, 'BOLETO') = 'BOLETO'
      and receivable.gateway_payment_id is null
      and receivable.gateway_payment_link_id is null
      and receivable.gateway_submission_status is null;
    if not found then
      if not exists (
        select 1 from public.contas_receber receivable
        where receivable.id = v_receivable_id
          and receivable.matricula_id = p_matricula_id
          and receivable.forma_pagamento = 'BOLETO'
          and receivable.gateway_payment_method = 'BOLETO'
          and receivable.gateway_provider = 'banese_card'
          and receivable.gateway_environment = 'production'
          and receivable.gateway_submission_status = 'API_REGISTERED'
      ) then
        raise exception 'Recebível do ciclo não pode ser preparado para BolePix.'
          using errcode = '40001';
      end if;
    end if;
    v_updated := v_updated + 1;
    v_receivables := v_receivables || jsonb_build_array(
      (v_receivable - 'emissaoBanese') || jsonb_build_object(
        'emissaoBanese', case
          when exists (
            select 1 from public.contas_receber receivable
            where receivable.id = v_receivable_id
              and receivable.gateway_submission_status = 'API_REGISTERED'
          ) then 'EMITIDO'
          else 'PENDENTE'
        end
      )
    );
  end loop;

  if v_updated <> (v_result -> 'ciclo' ->> 'quantidadeItens')::integer then
    raise exception 'A preparação Banese não cobriu todos os recebíveis.'
      using errcode = 'P0001';
  end if;

  perform public.registrar_turma_financeiro_auditoria(
    p_matricula_id,
    'CICLO_TECNICO_MANUAL_PREPARADO_BANESE',
    jsonb_build_object(
      'cicloNumero', p_ciclo_numero,
      'quantidadeItens', v_updated,
      'requestId', p_request_id,
      'metodo', 'BOLETO',
      'ambienteExigido', 'production'
    ),
    'Confirmação única preparou todos os itens para emissão sequencial BolePix.'
  );

  return jsonb_set(
    jsonb_set(
      v_result,
      '{ciclo,status}',
      to_jsonb('PRONTO_PARA_EMISSAO_BANESE'::text),
      true
    ),
    '{ciclo,recebiveis}',
    v_receivables,
    true
  );
end;
$function$;

revoke all on function
  public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(
    uuid, integer, date, uuid, text, text, text
  ) from public, anon, authenticated, service_role;
grant execute on function
  public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(
    uuid, integer, date, uuid, text, text, text
  ) to authenticated, service_role;

create or replace function
internal_academic.guard_manual_technical_banese_atomic_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_context text;
  v_transaction_count integer;
begin
  if new.gateway_submission_status is not distinct from
      old.gateway_submission_status
    or new.gateway_submission_status <> 'API_REGISTERED'
    or not exists (
      select 1
      from internal_academic.technical_manual_cycle_runs run
      where new.id = any(run.receivable_ids)
        and run.matricula_id = new.matricula_id
        and run.turma_id = new.turma_id
        and run.state = 'LOCAL_CREATED'
    )
  then
    return new;
  end if;

  v_context := nullif(current_setting(
    'app.technical_manual_cycle_atomic_receivable_id', true
  ), '');
  if v_context is distinct from new.id::text
    or new.gateway_provider <> 'banese_card'
    or new.gateway_environment <> 'production'
    or new.gateway_payment_method <> 'BOLETO'
    or new.forma_pagamento <> 'BOLETO'
    or new.gateway_boleto_issued_at is null
    or new.gateway_financial_terms is null
    or new.gateway_financial_terms_confirmed_at is null
    or coalesce(new.gateway_payment_id, '') !~ '^[0-9]{9}$'
    or coalesce(new.gateway_boleto_nosso_numero, '') !~ '^[0-9]{9}$'
    or coalesce(new.gateway_boleto_linha_digitavel, '') !~ '^[0-9]{47}$'
    or coalesce(new.gateway_boleto_codigo_barras, '') !~ '^[0-9]{44}$'
    or length(btrim(coalesce(new.gateway_pix_payload, ''))) not between 30 and 600
    or length(btrim(coalesce(new.gateway_pix_encoded_image, '')))
      not between 32 and 1500022
  then
    raise exception 'Conclusão BolePix do ciclo manual está incompleta.'
      using errcode = '23514';
  end if;

  select count(*)::integer into v_transaction_count
  from public.payment_gateway_transactions transaction
  where transaction.receivable_id = new.id
    and transaction.provider_code = 'banese_card'
    and transaction.environment = 'production'
    and transaction.payment_method = 'BOLETO'
    and transaction.remote_payment_id = new.gateway_payment_id
    and transaction.bank_slip_our_number = new.gateway_boleto_nosso_numero
    and transaction.bank_slip_digitable_line =
      new.gateway_boleto_linha_digitavel
    and transaction.bank_slip_barcode = new.gateway_boleto_codigo_barras
    and transaction.pix_payload = new.gateway_pix_payload
    and transaction.pix_encoded_image = new.gateway_pix_encoded_image;
  if v_transaction_count <> 1 then
    raise exception 'Conclusão BolePix exige exatamente uma transação canônica.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function
  internal_academic.guard_manual_technical_banese_atomic_completion()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_manual_technical_banese_atomic_completion
  on public.contas_receber;
create trigger guard_manual_technical_banese_atomic_completion
before update of gateway_submission_status on public.contas_receber
for each row execute function
  internal_academic.guard_manual_technical_banese_atomic_completion();

comment on function
  public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(
    uuid, integer, date, uuid, text, text, text
  ) is 'Cria/reutiliza o ciclo e congela BOLETO antes da saga BolePix de um clique.';

notify pgrst, 'reload schema';
commit;
