begin;

-- A evidência do item pago continua na hidratação da página. Nesta fase,
-- source_status/verification só participam de filtros e contadores não pagos.
-- Evita buscar e ordenar snapshots de todos os pagos antes de LIMIT/OFFSET.
-- Para não pagos, resolve o link único fora da lateral: o índice por link/data
-- pode fornecer as primeiras observações sem carregar e ordenar todo histórico.
-- obligation_links.receivable_id é UNIQUE: mover o JOIN não multiplica linhas.
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
  if (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'A busca de evidência da conciliação mudou; revisar antes de aplicar.';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$$;

notify pgrst, 'reload schema';
commit;
