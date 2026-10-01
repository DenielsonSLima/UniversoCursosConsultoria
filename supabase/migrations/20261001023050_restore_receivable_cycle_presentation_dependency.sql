-- Versiona a definição canônica antes do enriquecimento 023100.
-- Produção preserva a função existente; reconstrução limpa ganha a dependência.
begin;
do $bootstrap$
begin
  if to_regprocedure('internal_academic.receivable_cycle_presentation(public.contas_receber)') is null then
    execute $definition$
CREATE OR REPLACE FUNCTION internal_academic.receivable_cycle_presentation(p_receivable public.contas_receber)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_managed boolean;
  v_destination text;
  v_state text;
begin
  v_destination := case when p_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca'
    in ('LOCAL','BANESE') then p_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca' end;
  select exists(select 1 from internal_academic.technical_manual_cycle_runs run
    where run.state='LOCAL_CREATED' and p_receivable.id=any(run.receivable_ids)) into v_managed;
  if v_managed then
    if v_destination='LOCAL' then
      v_state := case when internal_academic.manual_cycle_local_receivable_complete(p_receivable)
        then 'NAO_APLICAVEL' else 'REVISAO' end;
    elsif internal_academic.technical_manual_banese_receivable_complete(p_receivable)
      or internal_academic.technical_manual_banese_receivable_paid_issued(p_receivable) then
      v_state := 'EMITIDO';
    elsif p_receivable.gateway_submission_status='API_REVIEW' then
      v_state := 'REVISAO_MANUAL';
    elsif p_receivable.gateway_submission_status is not null
      or p_receivable.gateway_creation_token is not null
      or coalesce(p_receivable.gateway_payment_id,p_receivable.gateway_boleto_nosso_numero) is not null
      or p_receivable.gateway_boleto_issued_at is not null
      or p_receivable.gateway_boleto_linha_digitavel is not null
      or p_receivable.gateway_boleto_codigo_barras is not null
      or p_receivable.gateway_pix_payload is not null
      or p_receivable.gateway_pix_encoded_image is not null
      or exists(select 1 from public.payment_gateway_transactions transaction
        where transaction.receivable_id=p_receivable.id) then
      v_state := 'REVISAO';
    else
      v_state := 'PENDENTE';
    end if;
    v_destination := coalesce(v_destination,'BANESE');
  end if;
  return jsonb_build_object('destino_cobranca',v_destination,
    'emissao_gerenciada_turma',v_managed,'emissao_ciclo_status',v_state);
end;
$function$
;
$definition$;
  end if;
  if md5(pg_get_functiondef('internal_academic.receivable_cycle_presentation(public.contas_receber)'::regprocedure)) <> '02d5770cfd9574c7c68e406b7c832c64' then
    raise exception 'Drift na apresentação canônica do ciclo; rebase obrigatório.';
  end if;
end;
$bootstrap$;
revoke all on function internal_academic.receivable_cycle_presentation(public.contas_receber)
  from public, anon, authenticated, service_role;
commit;
