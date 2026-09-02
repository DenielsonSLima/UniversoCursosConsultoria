begin;

do $migration$
declare
  v_definition text;
  v_updated text;
  v_old text;
  v_new text;
begin
  select pg_catalog.pg_get_functiondef(
    'internal_academic.technical_manual_banese_receivable_complete(public.contas_receber)'::regprocedure
  ) into v_definition;
  v_old := $old$coalesce(p_receivable.gateway_pix_payload, '') !~
      '^000201.*BR[.]GOV[.]BCB[.]PIX.*5303986.*5802BR.*6304[0-9A-Fa-f]{4}$'$old$;
  v_new := $new$coalesce(p_receivable.gateway_pix_payload, '') !~*
      '^000201.*BR[.]GOV[.]BCB[.]PIX.*5303986.*5802BR.*6304[0-9A-Fa-f]{4}$'$new$;
  v_updated := pg_catalog.replace(v_definition, v_old, v_new);
  if v_updated is not distinct from v_definition then
    raise exception 'Contrato Pix do predicado técnico não foi localizado.';
  end if;
  execute v_updated;

  select pg_catalog.pg_get_functiondef(
    'public.persist_technical_manual_cycle_banese_issuance(uuid,uuid,uuid,jsonb)'::regprocedure
  ) into v_definition;
  v_old := $old$coalesce(v_pix_payload, '') !~
      '^000201.*BR[.]GOV[.]BCB[.]PIX.*5303986.*5802BR.*6304[0-9A-Fa-f]{4}$'$old$;
  v_new := $new$coalesce(v_pix_payload, '') !~*
      '^000201.*BR[.]GOV[.]BCB[.]PIX.*5303986.*5802BR.*6304[0-9A-Fa-f]{4}$'$new$;
  v_updated := pg_catalog.replace(v_definition, v_old, v_new);
  if v_updated is not distinct from v_definition then
    raise exception 'Contrato Pix da persistência técnica não foi localizado.';
  end if;
  execute v_updated;
end;
$migration$;

comment on function
  internal_academic.technical_manual_banese_receivable_complete(
    public.contas_receber
  ) is
  'Valida o BolePix técnico completo; o GUI Pix segue a semântica case-insensitive do EMV.';
comment on function
  public.persist_technical_manual_cycle_banese_issuance(
    uuid, uuid, uuid, jsonb
  ) is
  'Persiste atomicamente o BolePix técnico com GUI Pix validado sem distinção de caixa.';

commit;
