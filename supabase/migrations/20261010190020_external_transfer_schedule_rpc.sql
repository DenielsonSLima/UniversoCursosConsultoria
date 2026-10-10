begin;
alter table internal_academic.technical_transfer_entry_plans drop constraint technical_transfer_entry_plans_check;
alter table internal_academic.technical_transfer_entry_plans add constraint technical_transfer_entry_plans_check
  check(initial_cycle=1 or financial_plan->'versao' is not distinct from '3'::jsonb
    or (cycle_two_reason is not null and length(btrim(cycle_two_reason))>=10));
alter table internal_academic.technical_transfer_entry_plans drop constraint technical_transfer_entry_plans_installment_count_check;
alter table internal_academic.technical_transfer_entry_plans add constraint technical_transfer_entry_plans_installment_count_check
  check(installment_count between 1 and 60 or (installment_count=0 and financial_plan->'versao' is not distinct from '3'::jsonb));

create function public.preview_recebimento_transferencia_tecnica_v3_secure(
  p_aluno_id uuid,p_turma_destino_id uuid,p_financeiro jsonb default null,p_ajuste jsonb default null
)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_rule jsonb; v_plan jsonb; v_totals jsonb; v_total numeric;
begin
  perform internal_academic.assert_transfer_entry_access(p_aluno_id,p_turma_destino_id);
  if internal_academic.transfer_entry_person_has_history(p_aluno_id) then
    raise exception 'Há histórico financeiro do aluno. A entrada exige conferência de continuidade antes de novas cobranças.' using errcode='23514';
  end if;
  v_rule:=internal_academic.technical_financial_rule(p_turma_destino_id);
  v_plan:=case when p_financeiro is null then internal_academic.default_transfer_schedule(v_rule)
    else internal_academic.normalize_transfer_schedule(v_rule,p_financeiro) end;
  v_plan:=internal_academic.adjust_transfer_schedule(v_rule,v_plan,p_ajuste);
  select jsonb_agg(jsonb_build_object('cicloNumero',s.ciclo,'totalNominal',to_char(s.total,'FM999999999990.00'),
    'quantidadeParcelas',s.parcelas,'quantidadeItens',s.itens) order by s.ciclo),sum(s.total)
    into v_totals,v_total from (
      select c.ciclo,coalesce(sum((i->>'valor')::numeric),0) as total,
        count(*) filter(where i->>'tipo'='PARCELA') as parcelas,count(i) as itens
      from generate_series(1,(v_rule#>>'{continuidade,maxCiclos}')::integer) c(ciclo)
      left join lateral jsonb_array_elements(v_plan->'itens') i on (i->>'cicloNumero')::integer=c.ciclo
      group by c.ciclo) s;
  return jsonb_build_object('versao',3,'regraFingerprint',v_rule->>'fingerprint',
    'maxCiclos',(v_rule#>>'{continuidade,maxCiclos}')::integer,'quantidadeMaxima',60,
    'financeiro',v_plan,'regra',v_rule||jsonb_build_object(
      'valorMatricula',v_rule#>>'{cobranca,matricula,valor}',
      'valorMensalidade',v_rule#>>'{cobranca,mensalidade,valor}',
      'valorRematricula',v_rule#>>'{cobranca,rematricula,valor}'),
    'cronogramaFingerprint',internal_academic.transfer_schedule_fingerprint(v_plan),
    'totais',jsonb_build_object('porCiclo',v_totals,'totalNominal',to_char(v_total,'FM999999999990.00')),
    'avisos',jsonb_build_array('A entrada registra o cronograma individual sem emitir cobranças.',
      'Os ciclos e itens não comprovam pagamento ou cobertura na escola de origem.'));
end;
$function$;
revoke all on function public.preview_recebimento_transferencia_tecnica_v3_secure(uuid,uuid,jsonb,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.preview_recebimento_transferencia_tecnica_v3_secure(uuid,uuid,jsonb,jsonb) to authenticated;
commit;
