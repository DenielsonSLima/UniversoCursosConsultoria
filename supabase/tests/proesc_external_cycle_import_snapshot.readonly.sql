-- Immediate post-import snapshot only. Future authorized Proesc payment
-- synchronization legitimately changes these five payment states. Do not use
-- this snapshot assertion as a permanent payment/coverage regression test.
begin read only;
do $initial_import_snapshot$
declare v_coverage record; v_count integer;
begin
  for v_coverage in select matricula_id
    from internal_academic.technical_external_cycle_coverage where state = 'CONFIRMED'
  loop
    select count(*) into v_count
    from internal_academic.technical_external_cycle_evidence evidence
    join public.contas_receber receivable on receivable.id = evidence.receivable_id
    where evidence.matricula_id = v_coverage.matricula_id and evidence.imported_now
      and evidence.source_ordinal between 20 and 24
      and receivable.status = 'PENDENTE' and receivable.valor_pago = 0
      and receivable.data_pagamento is null and receivable.valor = 279.90
      and receivable.parcela_numero = evidence.source_ordinal;
    if v_count <> 5 then
      raise exception 'Snapshot inicial exige cinco inclusões pendentes e sem pagamento; conferir se já houve sincronização autorizada.';
    end if;
  end loop;
end;
$initial_import_snapshot$;
rollback;
