begin;

-- The monitor already starts with exact Proesc links. Validate their identity
-- together instead of invoking the generic source classifier once per title.
-- Keep every Proesc predicate from reconciliation_source_system unchanged.
create or replace function internal_proesc.monitor_links(p_polos uuid[])
returns table(link_id uuid,receivable_id uuid,class_id uuid,polo_id uuid,auto_enabled boolean)
language sql stable security definer set search_path='' as $$
  select l.id,c.id,l.turma_id,c.polo_id,l.auto_enabled
  from internal_proesc.obligation_links l
  join public.contas_receber c on c.id=l.receivable_id
    and c.matricula_id=l.matricula_id and c.turma_id=l.turma_id
  join public.matriculas m on m.id=c.matricula_id and m.aluno_id=c.cliente_id
  join public.turmas t on t.id=m.turma_id and t.id=c.turma_id and t.polo_id=c.polo_id
  where c.polo_id=any(p_polos) and c.origem_pagamento='SISTEMA_ANTERIOR'
    and c.gateway_provider is null and c.gateway_payment_id is null
    and c.gateway_creation_token is null and c.asaas_payment_id is null
    and c.gateway_submission_status is null and c.gateway_submission_channel is null
    and c.nosso_numero_asaas is null and c.manual_settlement_id is null
    and c.gateway_boleto_nosso_numero is null and c.gateway_boleto_linha_digitavel is null
    and c.gateway_boleto_codigo_barras is null and c.gateway_pix_payload is null
    and c.gateway_pix_encoded_image is null
    and exists(select 1 from internal_proesc.class_scopes s
      where s.turma_id=l.turma_id and s.source_unit_id=l.source_unit_id
        and s.source_class_id=l.source_class_id and s.phase='CONFIRMED' and s.polo_id=c.polo_id);
$$;

revoke all on function internal_proesc.monitor_links(uuid[]) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
