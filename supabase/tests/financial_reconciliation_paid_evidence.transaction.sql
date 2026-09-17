-- Contrato via MCP. Não publica funções nem altera dados financeiros.
-- Defina app.test.actor_id e app.test.polo_id na mesma transação.
-- Antes de publicar, compare o resultado inteiro para filtros representativos;
-- o teste registra apenas igualdade/tempos, nunca dados pessoais.
begin isolation level repeatable read;
set local statement_timeout = '45s';
set local lock_timeout = '2s';
create temporary table reconciliation_evidence_test_results (
  scenario text, equal boolean, old_ms numeric, new_ms numeric, total_count integer, item_count integer
);
do $$
declare
  v_definition text := pg_get_functiondef(
    'public.list_financial_reconciliation_secure(uuid,uuid,date,date,text,text,text,integer,integer,text,text)'::regprocedure
  );
  v_old text := $old$left join lateral (
      select f.source_status,f.verification from internal_proesc.obligation_links l
      join internal_proesc.financial_snapshots f on f.link_id=l.id
      where x.source_system='PROESC' and l.receivable_id=x.id
      order by f.observed_at desc,f.recorded_at desc,f.id desc limit 1
    ) evidence on true$old$;
  v_new text := $new$left join internal_proesc.obligation_links l
      on x.source_system='PROESC' and x.status<>'PAGO' and l.receivable_id=x.id
    left join lateral (
      select f.source_status,f.verification from internal_proesc.financial_snapshots f
      where f.link_id=l.id
      order by f.observed_at desc,f.recorded_at desc,f.id desc limit 1
    ) evidence on true$new$;
begin
  if (length(v_definition)-length(replace(v_definition,v_new,'')))/length(v_new) = 1 then
    v_definition := replace(v_definition,v_new,v_old);
  end if;
  if (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old) <> 1 then
    raise exception 'Contrato da busca de evidência mudou; revisar fixture.';
  end if;
  execute replace(v_definition, 'public.list_financial_reconciliation_secure(', 'pg_temp.reconciliation_before(');
  execute replace(replace(v_definition, v_old, v_new),
    'public.list_financial_reconciliation_secure(', 'pg_temp.reconciliation_after(');
end;
$$;
select set_config('request.jwt.claim.sub', current_setting('app.test.actor_id'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub',current_setting('app.test.actor_id'),'role','authenticated'
)::text, true);
-- Cada comparação tem seu próprio statement_timeout. O baseline é lento;
-- não somar todos os cenários dentro de um único bloco DO.
create function pg_temp.check_reconciliation_evidence(
  p_label text,p_status text,p_start date,p_end date
) returns void language plpgsql as $$
declare
  v_polo uuid := current_setting('app.test.polo_id')::uuid;
  v_before jsonb;
  v_after jsonb;
  v_start timestamptz;
  v_old_ms numeric;
  v_new_ms numeric;
begin
  v_start := clock_timestamp();
  v_before := pg_temp.reconciliation_before(null,v_polo,p_start,p_end,
    null,'TODOS','production',1,20,p_status,'ALL');
  v_old_ms := extract(epoch from clock_timestamp()-v_start)*1000;
  v_start := clock_timestamp();
  v_after := pg_temp.reconciliation_after(null,v_polo,p_start,p_end,
    null,'TODOS','production',1,20,p_status,'ALL');
  v_new_ms := extract(epoch from clock_timestamp()-v_start)*1000;
  if v_before is distinct from v_after then
    raise exception 'Resposta divergente no cenário %', p_label;
  end if;
  insert into reconciliation_evidence_test_results values(p_label,true,v_old_ms,v_new_ms,
    (v_after->>'total_count')::integer,jsonb_array_length(v_after->'items'));
end;
$$;
select pg_temp.check_reconciliation_evidence('paid_day','PAGO','2026-09-12','2026-09-12');
select pg_temp.check_reconciliation_evidence('all_day','TODOS','2026-09-12','2026-09-12');
select pg_temp.check_reconciliation_evidence('pending_day','PENDENTE','2026-09-12','2026-09-12');
select pg_temp.check_reconciliation_evidence('overdue_day','VENCIDO','2026-09-12','2026-09-12');
select pg_temp.check_reconciliation_evidence('pending_full','PENDENTE',null,null);
select pg_temp.check_reconciliation_evidence('overdue_full','VENCIDO',null,null);
do $$
declare
  v_start timestamptz := clock_timestamp();
  v_after jsonb;
  v_new_ms numeric;
begin
  v_after := pg_temp.reconciliation_after(null,current_setting('app.test.polo_id')::uuid,
    null,null,null,'TODOS','production',1,20,'PAGO','ALL');
  v_new_ms := extract(epoch from clock_timestamp()-v_start)*1000;
  if coalesce((v_after->>'total_count')::integer,0) < jsonb_array_length(v_after->'items') then
    raise exception 'Contagem paginada inválida';
  end if;
  insert into reconciliation_evidence_test_results values('paid_full_new',null,null,v_new_ms,
    (v_after->>'total_count')::integer,jsonb_array_length(v_after->'items'));
end;
$$;
select * from reconciliation_evidence_test_results order by scenario;
rollback;
