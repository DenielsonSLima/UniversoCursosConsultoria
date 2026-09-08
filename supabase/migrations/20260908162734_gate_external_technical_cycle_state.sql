begin;

-- Preserve issued-title states, API_REVIEW and the last-boleto date suggestion.
alter function internal_academic.technical_manual_cycle_state(uuid)
  rename to technical_manual_cycle_state_before_external_history;
revoke all on function
  internal_academic.technical_manual_cycle_state_before_external_history(uuid)
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
begin
  v_state := internal_academic.technical_manual_cycle_state_before_external_history(
    p_matricula_id
  );
  select policy.* into v_policy
  from internal_academic.technical_manual_cycle_policies policy
  join public.matriculas enrollment on enrollment.turma_id = policy.turma_id
  where enrollment.id = p_matricula_id
    and policy.active and policy.eligibility_rule = 'HISTORICO_EXTERNO';

  if not found or not coalesce((v_state ->> 'habilitado')::boolean, false) then
    return v_state;
  end if;
  -- Never replace duplicate, terminal or academic/configuration protections.
  if v_state ->> 'estado' in (
      'PROTEGIDO_EXISTENTE', 'JA_GERADO', 'CICLOS_CONCLUIDOS'
    ) or v_state -> 'bloqueio' ->> 'codigo' in (
      'STATUS_ACADEMICO', 'SEM_CONFIGURACAO'
    ) then
    return v_state;
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

notify pgrst, 'reload schema';
commit;
