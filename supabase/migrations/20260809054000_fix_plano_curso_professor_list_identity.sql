-- Lote 2026-08-09: alinha a lista do Professor à identidade documental
-- nullable já exigida pelo contrato TypeScript.

begin;

create or replace function public.listar_planos_curso_professor_secure(p_polo_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_professor_id uuid := public.current_professor_id();
begin
  if v_professor_id is null then
    raise exception 'Professor autenticado não identificado.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'planoId', plan.id,
      'status', coalesce(plan.status, 'AUSENTE'),
      'revisao', coalesce(plan.revisao, 0),
      'templateRevision', plan.template_revision,
      'documentoFingerprint', plan.documento_fingerprint,
      'turmaId', assignment.turma_id,
      'disciplinaId', assignment.disciplina_id,
      'professorId', v_professor_id,
      'turmaNome', class.nome,
      'turmaCodigo', class.codigo,
      'cursoNome', course.nome,
      'poloId', class.polo_id,
      'poloNome', pole.nome,
      'disciplinaNome', subject.nome,
      'professorNome', coalesce(nullif(teacher.nome, ''), nullif(assignment.professor_nome, '')),
      'totalDias', lessons.total_dias,
      'totalAulas', lessons.total_aulas,
      'primeiraAula', lessons.primeira_aula,
      'ultimaAula', lessons.ultima_aula,
      'updatedAt', plan.updated_at
    ) order by course.nome, class.nome, subject.nome)
    from public.turmas_disciplinas assignment
    join public.turmas class on class.id = assignment.turma_id and class.polo_id = p_polo_id
    join public.cursos course on course.id = class.curso_id
    join public.polos pole on pole.id = class.polo_id
    join public.disciplinas subject on subject.id = assignment.disciplina_id
    join public.parceiros teacher on teacher.id = v_professor_id
    join lateral (
      select count(distinct meeting.data_aula)::integer as total_dias,
        count(*)::integer as total_aulas,
        min(meeting.data_aula) as primeira_aula,
        max(meeting.data_aula) as ultima_aula
      from public.aulas_turma meeting
      where meeting.turma_id = assignment.turma_id
        and meeting.disciplina_id = assignment.disciplina_id
        and meeting.data_aula is not null
    ) lessons on lessons.total_aulas > 0
    left join public.planos_curso plan
      on plan.turma_id = assignment.turma_id
      and plan.disciplina_id = assignment.disciplina_id
      and plan.professor_id = v_professor_id
    where assignment.professor_id = v_professor_id
  ), '[]'::jsonb);
end;
$function$;

revoke all on function public.listar_planos_curso_professor_secure(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.listar_planos_curso_professor_secure(uuid)
  to authenticated;

comment on function public.listar_planos_curso_professor_secure(uuid) is
  'Lista RPC-only do professor com identidade documental nullable do plano concluído.';

commit;
