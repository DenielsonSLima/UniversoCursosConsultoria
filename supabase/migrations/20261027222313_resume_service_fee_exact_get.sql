begin;
set local lock_timeout = '5s';

-- A service-approved correction preserves the human authorization archive.
-- A manager may resume its already claimed attempt, never authorize a new POST.
create function public.resume_rejected_fee_service_recovery_secure(
  p_receivable_id uuid, p_cycle_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.contas_receber;
  o internal_academic.technical_rejected_fee_corrections;
  c internal_academic.rejected_fee_service_capabilities;
  secret text;
  queued_request bigint;
  cooldown interval;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  select * into r from public.contas_receber where id = p_receivable_id;
  if not found or not coalesce(
    public.gestor_has_financeiro_tab('receber') and public.is_gestor_for_polo(r.polo_id), false
  ) then
    raise exception 'Sem permissão financeira para consultar este recebível.' using errcode = '42501';
  end if;
  select * into o from internal_academic.technical_rejected_fee_corrections
  where receivable_id = r.id;
  if not found then return jsonb_build_object('handled', false); end if;
  select * into c from internal_academic.rejected_fee_service_capabilities
  where operation_id = o.id;
  if not found then return jsonb_build_object('handled', false); end if;
  if o.cycle_request_id is distinct from p_cycle_request_id or o.matricula_id is distinct from r.matricula_id
    or o.cycle_number <> 2 or o.state <> 'CONSENTED' or o.consent_actor_id is not null
    or c.actor_kind <> 'SYSTEM' or c.first_claimed_at is null
    or c.completed_at is not null or r.gateway_creation_token is distinct from c.request_id then
    raise exception 'A operação da rematrícula exige revisão; nenhuma nova emissão foi autorizada.' using errcode = 'PT409';
  end if;
  c := internal_academic.assert_rejected_fee_service_scope(o.id, o.manifest_hash);
  if c.first_claimed_at < clock_timestamp() - interval '7 days' then
    raise exception 'A janela de recuperação terminou; a rematrícula exige revisão.' using errcode = 'PT409';
  end if;
  cooldown := case
    when c.first_claimed_at >= clock_timestamp() - interval '6 hours' then interval '1 minute'
    when c.first_claimed_at >= clock_timestamp() - interval '24 hours' then interval '5 minutes'
    else interval '1 hour' end;
  if c.lease_until > clock_timestamp() or exists (
    select 1 from public.historico_turma_financeira h
    where h.matricula_id = o.matricula_id and h.evento = 'TAXA_SERVICO_RETOMADA_GET_SOLICITADA'
      and h.regra ->> 'operationId' = o.id::text
      and h.created_at > clock_timestamp() - cooldown
  ) then
    return jsonb_build_object('handled', true, 'queued', false, 'recoveryOnly', true);
  end if;
  secret := public.get_banese_reconciliation_worker_secret();
  if secret is null or length(secret) < 32 then
    raise exception 'Configuração da consulta bancária indisponível.';
  end if;
  queued_request := net.http_post(
    url := 'https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/technical-manual-cycle-recovery-worker',
    body := jsonb_build_object('action', 'issue_approved_rejected_fee_service',
      'operationId', o.id, 'manifestHash', o.manifest_hash),
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Banese-Worker-Token', secret),
    timeout_milliseconds := 90000
  );
  if queued_request is null then raise exception 'A consulta bancária não foi agendada.'; end if;
  perform public.registrar_turma_financeiro_auditoria(o.matricula_id, 'TAXA_SERVICO_RETOMADA_GET_SOLICITADA',
    jsonb_build_object('operationId', o.id, 'cycleRequestId', o.cycle_request_id,
      'requestedBy', auth.uid(), 'recoveryOnly', true, 'issued', false),
    'Consulta da mesma tentativa aprovada pelo serviço; autorização histórica preservada.');
  return jsonb_build_object('handled', true, 'queued', true, 'recoveryOnly', true);
end $$;

revoke all on function public.resume_rejected_fee_service_recovery_secure(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.resume_rejected_fee_service_recovery_secure(uuid, uuid) to authenticated;
commit;
