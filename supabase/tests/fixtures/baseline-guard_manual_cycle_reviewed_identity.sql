CREATE OR REPLACE FUNCTION internal_academic.guard_manual_cycle_reviewed_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if row(new.id,new.cliente_id,new.matricula_id,new.turma_id,new.polo_id,
      new.tipo_lancamento,new.origem_cronograma_id,new.parcela_numero,new.valor,new.data_vencimento)
    is distinct from row(old.id,old.cliente_id,old.matricula_id,old.turma_id,old.polo_id,
      old.tipo_lancamento,old.origem_cronograma_id,old.parcela_numero,old.valor,old.data_vencimento)
    and exists(select 1 from internal_academic.technical_manual_cycle_runs run
      where old.id=any(run.receivable_ids) and run.reviewed_items is not null)
    and not (
      row(new.id,new.cliente_id,new.matricula_id,new.turma_id,new.polo_id,
        new.tipo_lancamento,new.origem_cronograma_id,new.parcela_numero,new.valor)
      is not distinct from row(old.id,old.cliente_id,old.matricula_id,old.turma_id,old.polo_id,
        old.tipo_lancamento,old.origem_cronograma_id,old.parcela_numero,old.valor)
      and new.data_vencimento is distinct from old.data_vencimento
      and internal_academic.technical_manual_due_date_correction_bypass_valid(old.id)
    )
  then
    raise exception 'A identidade e o vencimento revisados do ciclo manual são imutáveis.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$

