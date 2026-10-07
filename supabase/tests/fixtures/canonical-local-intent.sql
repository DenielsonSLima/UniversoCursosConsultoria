drop function internal_academic.manual_cycle_local_receivable_complete(public.contas_receber);
drop function internal_academic.manual_cycle_has_bank_fields(public.contas_receber);
drop function internal_academic.manual_cycle_has_local_intent(public.contas_receber);
create function internal_academic.manual_cycle_has_bank_fields(p_receivable public.contas_receber)
returns boolean language sql immutable set search_path='' as $$
  select exists(select 1 from jsonb_each(to_jsonb(p_receivable)) f(key,value)
    where (left(key,8)='gateway_' or left(key,6)='asaas_' or key='nosso_numero_asaas')
      and value<>'null'::jsonb);
$$;
-- Reversal is deliberately unsupported by this lane; a true reversal fixture
-- is neither necessary nor authorization to reverse an actual settlement.
create function internal_academic.manual_cycle_local_reversed_receivable_complete(public.contas_receber)
returns boolean language sql as $$select false;$$;
CREATE OR REPLACE FUNCTION internal_academic.manual_cycle_has_local_intent(p_receivable contas_receber)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from internal_academic.technical_manual_cycle_runs run
    join public.matriculas m on m.id=run.matricula_id
    join public.turmas t on t.id=m.turma_id
    cross join lateral jsonb_array_elements(run.reviewed_items) item
    where run.matricula_id=p_receivable.matricula_id and run.turma_id=p_receivable.turma_id
      and m.aluno_id=p_receivable.cliente_id and t.polo_id=p_receivable.polo_id
      and run.cycle_number=1 and p_receivable.tipo_lancamento='MATRICULA'
      and p_receivable.parcela_numero=0 and p_receivable.origem_cronograma_id='matricula'
      and item->>'chave'='matricula' and item->>'tipo'='MATRICULA'
      and item->>'destinoCobranca'='LOCAL'
      and p_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL'
      and p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}'=run.request_id::text
      and (p_receivable.id=any(run.receivable_ids) and run.state='LOCAL_CREATED'
        or run.state='GENERATING' and run.request_id::text=current_setting('app.technical_manual_cycle_request_id',true)));
$function$
;
