-- Contrato real da RPC, sem commit nem chamada ao banco externo.
-- Via MCP, na mesma transação iniciada abaixo:
-- 1. Defina app.test.manual_settlement_id para fixture em revisão explicitamente escolhida.
-- 2. Crie pg_temp.finalize_receivable_manual_settlement com o corpo exato da
--    migration 20260916120000 (só trocar o schema public por pg_temp na assinatura).
--    Insira CREATE antes do DO, depois do CREATE TEMPORARY TABLE.
-- Toda mutação de cenário é revertida em subtransação; ROLLBACK também descarta
-- objetos temporários. Não usar apply_migration nem persistir fixture/identidade.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '20s';
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temporary table manual_settlement_smoke_results (scenario text, passed boolean) on commit drop;
do $$
declare
  v_attempt public.receivable_manual_settlements%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_token uuid := gen_random_uuid();
  v_result jsonb;
  v_context text;
  v_snapshot jsonb;
  v_key text;
begin
  select * into strict v_attempt from public.receivable_manual_settlements
  where id = current_setting('app.test.manual_settlement_id')::uuid for update;
  select * into strict v_receivable from public.contas_receber
  where id = v_attempt.receivable_id for update;
  if v_attempt.state <> 'REVIEW_REQUIRED' or v_receivable.status <> 'PENDENTE'
     or v_receivable.manual_settlement_id is not null
     or v_attempt.remote_canceled_at is null then
    raise exception 'Fixture mudou: interromper smoke e revisar evidências.';
  end if;

  -- Sucesso com os dois contextos e compatibilidade de snapshot legado.
  foreach v_context in array array['STANDARD', 'DASHBOARD_EXISTING_TITLE_ONLY', 'LEGACY'] loop
    begin
      v_snapshot := v_attempt.receivable_snapshot - 'manual_settlement_context';
      if v_context <> 'LEGACY' then
        v_snapshot := v_snapshot || jsonb_build_object('manual_settlement_context', v_context);
      end if;
      update public.receivable_manual_settlements
      set state = 'REMOTE_CANCELED_LOCAL_PENDING', lease_token = v_token,
          lease_expires_at = clock_timestamp() + interval '2 minutes',
          receivable_snapshot = v_snapshot
      where id = v_attempt.id;
      v_result := pg_temp.finalize_receivable_manual_settlement(v_attempt.id, v_token);
      if v_result ->> 'success' is distinct from 'true' or not exists (
        select 1 from public.contas_receber
        where id = v_receivable.id and status = 'PAGO' and valor_pago = v_attempt.received_cents::numeric / 100
          and manual_settlement_discount_cents = v_attempt.discount_cents
          and manual_settlement_received_cents = v_attempt.received_cents
          and conta_bancaria_id = v_attempt.account_id
          and manual_settlement_id = v_attempt.id
      ) then
        raise exception 'Baixa canônica não conferiu.';
      end if;
      v_result := pg_temp.finalize_receivable_manual_settlement(v_attempt.id, v_token);
      if v_result ->> 'replayed' is distinct from 'true' then
        raise exception 'Replay idempotente ausente.';
      end if;
      raise exception using errcode = 'ZX001', message = 'rollback intencional do cenário';
    exception when sqlstate 'ZX001' then
      insert into manual_settlement_smoke_results values ('settle_and_replay_' || v_context, true);
    end;
  end loop;

  -- Cada campo financeiro/remoto continua protegido contra divergência CAS.
  for v_key in select jsonb_object_keys(v_attempt.receivable_snapshot - 'manual_settlement_context') loop
    begin
      update public.receivable_manual_settlements
      set state = 'REMOTE_CANCELED_LOCAL_PENDING', lease_token = v_token,
          lease_expires_at = clock_timestamp() + interval '2 minutes',
          receivable_snapshot = jsonb_set(v_attempt.receivable_snapshot, array[v_key], '"changed"'::jsonb)
      where id = v_attempt.id;
      perform pg_temp.finalize_receivable_manual_settlement(v_attempt.id, v_token);
      raise exception 'CAS aceitou campo divergente: %', v_key;
    exception when sqlstate 'PT409' then
      insert into manual_settlement_smoke_results values ('reject_changed_' || v_key, true);
    end;
  end loop;

  foreach v_context in array array['UNKNOWN', 'null', '{}'] loop
    begin
      update public.receivable_manual_settlements
      set state = 'REMOTE_CANCELED_LOCAL_PENDING', lease_token = v_token,
          lease_expires_at = clock_timestamp() + interval '2 minutes',
          receivable_snapshot = (v_attempt.receivable_snapshot - 'manual_settlement_context') ||
            jsonb_build_object('manual_settlement_context', case
              when v_context = 'null' then 'null'::jsonb
              when v_context = '{}' then '{}'::jsonb
              else to_jsonb(v_context) end)
      where id = v_attempt.id;
      perform pg_temp.finalize_receivable_manual_settlement(v_attempt.id, v_token);
      raise exception 'Contexto inválido foi aceito.';
    exception when invalid_parameter_value then
      insert into manual_settlement_smoke_results values ('reject_context_' || v_context, true);
    end;
  end loop;

  begin
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
    perform pg_temp.finalize_receivable_manual_settlement(v_attempt.id, v_token);
    raise exception 'A RPC aceitou caller sem service_role.';
  exception when insufficient_privilege then
    insert into manual_settlement_smoke_results values ('reject_authenticated', true);
  end;
end;
$$;
select * from manual_settlement_smoke_results order by scenario;
rollback;
