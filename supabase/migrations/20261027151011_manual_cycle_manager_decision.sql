begin;
set local lock_timeout = '5s';

alter table internal_academic.technical_manual_cycle_runs add column manager_decision jsonb;

create function internal_academic.manual_cycle_manager_decision_valid(
  p_run internal_academic.technical_manual_cycle_runs
) returns boolean language sql stable security definer set search_path = '' as $function$
  select coalesce(p_run.manager_decision->>'version'='1'
    and p_run.manager_decision->>'matriculaId'=p_run.matricula_id::text
    and p_run.manager_decision->>'turmaId'=p_run.turma_id::text
    and p_run.manager_decision->>'cycleNumber'=p_run.cycle_number::text
    and p_run.manager_decision->>'requestId'=p_run.request_id::text
    and p_run.manager_decision->>'actorId'=p_run.created_by::text
    and p_run.manager_decision->>'ruleFingerprint'=p_run.rule_fingerprint
    and p_run.manager_decision->>'policyFingerprint'=p_run.policy_fingerprint
    and p_run.manager_decision->>'scheduleFingerprint'=p_run.schedule_fingerprint
    and p_run.manager_decision->>'reviewHash'=encode(extensions.digest(p_run.reviewed_items::text,'sha256'),'hex')
    and p_run.cycle_number in (1,2) and p_run.created_by is not null
    and jsonb_typeof(p_run.reviewed_items)='array'
    and jsonb_array_length(p_run.reviewed_items)=p_run.item_count
    and exists(select 1 from public.matriculas m join public.turmas t on t.id=m.turma_id
      where m.id=p_run.matricula_id and m.turma_id=p_run.turma_id
        and m.aluno_id::text=p_run.manager_decision->>'alunoId'
        and t.polo_id::text=p_run.manager_decision->>'poloId'),false);
$function$;

create function internal_academic.guard_manual_cycle_manager_decision()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if tg_op='UPDATE' and new.manager_decision is distinct from old.manager_decision then
    raise exception 'A decisão original do ciclo é imutável.' using errcode='23514';
  end if;
  if new.manager_decision is not null then
    if not internal_academic.manual_cycle_manager_decision_valid(new) then
      raise exception 'A decisão não corresponde à identidade e à revisão do ciclo.' using errcode='23514';
    end if;
    if tg_op='INSERT' and (new.state<>'GENERATING' or auth.uid() is distinct from new.created_by
      or not coalesce(public.can_operate_turma_academics(new.turma_id)
        and public.gestor_has_tab('gestao','financeiro'),false)) then
      raise exception 'A decisão exige confirmação do gestor autorizado.' using errcode='42501';
    end if;
  end if;
  return new;
end;
$function$;

create trigger guard_manual_cycle_manager_decision before insert or update
on internal_academic.technical_manual_cycle_runs for each row
execute function internal_academic.guard_manual_cycle_manager_decision();

create function internal_academic.manual_cycle_manager_creation_claim(p_receivable public.contas_receber)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists(select 1 from internal_academic.technical_manual_cycle_runs r
    join public.matriculas m on m.id=r.matricula_id join public.turmas t on t.id=m.turma_id
    where r.matricula_id=p_receivable.matricula_id and r.turma_id=p_receivable.turma_id
      and m.aluno_id=p_receivable.cliente_id and t.polo_id=p_receivable.polo_id
      and r.state='GENERATING' and r.completed_at is null
      and coalesce(r.xmin=pg_current_xact_id_if_assigned()::xid,false)
      and r.request_id::text=current_setting('app.technical_manual_cycle_request_id',true)
      and internal_academic.manual_cycle_manager_decision_valid(r)
      and p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}'=r.request_id::text
      and p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,cicloNumero}'=r.cycle_number::text
      and p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,regraFingerprint}'=r.rule_fingerprint
      and p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,politicaFingerprint}'=r.policy_fingerprint
      and p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,cronogramaFingerprint}'=r.schedule_fingerprint
      and coalesce(p_receivable.origem_pagamento,'')<>'SISTEMA_ANTERIOR'
      and not exists(select 1 from internal_proesc.obligation_links l where l.receivable_id=p_receivable.id));
$function$;

create function internal_academic.manual_cycle_legacy_creation_proven(p_run internal_academic.technical_manual_cycle_runs)
returns boolean language plpgsql stable security definer set search_path='' as $function$
declare v_request internal_academic.technical_financial_requests%rowtype;
  v_audit public.historico_turma_financeira%rowtype; v_count integer;
begin
  if p_run.manager_decision is not null or p_run.state<>'LOCAL_CREATED'
    or p_run.created_by is null or p_run.completed_at is null
    or jsonb_typeof(p_run.reviewed_items) is distinct from 'array'
    or jsonb_array_length(p_run.reviewed_items)<>p_run.item_count
    or cardinality(p_run.receivable_ids)<>p_run.item_count
    or (select count(distinct x) from unnest(p_run.receivable_ids) x)<>p_run.item_count then return false; end if;
  select * into v_request from internal_academic.technical_financial_requests q
    where q.request_id=p_run.request_id and q.actor_id=p_run.created_by
      and q.operation='GERACAO_CICLO_TECNICO_MANUAL';
  if not found or v_request.response->>'operacao' is distinct from 'GERACAO_CICLO_TECNICO_MANUAL'
    or v_request.response->>'requestId' is distinct from p_run.request_id::text
    or v_request.response#>>'{ciclo,numero}' is distinct from p_run.cycle_number::text
    or v_request.response#>>'{ciclo,status}' is distinct from 'CRIADO_LOCAL'
    or v_request.response#>>'{ciclo,quantidadeItens}' is distinct from p_run.item_count::text
    or (v_request.response#>>'{ciclo,total}')::numeric is distinct from p_run.total_amount
    or jsonb_typeof(v_request.response#>'{ciclo,recebiveis}') is distinct from 'array'
    or jsonb_array_length(v_request.response#>'{ciclo,recebiveis}')<>p_run.item_count then return false; end if;
  select count(*) into v_count from public.historico_turma_financeira h
    where h.matricula_id=p_run.matricula_id and h.turma_id=p_run.turma_id
      and h.evento='CICLO_TECNICO_MANUAL_CRIADO_LOCAL' and h.regra->>'requestId'=p_run.request_id::text;
  if v_count<>1 then return false; end if;
  select * into v_audit from public.historico_turma_financeira h
    where h.matricula_id=p_run.matricula_id and h.turma_id=p_run.turma_id
      and h.evento='CICLO_TECNICO_MANUAL_CRIADO_LOCAL' and h.regra->>'requestId'=p_run.request_id::text;
  if v_audit.regra->>'cicloNumero' is distinct from p_run.cycle_number::text
    or v_audit.regra->>'quantidadeItens' is distinct from p_run.item_count::text
    or (v_audit.regra->>'total')::numeric is distinct from p_run.total_amount
    or v_audit.regra->>'regraFingerprint' is distinct from p_run.rule_fingerprint
    or v_audit.regra->>'politicaFingerprint' is distinct from p_run.policy_fingerprint
    or v_audit.regra->>'cronogramaFingerprint' is distinct from p_run.schedule_fingerprint
    or not exists(select 1 from (values(null::date),(p_run.first_due_date)) d(first_due)
      where v_request.payload_hash=encode(extensions.digest(convert_to((jsonb_build_object(
        'matriculaId',p_run.matricula_id,'cicloNumero',p_run.cycle_number,'primeiroVencimento',d.first_due,
        'regraFingerprint',p_run.rule_fingerprint,'politicaFingerprint',p_run.policy_fingerprint,
        'cronogramaFingerprint',p_run.schedule_fingerprint)||case
          when v_audit.regra->'revisao' is null or v_audit.regra->'revisao'='null'::jsonb then '{}'::jsonb
          else jsonb_build_object('revisao',v_audit.regra->'revisao') end)::text,'UTF8'),'sha256'),'hex')) then return false; end if;
  select count(*) into v_count from public.contas_receber c
    join public.matriculas m on m.id=p_run.matricula_id join public.turmas t on t.id=m.turma_id
    where c.id=any(p_run.receivable_ids) and c.matricula_id=m.id and c.turma_id=p_run.turma_id
      and m.turma_id=p_run.turma_id and c.cliente_id=m.aluno_id and c.polo_id=t.polo_id
      and c.regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}'=p_run.request_id::text
      and c.regra_financeira_tecnica_snapshot#>>'{cicloManual,cicloNumero}'=p_run.cycle_number::text
      and c.regra_financeira_tecnica_snapshot#>>'{cicloManual,regraFingerprint}'=p_run.rule_fingerprint
      and c.regra_financeira_tecnica_snapshot#>>'{cicloManual,politicaFingerprint}'=p_run.policy_fingerprint
      and c.regra_financeira_tecnica_snapshot#>>'{cicloManual,cronogramaFingerprint}'=p_run.schedule_fingerprint
      and coalesce(c.origem_pagamento,'')<>'SISTEMA_ANTERIOR'
      and not exists(select 1 from internal_proesc.obligation_links l where l.receivable_id=c.id)
      and (select count(*) from jsonb_array_elements(p_run.reviewed_items) i
        where i->>'chave'=c.origem_cronograma_id and i->>'tipo'=c.tipo_lancamento
          and i->>'descricao'=c.descricao
          and i->>'numero'=c.parcela_numero::text and (i->>'valor')::numeric=c.valor
          and (i->>'vencimento')::date=c.data_vencimento
          and coalesce(i->>'destinoCobranca','BANESE')=c.regra_financeira_tecnica_snapshot->>'destinoCobranca')=1
      and (select count(*) from jsonb_array_elements(v_request.response#>'{ciclo,recebiveis}') i
        where i->>'id'=c.id::text and i->>'chave'=c.origem_cronograma_id and i->>'tipo'=c.tipo_lancamento
          and i->>'descricao'=c.descricao
          and coalesce(i->>'destinoCobranca','BANESE')=c.regra_financeira_tecnica_snapshot->>'destinoCobranca'
          and i->>'numero'=c.parcela_numero::text and (i->>'valor')::numeric=c.valor
          and (i->>'vencimento')::date=c.data_vencimento)=1;
  return v_count=p_run.item_count;
exception when data_exception then return false;
end;
$function$;

create function internal_academic.manual_cycle_manager_receivable_valid(p_receivable_id uuid,p_matricula_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists(select 1 from internal_academic.technical_manual_cycle_runs r
    join public.contas_receber c on c.id=p_receivable_id
    join public.matriculas m on m.id=r.matricula_id join public.turmas t on t.id=m.turma_id
    where r.matricula_id=p_matricula_id and r.matricula_id=c.matricula_id
      and r.turma_id=c.turma_id and r.turma_id=m.turma_id
      and c.cliente_id=m.aluno_id and c.polo_id=t.polo_id
      and r.state='LOCAL_CREATED' and r.completed_at is not null
      and c.id=any(r.receivable_ids) and cardinality(r.receivable_ids)=r.item_count
      and (internal_academic.manual_cycle_manager_decision_valid(r)
        or internal_academic.manual_cycle_legacy_creation_proven(r))
      and c.regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}'=r.request_id::text
      and c.regra_financeira_tecnica_snapshot#>>'{cicloManual,cicloNumero}'=r.cycle_number::text
      and c.regra_financeira_tecnica_snapshot#>>'{cicloManual,regraFingerprint}'=r.rule_fingerprint
      and c.regra_financeira_tecnica_snapshot#>>'{cicloManual,politicaFingerprint}'=r.policy_fingerprint
      and c.regra_financeira_tecnica_snapshot#>>'{cicloManual,cronogramaFingerprint}'=r.schedule_fingerprint
      and c.regra_financeira_tecnica_snapshot->>'destinoCobranca'='BANESE'
      and coalesce(c.origem_pagamento,'')<>'SISTEMA_ANTERIOR'
      and not exists(select 1 from internal_proesc.obligation_links l where l.receivable_id=c.id));
$function$;

create function internal_academic.manual_cycle_manager_first_post_allowed(p_receivable_id uuid,p_matricula_id uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  select internal_academic.manual_cycle_manager_receivable_valid(p_receivable_id,p_matricula_id)
    and not internal_academic.technical_imported_cycle_has_conflict(p_matricula_id)
    and not exists(select 1 from internal_academic.technical_manual_cycle_runs r
      where r.matricula_id=p_matricula_id and p_receivable_id=any(r.receivable_ids)
        and (exists(select 1 from internal_academic.technical_imported_cycle_facts f
          where f.matricula_id=r.matricula_id and f.cycle_number=r.cycle_number)
          or exists(select 1 from internal_academic.technical_external_cycle_coverage c
            where c.matricula_id=r.matricula_id and (r.cycle_number=2 or c.scope='CONTRATO_COMPLETO'))));
$function$;

revoke all on function
  internal_academic.manual_cycle_manager_decision_valid(internal_academic.technical_manual_cycle_runs),
  internal_academic.guard_manual_cycle_manager_decision(),
  internal_academic.manual_cycle_manager_creation_claim(public.contas_receber),
  internal_academic.manual_cycle_manager_receivable_valid(uuid,uuid),
  internal_academic.manual_cycle_manager_first_post_allowed(uuid,uuid),
  internal_academic.manual_cycle_legacy_creation_proven(internal_academic.technical_manual_cycle_runs)
  from public,anon,authenticated,service_role;
commit;
