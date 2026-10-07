-- LOCAL DRAFT. Exact canonical baselines; old one-off behavior is retained.
begin;
do $baseline$
begin
 if md5(pg_get_functiondef('internal_academic.technical_manual_cycle_state(uuid)'::regprocedure)) <> 'bb60c9f3e9541e7a940715dbd10d6e48' then raise exception 'BOUNDED_BASELINE_DRIFT: technical_manual_cycle_state'; end if;
 if md5(pg_get_functiondef('public.enforce_receivable_gateway_submission_fence()'::regprocedure)) <> '625dc2db11bc6c71afb21e10b778b1a4' then raise exception 'BOUNDED_BASELINE_DRIFT: enforce_receivable_gateway_submission_fence'; end if;
 if md5(pg_get_functiondef('internal_academic.assert_manual_cycle_reviewed_receivable(public.contas_receber)'::regprocedure)) <> 'e82cf78d0e455aa84501f8d0eadc9408' then raise exception 'BOUNDED_BASELINE_DRIFT: assert_manual_cycle_reviewed_receivable'; end if;
 if md5(pg_get_functiondef('internal_academic.guard_manual_cycle_reviewed_identity()'::regprocedure)) <> 'c4c2f02fa7aec70ed16995e69b42c9d2' then raise exception 'BOUNDED_BASELINE_DRIFT: guard_manual_cycle_reviewed_identity'; end if;
end $baseline$;
CREATE OR REPLACE FUNCTION internal_academic.assert_manual_cycle_reviewed_receivable(p_receivable contas_receber)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_matches integer;
  v_overlay_matches integer;
begin
  if internal_financial_correction.corrected_receivable_valid(p_receivable) then return; end if;
  select run.* into v_run
  from internal_academic.technical_manual_cycle_runs run
  where p_receivable.id = any(run.receivable_ids) and run.state = 'LOCAL_CREATED';
  if v_run.reviewed_items is null then return; end if;
  select count(*) into v_matches from jsonb_array_elements(v_run.reviewed_items) item
  where item->>'chave' = p_receivable.origem_cronograma_id
    and (item->>'vencimento')::date = p_receivable.data_vencimento
    and (item->>'valor')::numeric = p_receivable.valor
    and item->>'tipo' = p_receivable.tipo_lancamento
    and (item->>'numero')::integer = p_receivable.parcela_numero
    and coalesce(item->>'destinoCobranca', 'BANESE') = coalesce(
      p_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca',
      'BANESE');
  select count(*) into v_overlay_matches
  from internal_academic.technical_manual_banese_due_date_overlay overlay
  cross join lateral jsonb_array_elements(v_run.reviewed_items) item
  where overlay.receivable_id = p_receivable.id
    and overlay.matricula_id = v_run.matricula_id
    and overlay.turma_id = v_run.turma_id
    and overlay.cycle_number = v_run.cycle_number
    and overlay.cycle_request_id = v_run.request_id
    and overlay.expected_item_count = v_run.item_count
    and overlay.reviewed_item_key = item->>'chave'
    and overlay.original_due_date = (item->>'vencimento')::date
    and overlay.corrected_due_date = p_receivable.data_vencimento
    and item->>'chave' = p_receivable.origem_cronograma_id
    and (item->>'valor')::numeric = p_receivable.valor
    and item->>'tipo' = p_receivable.tipo_lancamento
    and (item->>'numero')::integer = p_receivable.parcela_numero
    and coalesce(item->>'destinoCobranca', 'BANESE') = coalesce(
      p_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca',
      'BANESE');
  if (v_matches <> 1 and v_overlay_matches <> 1)
    or v_run.matricula_id is distinct from p_receivable.matricula_id
    or v_run.turma_id is distinct from p_receivable.turma_id
    or p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}'
      is distinct from v_run.request_id::text
    or p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,cicloNumero}'
      is distinct from v_run.cycle_number::text
    or p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,regraFingerprint}'
      is distinct from v_run.rule_fingerprint
    or p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,politicaFingerprint}'
      is distinct from v_run.policy_fingerprint
    or p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,cronogramaFingerprint}'
      is distinct from v_run.schedule_fingerprint
    or not exists(select 1 from public.matriculas m join public.turmas t on t.id=m.turma_id
      where m.id=v_run.matricula_id and m.turma_id=v_run.turma_id
        and m.aluno_id=p_receivable.cliente_id and t.polo_id=p_receivable.polo_id)
  then
    raise exception 'Recebível diverge da revisão canônica do ciclo manual.'
      using errcode = '23514';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION internal_academic.guard_manual_cycle_reviewed_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if internal_financial_correction.reset_transition_valid(old,new) then return new; end if;
  if row(new.id,new.cliente_id,new.matricula_id,new.turma_id,new.polo_id,
      new.tipo_lancamento,new.origem_cronograma_id,new.parcela_numero,new.valor,new.data_vencimento)
    is distinct from row(old.id,old.cliente_id,old.matricula_id,old.turma_id,old.polo_id,
      old.tipo_lancamento,old.origem_cronograma_id,old.parcela_numero,old.valor,old.data_vencimento)
    and exists(select 1 from internal_academic.technical_manual_cycle_runs run
      where old.id=any(run.receivable_ids) and run.reviewed_items is not null)
    and not (
      row(new.id,new.cliente_id,new.matricula_id,new.turma_id,new.polo_id,
        new.tipo_lancamento,new.origem_cronograma_id,new.parcela_numero,new.valor)
      is not distinct from row(old.id,old.cliente_id,old.matricula_id,old.turma_id,old.polo_id,
        old.tipo_lancamento,old.origem_cronograma_id,old.parcela_numero,old.valor)
      and new.data_vencimento is distinct from old.data_vencimento
      and internal_academic.technical_manual_due_date_correction_bypass_valid(old.id)
    )
  then
    raise exception 'A identidade e o vencimento revisados do ciclo manual são imutáveis.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_receivable_gateway_submission_fence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reset_fields text[] := array[
    'gateway_payment_id', 'gateway_customer_id', 'gateway_payment_link_id',
    'gateway_installment_id', 'gateway_status', 'gateway_invoice_url',
    'gateway_bank_slip_url', 'gateway_pix_payload',
    'gateway_pix_encoded_image', 'gateway_transaction_receipt_url',
    'gateway_fee_value', 'gateway_net_value', 'gateway_synced_at',
    'gateway_last_error', 'gateway_boleto_linha_digitavel',
    'gateway_boleto_codigo_barras', 'gateway_boleto_nosso_numero',
    'gateway_boleto_issued_at', 'gateway_financial_terms_confirmed_at',
    'gateway_creation_token', 'gateway_submission_channel',
    'gateway_submission_status', 'gateway_cnab_file_id'
  ];
begin
  if internal_financial_correction.reset_transition_valid(old,new) then return new; end if;
  if internal_academic.technical_manual_due_date_correction_bypass_valid(old.id)
    and old.gateway_submission_channel = 'API'
    and old.gateway_submission_status = 'API_REGISTERED'
    and old.data_vencimento = date '2027-10-15'
    and new.data_vencimento = date '2026-10-15'
    and new.gateway_submission_channel is null
    and new.gateway_submission_status is null
    and new.gateway_cnab_file_id is null
    and new.gateway_creation_token is null
    and new.gateway_status is null
    and new.gateway_payment_id is null
    and new.gateway_customer_id is null
    and new.gateway_payment_link_id is null
    and new.gateway_installment_id is null
    and new.gateway_invoice_url is null
    and new.gateway_bank_slip_url is null
    and new.gateway_transaction_receipt_url is null
    and new.gateway_fee_value is null
    and new.gateway_net_value is null
    and new.gateway_synced_at is null
    and new.gateway_last_error is null
    and new.gateway_boleto_nosso_numero is null
    and new.gateway_boleto_issued_at is null
    and new.gateway_boleto_linha_digitavel is null
    and new.gateway_boleto_codigo_barras is null
    and new.gateway_pix_payload is null
    and new.gateway_pix_encoded_image is null
    and new.gateway_financial_terms_confirmed_at is null
    and new.gateway_financial_terms =
      internal_academic.technical_manual_banese_expected_terms(new)
    and new.updated_at > old.updated_at
    and to_jsonb(new) - (
      v_reset_fields || array[
        'updated_at', 'data_vencimento', 'gateway_financial_terms'
      ]) is not distinct from to_jsonb(old) - (
      v_reset_fields || array[
        'updated_at', 'data_vencimento', 'gateway_financial_terms'
      ])
  then
    return new;
  end if;
  if internal_academic.technical_manual_banese_reissue_bypass_valid(old.id)
    and old.gateway_submission_channel = 'API'
    and old.gateway_submission_status = 'API_REVIEW'
    and new.gateway_submission_channel is null
    and new.gateway_submission_status is null
    and new.gateway_cnab_file_id is null
    and new.gateway_creation_token is null
    and new.gateway_status is null
    and new.gateway_payment_id is null
    and new.gateway_customer_id is null
    and new.gateway_payment_link_id is null
    and new.gateway_installment_id is null
    and new.gateway_invoice_url is null
    and new.gateway_bank_slip_url is null
    and new.gateway_transaction_receipt_url is null
    and new.gateway_fee_value is null
    and new.gateway_net_value is null
    and new.gateway_synced_at is null
    and new.gateway_last_error is null
    and new.gateway_boleto_nosso_numero is null
    and new.gateway_boleto_issued_at is null
    and new.gateway_boleto_linha_digitavel is null
    and new.gateway_boleto_codigo_barras is null
    and new.gateway_pix_payload is null
    and new.gateway_pix_encoded_image is null
    and new.gateway_financial_terms_confirmed_at is null
    and new.gateway_financial_terms is not distinct from old.gateway_financial_terms
    and new.updated_at > old.updated_at
    and to_jsonb(new) - (v_reset_fields || array['updated_at'])
      is not distinct from
      to_jsonb(old) - (v_reset_fields || array['updated_at'])
  then
    return new;
  end if;
  if public.banese_ead_replacement_bypass_valid(old.id)
    and new.gateway_payment_id is null
    and new.gateway_payment_link_id is null
    and new.gateway_submission_channel is null
    and new.gateway_submission_status is null
    and new.gateway_cnab_file_id is null
    and new.gateway_financial_terms is null
    and new.gateway_financial_terms_confirmed_at is null
    and new.gateway_boleto_issued_at is null
    and new.gateway_boleto_linha_digitavel is null
    and new.gateway_boleto_codigo_barras is null
    and new.gateway_invoice_url is null and new.gateway_bank_slip_url is null
  then
    return new;
  end if;
  if old.gateway_submission_channel is null
    and new.gateway_submission_channel is null
    and old.gateway_submission_status is null
    and new.gateway_submission_status is null
    and new.gateway_cnab_file_id is null
    and new.gateway_provider = 'banese_card'
    and (new.gateway_boleto_issued_at is not null
      or new.gateway_payment_id is not null
      or new.gateway_payment_link_id is not null
      or new.gateway_boleto_linha_digitavel is not null
      or new.gateway_boleto_codigo_barras is not null
      or new.gateway_invoice_url is not null
      or new.gateway_bank_slip_url is not null)
  then
    new.gateway_submission_channel := 'API';
    new.gateway_submission_status := 'API_REGISTERED';
  end if;
  if old.gateway_submission_channel is not null
    and new.gateway_submission_channel is distinct from
      old.gateway_submission_channel
  then
    raise exception
      'O canal de registro externo do titulo nao pode ser trocado depois do claim.'
      using errcode = '23514';
  end if;
  if old.gateway_cnab_file_id is not null
    and new.gateway_cnab_file_id is distinct from old.gateway_cnab_file_id
  then
    raise exception 'A remessa CNAB vinculada ao titulo e imutavel.'
      using errcode = '23514';
  end if;
  if old.gateway_submission_channel = 'CNAB' and (
    new.gateway_financial_terms is distinct from old.gateway_financial_terms
    or new.gateway_financial_terms_confirmed_at is distinct from
      old.gateway_financial_terms_confirmed_at)
  then
    raise exception 'O snapshot financeiro da remessa CNAB e imutavel.'
      using errcode = '23514';
  end if;
  if old.gateway_submission_status is not null
    and new.gateway_submission_status is distinct from
      old.gateway_submission_status
    and not coalesce(case old.gateway_submission_status
      when 'API_AMBIGUOUS' then new.gateway_submission_status in
        ('API_REGISTERED', 'API_REVIEW')
      when 'API_REGISTERED' then false
      when 'API_REVIEW' then
        (
          coalesce(auth.role(), '') = 'service_role'
          or session_user in ('postgres', 'supabase_admin', 'service_role')
        )
        and new.gateway_submission_status = 'API_AMBIGUOUS'
        and current_setting(
          'app.technical_manual_cycle_review_reopen_receivable_id', true
        ) = old.id::text
        and old.gateway_submission_channel = 'API'
        and new.gateway_submission_channel = 'API'
        and new.gateway_creation_token is not distinct from
          old.gateway_creation_token
        and new.gateway_boleto_nosso_numero is not distinct from
          old.gateway_boleto_nosso_numero
      when 'CNAB_GENERATED' then new.gateway_submission_status in
        ('CNAB_SENT', 'CNAB_REGISTERED', 'CNAB_REJECTED')
      when 'CNAB_SENT' then new.gateway_submission_status in
        ('CNAB_REGISTERED', 'CNAB_REJECTED')
      when 'CNAB_REGISTERED' then new.gateway_submission_status =
        'CNAB_REJECTED'
      when 'CNAB_REJECTED' then new.gateway_submission_status =
        'CNAB_REGISTERED'
      else false end, false)
  then
    raise exception
      'Transicao invalida no fencing de registro externo do titulo.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION internal_financial_correction.original_cycle_state(p_matricula_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_state jsonb;
begin
  v_state := internal_academic
    .technical_manual_cycle_state_before_durable_imported_history(
      p_matricula_id
    );
  if internal_academic.technical_imported_cycle_exists(p_matricula_id, 2) then
    if v_state ->> 'estado' in (
      'PROTEGIDO_EXISTENTE', 'JA_GERADO', 'CICLOS_CONCLUIDOS'
    ) then
      return v_state - 'conferenciaProesc';
    end if;
    return (v_state - 'conferenciaProesc') || jsonb_build_object(
      'estado', 'BLOQUEADO', 'podeGerar', false,
      'proximoCicloNumero', null, 'primeiroVencimentoSugerido', null,
      'bloqueio', jsonb_build_object(
        'codigo', case
          when internal_academic.technical_imported_cycle_has_conflict(
            p_matricula_id
          ) then 'CICLO_IMPORTADO_ORIGENS_CONFLITANTES'
          else 'PROESC_CONTRATO_EXTERNO'
        end,
        'mensagem', 'O segundo ciclo já possui cobertura confirmada.'
      )
    );
  end if;
  if internal_academic.technical_imported_cycle_has_conflict(p_matricula_id) then
    return (v_state - 'conferenciaProesc') || jsonb_build_object(
      'estado', 'BLOQUEADO', 'podeGerar', false,
      'bloqueio', jsonb_build_object(
        'codigo', 'HISTORICO_IMPORTADO_IDENTIDADE_DIVERGENTE',
        'mensagem', 'A identidade ou a origem do histórico exige revisão.'
      )
    );
  end if;
  if internal_academic.technical_imported_cycle_generation_permitted(
      p_matricula_id
    )
    and v_state ->> 'estado' not in ('JA_GERADO', 'CICLOS_CONCLUIDOS')
    and (v_state ->> 'estado' <> 'PROTEGIDO_EXISTENTE'
      or internal_academic.technical_imported_banese_cycle_is_durable(
        p_matricula_id, 1
      ))
    and coalesce(v_state #>> '{bloqueio,codigo}', '') not in (
      'STATUS_ACADEMICO', 'SEM_CONFIGURACAO'
    )
  then
    return (v_state - 'conferenciaProesc') || jsonb_build_object(
      'estado', 'ELEGIVEL', 'podeGerar', true,
      'cicloBaseHistorico', 1, 'proximoCicloNumero', 2,
      'primeiroVencimentoSugerido', null, 'bloqueio', null,
      'criterioElegibilidade', 'HISTORICO_EXTERNO'
    );
  end if;
  return v_state;
end;
$function$;

create or replace function internal_academic.technical_manual_cycle_state(p_matricula_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare base jsonb; correction jsonb; waived public.contas_receber%rowtype;
begin
 base:=internal_financial_correction.original_cycle_state(p_matricula_id);
 if base#>>'{cicloGerado,numero}'='1' then
  select r.* into waived from public.contas_receber r where r.matricula_id=p_matricula_id and internal_financial_correction.local_waiver_complete(r);
  if found then base:=jsonb_set(base,'{cicloGerado,activeTotal}',to_jsonb(to_char((base#>>'{cicloGerado,total}')::numeric-waived.valor,'FM999999990.00'))); end if;
 end if;
 correction:=internal_financial_correction.state_summary(p_matricula_id);
 if correction is null then return base; end if;
 -- After a completed C1-only correction, preserve ordinary canonical C2
 -- eligibility. A canceled historical C2 never receives this continuation.
 if correction->>'status'='COMPLETE' and (correction->>'historicalCycle2Count')::integer=0 then
  return base||jsonb_build_object('correcaoEmissao',correction);
 end if;
 return base||jsonb_build_object('podeGerar',false,'proximoCicloNumero',null,'correcaoEmissao',correction);
end $$;
revoke all on all functions in schema internal_financial_correction from public,anon,authenticated,service_role;
commit;

