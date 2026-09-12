-- Read-only after migration 20260912230000. No source consultation, enqueue,
-- financial mutation or credential lookup. Session claims are restored below.
-- Covers every currently imported new class, including the next five as they
-- become populated, without hardcoding a changing total or personal identity.
do $proesc_summary_contract$
declare
  v_claims text := current_setting('request.jwt.claims',true);
  v_role text := current_setting('request.jwt.claim.role',true);
  v_sub text := current_setting('request.jwt.claim.sub',true);
  v_scope record; v_range integer; v_start date; v_end date;
  v_summary jsonb; v_expected jsonb; v_all_polos jsonb; v_other_polo uuid;
  v_classes integer := 0; v_cases integer := 0; v_generic bigint;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub','',true);
  select count(*) into v_generic from internal_proesc.obligation_imports i
  join internal_proesc.obligation_links l on l.id=i.link_id
  join internal_proesc.class_scopes s on s.id=i.scope_id
  join public.contas_receber c on c.id=l.receivable_id
  where s.batch_id is not null and c.categoria='OUTROS_CREDITOS';
  assert v_generic>0,'Imported generic obligations are required to exercise this regression';

  for v_scope in
    select s.turma_id,s.polo_id from internal_proesc.class_scopes s
    where s.batch_id is not null and s.phase='CONFIRMED'
      and exists(select 1 from internal_proesc.obligation_links l where l.turma_id=s.turma_id)
    order by s.turma_id
  loop
    v_classes:=v_classes+1;
    for v_range in 0..1 loop
      v_start:=case when v_range=0 then null else date '2026-09-01' end;
      v_end:=case when v_range=0 then null else date '2026-09-30' end;
      v_summary:=public.get_receivables_modality_summary_v3_secure(
        'TECNICO',v_scope.polo_id,v_scope.turma_id,null,v_start,v_end);
      -- Independently aggregate the imported ledger by exact receivable identity.
      -- These new scopes contain linked imported history, not fabricated tuition.
      with ledger as (
        select c.status,c.valor,c.valor_pago,
          (v_start is null or c.data_vencimento>=v_start)
            and (v_end is null or c.data_vencimento<=v_end) as due_in_period,
          (v_start is null or c.data_pagamento>=v_start)
            and (v_end is null or c.data_pagamento<=v_end) as paid_in_period
        from public.contas_receber c
        where c.turma_id=v_scope.turma_id and c.polo_id=v_scope.polo_id
          and (c.categoria='MENSALIDADE' or c.id in (
            select l.receivable_id from internal_proesc.obligation_links l
            join internal_proesc.obligation_imports i on i.link_id=l.id
            where l.turma_id=v_scope.turma_id))
      )
      select jsonb_build_object(
        'pending_count',count(*) filter(where due_in_period and status in ('PENDENTE','VENCIDO','SUSPENSO')),
        'received_count',count(*) filter(where paid_in_period and status='PAGO'),
        'canceled_count',count(*) filter(where due_in_period and status='CANCELADO'),
        'overdue_count',count(*) filter(where due_in_period and status='VENCIDO'),
        'all_count',count(*) filter(where due_in_period),
        'pending_value',coalesce(sum(valor) filter(where due_in_period and status in ('PENDENTE','VENCIDO','SUSPENSO')),0),
        'received_value',coalesce(sum(coalesce(valor_pago,valor)) filter(where paid_in_period and status='PAGO'),0),
        'canceled_value',coalesce(sum(valor) filter(where due_in_period and status='CANCELADO'),0),
        'overdue_value',coalesce(sum(valor) filter(where due_in_period and status='VENCIDO'),0),
        'all_value',coalesce(sum(valor) filter(where due_in_period),0)
      ) into v_expected from ledger;
      assert v_summary=v_expected,'Summary differs from linked ledger totals/status/payment period';
      v_cases:=v_cases+1;
    end loop;
    v_all_polos:=public.get_receivables_modality_summary_v3_secure(
      'TECNICO',null,v_scope.turma_id,null,v_start,v_end);
    assert v_all_polos=v_summary,'Class filter differs between owner polo and global scope';
    select id into strict v_other_polo from public.polos where id<>v_scope.polo_id order by id limit 1;
    v_summary:=public.get_receivables_modality_summary_v3_secure(
      'TECNICO',v_other_polo,v_scope.turma_id,null,null,null);
    assert not exists(select 1 from jsonb_each_text(v_summary) x where x.value::numeric<>0),
      'Unrelated polo leaked the class summary';
  end loop;
  assert v_classes>0,'No imported class tested';
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  begin
    perform public.get_receivables_modality_summary_v3_secure('TECNICO',null,null,null,null,null);
    raise exception 'Missing authenticated identity accepted' using errcode='PT999';
  exception when sqlstate '42501' then null; end;
  perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
  perform set_config('request.jwt.claim.role',coalesce(v_role,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
  raise notice 'Linked summary passed: % classes, % period/status cases; polo separation and authorization intact',v_classes,v_cases;
end;
$proesc_summary_contract$;
