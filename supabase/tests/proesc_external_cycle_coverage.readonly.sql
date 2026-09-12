-- Run through MCP Supabase after the migrations and again after the authorized
-- import. Contains no student identifiers and never generates a receivable.
begin read only;
do $coverage_contract$
declare
  v_coverage record;
  v_state jsonb;
  v_count integer;
  v_cycle integer;
begin
  if exists (select 1 from internal_academic.technical_external_cycle_coverage
    where state <> 'CONFIRMED') then
    raise exception 'Uma importação parcial não pode permanecer publicada.';
  end if;
  if has_table_privilege('authenticated',
      'internal_academic.technical_external_cycle_coverage', 'SELECT')
    or has_table_privilege('service_role',
      'internal_academic.technical_external_cycle_evidence', 'INSERT')
    or has_function_privilege('authenticated',
      'public.import_and_protect_t42_proesc_cycle2_service(uuid,uuid,uuid,jsonb)', 'EXECUTE')
    or has_function_privilege('anon',
      'internal_academic.is_authorized_external_history_insert(public.contas_receber)', 'EXECUTE')
  then raise exception 'Cobertura e claims devem permanecer privados.'; end if;

  for v_coverage in select coverage.*
    from internal_academic.technical_external_cycle_coverage coverage
  loop
    if not exists (select 1 from public.turmas
      where id = v_coverage.turma_id and codigo = 'ENF-T42-INT-MAT')
      or not internal_academic.is_technical_manual_cycle_protected(v_coverage.matricula_id)
      or exists (select 1 from internal_academic.technical_manual_cycle_runs
        where matricula_id = v_coverage.matricula_id)
    then raise exception 'A cobertura externa deve ser independente da geração local.'; end if;
    select count(*) into v_count
    from internal_academic.technical_external_cycle_evidence evidence
    join public.contas_receber receivable on receivable.id = evidence.receivable_id
    where evidence.matricula_id = v_coverage.matricula_id
      and receivable.matricula_id = v_coverage.matricula_id
      and receivable.turma_id = v_coverage.turma_id
      and to_jsonb(receivable) @> (evidence.expected_receivable
        - 'status' - 'valor_pago' - 'data_pagamento')
      and receivable.gateway_provider is null
      and not exists (select 1 from public.payment_gateway_transactions tx
        where tx.receivable_id = receivable.id);
    if v_count <> 25 then raise exception 'As 25 identidades de evidência devem permanecer vinculadas.'; end if;
    v_state := internal_academic.technical_manual_cycle_state(v_coverage.matricula_id);
    if v_state ->> 'estado' is distinct from 'PROTEGIDO_EXISTENTE'
      or v_state ->> 'podeGerar' is distinct from 'false'
      or v_state ->> 'proximoCicloNumero' is not null
      or v_state -> 'cicloGerado' ->> 'origemEmissao' is distinct from 'PROESC'
      or v_state -> 'cicloGerado' ->> 'abrangencia' is distinct from 'CONTRATO_COMPLETO'
      or v_state -> 'cicloGerado' ->> 'status' is distinct from 'EXTERNAL_COVERAGE'
      or v_state -> 'cicloGerado' ->> 'emitidosBanese' is distinct from '0'
      or v_state -> 'cicloGerado' ->> 'pendentesEmissao' is distinct from '0'
    then raise exception 'A projeção deve informar Proesc sem emissão Banese.'; end if;
    for v_cycle in 1..3 loop
      begin
        perform internal_academic.technical_manual_cycle_preview(
          v_coverage.matricula_id, v_cycle, current_date + 30
        );
        raise exception 'A cobertura não pode oferecer prévia para gerar ciclo.' using errcode = 'P9001';
      exception when invalid_parameter_value then null;
      end;
    end loop;
  end loop;
end;
$coverage_contract$;

do $service_authorization$
begin
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform public.import_and_protect_t42_proesc_cycle2_service(null, null, null, '[]'::jsonb);
    raise exception 'Importação exige autorização antes de validar payload/replay.' using errcode = 'P9001';
  exception when insufficient_privilege then null;
  end;
end;
$service_authorization$;
rollback;
