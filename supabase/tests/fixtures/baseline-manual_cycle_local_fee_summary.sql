CREATE OR REPLACE FUNCTION internal_academic.manual_cycle_local_fee_summary(p_matricula_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('id',r.id,'chave',r.origem_cronograma_id,'tipo',r.tipo_lancamento,
    'numero',r.parcela_numero,'descricao',r.descricao,'valor',to_char(r.valor,'FM999999990.00'),
    'vencimento',to_char(r.data_vencimento,'YYYY-MM-DD'),'status',r.status,
    'destinoCobranca','LOCAL','emissaoBanese','NAO_APLICAVEL','localSemBoletoComprovado',true,
    'emissaoHistoricaComprovada',false)
  from internal_academic.technical_manual_cycle_runs run
  join public.contas_receber r on r.id=any(run.receivable_ids)
  where run.matricula_id=p_matricula_id and run.cycle_number=1 and run.state='LOCAL_CREATED'
    and internal_academic.manual_cycle_local_receivable_complete(r)
  limit 1;
$function$

