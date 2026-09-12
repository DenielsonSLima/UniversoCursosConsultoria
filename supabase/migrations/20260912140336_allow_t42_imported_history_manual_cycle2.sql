begin;

-- Only hashes are retained for the in-transaction preservation check.
create temporary table t42_cycle_preservation on commit drop as
select 'receivables'::text as source,
  md5(coalesce(jsonb_agg(to_jsonb(record_value) order by record_value.id)::text, '[]')) as fingerprint
from public.contas_receber record_value
where record_value.turma_id in (select id from public.turmas
  where codigo in ('ENF-T42-INT-MAT', '2026.1-RAD-INT-JAP'))
union all
select 'enrollments', md5(coalesce(jsonb_agg(to_jsonb(record_value) order by record_value.id)::text, '[]'))
from public.matriculas record_value
where record_value.turma_id in (select id from public.turmas
  where codigo in ('ENF-T42-INT-MAT', '2026.1-RAD-INT-JAP'))
union all
select 'classes', md5(coalesce(jsonb_agg(to_jsonb(record_value) order by record_value.id)::text, '[]'))
from public.turmas record_value
where codigo in ('ENF-T42-INT-MAT', '2026.1-RAD-INT-JAP')
union all
select 'runs', md5(coalesce(jsonb_agg(to_jsonb(record_value)
  order by record_value.matricula_id, record_value.cycle_number)::text, '[]'))
from internal_academic.technical_manual_cycle_runs record_value
where record_value.turma_id in (select id from public.turmas
  where codigo in ('ENF-T42-INT-MAT', '2026.1-RAD-INT-JAP'));


-- Imported local history differs from a newly created external-history class.
-- Do not normalize old class/enrollment flags, amounts or bank identities.
alter table internal_academic.technical_manual_cycle_policies
  drop constraint technical_manual_cycle_policies_eligibility_rule_check,
  add constraint technical_manual_cycle_policies_eligibility_rule_check
    check (eligibility_rule in (
      'QUITACAO_TOTAL', 'PENULTIMA_SEM_ATRASO', 'HISTORICO_EXTERNO',
      'HISTORICO_IMPORTADO_CONSULTA'
    )),
  add constraint technical_manual_cycle_imported_consultation_check
    check (eligibility_rule <> 'HISTORICO_IMPORTADO_CONSULTA' or (
      initial_state = 'IMPORTADA_CICLO_1' and baseline_cycle = 1
      and max_cycle = 2 and generation_mode = 'MANUAL'
    ));

create or replace function
internal_academic.technical_manual_cycle_policy_projection(
  p_turma_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select jsonb_build_object(
      'habilitado', true,
      'modo', policy.generation_mode,
      'estadoInicial', policy.initial_state,
      'cicloBaseHistorico', policy.baseline_cycle,
      'cicloMaximo', policy.max_cycle,
      'criterioElegibilidade', case
        when policy.eligibility_rule = 'HISTORICO_IMPORTADO_CONSULTA'
          then 'HISTORICO_EXTERNO'
        else policy.eligibility_rule end,
      'revisao', policy.revision,
      'fingerprint', pg_catalog.encode(extensions.digest(
        pg_catalog.convert_to(jsonb_build_object(
          'versao', 2,
          'turmaId', policy.turma_id,
          'modo', policy.generation_mode,
          'estadoInicial', policy.initial_state,
          'cicloBaseHistorico', policy.baseline_cycle,
          'cicloMaximo', policy.max_cycle,
          'criterioElegibilidade', policy.eligibility_rule,
          'revisao', policy.revision
        )::text, 'UTF8'),
        'sha256'
      ), 'hex')
    )
    from internal_academic.technical_manual_cycle_policies policy
    where policy.turma_id = p_turma_id
      and policy.active
      and policy.generation_mode = 'MANUAL'
  ), jsonb_build_object(
    'habilitado', false, 'modo', null, 'estadoInicial', null,
    'cicloBaseHistorico', null, 'cicloMaximo', null,
    'criterioElegibilidade', null, 'revisao', null, 'fingerprint', null
  ));
$function$;

revoke all on function
  internal_academic.technical_manual_cycle_policy_projection(uuid)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.technical_manual_cycle_state(
  p_matricula_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_state jsonb;
  v_policy internal_academic.technical_manual_cycle_policies%rowtype;
  v_block text;
  v_imported_consultation boolean;
begin
  v_state := internal_academic.technical_manual_cycle_state_before_external_history(
    p_matricula_id
  );
  select policy.* into v_policy
  from internal_academic.technical_manual_cycle_policies policy
  join public.matriculas enrollment on enrollment.turma_id = policy.turma_id
  where enrollment.id = p_matricula_id
    and policy.active and policy.eligibility_rule in (
      'HISTORICO_EXTERNO', 'HISTORICO_IMPORTADO_CONSULTA'
    );

  if not found or not coalesce((v_state ->> 'habilitado')::boolean, false) then
    return v_state;
  end if;
  v_imported_consultation :=
    v_policy.eligibility_rule = 'HISTORICO_IMPORTADO_CONSULTA';
  -- Existing clients already understand external history. The fingerprint still
  -- includes the canonical internal criterion and revision, never this alias.
  if v_imported_consultation then
    v_state := v_state || jsonb_build_object(
      'criterioElegibilidade', 'HISTORICO_EXTERNO'
    );
  end if;
  -- Never replace duplicate, terminal or academic/configuration protections.
  if v_state ->> 'estado' in (
      'PROTEGIDO_EXISTENTE', 'JA_GERADO', 'CICLOS_CONCLUIDOS'
    ) or v_state -> 'bloqueio' ->> 'codigo' in (
      'STATUS_ACADEMICO', 'SEM_CONFIGURACAO'
    ) then
    return v_state;
  end if;

  if v_imported_consultation and not exists (
    select 1 from public.turmas class
    where class.id = v_policy.turma_id and class.codigo = 'ENF-T42-INT-MAT'
  ) then
    return v_state || jsonb_build_object(
      'estado', 'BLOQUEADO', 'podeGerar', false,
      'bloqueio', jsonb_build_object(
        'codigo', 'HISTORICO_EXTERNO_REQUER_REVISAO',
        'mensagem', 'A continuidade deste histórico não foi autorizada.'
      )
    );
  end if;

  if v_policy.initial_state <> 'IMPORTADA_CICLO_1'
    or v_policy.baseline_cycle <> 1
    or (v_state ->> 'proximoCicloNumero')::integer is distinct from 2
  then
    v_block := 'A política externa permite somente o 2º ciclo.';
  elsif exists (
    select 1 from internal_academic.technical_manual_cycle_runs run
    where run.matricula_id = p_matricula_id
  ) then
    v_block := 'Existe uma geração registrada. Revise ou retome a emissão existente.';
  elsif exists (
    select 1 from public.contas_receber receivable
    where receivable.matricula_id = p_matricula_id
      and not coalesce((
        v_imported_consultation
        and receivable.turma_id = v_policy.turma_id
        and receivable.tipo_lancamento = 'PARCELA'
        and receivable.origem_pagamento = 'SISTEMA_ANTERIOR'
        and receivable.origem_cronograma_id ~ '^T42-LEG-S[0-9]+-P[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        and (receivable.regra_financeira_tecnica_snapshot -> 'cicloManual') is null
        and receivable.gateway_provider is null
        and receivable.gateway_payment_id is null
        and receivable.gateway_submission_channel is null
        and receivable.gateway_submission_status is null
        and receivable.gateway_boleto_nosso_numero is null
        and receivable.gateway_boleto_linha_digitavel is null
        and receivable.gateway_boleto_codigo_barras is null
        and receivable.asaas_payment_id is null
        and receivable.nosso_numero_asaas is null
        and not exists (
          select 1 from public.payment_gateway_transactions tx
          where tx.receivable_id = receivable.id
        )
      ), false)
  ) then
    v_block := 'Existem cobranças locais nesta matrícula. Revise o histórico antes de gerar outro ciclo.';
  end if;

  if v_block is not null then
    return v_state || jsonb_build_object(
      'estado', 'BLOQUEADO', 'podeGerar', false,
      'bloqueio', jsonb_build_object(
        'codigo', 'HISTORICO_EXTERNO_REQUER_REVISAO', 'mensagem', v_block
      )
    );
  end if;
  -- This is permission for explicit cycle-2 issuance, not proof of payment.
  -- No historical receivable, settlement or fake cycle run is inserted.
  return v_state || jsonb_build_object(
    'estado', 'ELEGIVEL', 'podeGerar', true, 'bloqueio', null,
    'primeiroVencimentoSugerido', null
  );
end;
$function$;

revoke all on function internal_academic.technical_manual_cycle_state(uuid)
  from public, anon, authenticated, service_role;

-- Authorize only the reviewed T42 policy. Existing runs keep their snapshots.
do $enable_t42$
declare
  v_count integer;
  v_turma_id uuid;
begin
  select count(*) into v_count from public.turmas class
  join internal_academic.technical_manual_cycle_policies policy
    on policy.turma_id = class.id
  where class.codigo = 'ENF-T42-INT-MAT' and policy.active
    and policy.initial_state = 'IMPORTADA_CICLO_1'
    and policy.baseline_cycle = 1 and policy.max_cycle = 2
    and policy.eligibility_rule = 'PENULTIMA_SEM_ATRASO';
  if v_count <> 1 then
    raise exception 'A política auditada da T42 mudou; revise antes de aplicar.';
  end if;
  select id into strict v_turma_id from public.turmas
  where codigo = 'ENF-T42-INT-MAT';
  update internal_academic.technical_manual_cycle_policies policy
  set eligibility_rule = 'HISTORICO_IMPORTADO_CONSULTA',
    revision = revision + 1, updated_at = now()
  where policy.turma_id = v_turma_id and policy.active
    and policy.initial_state = 'IMPORTADA_CICLO_1'
    and policy.baseline_cycle = 1 and policy.max_cycle = 2
    and policy.eligibility_rule = 'PENULTIMA_SEM_ATRASO';
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'A alteração deve alcançar exatamente uma política T42.';
  end if;
end;
$enable_t42$;

do $verify_t42$
declare
  v_states jsonb;
  v_count integer;
  v_state jsonb;
  v_row record;
  v_preview jsonb;
begin
  select jsonb_agg(internal_academic.technical_manual_cycle_state(enrollment.id))
  into v_states from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  where class.codigo = 'ENF-T42-INT-MAT';
  if jsonb_array_length(v_states) <> 35 then
    raise exception 'O conjunto auditado T42 mudou; revisar a aplicação.';
  end if;
  select count(*) into v_count from jsonb_array_elements(v_states) state
  where state ->> 'estado' = 'ELEGIVEL' and state ->> 'podeGerar' = 'true'
    and state ->> 'proximoCicloNumero' = '2'
    and state ->> 'criterioElegibilidade' = 'HISTORICO_EXTERNO';
  if v_count <> 27 then raise exception 'Esperadas 27 matrículas elegíveis.'; end if;
  select count(*) into v_count from jsonb_array_elements(v_states) state
  where state ->> 'estado' in ('JA_GERADO', 'PROTEGIDO_EXISTENTE')
    and state ->> 'podeGerar' = 'false';
  if v_count <> 6 then raise exception 'Os seis ciclos emitidos devem permanecer protegidos.'; end if;
  select count(*) into v_count from jsonb_array_elements(v_states) state
  where state ->> 'estado' = 'BLOQUEADO'
    and state -> 'bloqueio' ->> 'codigo' = 'STATUS_ACADEMICO'
    and state ->> 'podeGerar' = 'false';
  if v_count <> 2 then raise exception 'As duas matrículas trancadas devem continuar bloqueadas.'; end if;

  for v_row in select enrollment.id from public.matriculas enrollment
    join public.turmas class on class.id = enrollment.turma_id
    where class.codigo = 'ENF-T42-INT-MAT'
  loop
    v_state := internal_academic.technical_manual_cycle_state(v_row.id);
    if v_state ->> 'estado' = 'ELEGIVEL' then
      v_preview := internal_academic.technical_manual_cycle_preview(
        v_row.id, 2, (timezone('America/Maceio', now()))::date + 30
      );
      if v_preview -> 'preview' ->> 'cicloNumero' is distinct from '2'
        or (v_preview -> 'preview' ->> 'quantidadeItens')::integer is distinct from 13
      then raise exception 'Prévia do segundo ciclo incompatível.'; end if;
    end if;
    begin
      perform internal_academic.technical_manual_cycle_preview(v_row.id, 1, current_date + 30);
      raise exception 'O primeiro ciclo não pode ser gerado.' using errcode = 'P9001';
    exception when invalid_parameter_value then null;
    end;
    begin
      perform internal_academic.technical_manual_cycle_preview(v_row.id, 3, current_date + 30);
      raise exception 'O terceiro ciclo não pode ser gerado.' using errcode = 'P9001';
    exception when invalid_parameter_value then null;
    end;
  end loop;
end;
$verify_t42$;

do $preservation_check$
begin
  if exists (
    (select 'receivables'::text as source,
  md5(coalesce(jsonb_agg(to_jsonb(record_value) order by record_value.id)::text, '[]')) as fingerprint
from public.contas_receber record_value
where record_value.turma_id in (select id from public.turmas
  where codigo in ('ENF-T42-INT-MAT', '2026.1-RAD-INT-JAP'))
union all
select 'enrollments', md5(coalesce(jsonb_agg(to_jsonb(record_value) order by record_value.id)::text, '[]'))
from public.matriculas record_value
where record_value.turma_id in (select id from public.turmas
  where codigo in ('ENF-T42-INT-MAT', '2026.1-RAD-INT-JAP'))
union all
select 'classes', md5(coalesce(jsonb_agg(to_jsonb(record_value) order by record_value.id)::text, '[]'))
from public.turmas record_value
where codigo in ('ENF-T42-INT-MAT', '2026.1-RAD-INT-JAP')
union all
select 'runs', md5(coalesce(jsonb_agg(to_jsonb(record_value)
  order by record_value.matricula_id, record_value.cycle_number)::text, '[]'))
from internal_academic.technical_manual_cycle_runs record_value
where record_value.turma_id in (select id from public.turmas
  where codigo in ('ENF-T42-INT-MAT', '2026.1-RAD-INT-JAP'))
    ) except select * from pg_temp.t42_cycle_preservation
  ) then
    raise exception 'Dados financeiros/acadêmicos existentes não podem mudar.';
  end if;
end;
$preservation_check$;

notify pgrst, 'reload schema';
commit;
