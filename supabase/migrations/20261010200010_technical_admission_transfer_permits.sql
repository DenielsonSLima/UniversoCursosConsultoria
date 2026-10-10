begin;
create table internal_academic.technical_transfer_admission_permits(
  database_txid bigint not null,backend_pid integer not null,matricula_id uuid not null,
  aluno_id uuid not null,turma_id uuid not null,actor_id uuid,
  transfer_type text not null check(transfer_type in ('EXTERNA_RECEBIDA','INTERNA_TURMA','INTERNA_POLO')),
  source_enrollment_id uuid,
  primary key(database_txid,backend_pid,matricula_id),
  check((transfer_type='EXTERNA_RECEBIDA')=(source_enrollment_id is null))
);
alter table internal_academic.technical_transfer_admission_permits enable row level security;
revoke all on internal_academic.technical_transfer_admission_permits from public,anon,authenticated,service_role;

create function internal_academic.authorize_technical_transfer_admission(
  p_matricula_id uuid,p_aluno_id uuid,p_turma_id uuid,p_type text,p_source uuid default null
)
returns void language plpgsql security definer set search_path='' as $function$
begin
  if not exists(select 1 from public.turmas t join public.cursos c on c.id=t.curso_id
    where t.id=p_turma_id and upper(coalesce(c.modalidade,'')) in ('TECNICO','TÉCNICO')) then return; end if;
  if p_matricula_id is null or p_aluno_id is null
    or coalesce(auth.role(),'') not in ('authenticated','service_role')
    or not coalesce(public.can_operate_turma_academics(p_turma_id),false)
    or p_type not in ('EXTERNA_RECEBIDA','INTERNA_TURMA','INTERNA_POLO') or p_type is null
    or (p_type='EXTERNA_RECEBIDA') is distinct from (p_source is null) then
    raise exception 'Autorização de ingresso por transferência inválida.' using errcode='42501'; end if;
  if exists(select 1 from public.matriculas where aluno_id=p_aluno_id and turma_id=p_turma_id) then return; end if;
  if p_source is not null and not exists(select 1 from public.matriculas m
    join internal_academic.transfer_financial_operations op on op.source_enrollment_id=m.id
    where m.id=p_source and m.aluno_id=p_aluno_id and m.status='TRANSFERIDO'
      and op.database_txid=txid_current() and op.actor_id=auth.uid() and op.transfer_id is null and op.result is null
      and op.payload->>'tipo'=p_type and op.payload->>'destino'=p_turma_id::text) then
    raise exception 'O ingresso interno exige a operação oficial de transferência atual.' using errcode='42501'; end if;
  insert into internal_academic.technical_transfer_admission_permits
    values(txid_current(),pg_backend_pid(),p_matricula_id,p_aluno_id,p_turma_id,auth.uid(),p_type,p_source);
end;
$function$;

create function internal_academic.guard_technical_admission_window()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if tg_op='UPDATE' and new.turma_id is not distinct from old.turma_id
    and new.aluno_id is not distinct from old.aluno_id then return new; end if;
  if not exists(select 1 from public.turmas t join public.cursos c on c.id=t.curso_id
    where t.id=new.turma_id and upper(coalesce(c.modalidade,'')) in ('TECNICO','TÉCNICO')) then return new; end if;
  if tg_op='UPDATE' then
    raise exception 'Use a transferência oficial para alterar a identidade do vínculo técnico.' using errcode='23514'; end if;
  if exists(select 1 from internal_academic.technical_transfer_admission_permits p
    where p.database_txid=txid_current() and p.backend_pid=pg_backend_pid() and p.matricula_id=new.id
      and p.aluno_id=new.aluno_id and p.turma_id=new.turma_id and p.actor_id is not distinct from auth.uid()) then return new; end if;
  if internal_proesc.is_bootstrap_claim('ENROLLMENT',new.id,to_jsonb(new)) and exists(
    select 1 from internal_proesc.enrollment_sources s join internal_proesc.class_scopes c on c.id=s.scope_id
    where s.matricula_id=new.id and c.turma_id=new.turma_id and c.phase='CONFIRMED') then return new; end if;
  perform internal_academic.assert_technical_direct_admission(new.turma_id);
  return new;
end;
$function$;
create function internal_academic.complete_technical_transfer_admission()
returns trigger language plpgsql security definer set search_path='' as $function$
declare v_permit internal_academic.technical_transfer_admission_permits%rowtype;
begin
  delete from internal_academic.technical_transfer_admission_permits p
    where p.database_txid=txid_current() and p.backend_pid=pg_backend_pid() and p.matricula_id=new.id
    returning p.* into v_permit;
  if not found then return null; end if;
  if not exists(select 1 from public.transferencias_academicas t
    where t.matricula_destino_id=new.id and t.aluno_id=v_permit.aluno_id and t.turma_destino_id=v_permit.turma_id
      and t.tipo=v_permit.transfer_type and t.matricula_origem_id is not distinct from v_permit.source_enrollment_id
      and t.created_at>=transaction_timestamp()) then
    raise exception 'O novo vínculo exige o registro oficial desta operação de transferência.' using errcode='23514'; end if;
  return null;
end;
$function$;
revoke all on function internal_academic.authorize_technical_transfer_admission(uuid,uuid,uuid,text,uuid),
  internal_academic.guard_technical_admission_window(),internal_academic.complete_technical_transfer_admission()
  from public,anon,authenticated,service_role;
commit;
