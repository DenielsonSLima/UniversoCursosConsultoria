-- A transfer can request a bank cancellation only after its effective date.
-- Keep all existing identity, payment, lease, CAS and confirmation checks.
begin;

do $patch$
declare v_definition text; v_old text; v_new text; v_count integer; v_name text;
begin
  v_definition:=pg_get_functiondef('public.enqueue_banese_cancellation(uuid,uuid,date,text)'::regprocedure);
  v_old:=$old$  where c.id = p_receivable_id
    and c.matricula_id is not null$old$;
  if length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) then
    raise exception 'Banese enqueue boundary changed.';
  end if;
  execute replace(v_definition,v_old,$new$  where c.id = p_receivable_id
    and (p_reason<>'TRANSFERENCIA_EXTERNA_ENVIADA' or (
      internal_academic.transfer_receivable_action(c,'EXTERNA_ENVIADA',p_effective_date)='AGUARDAR_BANESE'
      and exists(select 1 from public.matricula_movimentacoes mm
        join public.matriculas m on m.id=mm.matricula_id
        where mm.id=p_movement_id and mm.matricula_id=c.matricula_id
          and mm.id=internal_academic.current_external_transfer_movement(c.matricula_id)
          and mm.tipo=p_reason and mm.data_movimentacao=p_effective_date
          and mm.status_novo='TRANSFERIDO' and m.status=mm.status_novo)))
    and c.matricula_id is not null$new$);

  v_definition:=pg_get_functiondef('public.claim_banese_cancellation_batch(integer)'::regprocedure);
  v_old:=$old$and c.data_pagamento is null$old$;
  v_count:=(length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old);
  if v_count<>2 then raise exception 'Banese claim payment boundaries changed: %',v_count; end if;
  execute replace(v_definition,v_old,$new$and c.data_pagamento is null
      and (j.reason<>'TRANSFERENCIA_EXTERNA_ENVIADA' or (c.data_vencimento>j.effective_date
        and j.movement_id=internal_academic.current_external_transfer_movement(c.matricula_id)))$new$);

  foreach v_name in array array[
    'public.start_banese_cancellation_remote_attempt(uuid,uuid)',
    'public.complete_banese_cancellation_job(uuid,uuid,text,boolean)'
  ] loop
    v_definition:=pg_get_functiondef(v_name::regprocedure);
    v_old:=$old$and c.data_pagamento is null$old$;
    v_count:=(length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old);
    if v_count<>(case when v_name like '%complete_%' then 2 else 1 end) then
      raise exception 'Banese start/complete payment boundaries changed: %',v_name;
    end if;
    execute replace(v_definition,v_old,$new$and c.data_pagamento is null
    and (v_job.reason<>'TRANSFERENCIA_EXTERNA_ENVIADA' or (c.data_vencimento>v_job.effective_date
      and v_job.movement_id=internal_academic.current_external_transfer_movement(c.matricula_id)))$new$);
  end loop;
end;
$patch$;
commit;
