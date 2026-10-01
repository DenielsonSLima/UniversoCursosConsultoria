-- Um encerramento posterior reaproveita a baixa mais restritiva do trancamento.
-- Não cria revisão externa falsa nem muda o corte original do job.
begin;

do $patch$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  v_definition := pg_get_functiondef(
    'internal_academic.apply_external_transfer_receivable(uuid,uuid)'::regprocedure
  );
  if md5(v_definition) <> '1306fd686f0697b4542d44a1878bb0ae'
     or v_definition not like '%SECURITY DEFINER%'
     or v_definition not like '%SET search_path TO ''''%'
     or has_function_privilege(
       'anon',
       'internal_academic.apply_external_transfer_receivable(uuid,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'internal_academic.apply_external_transfer_receivable(uuid,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'internal_academic.apply_external_transfer_receivable(uuid,uuid)',
       'EXECUTE'
     ) then
    raise exception 'Drift em apply_external_transfer_receivable.';
  end if;

  v_old := $old$    if not exists(select 1 from public.banese_cancellation_outbox
      where receivable_id=v_row.id and movement_id=v_move.id
        and state in ('PENDING','RETRY','PROCESSING','DONE','REVIEW_REQUIRED')) then
      v_action:='REVISAO_EXTERNA';
    end if;$old$;
  v_new := $new$    if not exists(select 1 from public.banese_cancellation_outbox j
      where j.receivable_id=v_row.id
        and j.state in ('PENDING','RETRY','PROCESSING','DONE','REVIEW_REQUIRED')
        and (j.movement_id=v_move.id or (
          j.reason='TRANCAMENTO_FUTURO'
          and internal_academic.banese_trancamento_job_matches(v_row,j)
        ))) then
      v_action:='REVISAO_EXTERNA';
    end if;$new$;
  if length(v_definition) - length(replace(v_definition, v_old, ''))
       <> length(v_old) then
    raise exception 'Âncora da revisão financeira externa mudou.';
  end if;
  execute replace(v_definition, v_old, v_new);

  v_definition := pg_get_functiondef(
    'public.ajustar_financeiro_movimentacao_matricula()'::regprocedure
  );
  v_old := $old$      and status = 'SUSPENSO'
      and data_pagamento is null;$old$;
  v_new := $new$      and status = 'SUSPENSO'
      and data_pagamento is null
      and not exists (select 1 from internal_proesc.obligation_links link
        where link.receivable_id = contas_receber.id);$new$;
  if length(v_definition) - length(replace(v_definition, v_old, ''))
       <> length(v_old) then
    raise exception 'Âncora readonly Proesc da reativação mudou.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  v_old := $old$      and coalesce(valor_pago, 0) = 0
      and ($old$;
  v_new := $new$      and coalesce(valor_pago, 0) = 0
      and not exists (select 1 from internal_proesc.obligation_links link
        where link.receivable_id = contas_receber.id)
      and ($new$;
  if length(v_definition) - length(replace(v_definition, v_old, ''))
       <> length(v_old) then
    raise exception 'Âncora readonly Proesc do encerramento mudou.';
  end if;
  execute replace(v_definition, v_old, v_new);

  v_definition := pg_get_functiondef(
    'public.cancel_late_terminal_local_receivable()'::regprocedure
  );
  v_old := $old$     or coalesce(new.valor_pago, 0) <> 0 then$old$;
  v_new := $new$     or coalesce(new.valor_pago, 0) <> 0
     or exists (select 1 from internal_proesc.obligation_links link
       where link.receivable_id = new.id) then$new$;
  if length(v_definition) - length(replace(v_definition, v_old, ''))
       <> length(v_old) then
    raise exception 'Âncora readonly Proesc tardia mudou.';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$patch$;

comment on function internal_academic.apply_external_transfer_receivable(
  uuid, uuid
) is 'Encerramento externo aceita baixa Banese mais restritiva já aberta pelo trancamento.';

commit;
