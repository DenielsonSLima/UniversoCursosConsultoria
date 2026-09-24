-- Keep reviewed item identity and dates fixed before and after bank issuance.
-- Existing runs without reviewed_items retain their previous contract.
begin;
set local lock_timeout = '5s';

create function internal_academic.assert_manual_cycle_reviewed_receivable(
  p_receivable public.contas_receber
)
returns void language plpgsql stable security definer set search_path='' as $function$
declare
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_matches integer;
begin
  select run.* into v_run
  from internal_academic.technical_manual_cycle_runs run
  where p_receivable.id=any(run.receivable_ids) and run.state='LOCAL_CREATED';
  if v_run.reviewed_items is null then return; end if;
  select count(*) into v_matches from jsonb_array_elements(v_run.reviewed_items) item
  where item->>'chave'=p_receivable.origem_cronograma_id
    and (item->>'vencimento')::date=p_receivable.data_vencimento
    and (item->>'valor')::numeric=p_receivable.valor
    and item->>'tipo'=p_receivable.tipo_lancamento
    and (item->>'numero')::integer=p_receivable.parcela_numero;
  if v_matches<>1
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
      using errcode='23514';
  end if;
end;
$function$;

create function internal_academic.guard_manual_cycle_reviewed_identity()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if row(new.id,new.cliente_id,new.matricula_id,new.turma_id,new.polo_id,
      new.tipo_lancamento,new.origem_cronograma_id,new.parcela_numero,new.valor,new.data_vencimento)
    is distinct from row(old.id,old.cliente_id,old.matricula_id,old.turma_id,old.polo_id,
      old.tipo_lancamento,old.origem_cronograma_id,old.parcela_numero,old.valor,old.data_vencimento)
    and exists(select 1 from internal_academic.technical_manual_cycle_runs run
      where old.id=any(run.receivable_ids) and run.reviewed_items is not null)
  then
    raise exception 'A identidade e o vencimento revisados do ciclo manual são imutáveis.'
      using errcode='23514';
  end if;
  return new;
end;
$function$;

create trigger guard_manual_cycle_reviewed_identity
  before update of id,cliente_id,matricula_id,turma_id,polo_id,tipo_lancamento,
    origem_cronograma_id,parcela_numero,valor,data_vencimento on public.contas_receber
  for each row execute function internal_academic.guard_manual_cycle_reviewed_identity();

revoke all on function
  internal_academic.assert_manual_cycle_reviewed_receivable(public.contas_receber),
  internal_academic.guard_manual_cycle_reviewed_identity()
  from public,anon,authenticated,service_role;

-- Validate also at authorization/replay and adapter boundaries. A corrupted
-- preexisting row cannot acquire a new authorization or different bank terms.
do $patch$
declare v_definition text; v_from text; v_to text;
begin
  v_definition:=pg_get_functiondef(
    'internal_academic.technical_manual_banese_expected_terms(public.contas_receber)'::regprocedure);
  if md5(v_definition)<>'505c298a40c81b73565d4d10ad3ad632' then
    raise exception 'Unexpected manual Banese terms contract; review before applying.';
  end if;
  v_from:=$old$  v_cycle := v_snapshot -> 'cicloManual';$old$;
  v_to:=$new$  perform internal_academic.assert_manual_cycle_reviewed_receivable(p_receivable);
  v_cycle := v_snapshot -> 'cicloManual';$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Manual terms validation boundary not found.';
  end if;
  execute replace(v_definition,v_from,v_to);

  v_definition:=pg_get_functiondef(
    'public.authorize_technical_manual_receivable_issuance_secure(uuid,uuid)'::regprocedure);
  if md5(v_definition)<>'b591443d2695b7adff03ab60309e46f8' then
    raise exception 'Unexpected manual authorization contract; review before applying.';
  end if;
  v_from:=$old$  v_fingerprint :=$old$;
  v_to:=$new$  perform internal_academic.assert_manual_cycle_reviewed_receivable(v_receivable);
  v_fingerprint :=$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Manual authorization validation boundary not found.';
  end if;
  execute replace(v_definition,v_from,v_to);
end;
$patch$;

commit;
