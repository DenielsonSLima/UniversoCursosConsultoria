begin;

-- Keep the existing financial summary contract and change only open receivables.
do $patch$
declare
  v_target constant regprocedure := 'public.get_financeiro_summary(uuid,date,date)'::regprocedure;
  v_due_scope constant text := $old$AND cr.status IN ('PENDENTE', 'VENCIDO')
        AND cr.data_vencimento BETWEEN p_data_inicio AND p_data_fim$old$;
  v_debt_scope constant text := $new$AND cr.status IN ('PENDENTE', 'VENCIDO')
        AND cr.data_vencimento BETWEEN p_data_inicio AND p_data_fim
        AND NOT internal_contas.ead_checkout_is_optional(cr.id)$new$;
  v_definition text;
  v_metadata jsonb;
begin
  select pg_catalog.pg_get_functiondef(p.oid), to_jsonb(p) - 'prosrc'
    into v_definition, v_metadata
    from pg_catalog.pg_proc p where p.oid = v_target;

  if length(v_definition) - length(replace(v_definition, v_due_scope, '')) <> length(v_due_scope)
    or position('internal_contas.ead_checkout_is_optional' in v_definition) > 0 then
    raise exception 'Finance summary open receivables definition changed. Review before applying.';
  end if;

  execute replace(v_definition, v_due_scope, v_debt_scope);

  if (select to_jsonb(p) - 'prosrc' from pg_catalog.pg_proc p where p.oid = v_target)
      is distinct from v_metadata then
    raise exception 'Finance summary metadata changed.';
  end if;
end;
$patch$;

commit;
