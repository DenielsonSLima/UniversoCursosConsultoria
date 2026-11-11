begin;

-- EAD enrollment must use its canonical charged or explicitly authorized
-- no-charge flow. The generic legacy RPC must not activate it without either.
create or replace function public.matricular_aluno_turma(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_responsavel_id uuid default null
)
returns public.matriculas
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_modalidade text;
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and not (
      public.gestor_has_module('gestao')
      and public.can_write_turma(p_turma_id)
    )
  then
    raise exception 'Sem permissão para matricular aluno nesta turma.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.turmas_plano_financeiro_unico plano
    where plano.turma_id = p_turma_id
  ) then
    raise exception
      'Esta turma usa plano financeiro único. Matricule pelo fluxo que gera todas as parcelas.'
      using errcode = '22023';
  end if;

  select upper(coalesce(curso.modalidade, ''))
  into v_modalidade
  from public.turmas turma
  join public.cursos curso on curso.id = turma.curso_id
  where turma.id = p_turma_id;

  if v_modalidade is null then
    raise exception 'Turma não encontrada.' using errcode = '22023';
  end if;
  if v_modalidade = 'EAD' then
    raise exception
      'Confirme a geração do financeiro no fluxo de matrícula EAD. Somente usuários com acesso ao Financeiro podem autorizar uma matrícula sem cobrança.'
      using errcode = 'PT409';
  end if;
  if v_modalidade in ('TECNICO', 'TÉCNICO') then
    raise exception
      'Matrícula técnica deve ser criada pelo fluxo financeiro pendente ou pela implantação explícita.'
      using errcode = '22023';
  end if;

  perform internal_academic.authorize_enrollment_upsert(
    p_aluno_id,
    p_turma_id,
    'ATIVO'
  );

  return internal_academic.legacy_matricular_aluno_turma(
    p_aluno_id,
    p_turma_id,
    p_responsavel_id
  );
end;
$function$;

revoke all on function public.matricular_aluno_turma(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.matricular_aluno_turma(uuid, uuid, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
