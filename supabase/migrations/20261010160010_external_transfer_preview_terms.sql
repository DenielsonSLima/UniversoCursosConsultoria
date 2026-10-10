-- Preview and admission freeze the same individual conditions without debts.
begin;

create or replace function public.preview_recebimento_transferencia_tecnica_secure(
  p_aluno_id uuid,p_turma_destino_id uuid,p_financeiro jsonb default null
)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_class_rule jsonb; v_rule jsonb; v_plan jsonb;
  v_initial numeric:=0; v_total numeric:=0; v_monthly numeric:=0;
  v_cycle integer; v_conditions jsonb;
begin
  perform internal_academic.assert_transfer_entry_access(p_aluno_id,p_turma_destino_id);
  if internal_academic.transfer_entry_person_has_history(p_aluno_id) then
    raise exception 'Há histórico financeiro do aluno. A entrada exige conferência de continuidade antes de novas cobranças.' using errcode='23514';
  end if;
  v_class_rule:=internal_academic.technical_financial_rule(p_turma_destino_id);
  v_plan:=internal_academic.normalize_transfer_entry_plan(v_class_rule,p_financeiro);
  v_rule:=internal_academic.transfer_entry_individual_rule(v_class_rule,v_plan);
  v_conditions:=v_plan->'condicoes';
  v_cycle:=(v_plan->>'cicloNumero')::integer;
  if (v_plan->>'cobrarMensalidades')::boolean then
    v_monthly:=(v_conditions->>'valorMensalidade')::numeric;
  end if;
  v_initial:=(v_plan->>'quantidadeParcelas')::integer*v_monthly
    +case when v_cycle=1 and (v_conditions->>'cobrarMatricula')::boolean
      then (v_conditions->>'valorMatricula')::numeric
      when v_cycle=2 and (v_conditions->>'cobrarRematricula')::boolean
      then (v_conditions->>'valorRematricula')::numeric else 0 end;
  v_total:=v_initial;
  if v_cycle=1 and (v_class_rule#>>'{continuidade,maxCiclos}')::integer=2 then
    v_total:=v_total+(v_class_rule#>>'{cobranca,mensalidade,quantidade}')::integer*v_monthly
      +case when (v_conditions->>'cobrarRematricula')::boolean
        then (v_conditions->>'valorRematricula')::numeric else 0 end;
  end if;
  return jsonb_build_object('versao',2,'regraFingerprint',v_class_rule->>'fingerprint',
    'maxCiclos',(v_class_rule#>>'{continuidade,maxCiclos}')::integer,
    'quantidadeMaxima',(v_class_rule#>>'{cobranca,mensalidade,quantidade}')::integer,
    'financeiro',v_plan,'regra',v_rule,
    'totais',jsonb_build_object('cicloInicialNominal',to_char(v_initial,'FM999999999990.00'),
      'totalNominal',to_char(v_total,'FM999999999990.00')),
    'avisos',jsonb_build_array(
      'A entrada registra o plano individual. Nenhuma cobrança será criada antes da revisão e confirmação no Financeiro.',
      'O ciclo inicial nesta instituição não comprova pagamento ou cobertura na instituição de origem.'));
end;
$function$;

revoke all on function public.preview_recebimento_transferencia_tecnica_secure(uuid,uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.preview_recebimento_transferencia_tecnica_secure(uuid,uuid,jsonb)
  to authenticated;

-- The existing payload hash already includes the entire p_financeiro object;
-- replace only the response contract version, preserving every admission guard.
do $receive$
declare v_definition text; v_boundary text:=$old$'versao',1,'requestId',p_request_id$old$;
begin
  v_definition:=pg_get_functiondef(
    'public.receber_transferencia_tecnica_planejada_secure(uuid,uuid,uuid,text,text,text,text,date,jsonb,jsonb,text)'::regprocedure);
  if length(v_definition)-length(replace(v_definition,v_boundary,''))<>length(v_boundary) then
    raise exception 'The external entry response boundary changed.';
  end if;
  execute replace(v_definition,v_boundary,$new$'versao',2,'requestId',p_request_id$new$);
end;
$receive$;

notify pgrst,'reload schema';
commit;
