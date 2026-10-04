begin;

-- Patch only the source-row eligibility of existing financial RPCs. Their
-- authorization, evidence, dates, paid cash and response shapes remain intact.
-- Abort the whole migration if a target query drifted or was already patched.
do $eligibility$
declare
  target record;
  definition text;
  occurrences integer;
begin
  for target in select * from (values
    ('internal_contas.caixa_monthly_delinquency(uuid,date,date)',
      $old$and c.status in ('PAGO','PENDENTE','VENCIDO','AGUARDANDO_CONFIRMACAO','AGUARDANDO_PAGAMENTO')$old$,
      $new$and c.status in ('PAGO','PENDENTE','VENCIDO','AGUARDANDO_CONFIRMACAO','AGUARDANDO_PAGAMENTO')
      and not internal_contas.ead_checkout_is_optional(c.id)$new$,1),
    ('internal_contas.caixa_receivables_position_rows(uuid,date,date)',
      $old$and c.status in ('PAGO','PENDENTE','VENCIDO','AGUARDANDO_CONFIRMACAO','AGUARDANDO_PAGAMENTO')$old$,
      $new$and c.status in ('PAGO','PENDENTE','VENCIDO','AGUARDANDO_CONFIRMACAO','AGUARDANDO_PAGAMENTO')
      and not internal_contas.ead_checkout_is_optional(c.id)$new$,1),
    ('internal_contas.caixa_open_receivables(uuid)',
      $old$where c.status in ('PENDENTE', 'VENCIDO')$old$,
      $new$where c.status in ('PENDENTE', 'VENCIDO')
      and not internal_contas.ead_checkout_is_optional(c.id)$new$,1),
    ('public.get_caixa_prestacao_mensal_v2_core(uuid,date,integer)',
      $old$WHERE cr.status IN ('PENDENTE', 'VENCIDO')$old$,
      $new$WHERE cr.status IN ('PENDENTE', 'VENCIDO')
    AND NOT internal_contas.ead_checkout_is_optional(cr.id)$new$,1),
    ('public.get_caixa_dashboard_secure(uuid)',
      $old$WHERE cr.status IN ('PENDENTE', 'VENCIDO')$old$,
      $new$WHERE cr.status IN ('PENDENTE', 'VENCIDO')
      AND NOT internal_contas.ead_checkout_is_optional(cr.id)$new$,1),
    ('public.get_caixa_linha_corte_secure(uuid,date)',
      $old$  FROM public.contas_receber cr
  WHERE (p_polo_id IS NULL OR cr.polo_id = p_polo_id);$old$,
      $new$  FROM public.contas_receber cr
  WHERE (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
    AND NOT internal_contas.ead_checkout_is_optional(cr.id);$new$,1),
    ('public.get_relatorio_inadimplencia_secure(uuid,date,integer,text)',
      $old$WHERE recebimento.data_vencimento < v_corte$old$,
      $new$WHERE recebimento.data_vencimento < v_corte
      AND NOT internal_contas.ead_checkout_is_optional(recebimento.id)$new$,2)
  ) as patch(signature,old_text,new_text,expected_count)
  loop
    select pg_get_functiondef(target.signature::regprocedure) into definition;
    occurrences:=(length(definition)-length(replace(definition,target.old_text,'')))
      /length(target.old_text);
    if occurrences<>target.expected_count
      or position('ead_checkout_is_optional' in definition)>0 then
      raise exception 'Optional EAD eligibility target drifted: %. Review and rebase.',target.signature;
    end if;
    execute replace(definition,target.old_text,target.new_text);
  end loop;
end;
$eligibility$;

notify pgrst,'reload schema';
commit;

