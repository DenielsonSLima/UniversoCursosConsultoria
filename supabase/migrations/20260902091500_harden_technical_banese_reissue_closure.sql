begin;
set local lock_timeout = '5s';

alter table internal_academic.technical_manual_banese_reissue_jobs
  add column recovered_pix_at timestamptz;

create or replace function
internal_academic.guard_banese_canceled_number_archive_global()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'banese-canceled-number:' || new.environment || ':' || new.convenio || ':' ||
      new.canceled_nosso_numero, 0));
  if exists (
    select 1 from public.contas_receber as receivable
    where receivable.id <> new.receivable_id
      and receivable.gateway_provider = 'banese_card'
      and receivable.gateway_environment = new.environment
      and receivable.gateway_payment_method = 'BOLETO'
      and receivable.gateway_boleto_convenio = new.convenio
      and receivable.gateway_boleto_nosso_numero = new.canceled_nosso_numero
  ) then
    raise exception 'Nosso Número Banese pertence a outro recebível.'
      using errcode = '23505';
  elsif tg_table_schema = 'internal_academic' and exists (
    select 1 from public.banese_ead_title_replacement_archive as archive
    where archive.environment = new.environment
      and archive.convenio = new.convenio
      and archive.canceled_nosso_numero = new.canceled_nosso_numero
  ) then
    raise exception 'Nosso Número Banese já arquivado no fluxo EAD.'
      using errcode = '23505';
  elsif tg_table_schema = 'public' and exists (
    select 1
    from internal_academic.technical_manual_banese_reissue_archive as archive
    where archive.environment = new.environment
      and archive.convenio = new.convenio
      and archive.canceled_nosso_numero = new.canceled_nosso_numero
  ) then
    raise exception 'Nosso Número Banese já arquivado no fluxo técnico.'
      using errcode = '23505';
  end if;
  return new;
end;
$function$;

revoke all on function
  internal_academic.guard_banese_canceled_number_archive_global()
  from public, anon, authenticated, service_role;

create or replace function
internal_academic.finish_technical_manual_banese_reissue_on_recovered_pix()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job internal_academic.technical_manual_banese_reissue_jobs%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if not (
      coalesce(auth.role(), '') = 'service_role'
      or session_user in ('postgres', 'supabase_admin', 'service_role'))
    or old.gateway_submission_status is distinct from 'API_AMBIGUOUS'
    or new.gateway_submission_status is distinct from 'API_REGISTERED'
    or current_setting(
      'app.technical_manual_cycle_review_reopen_receivable_id', true
    ) is distinct from new.id::text
    or old.gateway_creation_token is null
    or new.gateway_creation_token is not null
    or nullif(btrim(coalesce(new.gateway_pix_payload, '')), '') is null
    or nullif(btrim(coalesce(new.gateway_pix_encoded_image, '')), '') is null
  then
    return new;
  end if;
  select job.* into v_job
  from internal_academic.technical_manual_banese_reissue_jobs as job
  where job.receivable_id = new.id
    and job.recovery_request_id = old.gateway_creation_token
    and job.canceled_nosso_numero = new.gateway_boleto_nosso_numero
    and job.status in ('FENCED', 'CANCEL_INTENT')
  for update;
  if not found then
    return new;
  end if;
  if v_job.status = 'CANCEL_INTENT' and (
      v_job.cancel_mutation_intent_at is null
      or v_job.cancel_mutation_intent_at > v_now - interval '3 minutes'
    )
  then
    raise exception
      'Intenção de baixa Banese ainda ativa; persistência Pix bloqueada.'
      using errcode = 'PT409';
  end if;
  update internal_academic.technical_manual_banese_reissue_jobs
  set status = 'RECOVERED_PIX', recovered_pix_at = v_now,
      lease_valid_until = v_now, updated_at = v_now
  where id = v_job.id
    and status in ('FENCED', 'CANCEL_INTENT');
  if not found then
    raise exception 'Job técnico perdeu o fence ao concluir Pix recuperado.'
      using errcode = '40001';
  end if;
  perform public.registrar_turma_financeiro_auditoria(
    v_job.matricula_id,
    'CICLO_TECNICO_MANUAL_BANESE_REISSUE_RECOVERED_PIX',
    jsonb_build_object(
      'mode', 'INTERNAL_RECOVERY', 'jobId', v_job.id,
      'previousStatus', v_job.status, 'receivableId', v_job.receivable_id,
      'cycleNumber', v_job.cycle_number,
      'cycleRequestId', v_job.cycle_request_id,
      'recoveryRequestId', v_job.recovery_request_id,
      'nossoNumero', v_job.canceled_nosso_numero),
    'Pix oficial recuperado por GET; baixa e reemissão foram encerradas.');
  return new;
end;
$function$;

revoke all on function
  internal_academic.finish_technical_manual_banese_reissue_on_recovered_pix()
  from public, anon, authenticated, service_role;

commit;
