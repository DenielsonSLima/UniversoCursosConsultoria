-- Separate financial records from the subset destined for bank issuance.
begin;

do $patch$
declare v_definition text; v_from text; v_to text;
begin
  v_definition:=pg_get_functiondef('public.obter_emissao_ciclo_financeiro_tecnico_manual_service(uuid,integer)'::regprocedure);
  if md5(v_definition)<>'bcc4f0020b36722ca0008876dd891217' then raise exception 'Canonical function changed: public.obter_emissao_ciclo_financeiro_tecnico_manual_service(uuid,integer)'; end if;
  v_from:=$old$  v_paid_issued boolean;$old$;
  v_to:=$new$  v_paid_issued boolean;
  v_is_local boolean;
  v_local integer:=0;
  v_banking integer;$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Canonical function boundary changed: public.obter_emissao_ciclo_financeiro_tecnico_manual_service(uuid,integer)';
  end if;
  v_definition:=replace(v_definition,v_from,v_to);
  v_from:=$old$    v_complete :=
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
$old$;
  v_to:=$new$    v_is_local:=internal_academic.manual_cycle_has_local_intent(v_receivable);
    if v_is_local then
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
$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Canonical function boundary changed: public.obter_emissao_ciclo_financeiro_tecnico_manual_service(uuid,integer)';
  end if;
  v_definition:=replace(v_definition,v_from,v_to);
  v_from:=$old$      'emissaoHistoricaComprovada', v_paid_issued$old$;
  v_to:=$new$      'emissaoHistoricaComprovada', v_paid_issued,
      'destinoCobranca', case when v_is_local then 'LOCAL' else 'BANESE' end,
      'localSemBoletoComprovado', v_is_local$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Canonical function boundary changed: public.obter_emissao_ciclo_financeiro_tecnico_manual_service(uuid,integer)';
  end if;
  v_definition:=replace(v_definition,v_from,v_to);
  v_from:=$old$  v_cycle_status := case$old$;
  v_to:=$new$  v_banking:=v_run.item_count-v_local;
  v_cycle_status := case$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Canonical function boundary changed: public.obter_emissao_ciclo_financeiro_tecnico_manual_service(uuid,integer)';
  end if;
  v_definition:=replace(v_definition,v_from,v_to);
  v_from:=$old$when v_emitted = v_run.item_count and v_review = 0 then 'EMITIDO_BANESE'$old$;
  v_to:=$new$when v_emitted = v_banking and v_review = 0 then 'EMITIDO_BANESE'$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Canonical function boundary changed: public.obter_emissao_ciclo_financeiro_tecnico_manual_service(uuid,integer)';
  end if;
  v_definition:=replace(v_definition,v_from,v_to);
  v_from:=$old$      'quantidadeItens', v_run.item_count,$old$;
  v_to:=$new$      'quantidadeItens', v_run.item_count,
      'quantidadeBancaria', v_banking, 'quantidadeLocal', v_local,
      'modoMatricula', case when v_local=1 then 'REGISTRO_SEM_BOLETO'
        when v_run.cycle_number=1 and v_run.item_count=12 then 'OMITIR' else 'BOLETO' end,$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Canonical function boundary changed: public.obter_emissao_ciclo_financeiro_tecnico_manual_service(uuid,integer)';
  end if;
  v_definition:=replace(v_definition,v_from,v_to);
  v_from:=$old$'pendentesEmissao', greatest(v_run.item_count - v_emitted - v_review, 0)$old$;
  v_to:=$new$'pendentesEmissao', greatest(v_banking - v_emitted - v_review, 0)$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Canonical function boundary changed: public.obter_emissao_ciclo_financeiro_tecnico_manual_service(uuid,integer)';
  end if;
  v_definition:=replace(v_definition,v_from,v_to);
  execute v_definition;
end;
$patch$;

-- The authenticated prepare RPC is already authorized by generation. Share a
-- private projection rather than impersonating the service role to call it.
do $internal_projection$
declare v_definition text; v_guard text;
begin
  v_definition:=pg_get_functiondef('public.obter_emissao_ciclo_financeiro_tecnico_manual_service(uuid,integer)'::regprocedure);
  v_definition:=replace(v_definition,
    'FUNCTION public.obter_emissao_ciclo_financeiro_tecnico_manual_service(',
    'FUNCTION internal_academic.manual_cycle_issuance_progress(');
  v_guard:=$guard$  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role')
  then
    raise exception 'Acesso negado à retomada do ciclo BolePix.'
      using errcode = '42501';
  end if;
$guard$;
  if length(v_definition)-length(replace(v_definition,v_guard,''))<>length(v_guard) then
    raise exception 'Service projection authorization boundary changed.';
  end if;
  execute replace(v_definition,v_guard,'');
end;
$internal_projection$;
revoke all on function internal_academic.manual_cycle_issuance_progress(uuid,integer)
  from public,anon,authenticated,service_role;

create or replace function public.obter_emissao_ciclo_financeiro_tecnico_manual_service(
  p_matricula_id uuid,p_ciclo_numero integer
)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role')
  then
    raise exception 'Acesso negado à retomada do ciclo BolePix.'
      using errcode = '42501';
  end if;
  return internal_academic.manual_cycle_issuance_progress(p_matricula_id,p_ciclo_numero);
end;
$function$;
revoke all on function public.obter_emissao_ciclo_financeiro_tecnico_manual_service(uuid,integer)
  from public,anon,authenticated;
grant execute on function public.obter_emissao_ciclo_financeiro_tecnico_manual_service(uuid,integer) to service_role;

create or replace function public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(
  p_matricula_id uuid,p_ciclo_numero integer,p_primeiro_vencimento date,p_request_id uuid,
  p_expected_regra_fingerprint text,p_expected_politica_fingerprint text,
  p_expected_cronograma_fingerprint text,p_revisao jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_result jsonb; v_item jsonb; v_receivable public.contas_receber%rowtype;
  v_banking integer:=0; v_local integer:=0;
begin
  v_result:=public.gerar_ciclo_financeiro_tecnico_manual_secure(
    p_matricula_id,p_ciclo_numero,p_primeiro_vencimento,p_request_id,
    p_expected_regra_fingerprint,p_expected_politica_fingerprint,p_expected_cronograma_fingerprint,p_revisao);
  for v_item in select value from jsonb_array_elements(v_result#>'{ciclo,recebiveis}') loop
    select * into strict v_receivable from public.contas_receber
      where id=(v_item->>'id')::uuid and matricula_id=p_matricula_id for update;
    if internal_academic.manual_cycle_has_local_intent(v_receivable) then
      if not internal_academic.manual_cycle_local_receivable_complete(v_receivable) then
        raise exception 'Matrícula local do ciclo possui estado divergente; revise a cobrança.' using errcode='23514';
      end if;
      v_local:=v_local+1;
      continue;
    end if;
    if v_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL' then
      raise exception 'Intenção local da matrícula não foi comprovada.' using errcode='23514';
    end if;
    update public.contas_receber receivable
    set forma_pagamento='BOLETO',gateway_payment_method='BOLETO',
      updated_at=case when receivable.forma_pagamento is distinct from 'BOLETO'
        or receivable.gateway_payment_method is distinct from 'BOLETO'
        then clock_timestamp() else receivable.updated_at end
    where receivable.id=v_receivable.id
      and upper(coalesce(receivable.status,'')) in ('PENDENTE','VENCIDO')
      and coalesce(receivable.forma_pagamento,'BOLETO')='BOLETO'
      and coalesce(receivable.gateway_payment_method,'BOLETO')='BOLETO'
      and receivable.gateway_payment_id is null and receivable.gateway_payment_link_id is null
      and receivable.gateway_submission_status is null;
    if not found and not coalesce((
      internal_academic.technical_manual_banese_receivable_complete(v_receivable)
      or internal_academic.technical_manual_banese_receivable_paid_issued(v_receivable)
      or (v_receivable.forma_pagamento='BOLETO' and v_receivable.gateway_payment_method='BOLETO'
        and v_receivable.gateway_provider='banese_card' and v_receivable.gateway_environment='production'
        and v_receivable.gateway_submission_status='API_REGISTERED')
    ),false) then
      raise exception 'Recebível do ciclo não pode ser preparado para BolePix.' using errcode='40001';
    end if;
    v_banking:=v_banking+1;
  end loop;
  if v_banking+v_local<>(v_result#>>'{ciclo,quantidadeItens}')::integer then
    raise exception 'A preparação não cobriu os recebíveis do ciclo.' using errcode='23514';
  end if;
  perform public.registrar_turma_financeiro_auditoria(p_matricula_id,
    'CICLO_TECNICO_MANUAL_PREPARADO_BANESE',jsonb_build_object(
      'cicloNumero',p_ciclo_numero,'quantidadeItens',v_banking+v_local,
      'quantidadeBancaria',v_banking,'quantidadeLocal',v_local,'requestId',p_request_id,
      'metodo','BOLETO','ambienteExigido','production'),
    'Apenas os itens destinados ao Banese foram preparados para emissão.');
  return v_result||internal_academic.manual_cycle_issuance_progress(p_matricula_id,p_ciclo_numero)
    ||jsonb_build_object('replayed',v_result->'replayed');
end;
$function$;
revoke all on function public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(
  uuid,integer,date,uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(
  uuid,integer,date,uuid,text,text,text,jsonb) to authenticated,service_role;

commit;
