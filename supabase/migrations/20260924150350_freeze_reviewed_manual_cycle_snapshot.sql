begin;

alter table internal_academic.technical_manual_cycle_runs
  add column if not exists reviewed_items jsonb
  check (reviewed_items is null or jsonb_typeof(reviewed_items) = 'array');

CREATE OR REPLACE FUNCTION internal_academic.guard_technical_receivable_policy_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_snapshot jsonb;
  v_cycle jsonb;
  v_request_setting text;
  v_authorization_id uuid;
  v_reviewed_items jsonb;
  v_item jsonb;
begin
  if tg_op = 'INSERT' then
    v_snapshot := internal_academic.build_technical_receivable_policy_snapshot(
      new.matricula_id, new.tipo_lancamento, new.descricao, new.valor, false
    );
    if v_snapshot is null then return new; end if;

    v_cycle := new.regra_financeira_tecnica_snapshot -> 'cicloManual';
    v_request_setting := nullif(current_setting(
      'app.technical_manual_cycle_request_id', true
    ), '');
    if v_cycle is not null or v_request_setting is not null then
      if jsonb_typeof(v_cycle) <> 'object'
        or coalesce(v_cycle ->> 'requestId', '') <> v_request_setting
        or not exists (
          select 1
          from internal_academic.technical_manual_cycle_runs run
          where run.matricula_id = new.matricula_id
            and run.turma_id = new.turma_id
            and run.cycle_number = (v_cycle ->> 'cicloNumero')::integer
            and run.request_id = (v_cycle ->> 'requestId')::uuid
            and run.rule_fingerprint = v_cycle ->> 'regraFingerprint'
            and run.policy_fingerprint = v_cycle ->> 'politicaFingerprint'
            and run.schedule_fingerprint = v_cycle ->> 'cronogramaFingerprint'
            and run.state = 'GENERATING'
        )
      then
        raise exception 'Contexto do ciclo manual inválido no snapshot técnico.'
          using errcode = '23514';
      end if;
      select run.reviewed_items into v_reviewed_items
      from internal_academic.technical_manual_cycle_runs run
      where run.matricula_id = new.matricula_id
        and run.cycle_number = (v_cycle ->> 'cicloNumero')::integer
        and run.request_id = (v_cycle ->> 'requestId')::uuid;
      if v_reviewed_items is not null then
        select i into v_item from jsonb_array_elements(v_reviewed_items) i
          where i ->> 'chave' = new.origem_cronograma_id;
        if v_item is null
          or (v_item ->> 'valor')::numeric is distinct from new.valor
          or (v_item ->> 'vencimento')::date is distinct from new.data_vencimento
          or v_item ->> 'tipo' is distinct from new.tipo_lancamento
          or (v_item ->> 'numero')::integer is distinct from new.parcela_numero
        then
          raise exception 'Recebível diverge da revisão canônica do ciclo.'
            using errcode = '23514';
        end if;
        v_snapshot := internal_academic.manual_cycle_reviewed_snapshot(new.matricula_id, v_item);
      end if;
      v_snapshot := v_snapshot || jsonb_build_object(
        'cicloManual', v_cycle
      );
    end if;
    new.regra_financeira_tecnica_snapshot := v_snapshot;
    return new;
  end if;

  if old.regra_financeira_tecnica_snapshot is not null then
    if new.valor is distinct from old.valor
      or new.matricula_id is distinct from old.matricula_id
      or new.tipo_lancamento is distinct from old.tipo_lancamento
    then
      raise exception 'A política e o valor de um título técnico emitido são imutáveis.'
        using errcode = '23514';
    end if;
    if new.regra_financeira_tecnica_snapshot
        is distinct from old.regra_financeira_tecnica_snapshot
    then
      select audit.id into v_authorization_id
      from internal_academic.banese_discount_correction_audit audit
      where audit.receivable_id = old.id
        and audit.database_txid = pg_catalog.txid_current()
        and audit.state = 'AUTHORIZED'
        and audit.expected_technical_snapshot
          = old.regra_financeira_tecnica_snapshot
        and audit.corrected_technical_snapshot
          = new.regra_financeira_tecnica_snapshot
      for update;
      if not found then
        raise exception 'A política e o valor de um título técnico emitido são imutáveis.'
          using errcode = '23514';
      end if;
      update internal_academic.banese_discount_correction_audit audit
      set state = 'SNAPSHOT_APPLIED', snapshot_applied_at = clock_timestamp()
      where audit.id = v_authorization_id and audit.state = 'AUTHORIZED';
      if not found then
        raise exception 'Autorização da correção técnica já foi consumida.'
          using errcode = '40001';
      end if;
    end if;
    return new;
  end if;

  v_snapshot := internal_academic.build_technical_receivable_policy_snapshot(
    new.matricula_id, new.tipo_lancamento, new.descricao, new.valor, false
  );
  if v_snapshot is not null then
    new.regra_financeira_tecnica_snapshot := v_snapshot;
  end if;
  return new;
end;
$function$;

revoke all on function internal_academic.guard_technical_receivable_policy_snapshot()
  from public, anon, authenticated, service_role;

commit;
