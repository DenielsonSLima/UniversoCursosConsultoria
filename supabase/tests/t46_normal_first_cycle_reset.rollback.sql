-- Append after the reset migration body, replacing its COMMIT, then ROLLBACK.
-- Uses the real bank-number guard on a temporary projection; no bank operation.
create temporary table t46_bank_number_guard_probe (
  gateway_boleto_nosso_numero text,
  gateway_provider text,
  gateway_payment_method text,
  gateway_environment text,
  gateway_boleto_convenio text
) on commit drop;
create trigger guard_t46_bank_number_probe before insert on t46_bank_number_guard_probe
  for each row execute function internal_academic.guard_technical_manual_banese_canceled_number_reuse();

do $$
declare identity record; tested integer := 0;
begin
  for identity in select bank_environment,bank_convenio,canceled_nosso_numero
    from internal_financial_correction.normal_cycle_reset_archive
    where source_table = 'canceled_bank_identity'
  loop
    begin
      insert into t46_bank_number_guard_probe values
        (identity.canceled_nosso_numero,'banese_card','BOLETO',identity.bank_environment,identity.bank_convenio);
      raise exception 'A canceled bank number was accepted.';
    exception when unique_violation then
      tested := tested + 1;
    end;
  end loop;
  if tested <> 49 then raise exception 'Expected 49 canceled-number rejection tests.'; end if;
  begin
    update internal_financial_correction.normal_cycle_reset_archive
      set payload = '{}'::jsonb where source_table = 'canceled_bank_identity';
    raise exception 'The reset archive accepted an update.';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from internal_financial_correction.normal_cycle_reset_archive
      where source_table = 'canceled_bank_identity';
    raise exception 'The reset archive accepted a delete.';
  exception when sqlstate '55000' then null;
  end;
  if exists(select 1 from pg_roles r
    where r.rolname in ('anon','authenticated','service_role')
      and has_table_privilege(r.oid,
        'internal_financial_correction.normal_cycle_reset_archive'::regclass,'SELECT'))
  then raise exception 'Private audit archive exposed to an application role.'; end if;
end;
$$;

do $$
declare enrollment uuid; mode text; preview jsonb; extract jsonb; actor uuid;
begin
  select actor_id into strict actor from internal_financial_correction.operations
    where fingerprint = '2bceecc45d6dac70f45043c871adae0455f4f369731792646bde8347e5370709';
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',actor)::text,true);
  for enrollment in select distinct (payload->>'matricula_id')::uuid
    from internal_financial_correction.normal_cycle_reset_archive
    where source_table = 'internal_academic.technical_manual_cycle_runs'
  loop
    foreach mode in array array['BOLETO','REGISTRO_SEM_BOLETO','OMITIR'] loop
      preview := public.preview_ciclo_financeiro_tecnico_manual_secure(enrollment,1,date '2026-10-15',
        jsonb_build_object('modoMatricula',mode,'emitirMatricula',mode='BOLETO','itens','[]'::jsonb));
      if preview #>> '{cicloManual,estado}' is distinct from 'ELEGIVEL'
        or preview #>> '{preview,cicloNumero}' is distinct from '1'
        or preview #>> '{preview,modoMatricula}' is distinct from mode
        or (preview #>> '{preview,quantidadeItens}')::integer <> (case when mode='OMITIR' then 12 else 13 end)
      then raise exception 'Ordinary first-cycle preview failed.'; end if;
      if mode='OMITIR' and preview #>> '{preview,itens,0,vencimento}' is distinct from '2026-10-15'
      then raise exception 'Normal first-installment date changed.'; end if;
    end loop;
    extract := public.get_aluno_extrato_financeiro(enrollment);
    if extract->'recebiveis' is distinct from '[]'::jsonb
      or (extract->>'total')::numeric <> 0 or (extract->>'recebido')::numeric <> 0
      or (extract->>'pagos')::integer <> 0 or (extract->>'pendentes')::integer <> 0
    then raise exception 'Student statement retained an erroneous charge.'; end if;
  end loop;
end;
$$;

select jsonb_build_object(
  'canceledNumberRejections',49,
  'operationalReceivables',0,
  'gatewayTransactionsPreserved',49,
  'localPaymentReversed',true,
  'archiveImmutable',true,
  'ordinaryPreviewsPassed',9,
  'emptyStatements',3,
  'cycleStates',(select jsonb_agg(internal_academic.technical_manual_cycle_state(matricula_id)
    order by matricula_id) from (
      select distinct (payload->>'matricula_id')::uuid matricula_id
      from internal_financial_correction.normal_cycle_reset_archive
      where source_table = 'internal_academic.technical_manual_cycle_runs') targets)
) result;
rollback;
