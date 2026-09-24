-- Reject local-only enrollment fees before authorization/replay and adapter terms.
begin;

do $patch$
declare v_definition text; v_from text; v_to text;
begin
  v_definition:=pg_get_functiondef('internal_academic.assert_manual_cycle_reviewed_receivable(public.contas_receber)'::regprocedure);
  if md5(v_definition)<>'23028e8e67d6576c070fdcb28c47d9ec' then raise exception 'Canonical function changed: internal_academic.assert_manual_cycle_reviewed_receivable(public.contas_receber)'; end if;
  v_from:=$old$    and (item->>'numero')::integer=p_receivable.parcela_numero;$old$;
  v_to:=$new$    and (item->>'numero')::integer=p_receivable.parcela_numero
    and coalesce(item->>'destinoCobranca','BANESE')
      =coalesce(p_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca','BANESE');$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Canonical function boundary changed: internal_academic.assert_manual_cycle_reviewed_receivable(public.contas_receber)';
  end if;
  v_definition:=replace(v_definition,v_from,v_to);
  execute v_definition;
end;
$patch$;

do $patch$
declare v_definition text; v_from text; v_to text;
begin
  v_definition:=pg_get_functiondef('internal_academic.technical_manual_banese_expected_terms(public.contas_receber)'::regprocedure);
  if md5(v_definition)<>'cdf22901260c12954baaf11f44763f4d' then raise exception 'Canonical function changed: internal_academic.technical_manual_banese_expected_terms(public.contas_receber)'; end if;
  v_from:=$old$  perform internal_academic.assert_manual_cycle_reviewed_receivable(p_receivable);$old$;
  v_to:=$new$  perform internal_academic.assert_manual_cycle_reviewed_receivable(p_receivable);
  if p_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL'
    or internal_academic.manual_cycle_has_local_intent(p_receivable) then
    raise exception 'Matrícula registrada sem boleto não possui termos bancários.' using errcode='23514';
  end if;$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Canonical function boundary changed: internal_academic.technical_manual_banese_expected_terms(public.contas_receber)';
  end if;
  v_definition:=replace(v_definition,v_from,v_to);
  execute v_definition;
end;
$patch$;

do $patch$
declare v_definition text; v_from text; v_to text;
begin
  v_definition:=pg_get_functiondef('public.authorize_technical_manual_receivable_issuance_secure(uuid,uuid)'::regprocedure);
  if md5(v_definition)<>'35666cc17f8a275abceefa5460288934' then raise exception 'Canonical function changed: public.authorize_technical_manual_receivable_issuance_secure(uuid,uuid)'; end if;
  v_from:=$old$  perform internal_academic.assert_manual_cycle_reviewed_receivable(v_receivable);$old$;
  v_to:=$new$  perform internal_academic.assert_manual_cycle_reviewed_receivable(v_receivable);
  if v_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL'
    or internal_academic.manual_cycle_has_local_intent(v_receivable) then
    raise exception 'Matrícula registrada sem boleto não permite autorização bancária.' using errcode='23514';
  end if;$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Canonical function boundary changed: public.authorize_technical_manual_receivable_issuance_secure(uuid,uuid)';
  end if;
  v_definition:=replace(v_definition,v_from,v_to);
  execute v_definition;
end;
$patch$;

commit;
