-- Separate new, authorized admissions from the immutable Proesc import lane.
begin;

create table internal_academic.regular_technical_admission_claims (
  transaction_id bigint not null,
  backend_pid integer not null,
  matricula_id uuid not null,
  aluno_id uuid not null,
  turma_id uuid not null,
  actor_id uuid,
  status text not null check (status in ('PENDENTE','ATIVO')),
  primary key(transaction_id,backend_pid,matricula_id)
);
revoke all on internal_academic.regular_technical_admission_claims
  from public,anon,authenticated,service_role;

create function internal_academic.authorize_regular_technical_admission(
  p_matricula_id uuid,p_aluno_id uuid,p_turma_id uuid,p_status text
)
returns void language plpgsql security definer set search_path='' as $function$
begin
  if not exists(select 1 from internal_proesc.class_scopes
    where turma_id=p_turma_id and batch_id is not null) then return; end if;
  if p_matricula_id is null or p_aluno_id is null or p_status not in ('PENDENTE','ATIVO')
    or p_status is null or coalesce(auth.role(),'') not in ('authenticated','service_role')
    or (auth.role()='authenticated' and (auth.uid() is null
      or not coalesce(public.can_operate_turma_academics(p_turma_id),false)))
    or not exists(select 1 from internal_proesc.class_scopes s
      join public.turmas t on t.id=s.turma_id
      where s.turma_id=p_turma_id and s.batch_id is not null and s.phase='CONFIRMED'
        and t.status in ('PLANEJADA','INSCRICOES_ABERTAS','EM_ANDAMENTO'))
    or exists(select 1 from public.matriculas where id=p_matricula_id)
    or exists(select 1 from internal_proesc.enrollment_sources where matricula_id=p_matricula_id)
    or exists(select 1 from internal_proesc.obligation_links where matricula_id=p_matricula_id)
  then raise exception 'Admissão regular não autorizada neste escopo importado.' using errcode='42501'; end if;
  insert into internal_academic.regular_technical_admission_claims
    values(txid_current(),pg_backend_pid(),p_matricula_id,p_aluno_id,p_turma_id,auth.uid(),p_status);
end;
$function$;

create function internal_academic.consume_regular_technical_admission(p_new public.matriculas)
returns boolean language plpgsql security definer set search_path='' as $function$
declare v_claim boolean;
begin
  if p_new.fluxo_operacional is distinct from 'REGULAR'
    or coalesce(p_new.financeiro_herdado,false)
    or coalesce(p_new.gerar_cobranca_inicial,false)
    or coalesce(p_new.gerar_cobranca_futura,false)
    or coalesce(p_new.sincronizar_asaas,false)
    or exists(select 1 from internal_proesc.enrollment_sources where matricula_id=p_new.id)
    or exists(select 1 from internal_proesc.obligation_links where matricula_id=p_new.id)
  then return false; end if;
  delete from internal_academic.regular_technical_admission_claims c
    where c.transaction_id=txid_current() and c.backend_pid=pg_backend_pid()
      and c.matricula_id=p_new.id and c.aluno_id=p_new.aluno_id and c.turma_id=p_new.turma_id
      and c.status=p_new.status and c.actor_id is not distinct from auth.uid()
    returning true into v_claim;
  return coalesce(v_claim,false);
end;
$function$;
revoke all on function
  internal_academic.authorize_regular_technical_admission(uuid,uuid,uuid,text),
  internal_academic.consume_regular_technical_admission(public.matriculas)
  from public,anon,authenticated,service_role;

do $patch$
declare v_definition text; v_from text;
begin
  v_definition:=pg_get_functiondef('internal_proesc.guard_bootstrap_enrollment()'::regprocedure);
  v_from:=$old$  if not found then return new; end if;$old$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Bootstrap admission boundary changed.';
  end if;
  execute replace(v_definition,v_from,v_from||$new$
  if v_scope.phase='CONFIRMED'
    and internal_academic.consume_regular_technical_admission(new) then return new; end if;$new$);

  v_definition:=pg_get_functiondef('public.pre_vincular_aluno_tecnico_secure(uuid,uuid,uuid,date,integer,text)'::regprocedure);
  v_from:=$old$  v_public_rule jsonb;$old$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Prelink declaration changed.';
  end if;
  v_definition:=replace(v_definition,v_from,v_from||E'\n  v_admission_id uuid:=gen_random_uuid();');
  v_from:=$old$  insert into public.matriculas (
    aluno_id, turma_id, status,$old$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Prelink insert changed.';
  end if;
  v_definition:=replace(v_definition,v_from,$new$  perform internal_academic.authorize_regular_technical_admission(
    v_admission_id,p_aluno_id,p_turma_id,'PENDENTE');
  insert into public.matriculas (
    id, aluno_id, turma_id, status,$new$);
  v_from:=$old$    p_aluno_id, p_turma_id, 'PENDENTE',
    v_turma.valor_matricula$old$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Prelink values changed.';
  end if;
  execute replace(v_definition,v_from,$new$    v_admission_id, p_aluno_id, p_turma_id, 'PENDENTE',
    v_turma.valor_matricula$new$);
end;
$patch$;
commit;
