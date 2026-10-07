-- Exact waiver proof shared by progress and existing C2 eligibility.
begin;
do $baseline$
begin
 if md5(pg_get_functiondef('internal_academic.manual_cycle_issuance_progress(uuid,integer)'::regprocedure))<>'0c374866eed71a507890d586506261fb' then raise exception 'BOUNDED_WAIVER_BASELINE_DRIFT: manual_cycle_issuance_progress'; end if;
 if md5(pg_get_functiondef('internal_academic.manual_cycle_local_fee_summary(uuid)'::regprocedure))<>'42d36d8cbc410c87a96966657da2b23a' then raise exception 'BOUNDED_WAIVER_BASELINE_DRIFT: manual_cycle_local_fee_summary'; end if;
 if md5(pg_get_functiondef('internal_academic.manual_cycle_local_receivable_complete(public.contas_receber)'::regprocedure))<>'a9ae5c5fb9e4672b1821daa5f894c832' then raise exception 'BOUNDED_WAIVER_BASELINE_DRIFT: manual_cycle_local_receivable_complete'; end if;
end $baseline$;
CREATE OR REPLACE FUNCTION internal_financial_correction.original_local_complete(p_receivable contas_receber)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not internal_academic.manual_cycle_has_local_intent(p_receivable)
    or internal_academic.manual_cycle_has_bank_fields(p_receivable)
    or exists(select 1 from public.payment_gateway_transactions t where t.receivable_id=p_receivable.id)
  then return false; end if;
  perform internal_academic.assert_manual_cycle_reviewed_receivable(p_receivable);
  if p_receivable.status in ('PENDENTE','VENCIDO') then
    if p_receivable.manual_settlement_id is not null or p_receivable.manual_settlement_reversed_at is not null then
      return coalesce(internal_academic.manual_cycle_local_reversed_receivable_complete(p_receivable),false);
    end if;
    return p_receivable.data_pagamento is null and p_receivable.valor_pago is null;
  end if;
  if p_receivable.status<>'PAGO' or p_receivable.origem_pagamento is distinct from 'PRESENCIAL'
    or p_receivable.manual_settlement_reversed_at is not null then return false; end if;
  return exists(select 1 from public.receivable_manual_settlements s
    where s.id=p_receivable.manual_settlement_id and s.receivable_id=p_receivable.id
      and s.state='COMPLETED' and not s.requires_remote_cancellation
      and s.provider_code is null and s.remote_payment_id is null and s.remote_payment_link_id is null
      and s.polo_id is not distinct from p_receivable.polo_id
      and s.account_id is not distinct from p_receivable.conta_bancaria_id
      and s.payment_method is not distinct from p_receivable.forma_pagamento
      and s.payment_date=p_receivable.data_pagamento
      and s.principal_cents=round(p_receivable.valor*100)::bigint
      and s.received_cents=round(p_receivable.valor_pago*100)::bigint
      and s.principal_cents=p_receivable.manual_settlement_principal_cents
      and s.interest_cents=p_receivable.manual_settlement_interest_cents
      and s.penalty_cents=p_receivable.manual_settlement_penalty_cents
      and s.addition_cents=p_receivable.manual_settlement_addition_cents
      and s.discount_cents=p_receivable.manual_settlement_discount_cents
      and s.received_cents=p_receivable.manual_settlement_received_cents);
exception when others then return false;
end;
$function$
;
create or replace function internal_academic.manual_cycle_local_receivable_complete(p_receivable public.contas_receber)
returns boolean language sql stable security definer set search_path='' as $$
 select internal_financial_correction.original_local_complete(p_receivable) or internal_financial_correction.local_waiver_complete(p_receivable);
$$;
CREATE OR REPLACE FUNCTION internal_academic.manual_cycle_issuance_progress(p_matricula_id uuid, p_ciclo_numero integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
declare
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_polo_id uuid;
  v_aluno_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_waived numeric := 0;
  v_emitted integer := 0;
  v_review integer := 0;
  v_complete boolean;
  v_paid_issued boolean;
  v_is_local boolean;
  v_local integer:=0;
  v_banking integer;
  v_item_state text;
  v_cycle_status text;
begin
  if p_matricula_id is null or p_ciclo_numero is null
    or p_ciclo_numero not in (1, 2) then
    raise exception 'Matrícula ou ciclo inválido para retomada.'
      using errcode = '22023';
  end if;
  select run.* into strict v_run
  from internal_academic.technical_manual_cycle_runs run
  where run.matricula_id = p_matricula_id
    and run.cycle_number = p_ciclo_numero
    and run.state = 'LOCAL_CREATED';
  select class.polo_id, enrollment.aluno_id into strict v_polo_id, v_aluno_id
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  where enrollment.id = v_run.matricula_id
    and enrollment.turma_id = v_run.turma_id;

  for v_receivable in
    select receivable.* from public.contas_receber receivable
    where receivable.id = any(v_run.receivable_ids)
    order by receivable.data_vencimento, receivable.id
  loop
    v_count := v_count + 1;
    v_is_local:=internal_academic.manual_cycle_has_local_intent(v_receivable);
    if v_is_local then
      if internal_financial_correction.local_waiver_complete(v_receivable) then v_waived:=v_waived+v_receivable.valor; end if;
      if not internal_academic.manual_cycle_local_receivable_complete(v_receivable) then
        raise exception 'Matrícula local do ciclo possui estado divergente; revise a cobrança.' using errcode='23514';
      end if;
      v_local:=v_local+1;
      v_complete:=false;
      v_paid_issued:=false;
      v_item_state:='NAO_APLICAVEL';
    else
    v_complete :=
      internal_academic.technical_manual_banese_receivable_complete(v_receivable);
    v_paid_issued:=
      internal_academic.technical_manual_banese_receivable_paid_issued(v_receivable);
    if v_complete or v_paid_issued then
      v_item_state := 'EMITIDO';
      v_emitted := v_emitted + 1;
    elsif v_receivable.gateway_submission_status = 'API_REVIEW' then
      v_item_state := 'REVISAO_MANUAL'; v_review := v_review + 1;
    elsif v_receivable.gateway_submission_status is not null
      or v_receivable.gateway_creation_token is not null
      or coalesce(v_receivable.gateway_payment_id,
        v_receivable.gateway_boleto_nosso_numero) is not null
      or v_receivable.gateway_boleto_issued_at is not null
      or v_receivable.gateway_boleto_linha_digitavel is not null
      or v_receivable.gateway_boleto_codigo_barras is not null
      or v_receivable.gateway_pix_payload is not null
      or v_receivable.gateway_pix_encoded_image is not null
      or exists (select 1 from public.payment_gateway_transactions transaction
        where transaction.receivable_id = v_receivable.id)
    then
      v_item_state := 'REVISAO';
    else
      v_item_state := 'PENDENTE';
    end if;
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_receivable.id, 'chave', v_receivable.origem_cronograma_id,
      'tipo', v_receivable.tipo_lancamento,
      'numero', v_receivable.parcela_numero,
      'descricao', v_receivable.descricao,
      'valor', pg_catalog.to_char(v_receivable.valor, 'FM999999990.00'),
      'vencimento', pg_catalog.to_char(
        v_receivable.data_vencimento, 'YYYY-MM-DD'
      ), 'status', upper(v_receivable.status),
      'emissaoBanese', v_item_state,
      'emissaoHistoricaComprovada', v_paid_issued,
      'destinoCobranca', case when v_is_local then 'LOCAL' else 'BANESE' end,
      'localSemBoletoComprovado', v_is_local,
      'localFeeWaiverProven', internal_financial_correction.local_waiver_complete(v_receivable)
    ));
  end loop;
  if v_count <> v_run.item_count or v_count <> cardinality(v_run.receivable_ids)
  then
    raise exception 'Run do ciclo perdeu sua cardinalidade canônica.'
      using errcode = '23514';
  end if;
  v_banking:=v_run.item_count-v_local;
  v_cycle_status := case
    when v_emitted = v_banking and v_review = 0 then 'EMITIDO_BANESE'
    when v_review > 0 then 'EMISSAO_EM_REVISAO'
    when v_emitted > 0 then 'EMISSAO_PARCIAL'
    else 'PRONTO_PARA_EMISSAO_BANESE'
  end;
  return jsonb_build_object(
    'requestId', v_run.request_id, 'replayed', true,
    'matriculaId', v_run.matricula_id, 'turmaId', v_run.turma_id,
    'poloId', v_polo_id, 'alunoId', v_aluno_id,
    'regraFingerprint', v_run.rule_fingerprint,
    'politicaFingerprint', v_run.policy_fingerprint,
    'cronogramaFingerprint', v_run.schedule_fingerprint,
    'primeiroVencimento', v_run.first_due_date,
    'ciclo', jsonb_build_object(
      'numero', v_run.cycle_number, 'status', v_cycle_status,
      'quantidadeItens', v_run.item_count,
      'quantidadeBancaria', v_banking, 'quantidadeLocal', v_local,
      'modoMatricula', case when v_local=1 then 'REGISTRO_SEM_BOLETO'
        when v_run.cycle_number=1 and v_run.item_count=12 then 'OMITIR' else 'BOLETO' end,
      'total', pg_catalog.to_char(v_run.total_amount, 'FM999999990.00'),
      'activeTotal', pg_catalog.to_char(v_run.total_amount-v_waived, 'FM999999990.00'),
      'emitidosBanese', v_emitted,
      'pendentesEmissao', greatest(v_banking - v_emitted - v_review, 0),
      'emRevisao', v_review, 'recebiveis', v_items
    ),
    'cicloManual', internal_academic.technical_manual_cycle_state(
      v_run.matricula_id
    )
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION internal_academic.manual_cycle_local_fee_summary(p_matricula_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('id',r.id,'chave',r.origem_cronograma_id,'tipo',r.tipo_lancamento,
    'numero',r.parcela_numero,'descricao',r.descricao,'valor',to_char(r.valor,'FM999999990.00'),
    'vencimento',to_char(r.data_vencimento,'YYYY-MM-DD'),'status',r.status,
    'destinoCobranca','LOCAL','emissaoBanese','NAO_APLICAVEL','localSemBoletoComprovado',true,
    'emissaoHistoricaComprovada',false,'localFeeWaiverProven',internal_financial_correction.local_waiver_complete(r))
  from internal_academic.technical_manual_cycle_runs run
  join public.contas_receber r on r.id=any(run.receivable_ids)
  where run.matricula_id=p_matricula_id and run.cycle_number=1 and run.state='LOCAL_CREATED'
    and internal_academic.manual_cycle_local_receivable_complete(r)
  limit 1;
$function$
;
revoke all on all functions in schema internal_financial_correction from public,anon,authenticated,service_role;
commit;

