begin;

-- NULL means all of the actor's authorized polos. Each UNION branch retains
-- its existing row scope; explicit polo requests retain the canonical guard.
do $scope$
declare
  v_oid regprocedure := 'public.ead_list_payment_reviews_secure(uuid)'::regprocedure;
  v_definition text;
  v_metadata jsonb;
  v_anchor text := '  perform public.assert_receivables_filter_scope(p_polo_id);';
  v_replacement text := $guard$  if (public.gestor_has_module('financeiro')
    and public.gestor_has_financeiro_tab('receber')) is not true then
    raise exception 'Acesso negado às revisões financeiras EAD.' using errcode='42501';
  end if;
  if p_polo_id is not null then
    perform public.assert_receivables_filter_scope(p_polo_id);
  end if;$guard$;
begin
  select pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc'
    into v_definition,v_metadata from pg_catalog.pg_proc p where p.oid=v_oid;
  if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1
    or position('public.gestor_has_module(''financeiro'')' in v_definition)>0
    or (length(v_definition)-length(replace(v_definition,
      'public.gestor_has_any_module_for_polo(array[''financeiro'']','')))
      /length('public.gestor_has_any_module_for_polo(array[''financeiro'']')<>2 then
    raise exception 'EAD review reader scope drift. Review and rebase.';
  end if;
  execute replace(v_definition,v_anchor,v_replacement);
  if (select to_jsonb(p)-'prosrc' from pg_catalog.pg_proc p where p.oid=v_oid)
    is distinct from v_metadata then
    raise exception 'EAD review reader metadata or privileges changed.';
  end if;
end;
$scope$;

notify pgrst,'reload schema';
commit;
