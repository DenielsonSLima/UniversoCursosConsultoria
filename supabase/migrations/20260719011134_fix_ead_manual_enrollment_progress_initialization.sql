begin;

create or replace function public.ead_liberar_matricula(p_matricula_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_matricula record;
  v_curso_id uuid;
begin
  select m.* into v_matricula
  from public.matriculas m
  where m.id = p_matricula_id
  for update;

  if not found then raise exception 'Matrícula não encontrada'; end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not (
      public.gestor_has_module('gestao')
      and public.can_write_turma(v_matricula.turma_id)
    )
  then
    raise exception 'Gestor sem permissão para liberar esta matrícula EAD.'
      using errcode = '42501';
  end if;

  select t.curso_id into v_curso_id
  from public.turmas t
  join public.cursos c on c.id = t.curso_id
  where t.id = v_matricula.turma_id and c.modalidade = 'EAD';

  if v_curso_id is null then
    raise exception 'Matrícula não pertence a turma EAD';
  end if;

  update public.matriculas set status = 'ATIVO'
  where id = p_matricula_id
  returning * into v_matricula;

  update public.inscricoes_online
  set status = 'PAGO', erro = null,
      pago_em = coalesce(pago_em, now()),
      confirmado_em = coalesce(confirmado_em, now()),
      forma_pagamento = coalesce(forma_pagamento, 'MANUAL'),
      updated_at = now()
  where matricula_id = p_matricula_id
    and status in ('AGUARDANDO_PAGAMENTO', 'AGUARDANDO_CONFIRMACAO');

  insert into public.ead_aluno_progresso (aluno_id, curso_id, progress)
  values (
    v_matricula.aluno_id,
    v_curso_id,
    jsonb_build_object(
      'completedContentIds', '[]'::jsonb,
      'completedActivityIds', '[]'::jsonb,
      'completedVideoIds', '[]'::jsonb,
      'activityAnswers', '{}'::jsonb,
      'quizAnswers', '{}'::jsonb
    )
  )
  on conflict (aluno_id, curso_id) do nothing;

  return jsonb_build_object(
    'success', true,
    'matriculaId', v_matricula.id,
    'status', v_matricula.status
  );
end;
$$;

revoke all on function public.ead_liberar_matricula(uuid) from public, anon;
grant execute on function public.ead_liberar_matricula(uuid)
  to authenticated, service_role;

create or replace function public.ead_matricular_aluno_manual(
  p_turma_id uuid,
  p_aluno_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turma record;
  v_matricula record;
begin
  select t.id, t.curso_id, t.polo_id, c.modalidade
  into v_turma
  from public.turmas t
  join public.cursos c on c.id = t.curso_id
  where t.id = p_turma_id;

  if not found or v_turma.modalidade <> 'EAD' then
    raise exception 'Turma EAD não encontrada';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not (
      public.gestor_has_module('gestao')
      and public.can_write_turma(p_turma_id)
    )
  then
    raise exception 'Gestor sem permissão para matricular nesta turma EAD.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.parceiros
    where id = p_aluno_id
      and tipo = 'Aluno'
  ) then
    raise exception 'Aluno não encontrado';
  end if;

  perform public.assert_aluno_sem_matricula_curso_duplicada(
    p_aluno_id,
    v_turma.curso_id,
    p_turma_id
  );

  insert into public.matriculas (aluno_id, turma_id, status)
  values (p_aluno_id, p_turma_id, 'ATIVO')
  on conflict (aluno_id, turma_id) do update
    set status = 'ATIVO'
  returning * into v_matricula;

  perform public.sync_aluno_polo_scope(p_aluno_id, v_turma.polo_id);

  insert into public.ead_aluno_progresso (aluno_id, curso_id, progress)
  values (
    p_aluno_id,
    v_turma.curso_id,
    jsonb_build_object(
      'completedContentIds', '[]'::jsonb,
      'completedActivityIds', '[]'::jsonb,
      'completedVideoIds', '[]'::jsonb,
      'activityAnswers', '{}'::jsonb,
      'quizAnswers', '{}'::jsonb
    )
  )
  on conflict (aluno_id, curso_id) do nothing;

  return jsonb_build_object(
    'success', true,
    'matriculaId', v_matricula.id,
    'status', v_matricula.status
  );
end;
$$;

revoke all on function public.ead_matricular_aluno_manual(uuid, uuid) from public, anon;
grant execute on function public.ead_matricular_aluno_manual(uuid, uuid)
  to authenticated, service_role;

commit;
