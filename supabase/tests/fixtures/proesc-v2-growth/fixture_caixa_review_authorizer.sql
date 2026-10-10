CREATE OR REPLACE FUNCTION internal_contas.caixa_assert_receivables_scope(p_polo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_allowed boolean;
begin
  if coalesce(auth.jwt()->>'role','')='service_role' then return; end if;
  if auth.uid() is null or not coalesce(public.is_gestor(),false) then
    raise exception 'Identidade gestora válida é obrigatória.' using errcode='42501'; end if;
  v_allowed:=case when p_polo_id is null then
    coalesce(public.gestor_has_any_global_module(array['caixa']),false)
    or (coalesce(public.gestor_has_any_global_module(array['financeiro']),false)
      and coalesce(public.gestor_has_effective_financeiro_tab('receber'),false))
  else coalesce(public.gestor_has_any_module_for_polo(array['caixa'],p_polo_id),false)
    or (coalesce(public.gestor_has_any_module_for_polo(array['financeiro'],p_polo_id),false)
      and coalesce(public.gestor_has_effective_financeiro_tab('receber'),false)) end;
  if not v_allowed then
    raise exception 'Módulo, aba ou polo fora do escopo autorizado do Caixa.' using errcode='42501'; end if;
end;
$function$

