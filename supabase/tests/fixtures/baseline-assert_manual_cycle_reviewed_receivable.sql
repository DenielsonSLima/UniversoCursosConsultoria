CREATE OR REPLACE FUNCTION internal_academic.assert_manual_cycle_reviewed_receivable(p_receivable contas_receber)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_matches integer;
  v_overlay_matches integer;
begin
  select run.* into v_run
  from internal_academic.technical_manual_cycle_runs run
  where p_receivable.id = any(run.receivable_ids) and run.state = 'LOCAL_CREATED';
  if v_run.reviewed_items is null then return; end if;
  select count(*) into v_matches from jsonb_array_elements(v_run.reviewed_items) item
  where item->>'chave' = p_receivable.origem_cronograma_id
    and (item->>'vencimento')::date = p_receivable.data_vencimento
    and (item->>'valor')::numeric = p_receivable.valor
    and item->>'tipo' = p_receivable.tipo_lancamento
    and (item->>'numero')::integer = p_receivable.parcela_numero
    and coalesce(item->>'destinoCobranca', 'BANESE') = coalesce(
      p_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca',
      'BANESE');
  select count(*) into v_overlay_matches
  from internal_academic.technical_manual_banese_due_date_overlay overlay
  cross join lateral jsonb_array_elements(v_run.reviewed_items) item
  where overlay.receivable_id = p_receivable.id
    and overlay.matricula_id = v_run.matricula_id
    and overlay.turma_id = v_run.turma_id
    and overlay.cycle_number = v_run.cycle_number
    and overlay.cycle_request_id = v_run.request_id
    and overlay.expected_item_count = v_run.item_count
    and overlay.reviewed_item_key = item->>'chave'
    and overlay.original_due_date = (item->>'vencimento')::date
    and overlay.corrected_due_date = p_receivable.data_vencimento
    and item->>'chave' = p_receivable.origem_cronograma_id
    and (item->>'valor')::numeric = p_receivable.valor
    and item->>'tipo' = p_receivable.tipo_lancamento
    and (item->>'numero')::integer = p_receivable.parcela_numero
    and coalesce(item->>'destinoCobranca', 'BANESE') = coalesce(
      p_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca',
      'BANESE');
  if (v_matches <> 1 and v_overlay_matches <> 1)
    or v_run.matricula_id is distinct from p_receivable.matricula_id
    or v_run.turma_id is distinct from p_receivable.turma_id
    or p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}'
      is distinct from v_run.request_id::text
    or p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,cicloNumero}'
      is distinct from v_run.cycle_number::text
    or p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,regraFingerprint}'
      is distinct from v_run.rule_fingerprint
    or p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,politicaFingerprint}'
      is distinct from v_run.policy_fingerprint
    or p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,cronogramaFingerprint}'
      is distinct from v_run.schedule_fingerprint
    or not exists(select 1 from public.matriculas m join public.turmas t on t.id=m.turma_id
      where m.id=v_run.matricula_id and m.turma_id=v_run.turma_id
        and m.aluno_id=p_receivable.cliente_id and t.polo_id=p_receivable.polo_id)
  then
    raise exception 'Recebível diverge da revisão canônica do ciclo manual.'
      using errcode = '23514';
  end if;
end;
$function$

