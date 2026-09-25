-- This projection activates only when the separately versioned canonical bridge
-- helpers exist. Financial identities remain on their original enrollment.
begin;
alter function internal_academic.technical_local_cycle_eligible(uuid)
  rename to technical_local_cycle_eligible_before_internal_transfer;
create function internal_academic.technical_local_cycle_eligible(p_matricula_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $function$
declare v_source uuid; v_person uuid; v_source_run internal_academic.technical_manual_cycle_runs%rowtype;
begin
  if to_regprocedure('internal_academic.transfer_financial_origin(uuid)') is null then
    return internal_academic.technical_local_cycle_eligible_before_internal_transfer(p_matricula_id);
  end if;
  v_source:=internal_academic.transfer_financial_origin(p_matricula_id);
  if v_source is null then
    return internal_academic.technical_local_cycle_eligible_before_internal_transfer(p_matricula_id);
  end if;
  if not internal_academic.technical_cycle_history_outside_enrollment(p_matricula_id) then
    return internal_academic.technical_local_cycle_eligible_before_internal_transfer(p_matricula_id);
  end if;
  if not coalesce(internal_academic.transfer_source_cycle_one_complete(p_matricula_id),false) then return false; end if;
  select aluno_id into v_person from public.matriculas where id=p_matricula_id;
  select * into strict v_source_run from internal_academic.technical_manual_cycle_runs
    where matricula_id=v_source and cycle_number=1 and state='LOCAL_CREATED';
  return internal_academic.is_manual_technical_enrollment(p_matricula_id)
    and not exists(select 1 from public.matriculas m join internal_proesc.class_scopes s on s.turma_id=m.turma_id
      where m.id=p_matricula_id and s.phase<>'CONFIRMED')
    and not exists(select 1 from public.matriculas m join internal_proesc.enrollment_cycle_evidence e on e.matricula_id=m.id
      where m.aluno_id=v_person)
    and not exists(select 1 from internal_academic.technical_manual_cycle_runs run
      join public.matriculas m on m.id=run.matricula_id where m.aluno_id=v_person
      and not (run.matricula_id=v_source and run.cycle_number=1 and run.state='LOCAL_CREATED')
      and not (run.matricula_id=p_matricula_id and run.cycle_number=2 and run.state in ('GENERATING','LOCAL_CREATED')))
    and not exists(select 1 from public.contas_receber r
      where (r.cliente_id=v_person or r.matricula_id in (select id from public.matriculas where aluno_id=v_person))
        and not (r.matricula_id=v_source and r.id=any(v_source_run.receivable_ids))
        and not exists(select 1 from internal_academic.technical_manual_cycle_runs run
          join public.matriculas m on m.id=run.matricula_id
          where run.matricula_id=p_matricula_id and run.cycle_number=2
            and r.matricula_id=run.matricula_id and r.turma_id=run.turma_id and r.cliente_id=m.aluno_id
            and r.regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}'=run.request_id::text
            and r.regra_financeira_tecnica_snapshot#>>'{cicloManual,cicloNumero}'='2'
            and (run.state='LOCAL_CREATED' and r.id=any(run.receivable_ids)
              or run.state='GENERATING' and run.request_id::text=current_setting('app.technical_manual_cycle_request_id',true))));
exception when others then return false;
end;
$function$;

alter function internal_academic.technical_manual_cycle_state(uuid)
  rename to technical_manual_cycle_state_before_internal_transfer;
create function internal_academic.technical_manual_cycle_state(p_matricula_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_state jsonb; v_source uuid; v_transfer uuid; v_due date;
  v_complete boolean; v_eligible boolean; v_no_history boolean;
begin
  v_state:=internal_academic.technical_manual_cycle_state_before_internal_transfer(p_matricula_id);
  if to_regprocedure('internal_academic.transfer_financial_origin(uuid)') is null then return v_state; end if;
  v_source:=internal_academic.transfer_financial_origin(p_matricula_id);
  if v_source is null then return v_state; end if;
  select transferencia_id into v_transfer from internal_academic.transfer_financial_continuity
    where target_enrollment_id=p_matricula_id;
  v_complete:=internal_academic.transfer_source_cycle_one_complete(p_matricula_id);
  v_eligible:=internal_academic.technical_local_cycle_eligible(p_matricula_id);
  v_no_history:=not internal_academic.technical_cycle_history_outside_enrollment(p_matricula_id);
  v_state:=v_state||jsonb_build_object('continuidadeFinanceira',jsonb_build_object(
    'matriculaOrigemId',v_source,'transferenciaId',v_transfer,'origemCompleta',v_complete,
    'semHistoricoFinanceiro',v_no_history,
    'cadeiaOrigemIds',to_jsonb(internal_academic.transfer_financial_origin_chain(p_matricula_id)),
    'cicloOrigem',case when exists(select 1 from internal_academic.technical_manual_cycle_runs
      where matricula_id=v_source and cycle_number=1 and state='LOCAL_CREATED') then 1 end));
  if not exists(select 1 from internal_academic.technical_manual_cycle_runs where matricula_id=p_matricula_id) then
    if v_no_history and v_eligible and v_state->>'estado'='ELEGIVEL' then
      -- An academic origin with no debt does not invent a prior financial C1.
      return v_state;
    elsif v_complete and v_eligible and v_state->>'estado'='ELEGIVEL' then
      select internal_academic.technical_manual_cycle_due_from_last_boleto(max(r.data_vencimento)) into v_due
        from internal_academic.technical_manual_cycle_runs run join public.contas_receber r on r.id=any(run.receivable_ids)
        where run.matricula_id=v_source and run.cycle_number=1 and r.tipo_lancamento='PARCELA';
      v_state:=v_state||jsonb_build_object('cicloBaseHistorico',0,'proximoCicloNumero',2,
        'primeiroVencimentoSugerido',v_due,'criterioElegibilidade','TRANSFERENCIA_INTERNA_CANONICA');
      v_state:=jsonb_set(v_state,'{politica,fingerprint}',to_jsonb(encode(extensions.digest(
        jsonb_build_object('base',v_state#>>'{politica,fingerprint}','transferenciaId',v_transfer,
          'source',v_source,'nextCycle',2)::text,'sha256'),'hex')));
    elsif v_state->>'estado' is distinct from 'BLOQUEADO' then
      v_state:=v_state||jsonb_build_object('estado','PROTEGIDO_EXISTENTE','podeGerar',false,
        'proximoCicloNumero',null,'primeiroVencimentoSugerido',null,
        'bloqueio',jsonb_build_object('codigo','HISTORICO_FINANCEIRO_EXISTENTE',
          'mensagem','A continuidade mantém as cobranças na matrícula de origem. Confira esse histórico antes de emitir novo ciclo.'));
    end if;
  end if;
  return v_state;
end;
$function$;
revoke all on function internal_academic.technical_local_cycle_eligible(uuid),
  internal_academic.technical_local_cycle_eligible_before_internal_transfer(uuid),
  internal_academic.technical_manual_cycle_state(uuid),
  internal_academic.technical_manual_cycle_state_before_internal_transfer(uuid)
  from public,anon,authenticated,service_role;
commit;
