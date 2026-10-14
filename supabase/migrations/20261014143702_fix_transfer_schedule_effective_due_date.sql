begin;

-- Preserve the existing helper contract and refuse an unexpected concurrent change.
do $guard$
begin
  if md5(pg_get_functiondef(
    'internal_academic.technical_financial_effective_rule(uuid)'::regprocedure
  )) <> '54d09cdf5a4402eafe7d29923ceebd22' then
    raise exception 'A projeção financeira mudou; revise a migration antes de aplicar.';
  end if;
end;
$guard$;

create or replace function internal_academic.technical_financial_effective_rule(
  p_matricula_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_entry internal_academic.technical_transfer_entry_plans%rowtype;
  v_fingerprint text;
begin
  select *
  into v_entry
  from internal_academic.technical_transfer_entry_plans
  where matricula_id = p_matricula_id;

  if not found or v_entry.financial_plan->'versao' is distinct from '3'::jsonb then
    return internal_academic.technical_financial_effective_rule_before_transfer_schedule(
      p_matricula_id
    );
  end if;

  v_fingerprint := encode(extensions.digest(jsonb_build_object(
    'requestId', v_entry.request_id,
    'regra', v_entry.rule_snapshot,
    'cronograma', v_entry.financial_plan
  )::text, 'sha256'), 'hex');

  return jsonb_set(
    jsonb_set(
      v_entry.rule_snapshot,
      '{identidade,efetivaFingerprint}',
      to_jsonb(v_fingerprint)
    ),
    '{vencimento,primeiroVencimentoSugerido}',
    to_jsonb(v_entry.first_due_date)
  ) || jsonb_build_object(
    'entradaTransferencia', true,
    'cronogramaEntradaVersao', 3,
    'primeiroVencimentoSugerido', v_entry.first_due_date,
    'fonte', 'INDIVIDUAL'
  );
end;
$function$;

commit;
