-- A complete external second cycle does not require importing its first cycle.
-- No financial title, payment, academic status or bank operation is changed.
begin;

alter table internal_academic.technical_external_cycle_coverage
  drop constraint technical_external_cycle_coverage_scope_check,
  drop constraint technical_external_cycle_coverage_item_count_check,
  drop constraint technical_external_cycle_coverage_installment_count_check,
  drop constraint technical_external_cycle_coverage_total_amount_check,
  add constraint technical_external_cycle_coverage_contract_shape_check check (
    (scope='CONTRATO_COMPLETO' and item_count=25 and installment_count=24 and total_amount=6817.60)
    or (scope='SEGUNDO_CICLO' and item_count=13 and installment_count=12 and total_amount=3458.80)
  );

-- Private validation called only inside the existing authorized/CAS-locked RPC.
-- The receipt is an explicitly identified transcription, never a fabricated file hash.
create function internal_proesc.assert_external_second_cycle_only(
  p_matricula_id uuid,p_source jsonb,p_observed timestamptz
) returns void language plpgsql security definer set search_path='' as $$
declare
  v_context jsonb:=internal_proesc.cycle_review_context(p_matricula_id);
  v_cache internal_proesc.cycle_review_cache%rowtype;
  v_receipt jsonb:=p_source->'firstCycleReceipt';
  v_items jsonb:=p_source->'obligations';
  v_fee date; v_first date; v_prior_due date; v_prior_paid date;
  v_count integer;
begin
  if p_source->>'scope' is distinct from 'SEGUNDO_CICLO'
    or p_source->>'criterion' is distinct from 'API_PLAN_WITH_PRIOR_CYCLE_RECEIPT'
    or p_source->'completeSecondCycle' is distinct from 'true'::jsonb
    or p_source->'completeContract' is not distinct from 'true'::jsonb
    or p_source->>'firstInstallmentCount' is distinct from '0'
    or p_source->>'secondInstallmentCount' is distinct from '12'
    or jsonb_typeof(v_receipt) is distinct from 'object'
    or jsonb_typeof(v_items) is distinct from 'array'
    or not coalesce(p_source->>'cacheId' ~ '^[0-9a-fA-F-]{36}$'
      and p_source->>'sourceHash' ~ '^[0-9a-f]{64}$',false) then
    raise exception 'Cobertura isolada exige prova completa e explícita do segundo ciclo.' using errcode='22023';
  end if;
  if v_receipt->>'kind' is distinct from 'USER_RECEIPT_TRANSCRIPTION'
    or v_receipt->>'issuer' is distinct from 'PROESC'
    or v_receipt->>'personHash' is distinct from v_context->>'personHash'
    or v_receipt->>'classId' is distinct from v_context->>'classId'
    or v_receipt->>'unitId' is distinct from v_context->>'unitId'
    or v_receipt->>'cycle' is distinct from 'FIRST'
    or v_receipt->>'ordinal' is distinct from '12'
    or v_receipt->>'installmentCount' is distinct from '12'
    or v_receipt->>'principalCents' is distinct from '27990'
    or not coalesce(v_receipt->>'documentReference' ~ '^[0-9A-Za-z-]{12,100}$'
      and v_receipt->>'sourceEnrollmentReference' ~ '^[1-9][0-9]*$'
      and v_receipt->>'paidCents' ~ '^[1-9][0-9]*$'
      and v_receipt->>'dueDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and v_receipt->>'paidDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and v_receipt->>'issuedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
      and v_receipt->>'transcriptionHash' ~ '^[0-9a-f]{64}$',false)
    or v_receipt->>'transcriptionHash' is distinct from encode(extensions.digest(
      (v_receipt-'transcriptionHash')::text,'sha256'),'hex') then
    raise exception 'Comprovante do primeiro ciclo ausente ou divergente da transcrição identificada.' using errcode='22023';
  end if;
  v_prior_due:=(v_receipt->>'dueDate')::date;
  v_prior_paid:=(v_receipt->>'paidDate')::date;
  if not isfinite(v_prior_due) or not isfinite(v_prior_paid)
    or not isfinite((v_receipt->>'issuedAt')::timestamptz)
    or v_prior_paid>(v_receipt->>'issuedAt')::timestamptz::date
    or (v_receipt->>'issuedAt')::timestamptz>now()+interval '5 minutes' then
    raise exception 'Datas documentais do primeiro ciclo inconsistentes.' using errcode='22023'; end if;
  select * into strict v_cache from internal_proesc.cycle_review_cache
    where id=(p_source->>'cacheId')::uuid for share;
  -- This records historical C2 presence. It never grants C1 or refreshes a clock.
  if v_cache.state<>'COMPLETE' or v_cache.completed_at is null
    or v_cache.token_revision is distinct from (select revision from internal_proesc.connection where id)
    or v_cache.unit_id is distinct from v_context->>'unitId'
    or v_cache.class_ids is distinct from v_context->'classIds'
    or v_cache.first_year is distinct from (v_context->>'firstYear')::integer
    or v_cache.last_year is distinct from (v_context->>'lastYear')::integer
    or v_cache.source_hash is distinct from p_source->>'sourceHash'
    or p_source->>'artifactHash' is distinct from v_cache.source_hash
    or v_cache.observed_at is distinct from p_observed
    or p_source->>'academicFingerprint' is distinct from v_context->>'academicFingerprint'
    or p_source->>'classStartDate' is distinct from v_context->>'classStartDate' then
    raise exception 'A coleta completa da API mudou; refaça a conferência documental.' using errcode='40001'; end if;
  if jsonb_array_length(v_items)<>13 or exists (
    select 1 from jsonb_array_elements(v_items) item where item->>'cycle' is distinct from 'SECOND'
      or not coalesce((item->>'kind'='TUITION' and item->>'principalCents'='27990'
        and item->>'ordinal' ~ '^[1-9][0-9]?$')
        or (item->>'kind'='FEE' and item->>'principalCents'='10000'
          and (item->>'ordinal') is null),false)
      or not coalesce(item->>'dueDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$',false))
    or (select count(*) from jsonb_array_elements(v_items) item where item->>'kind'='FEE')<>1
    or (select count(*) from jsonb_array_elements(v_items) item where item->>'kind'='TUITION')<>12 then
    raise exception 'Segundo ciclo exige rematrícula de 100 e 12 mensalidades de 279,90.' using errcode='22023'; end if;
  select (item->>'dueDate')::date into strict v_fee from jsonb_array_elements(v_items) item where item->>'kind'='FEE';
  select min((item->>'dueDate')::date) into v_first from jsonb_array_elements(v_items) item where item->>'kind'='TUITION';
  if not isfinite(v_fee) or not isfinite(v_first) or v_prior_due>=v_fee or v_prior_paid>=v_fee
    or date_trunc('month',v_fee)<>date_trunc('month',v_prior_due)+interval '1 month'
    or date_trunc('month',v_first)<>date_trunc('month',v_fee)+interval '1 month'
    or exists (select 1 from generate_series(1,12) ordinal where (select count(*)
      from jsonb_array_elements(v_items) item where item->>'kind'='TUITION'
        and (item->>'ordinal')::integer=ordinal
        and date_trunc('month',(item->>'dueDate')::date)=date_trunc('month',v_first)
          +(ordinal-1)*interval '1 month')<>1) then
    raise exception 'O plano do segundo ciclo diverge da sequência documental do primeiro.' using errcode='22023'; end if;
  select count(*) into v_count from jsonb_array_elements(v_items) item
    join internal_proesc.obligation_links link on link.matricula_id=p_matricula_id
      and link.source_key=item->>'key' and link.kind='ORIGINAL'
      and link.confirmed_at is not null and link.confirmed_by is not null
      and link.source_unit_id=v_context->>'unitId' and link.source_class_id=v_context->>'classId'
    join internal_proesc.obligation_imports imported on imported.link_id=link.id
      and imported.scope_id=(v_context->>'scopeId')::uuid
      and imported.source_person_hash=v_context->>'personHash'
      and imported.source_cycle in ('UNRESOLVED','SECOND','FULL_CONTRACT')
    join public.contas_receber receivable on receivable.id=link.receivable_id
      and receivable.matricula_id=p_matricula_id and receivable.turma_id=link.turma_id
      and receivable.valor*100=(item->>'principalCents')::numeric
      and receivable.data_vencimento=(item->>'dueDate')::date
    where (select count(*) from jsonb_array_elements(v_cache.obligations) source where
      source->>'key'=item->>'key' and source->>'classId'=v_context->>'classId'
      and source->>'personHash'=v_context->>'personHash' and source->'unsafe'='false'::jsonb
      and source->>'amountCents'=item->>'principalCents' and source->>'dueDate'=item->>'dueDate')=1;
  if v_count<>13 then
    raise exception 'Os 13 vínculos originais confirmados não correspondem à API e à matrícula.' using errcode='40001'; end if;
end;
$$;
revoke all on function internal_proesc.assert_external_second_cycle_only(uuid,jsonb,timestamptz)
  from public,anon,authenticated,service_role;

-- Keep the canonical authorization, advisory locks, CAS, manifest validation,
-- replay semantics and audit. Extend only the explicit second-cycle branch.
do $patch$
declare v_definition text; v_from text; v_to text;
begin
  v_definition:=pg_get_functiondef('public.proesc_confirm_enrollment_cycle_evidence_service(uuid,uuid,jsonb)'::regprocedure);
  v_from:=$old$  IF v_classification<>'UNKNOWN' THEN
    IF v_kind='UNRESOLVED' OR v_source->'completeContract' IS DISTINCT FROM 'true'::jsonb$old$;
  v_to:=$new$  IF v_classification<>'UNKNOWN' THEN
    IF v_source->>'scope'='SEGUNDO_CICLO' THEN
      IF v_classification<>'FULL' OR v_has_second IS DISTINCT FROM true
        OR v_kind<>'SOURCE_CYCLE_REFERENCE' THEN
        RAISE EXCEPTION 'Prova isolada do segundo ciclo não autoriza primeiro ciclo.' USING errcode='22023'; END IF;
      PERFORM internal_proesc.assert_external_second_cycle_only(v_enrollment.id,v_source,v_observed);
    END IF;
    IF v_kind='UNRESOLVED' OR (v_source->'completeContract' IS DISTINCT FROM 'true'::jsonb
      AND NOT coalesce(v_source->>'scope'='SEGUNDO_CICLO'
        AND v_source->'completeSecondCycle'='true'::jsonb,false))$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Unexpected canonical evidence validator before second-cycle extension.'; end if;
  v_definition:=replace(v_definition,v_from,v_to);
  v_from:=$old$AND v_source->>'firstInstallmentCount' ~ '^[1-9][0-9]?$'$old$;
  v_to:=$new$AND (v_source->>'firstInstallmentCount' ~ '^[1-9][0-9]?$'
          OR (v_source->>'scope'='SEGUNDO_CICLO' AND v_source->>'firstInstallmentCount'='0'))$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Unexpected canonical first-cycle count validation.'; end if;
  v_definition:=replace(v_definition,v_from,v_to);
  v_from:=$old$  RETURN v_response;
END;$old$;
  v_to:=$new$  IF v_classification='FULL' AND v_source->>'scope'='SEGUNDO_CICLO' THEN
    INSERT INTO internal_academic.technical_external_cycle_coverage(matricula_id,turma_id,
      cycle_number,source_system,scope,state,request_id,payload_hash,item_count,installment_count,
      total_amount,import_transaction_id,created_by,confirmed_at)
    VALUES(v_enrollment.id,v_enrollment.turma_id,2,'PROESC','SEGUNDO_CICLO','CONFIRMED',
      p_request_id,v_hash,13,12,3458.80,txid_current(),p_actor_id,now());
    INSERT INTO internal_academic.technical_external_cycle_evidence(matricula_id,cycle_number,
      source_key,source_unit_id,source_class_id,source_kind,source_ordinal,source_fingerprint,
      receivable_id,imported_now,expected_receivable)
    SELECT v_enrollment.id,2,link.source_key,link.source_unit_id,link.source_class_id,
      CASE item->>'kind' WHEN 'FEE' THEN 'REMATRICULA' ELSE 'MENSALIDADE' END,
      (item->>'ordinal')::integer,imported.source_fingerprint,receivable.id,false,
      jsonb_build_object('id',receivable.id,'matricula_id',receivable.matricula_id,
        'turma_id',receivable.turma_id,'cliente_id',receivable.cliente_id,'polo_id',receivable.polo_id,
        'valor',receivable.valor,'data_vencimento',receivable.data_vencimento,
        'origem_cronograma_id',receivable.origem_cronograma_id,'tipo_lancamento',receivable.tipo_lancamento)
    FROM jsonb_array_elements(v_items) item
    JOIN internal_proesc.obligation_links link ON link.matricula_id=v_enrollment.id AND link.source_key=item->>'key'
    JOIN internal_proesc.obligation_imports imported ON imported.link_id=link.id
    JOIN public.contas_receber receivable ON receivable.id=link.receivable_id;
  END IF;
  RETURN v_response;
END;$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Unexpected canonical evidence audit/return boundary.'; end if;
  execute replace(v_definition,v_from,v_to);
  v_definition:=pg_get_functiondef('internal_academic.technical_manual_cycle_state_before_proesc_scopes(uuid)'::regprocedure);
  v_from:=$old$'origemEmissao', 'PROESC', 'abrangencia', 'CONTRATO_COMPLETO'$old$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Unexpected external coverage state projection.'; end if;
  execute replace(v_definition,v_from,$new$'origemEmissao', 'PROESC', 'abrangencia', v_coverage.scope$new$);
end;
$patch$;
notify pgrst,'reload schema';
commit;
