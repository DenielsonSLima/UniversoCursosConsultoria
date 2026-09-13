-- A turma code is not proof of cycle coverage. Reuse the verified individual
-- contract for imported classes while preserving the established seed scope.
begin;

do $base$
begin
  if md5(pg_get_functiondef(
    'internal_academic.technical_manual_cycle_state_before_proesc_coverage(uuid)'::regprocedure
  )) <> 'd8ca0f4e438dd43421404d3a6e916509' then
    raise exception 'Imported cycle state changed; review its current contract before applying.';
  end if;
end;
$base$;

CREATE OR REPLACE FUNCTION internal_academic.technical_manual_cycle_state_before_proesc_coverage(p_matricula_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    select 1 from internal_proesc.class_scopes scope
    where scope.turma_id = v_policy.turma_id and scope.phase = 'CONFIRMED'
      and (
        -- The established seed scope retains its individually reconciled rules.
        (scope.batch_id is null and scope.financial_mode = 'CICLO1_PROESC')
        or (
          scope.batch_id is not null and scope.financial_mode = 'INDIVIDUAL_REVIEW'
          and internal_proesc.has_confirmed_first_cycle_only(p_matricula_id)
        )
      )
  ) then
    return v_state || jsonb_build_object(
      'estado', 'BLOQUEADO', 'podeGerar', false,
      'bloqueio', jsonb_build_object(
        'codigo', 'HISTORICO_EXTERNO_REQUER_REVISAO',
        'mensagem', 'A conferência das cobranças no Proesc ainda não confirmou que esta matrícula tem somente o 1º ciclo.'
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
        and (
          receivable.origem_cronograma_id ~ '^T42-LEG-S[0-9]+-P[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          or exists (select 1 from internal_proesc.obligation_links link
            where link.receivable_id = receivable.id and link.matricula_id = p_matricula_id
              and link.turma_id = v_policy.turma_id)
        )
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

revoke all on function internal_academic.technical_manual_cycle_state_before_proesc_coverage(uuid)
  from public, anon, authenticated, service_role;

commit;
