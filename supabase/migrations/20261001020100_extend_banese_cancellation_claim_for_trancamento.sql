-- Reusa a lane canônica com as mesmas leases, snapshot, CAS e confirmação remota.
begin;

do $guard$
declare
  v_definition text;
  v_signature text;
  v_expected_md5 text;
begin
  for v_signature, v_expected_md5 in
    select * from (values
      ('public.claim_banese_cancellation_batch(integer)',
        'd84e7814737036c428b52a6d53fe08af'),
      ('public.start_banese_cancellation_remote_attempt(uuid,uuid)',
        '0f64370030e0663df813109c01f30947'),
      ('public.complete_banese_cancellation_job(uuid,uuid,text,boolean)',
        '09433695b59a5f0822118c89a01d4c8f')
    ) expected(signature, definition_md5)
  loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    if md5(v_definition) <> v_expected_md5
       or v_definition not like '%SECURITY DEFINER%'
       or v_definition not like '%SET search_path TO ''''%' then
      raise exception 'Drift na função Banese %.', v_signature;
    end if;
    if has_function_privilege('anon', v_signature, 'EXECUTE')
       or has_function_privilege('authenticated', v_signature, 'EXECUTE')
       or not has_function_privilege('service_role', v_signature, 'EXECUTE') then
      raise exception 'ACL inesperada na função Banese %.', v_signature;
    end if;
  end loop;
end;
$guard$;

do $patch$
declare
  v_definition text;
  v_old text;
  v_new text;
  v_count integer;
begin
  v_definition := pg_get_functiondef(
    'public.claim_banese_cancellation_batch(integer)'::regprocedure
  );

  v_old := $old$and c.data_pagamento is null$old$;
  v_count := (length(v_definition) - length(replace(v_definition, v_old, '')))
    / length(v_old);
  if v_count <> 2 then
    raise exception 'Drift nas cercas de pagamento do claim: %.', v_count;
  end if;
  v_new := $new$and c.data_pagamento is null
      and not exists (select 1 from internal_proesc.obligation_links link
        where link.receivable_id = c.id)
      and (
        j.reason <> 'TRANCAMENTO_FUTURO'
        or internal_academic.banese_trancamento_job_matches(c, j)
      )$new$;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$m.status in ('DESISTENTE', 'CANCELADO', 'TRANSFERIDO')$old$;
  v_count := (length(v_definition) - length(replace(v_definition, v_old, '')))
    / length(v_old);
  if v_count <> 2 then
    raise exception 'Drift nas cercas acadêmicas do claim: %.', v_count;
  end if;
  v_new := $new$(
        m.status in ('DESISTENTE', 'CANCELADO', 'TRANSFERIDO')
        or internal_academic.banese_trancamento_job_matches(c, j)
      )$new$;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$mm.tipo = j.reason$old$;
  v_count := (length(v_definition) - length(replace(v_definition, v_old, '')))
    / length(v_old);
  if v_count <> 2 then
    raise exception 'Drift nas identidades de movimento do claim: %.', v_count;
  end if;
  v_new := $new$mm.tipo = case
          when j.reason = 'TRANCAMENTO_FUTURO' then 'TRANCAMENTO'
          else j.reason
        end$new$;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$mm.status_novo = m.status$old$;
  v_count := (length(v_definition) - length(replace(v_definition, v_old, '')))
    / length(v_old);
  if v_count <> 2 then
    raise exception 'Drift nos destinos acadêmicos do claim: %.', v_count;
  end if;
  v_new := $new$(
          mm.status_novo = m.status
          or (mm.status_novo = 'TRANCADO'
            and internal_academic.banese_trancamento_job_matches(c, j))
        )$new$;
  execute replace(v_definition, v_old, v_new);

  v_definition := pg_get_functiondef(
    'public.start_banese_cancellation_remote_attempt(uuid,uuid)'::regprocedure
  );
  v_old := $old$and c.data_pagamento is null$old$;
  v_count := (length(v_definition) - length(replace(v_definition, v_old, '')))
    / length(v_old);
  if v_count <> 1 then
    raise exception 'Drift na cerca de pagamento do start: %.', v_count;
  end if;
  v_new := $new$and c.data_pagamento is null
    and not exists (select 1 from internal_proesc.obligation_links link
      where link.receivable_id = c.id)
    and (
      v_job.reason <> 'TRANCAMENTO_FUTURO'
      or internal_academic.banese_trancamento_job_matches(c, v_job)
    )$new$;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$m.status in ('DESISTENTE', 'CANCELADO', 'TRANSFERIDO')$old$;
  v_count := (length(v_definition) - length(replace(v_definition, v_old, '')))
    / length(v_old);
  if v_count <> 1 then
    raise exception 'Drift na cerca acadêmica do start: %.', v_count;
  end if;
  v_new := $new$(
      m.status in ('DESISTENTE', 'CANCELADO', 'TRANSFERIDO')
      or internal_academic.banese_trancamento_job_matches(c, v_job)
    )$new$;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$mm.tipo = v_job.reason$old$;
  v_count := (length(v_definition) - length(replace(v_definition, v_old, '')))
    / length(v_old);
  if v_count <> 1 then
    raise exception 'Drift na identidade de movimento do start: %.', v_count;
  end if;
  v_new := $new$mm.tipo = case
      when v_job.reason = 'TRANCAMENTO_FUTURO' then 'TRANCAMENTO'
      else v_job.reason
    end$new$;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$mm.status_novo = m.status$old$;
  v_count := (length(v_definition) - length(replace(v_definition, v_old, '')))
    / length(v_old);
  if v_count <> 1 then
    raise exception 'Drift no destino acadêmico do start: %.', v_count;
  end if;
  v_new := $new$(
      mm.status_novo = m.status
      or (mm.status_novo = 'TRANCADO'
        and internal_academic.banese_trancamento_job_matches(c, v_job))
    )$new$;
  execute replace(v_definition, v_old, v_new);

  v_definition := pg_get_functiondef(
    'public.complete_banese_cancellation_job(uuid,uuid,text,boolean)'::regprocedure
  );
  v_old := $old$and c.data_pagamento is null$old$;
  v_count := (length(v_definition) - length(replace(v_definition, v_old, '')))
    / length(v_old);
  if v_count <> 2 then
    raise exception 'Drift nas cercas de pagamento do complete: %.', v_count;
  end if;
  v_new := $new$and c.data_pagamento is null
    and not exists (select 1 from internal_proesc.obligation_links link
      where link.receivable_id = c.id)
    and (
      v_job.reason <> 'TRANCAMENTO_FUTURO'
      or internal_academic.banese_trancamento_job_matches(c, v_job)
    )$new$;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$and c.status = v_job.snapshot_receivable_status
    and c.status in ('PENDENTE', 'VENCIDO', 'SUSPENSO')
    and c.data_pagamento is null
    and not exists (select 1 from internal_proesc.obligation_links link
      where link.receivable_id = c.id)
    and (
      v_job.reason <> 'TRANCAMENTO_FUTURO'
      or internal_academic.banese_trancamento_job_matches(c, v_job)
    )$old$;
  v_count := (length(v_definition) - length(replace(v_definition, v_old, '')))
    / length(v_old);
  if v_count <> 1 then
    raise exception 'Drift na cerca pós-remoto do complete: %.', v_count;
  end if;
  v_new := $new$and c.status = v_job.snapshot_receivable_status
    and c.status in ('PENDENTE', 'VENCIDO', 'SUSPENSO')
    and c.data_pagamento is null
    and not exists (select 1 from internal_proesc.obligation_links link
      where link.receivable_id = c.id)
    and (
      v_job.reason <> 'TRANCAMENTO_FUTURO'
      or internal_academic.banese_trancamento_completion_matches(c, v_job)
    )$new$;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$m.status in ('DESISTENTE', 'CANCELADO', 'TRANSFERIDO')$old$;
  v_count := (length(v_definition) - length(replace(v_definition, v_old, '')))
    / length(v_old);
  if v_count <> 1 then
    raise exception 'Drift na cerca acadêmica do complete: %.', v_count;
  end if;
  v_new := $new$(
      m.status in ('DESISTENTE', 'CANCELADO', 'TRANSFERIDO')
      or internal_academic.banese_trancamento_job_matches(c, v_job)
    )$new$;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$mm.tipo = v_job.reason$old$;
  v_count := (length(v_definition) - length(replace(v_definition, v_old, '')))
    / length(v_old);
  if v_count <> 1 then
    raise exception 'Drift na identidade de movimento do complete: %.', v_count;
  end if;
  v_new := $new$mm.tipo = case
      when v_job.reason = 'TRANCAMENTO_FUTURO' then 'TRANCAMENTO'
      else v_job.reason
    end$new$;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$mm.status_novo = m.status$old$;
  v_count := (length(v_definition) - length(replace(v_definition, v_old, '')))
    / length(v_old);
  if v_count <> 1 then
    raise exception 'Drift no destino acadêmico do complete: %.', v_count;
  end if;
  v_new := $new$(
      mm.status_novo = m.status
      or (mm.status_novo = 'TRANCADO'
        and internal_academic.banese_trancamento_job_matches(c, v_job))
    )$new$;
  execute replace(v_definition, v_old, v_new);
end;
$patch$;

revoke all on function public.claim_banese_cancellation_batch(integer)
  from public, anon, authenticated;
revoke all on function public.start_banese_cancellation_remote_attempt(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_banese_cancellation_job(
  uuid, uuid, text, boolean
) from public, anon, authenticated;
grant execute on function public.claim_banese_cancellation_batch(integer)
  to service_role;
grant execute on function public.start_banese_cancellation_remote_attempt(uuid, uuid)
  to service_role;
grant execute on function public.complete_banese_cancellation_job(
  uuid, uuid, text, boolean
) to service_role;

comment on function public.claim_banese_cancellation_batch(integer) is
  'Reserva cancelamentos terminais ou futuros por trancamento, com identidade e corte revalidados.';

commit;
