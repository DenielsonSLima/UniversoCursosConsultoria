begin;

alter function public.get_professor_disciplinas_portal(uuid)
  set schema internal_academic;
alter function internal_academic.get_professor_disciplinas_portal(uuid)
  rename to get_professor_disciplinas_portal_pre_livre;
revoke all on function internal_academic.get_professor_disciplinas_portal_pre_livre(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.get_professor_disciplinas_portal(p_polo_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_professor_id uuid := public.current_professor_id();
  v_today date := (pg_catalog.timezone('America/Maceio', now()))::date;
  v_technical jsonb;
  v_livre jsonb;
begin
  if v_professor_id is null or p_polo_id is null then return '[]'::jsonb; end if;
  v_technical := internal_academic.get_professor_disciplinas_portal_pre_livre(p_polo_id);

  with assigned as (
    select
      binding.turma_id,
      binding.disciplina_id,
      binding.professor_nome,
      binding.concluida,
      coalesce(binding.bloqueio_diario, 'ABERTO') as bloqueio_diario,
      class.codigo as turma_codigo,
      class.nome as turma_nome,
      class.curso_id,
      class.polo_id,
      class.data_inicio,
      class.data_previsao_termino,
      class.turno,
      upper(coalesce(class.status, 'STATUS_INDEFINIDO')) as turma_status,
      class.vagas_totais,
      class.valor_matricula,
      class.valor_rematricula,
      class.qtd_parcelas,
      class.valor_parcela,
      class.desconto_pontualidade,
      class.juros_atraso,
      class.multa_atraso,
      course.nome as curso_nome,
      'LIVRE'::text as modalidade,
      discipline.nome as disciplina_nome,
      coalesce(discipline.carga_horaria, 0)::numeric as carga_horaria,
      coalesce(discipline.carga_horaria_estagio, 0)::numeric as carga_horaria_estagio,
      module.nome as modulo_nome,
      unit.nome as polo_nome
    from public.turmas_disciplinas binding
    join public.turmas class on class.id = binding.turma_id and class.polo_id = p_polo_id
    join public.cursos course on course.id = class.curso_id
      and upper(coalesce(course.modalidade, '')) = 'LIVRE'
    join public.disciplinas discipline on discipline.id = binding.disciplina_id
    left join public.modulos module on module.id = discipline.modulo_id
    left join public.polos unit on unit.id = class.polo_id
    where binding.professor_id = v_professor_id
  ), meetings as (
    select meeting.turma_id, meeting.disciplina_id,
      count(distinct meeting.data_aula) filter (where meeting.data_aula is not null)::integer as total_aulas,
      count(distinct meeting.data_aula) filter (where meeting.data_aula <= v_today)::integer as total_aulas_dadas,
      coalesce(sum(meeting.carga_horaria) filter (where meeting.data_aula <= v_today), 0)::numeric as carga_dada,
      coalesce(sum(meeting.carga_horaria), 0)::numeric as carga_planejada,
      min(meeting.data_aula) as primeira_aula,
      max(meeting.data_aula) as ultima_aula
    from public.aulas_turma meeting
    join assigned item on item.turma_id = meeting.turma_id
      and item.disciplina_id = meeting.disciplina_id
    group by meeting.turma_id, meeting.disciplina_id
  ), canonical as (
    select item.*, coalesce(meeting.total_aulas, 0) as total_aulas,
      coalesce(meeting.total_aulas_dadas, 0) as total_aulas_dadas,
      coalesce(meeting.carga_dada, 0) as carga_dada,
      coalesce(meeting.carga_planejada, 0) as carga_planejada,
      meeting.primeira_aula, meeting.ultima_aula,
      (item.turma_status = 'EM_ANDAMENTO' and item.bloqueio_diario = 'ABERTO') as can_edit
    from assigned item
    left join meetings meeting on meeting.turma_id = item.turma_id
      and meeting.disciplina_id = item.disciplina_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.turma_id::text || '-' || item.disciplina_id::text,
    'turmaId', item.turma_id,
    'disciplinaId', item.disciplina_id,
    'turmaNome', coalesce(item.turma_nome, 'Turma sem nome'),
    'turmaCodigo', coalesce(item.turma_codigo, ''),
    'cursoNome', coalesce(item.curso_nome, 'Curso não informado'),
    'cursoId', item.curso_id,
    'modalidade', item.modalidade,
    'turno', coalesce(item.turno, 'Geral'),
    'status', item.turma_status,
    'disciplinaNome', coalesce(item.disciplina_nome, 'Disciplina'),
    'cargaHoraria', item.carga_horaria,
    'cargaHorariaEstagio', item.carga_horaria_estagio,
    'totalAulas', item.total_aulas,
    'totalAulasDadas', item.total_aulas_dadas,
    'totalAtividades', 0,
    'cargaHorariaDada', item.carga_dada,
    'cargaDadaPercent', case when item.carga_horaria > 0
      then least(100, round(item.carga_dada / item.carga_horaria * 100, 1)) else 0 end,
    'horasLancadas', item.carga_planejada,
    'progressoPercent', case when item.carga_horaria > 0
      then least(100, round(item.carga_planejada / item.carga_horaria * 100, 1)) else 0 end,
    'primeiraAula', item.primeira_aula,
    'ultimaAula', item.ultima_aula,
    'isEstagio', false,
    'canEdit', item.can_edit,
    'accessLabel', case
      when item.can_edit then 'Lançamentos liberados'
      when item.bloqueio_diario = 'PROFESSOR' then 'Em revisão'
      when item.bloqueio_diario = 'TOTAL' then 'Diário fechado'
      when item.turma_status = 'FINALIZADA' then 'Turma encerrada'
      else 'Aguardando início' end,
    'accessMessage', case
      when item.can_edit then ''
      when item.bloqueio_diario = 'PROFESSOR' then 'Este diário foi enviado para revisão.'
      when item.bloqueio_diario = 'TOTAL' then 'Este diário foi fechado pela Gestão.'
      when item.turma_status = 'FINALIZADA' then 'Esta turma foi encerrada.'
      else 'A turma ainda não está em andamento.' end,
    'raw', jsonb_build_object(
      'modulo_nome', item.modulo_nome,
      'periodo_letivo_id', null,
      'periodo_status', null,
      'bloqueio_diario', item.bloqueio_diario
    ),
    'turmaForDiario', jsonb_build_object(
      'id', item.turma_id, 'codigo', coalesce(item.turma_codigo, ''),
      'nome', coalesce(item.turma_nome, 'Turma sem nome'),
      'cursoId', item.curso_id, 'cursoNome', item.curso_nome,
      'modalidade', 'LIVRE', 'poloId', item.polo_id,
      'poloNome', coalesce(item.polo_nome, ''), 'dataInicio', item.data_inicio,
      'dataPrevisaoTermino', item.data_previsao_termino,
      'turno', coalesce(item.turno, 'Geral'), 'status', item.turma_status,
      'alunosMatriculados', 0, 'vagasTotais', coalesce(item.vagas_totais, 0),
      'valorMatricula', coalesce(item.valor_matricula, 0),
      'valorRematricula', coalesce(item.valor_rematricula, 0),
      'qtdParcelas', coalesce(item.qtd_parcelas, 0),
      'valorParcela', coalesce(item.valor_parcela, 0),
      'descontoPontualidade', coalesce(item.desconto_pontualidade, 0),
      'jurosAtraso', coalesce(item.juros_atraso, 0),
      'multaAtraso', coalesce(item.multa_atraso, 0)
    ),
    'disciplinaForDiario', jsonb_build_object(
      'id', item.disciplina_id, 'nome', item.disciplina_nome,
      'professor', coalesce(item.professor_nome, 'Professor'),
      'horasRealizadas', item.carga_planejada,
      'cargaHoraria', item.carga_horaria,
      'progressoPercent', case when item.carga_horaria > 0
        then least(100, round(item.carga_planejada / item.carga_horaria * 100, 1)) else 0 end,
      'periodoStatus', null, 'concluida', coalesce(item.concluida, false),
      'cargaHorariaEstagio', item.carga_horaria_estagio
    )
  ) order by item.disciplina_nome, item.turma_nome), '[]'::jsonb)
  into v_livre from canonical item;

  return coalesce(v_technical, '[]'::jsonb) || coalesce(v_livre, '[]'::jsonb);
end;
$function$;

revoke all on function public.get_professor_disciplinas_portal(uuid) from public, anon;
grant execute on function public.get_professor_disciplinas_portal(uuid)
  to authenticated, service_role;

commit;
