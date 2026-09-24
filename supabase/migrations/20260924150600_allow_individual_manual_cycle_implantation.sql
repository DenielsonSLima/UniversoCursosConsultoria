-- An academic import/workflow flag is not proof of imported financial debt.
-- Exception restricted to the authorized, individually verified manual run.
begin;

do $base$
begin
  if md5(pg_get_functiondef('public.guard_implantation_receivable()'::regprocedure))
    <>'d42612f1405abdbe5181d9fed475f7b0' then
    raise exception 'Implantation financial guard changed; rebase required.';
  end if;
end;
$base$;

create function internal_academic.is_individual_manual_cycle_receivable(
  p_receivable public.contas_receber,p_creating boolean
) returns boolean language sql stable security definer set search_path='' as $$
  select internal_academic.technical_local_cycle_eligible((p_receivable).matricula_id)
    and exists(select 1 from internal_academic.technical_manual_cycle_runs run
      join public.matriculas m on m.id=run.matricula_id
      join public.turmas t on t.id=m.turma_id
      where run.matricula_id=(p_receivable).matricula_id
        and run.turma_id=(p_receivable).turma_id and m.turma_id=run.turma_id
        and m.aluno_id=(p_receivable).cliente_id and t.polo_id=(p_receivable).polo_id
        and (p_receivable).regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}'=run.request_id::text
        and (p_receivable).regra_financeira_tecnica_snapshot#>>'{cicloManual,cicloNumero}'=run.cycle_number::text
        and (p_receivable).regra_financeira_tecnica_snapshot#>>'{cicloManual,regraFingerprint}'=run.rule_fingerprint
        and (p_receivable).regra_financeira_tecnica_snapshot#>>'{cicloManual,politicaFingerprint}'=run.policy_fingerprint
        and (p_receivable).regra_financeira_tecnica_snapshot#>>'{cicloManual,cronogramaFingerprint}'=run.schedule_fingerprint
        and case (p_receivable).tipo_lancamento
          when 'MATRICULA' then run.cycle_number=1 and (p_receivable).parcela_numero=0
            and (p_receivable).origem_cronograma_id='matricula'
          when 'REMATRICULA' then run.cycle_number=2 and (p_receivable).parcela_numero=0
            and (p_receivable).origem_cronograma_id='ciclo-1-rematricula'
          when 'PARCELA' then (p_receivable).parcela_numero between 1 and run.expected_installment_count
            and (p_receivable).origem_cronograma_id='ciclo-'||run.cycle_number||'-parc-'||(p_receivable).parcela_numero
          else false end
        and case when p_creating then
          run.state='GENERATING' and run.request_id::text=
            current_setting('app.technical_manual_cycle_request_id',true)
        else run.state='LOCAL_CREATED' and (p_receivable).id=any(run.receivable_ids) end);
$$;
revoke all on function internal_academic.is_individual_manual_cycle_receivable(public.contas_receber,boolean)
  from public,anon,authenticated,service_role;

create or replace function public.guard_implantation_receivable()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_matricula_id uuid; v_manual boolean:=false;
begin
  if tg_op='DELETE' then v_matricula_id:=old.matricula_id;
  else v_matricula_id:=new.matricula_id; end if;
  if v_matricula_id is null then
    return case when tg_op='DELETE' then old else new end;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('matricula_workflow:'||v_matricula_id::text,0));
  if tg_op<>'DELETE' and exists(select 1 from public.matriculas m
    where m.id=v_matricula_id and m.fluxo_operacional='IMPLANTACAO') then
    if tg_op='INSERT' then
      v_manual:=internal_academic.is_individual_manual_cycle_receivable(new,true);
    elsif tg_op='UPDATE' then
      v_manual:=internal_academic.is_individual_manual_cycle_receivable(old,false)
        and internal_academic.is_individual_manual_cycle_receivable(new,false)
        and row(old.id,old.matricula_id,old.turma_id,old.cliente_id,old.polo_id,
          old.tipo_lancamento,old.parcela_numero,old.origem_cronograma_id,
          old.valor,old.data_vencimento,old.regra_financeira_tecnica_snapshot)
        is not distinct from row(new.id,new.matricula_id,new.turma_id,new.cliente_id,new.polo_id,
          new.tipo_lancamento,new.parcela_numero,new.origem_cronograma_id,
          new.valor,new.data_vencimento,new.regra_financeira_tecnica_snapshot);
    end if;
    if not coalesce(v_manual,false) then
      raise exception 'Matrícula de implantação não pode receber lançamento financeiro.' using errcode='22023';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function public.guard_implantation_receivable() from public,anon,authenticated,service_role;

-- Synthetic contracts execute before COMMIT.
create temporary table implantation_receivable (like public.contas_receber) on commit drop;
create temporary table implantation_run (like internal_academic.technical_manual_cycle_runs) on commit drop;
create temporary table implantation_enrollment (id uuid,turma_id uuid,aluno_id uuid,fluxo_operacional text) on commit drop;
create temporary table implantation_class (id uuid,polo_id uuid) on commit drop;
create temporary table implantation_eligibility (id uuid,eligible boolean) on commit drop;
do $nullable$
declare v_column record;
begin
  for v_column in select c.relname,a.attname from pg_class c
    join pg_attribute a on a.attrelid=c.oid
    where c.relnamespace=pg_my_temp_schema() and c.relname like 'implantation_%'
      and a.attnum>0 and a.attnotnull
  loop execute format('alter table pg_temp.%I alter column %I drop not null',v_column.relname,v_column.attname); end loop;
end;
$nullable$;
create function pg_temp.implantation_local(p_id uuid) returns boolean language sql as $$
  select eligible from pg_temp.implantation_eligibility where id=p_id;
$$;
do $copy$
declare v_signature text; v_source text; v_pair text[];
begin
  foreach v_signature in array array[
    'internal_academic.is_individual_manual_cycle_receivable(public.contas_receber,boolean)',
    'public.guard_implantation_receivable()'
  ] loop
    v_source:=pg_get_functiondef(v_signature::regprocedure);
    foreach v_pair slice 1 in array array[
      ['internal_academic.is_individual_manual_cycle_receivable','pg_temp.implantation_canonical'],
      ['public.guard_implantation_receivable','pg_temp.implantation_guard'],
      ['internal_academic.technical_local_cycle_eligible','pg_temp.implantation_local'],
      ['internal_academic.technical_manual_cycle_runs','pg_temp.implantation_run'],
      ['public.contas_receber','pg_temp.implantation_receivable'],
      ['p_receivable contas_receber','p_receivable pg_temp.implantation_receivable'],
      ['public.matriculas','pg_temp.implantation_enrollment'],
      ['public.turmas','pg_temp.implantation_class']
    ] loop v_source:=replace(v_source,v_pair[1],v_pair[2]); end loop;
    execute v_source;
  end loop;
end;
$copy$;
create trigger implantation_fixture_guard before insert or update or delete
  on implantation_receivable for each row execute function pg_temp.implantation_guard();

do $contract$
declare
  v_enrollment uuid:='b0000000-0000-0000-0000-000000000001';
  v_class uuid:='b0000000-0000-0000-0000-000000000002';
  v_person uuid:='b0000000-0000-0000-0000-000000000003';
  v_receivable uuid:='b0000000-0000-0000-0000-000000000004';
  v_request uuid:='b0000000-0000-0000-0000-000000000005';
  v_row pg_temp.implantation_receivable;
begin
  insert into pg_temp.implantation_enrollment values(v_enrollment,v_class,v_person,'IMPLANTACAO');
  insert into pg_temp.implantation_class values(v_class,v_class);
  insert into pg_temp.implantation_eligibility values(v_enrollment,true);
  insert into pg_temp.implantation_run(matricula_id,turma_id,cycle_number,state,request_id,
    rule_fingerprint,policy_fingerprint,schedule_fingerprint,expected_installment_count)
    values(v_enrollment,v_class,1,'GENERATING',v_request,repeat('a',64),repeat('b',64),repeat('c',64),12);
  v_row.id:=v_receivable; v_row.matricula_id:=v_enrollment; v_row.turma_id:=v_class;
  v_row.cliente_id:=v_person; v_row.polo_id:=v_class; v_row.tipo_lancamento:='PARCELA';
  v_row.parcela_numero:=1; v_row.origem_cronograma_id:='ciclo-1-parc-1';
  v_row.valor:=100; v_row.data_vencimento:=current_date+30; v_row.status:='PENDENTE';
  v_row.regra_financeira_tecnica_snapshot:=jsonb_build_object('cicloManual',jsonb_build_object(
    'requestId',v_request,'cicloNumero',1,'regraFingerprint',repeat('a',64),
    'politicaFingerprint',repeat('b',64),'cronogramaFingerprint',repeat('c',64)));
  perform set_config('app.technical_manual_cycle_request_id','',true);
  begin
    insert into pg_temp.implantation_receivable select (v_row).*;
    raise exception 'Generation without request GUC was accepted' using errcode='23514';
  exception when invalid_parameter_value then null; end;
  perform set_config('app.technical_manual_cycle_request_id',v_request::text,true);
  update pg_temp.implantation_eligibility set eligible=false;
  begin
    insert into pg_temp.implantation_receivable select (v_row).*;
    raise exception 'Imported financial history bypassed implantation guard' using errcode='23514';
  exception when invalid_parameter_value then null; end;
  update pg_temp.implantation_eligibility set eligible=true;
  v_row.cliente_id:=v_class;
  assert not pg_temp.implantation_canonical(v_row,true),'A foreign person must fail identity';
  v_row.cliente_id:=v_person;
  v_row.regra_financeira_tecnica_snapshot:=jsonb_set(v_row.regra_financeira_tecnica_snapshot,
    '{cicloManual,cronogramaFingerprint}',to_jsonb(repeat('d',64)));
  assert not pg_temp.implantation_canonical(v_row,true),'Schedule CAS mismatch must fail';
  v_row.regra_financeira_tecnica_snapshot:=jsonb_set(v_row.regra_financeira_tecnica_snapshot,
    '{cicloManual,cronogramaFingerprint}',to_jsonb(repeat('c',64)));
  v_row.origem_cronograma_id:='ciclo-2-parc-1';
  assert not pg_temp.implantation_canonical(v_row,true),'Cross-cycle origin must fail';
  v_row.origem_cronograma_id:='ciclo-1-parc-1';
  insert into pg_temp.implantation_receivable select (v_row).*;
  assert (select count(*) from pg_temp.implantation_receivable)=1;
  assert (select fluxo_operacional from pg_temp.implantation_enrollment)='IMPLANTACAO',
    'Issuing a manual cycle must not activate or reclassify the academic enrollment';

  update pg_temp.implantation_run set state='LOCAL_CREATED',receivable_ids=array[v_receivable];
  perform set_config('app.technical_manual_cycle_request_id','',true);
  -- A finalized canonical receipt remains updatable for bank reconciliation and
  -- payment projection; its contract and academic identity must remain intact.
  update pg_temp.implantation_receivable set gateway_submission_status='API_REGISTERED';
  update pg_temp.implantation_receivable set status='PAGO';
  begin
    update pg_temp.implantation_receivable set valor=101;
    raise exception 'A changed principal escaped the identity guard' using errcode='23514';
  exception when invalid_parameter_value then null; end;
  begin
    update pg_temp.implantation_receivable set cliente_id=v_class;
    raise exception 'Receipt reassignment escaped the identity guard' using errcode='23514';
  exception when invalid_parameter_value then null; end;
  update pg_temp.implantation_run set receivable_ids='{}';
  begin
    update pg_temp.implantation_receivable set status='PENDENTE';
    raise exception 'A receipt outside its finalized run was accepted' using errcode='23514';
  exception when invalid_parameter_value then null; end;
  update pg_temp.implantation_run set receivable_ids=array[v_receivable];
  update pg_temp.implantation_eligibility set eligible=false;
  begin
    update pg_temp.implantation_receivable set status='PENDENTE';
    raise exception 'External history was accepted on update' using errcode='23514';
  exception when invalid_parameter_value then null; end;
  -- Delete semantics stay delegated to existing history/protected-cycle guards.
  delete from pg_temp.implantation_receivable;
  assert (select count(*) from pg_temp.implantation_receivable)=0;
end;
$contract$;
commit;
