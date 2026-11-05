begin;

create table internal_academic.ead_no_charge_enrollments (
  request_id uuid primary key,
  actor_id uuid not null references auth.users(id),
  aluno_id uuid not null references public.parceiros(id),
  turma_id uuid not null references public.turmas(id),
  curso_id uuid not null references public.cursos(id),
  matricula_id uuid not null unique references public.matriculas(id) on delete restrict,
  mode text not null default 'SEM_COBRANCA' check(mode='SEM_COBRANCA'),
  created_at timestamptz not null default clock_timestamp()
);
alter table internal_academic.ead_no_charge_enrollments enable row level security;
revoke all on internal_academic.ead_no_charge_enrollments from public,anon,authenticated,service_role;

create function internal_academic.protect_ead_no_charge_audit()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  raise exception 'A autorização da matrícula sem cobrança é imutável.' using errcode='42501';
end; $$;
create trigger protect_ead_no_charge_audit before update or delete
  on internal_academic.ead_no_charge_enrollments for each row
  execute function internal_academic.protect_ead_no_charge_audit();
revoke all on function internal_academic.protect_ead_no_charge_audit()
  from public,anon,authenticated,service_role;

create function public.ead_adicionar_aluno_sem_cobranca_secure(
  p_turma_id uuid,p_aluno_id uuid,p_request_id uuid,p_confirm boolean default false
)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
  v_t public.turmas%rowtype;
  v_c public.cursos%rowtype;
  v_m public.matriculas%rowtype;
  v_a internal_academic.ead_no_charge_enrollments%rowtype;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated' then
    raise exception 'Autenticação de gestor obrigatória.' using errcode='42501';
  end if;
  select * into v_t from public.turmas where id=p_turma_id;
  if not found or not coalesce(
    public.gestor_has_module('financeiro') and public.gestor_has_module('gestao')
    and public.is_financeiro_for_polo(v_t.polo_id) and public.can_write_turma(v_t.id)
    and exists(select 1 from public.usuarios_sistema u where u.auth_user_id=auth.uid()
      and public.is_active_status(u.status) and lower(btrim(u.perfil)) in ('gestor','financeiro')),
    false
  ) then
    raise exception 'Acesso ao Financeiro e à turma EAD obrigatório para adicionar sem cobrança.' using errcode='42501';
  end if;
  if p_aluno_id is null or p_request_id is null or p_confirm is not true then
    raise exception 'Selecione o aluno e confirme a matrícula sem cobrança.' using errcode='22023';
  end if;
  select * into v_c from public.cursos where id=v_t.curso_id;
  if not found or upper(coalesce(v_c.modalidade,''))<>'EAD' then
    raise exception 'Turma EAD não encontrada.' using errcode='22023';
  end if;
  -- Both locks follow the canonical checkout order: duplicate-course guard,
  -- then its student/course checkout lock. No browser flag bypasses a guard.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ead_no_charge_request:'||p_request_id::text,0));
  select * into v_a from internal_academic.ead_no_charge_enrollments where request_id=p_request_id;
  if found then
    if v_a.actor_id is distinct from auth.uid() or v_a.aluno_id is distinct from p_aluno_id
      or v_a.turma_id is distinct from p_turma_id or v_a.curso_id is distinct from v_t.curso_id then
      raise exception 'Chave de confirmação reutilizada para outra matrícula.' using errcode='22023';
    end if;
    select * into strict v_m from public.matriculas where id=v_a.matricula_id;
    return jsonb_build_object('success',true,'matriculaId',v_m.id,'mode','SEM_COBRANCA',
      'status',v_m.status,'replayed',true);
  end if;
  if upper(coalesce(v_c.status,''))<>'ATIVO' or upper(coalesce(v_t.status,''))<>'EM_ANDAMENTO' then
    raise exception 'Curso ou turma EAD indisponível para nova matrícula.' using errcode='22023';
  end if;
  if not exists(select 1 from public.parceiros p where p.id=p_aluno_id
    and upper(p.tipo)='ALUNO' and upper(p.status)='ATIVO') then
    raise exception 'Aluno ativo não encontrado.' using errcode='22023';
  end if;
  perform public.assert_aluno_sem_matricula_curso_duplicada(p_aluno_id,v_t.curso_id,p_turma_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ead_checkout:'||p_aluno_id::text||':'||v_t.curso_id::text,0));
  if exists(select 1 from public.turmas_plano_financeiro_unico where turma_id=p_turma_id)
    or exists(select 1 from public.ead_checkout_attempts where aluno_id=p_aluno_id and curso_id=v_t.curso_id)
    or exists(select 1 from public.matriculas m join public.turmas t on t.id=m.turma_id
      where m.aluno_id=p_aluno_id and t.curso_id=v_t.curso_id)
    or exists(select 1 from public.contas_receber r
      left join public.matriculas m on m.id=r.matricula_id
      join public.turmas t on t.id=coalesce(r.turma_id,m.turma_id)
      where (r.cliente_id=p_aluno_id or m.aluno_id=p_aluno_id) and t.curso_id=v_t.curso_id)
    or exists(select 1 from public.inscricoes_online i
      where i.aluno_id=p_aluno_id and (i.curso_id=v_t.curso_id or i.turma_id=p_turma_id)) then
    raise exception 'Existe matrícula, tentativa ou vínculo financeiro neste curso. Confira o histórico antes de adicionar sem cobrança.' using errcode='PT409';
  end if;
  perform internal_academic.authorize_enrollment_upsert(p_aluno_id,p_turma_id,'ATIVO');
  insert into public.matriculas(aluno_id,turma_id,status,financeiro_herdado,
    gerar_cobranca_inicial,gerar_cobranca_futura,sincronizar_asaas)
  values(p_aluno_id,p_turma_id,'ATIVO',false,false,false,false) returning * into v_m;
  perform public.sync_aluno_polo_scope(p_aluno_id,v_t.polo_id);
  insert into public.ead_aluno_progresso(aluno_id,curso_id,progress)
  values(p_aluno_id,v_t.curso_id,jsonb_build_object('completedContentIds','[]'::jsonb,
    'completedActivityIds','[]'::jsonb,'completedVideoIds','[]'::jsonb,
    'activityAnswers','{}'::jsonb,'quizAnswers','{}'::jsonb))
  on conflict(aluno_id,curso_id) do nothing;
  -- Any unexpected automatic financial side effect aborts the whole operation.
  if exists(select 1 from public.contas_receber where matricula_id=v_m.id)
    or exists(select 1 from public.inscricoes_online where matricula_id=v_m.id) then
    raise exception 'A matrícula sem cobrança produziu vínculo financeiro inesperado.' using errcode='PT409';
  end if;
  insert into internal_academic.ead_no_charge_enrollments(request_id,actor_id,aluno_id,turma_id,curso_id,matricula_id)
  values(p_request_id,auth.uid(),p_aluno_id,p_turma_id,v_t.curso_id,v_m.id);
  return jsonb_build_object('success',true,'matriculaId',v_m.id,'mode','SEM_COBRANCA','status','ATIVO','replayed',false);
end; $$;
revoke all on function public.ead_adicionar_aluno_sem_cobranca_secure(uuid,uuid,uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.ead_adicionar_aluno_sem_cobranca_secure(uuid,uuid,uuid,boolean) to authenticated;

notify pgrst,'reload schema';
commit;
