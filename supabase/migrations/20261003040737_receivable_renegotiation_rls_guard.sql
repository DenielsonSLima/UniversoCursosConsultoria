begin;

-- O helper granular de abas não é uma API pública. RLS deve consultá-lo dentro
-- de um predicado restrito, preservando seu ACL e sem expor permissões globais.
create function public.can_read_receivable_renegotiation_for_polo(p_polo_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select p_polo_id is not null
    and auth.uid() is not null
    and coalesce(public.is_gestor(), false)
    and coalesce(public.gestor_has_any_module_for_polo(
      array['financeiro'], p_polo_id
    ), false)
    and coalesce(public.gestor_has_effective_financeiro_tab('receber'), false);
$function$;

revoke all on function public.can_read_receivable_renegotiation_for_polo(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.can_read_receivable_renegotiation_for_polo(uuid)
  to authenticated;

alter policy receivable_renegotiation_agreements_select_scoped
  on public.receivable_renegotiation_agreements
  using (public.can_read_receivable_renegotiation_for_polo(polo_id));
alter policy receivable_renegotiation_source_items_select_scoped
  on public.receivable_renegotiation_source_items
  using (public.can_read_receivable_renegotiation_for_polo(polo_id));
alter policy receivable_renegotiation_events_select_scoped
  on public.receivable_renegotiation_events
  using (public.can_read_receivable_renegotiation_for_polo(polo_id));

comment on function public.can_read_receivable_renegotiation_for_polo(uuid) is
  'Predicado RLS de propostas: identidade gestora ativa, Financeiro/Receber e polo. Não concede mutações.';

notify pgrst, 'reload schema';
commit;
