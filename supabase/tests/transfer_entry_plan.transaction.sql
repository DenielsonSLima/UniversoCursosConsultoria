-- Pure validation of the entry plan and canonical item cardinality.
begin;
set local plpgsql.check_asserts='on';
do $test$
declare v_rule jsonb; v_original jsonb; v_plan jsonb; v_bad jsonb; v_items jsonb; v_rejected boolean;
  v_today date:=timezone('America/Maceio',now())::date;
begin
  select internal_academic.technical_financial_rule(t.id) into strict v_rule
  from public.turmas t join public.cursos c on c.id=t.curso_id
  where upper(c.modalidade) in ('TECNICO','TÉCNICO') and t.qtd_parcelas=12 limit 1;
  v_plan:=jsonb_build_object('cicloNumero',2,'quantidadeParcelas',5,
    'primeiroVencimento',v_today+7,'justificativaCiclo2','Ingresso no segundo ciclo nesta instituição');
  assert internal_academic.normalize_transfer_entry_plan(v_rule,v_plan)=v_plan;
  foreach v_bad in array array[
    v_plan-'primeiroVencimento',v_plan-'justificativaCiclo2',
    v_plan||'{"quantidadeParcelas":0}'::jsonb,v_plan||'{"quantidadeParcelas":13}'::jsonb,
    v_plan||'{"cicloNumero":3}'::jsonb,v_plan||'{"quantidadeParcelas":2.5}'::jsonb,
    v_plan||jsonb_build_object('primeiroVencimento',v_today-1),v_plan||'{"emitirAgora":true}'::jsonb
  ] loop
    v_rejected:=false;
    begin perform internal_academic.normalize_transfer_entry_plan(v_rule,v_bad);
    exception when invalid_parameter_value then v_rejected:=true; end;
    assert v_rejected,'Malformed or excess entry intent must fail';
  end loop;
  v_original:=v_rule;
  v_rule:=internal_academic.transfer_entry_rule(v_rule,5,v_today+7,repeat('a',64));
  assert v_rule#>>'{cobranca,mensalidade,quantidade}'='5';
  assert v_rule#>>'{identidade,efetivaFingerprint}'=repeat('a',64);
  assert v_rule->'encargos'=v_original->'encargos'
    and v_rule->'aplicacao'=v_original->'aplicacao'
    and v_rule->'boleto'=v_original->'boleto', 'All financial terms must remain frozen';
  assert v_rule#>'{cobranca,matricula}'=v_original#>'{cobranca,matricula}'
    and v_rule#>'{cobranca,rematricula}'=v_original#>'{cobranca,rematricula}'
    and ((v_rule#>'{cobranca,mensalidade}')-'quantidade')=((v_original#>'{cobranca,mensalidade}')-'quantidade'),
    'Partial entry changes only the monthly quantity';
end;
$test$;
rollback;
