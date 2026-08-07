-- Ajuste pós-validação do lote 2026-08-07: a lista da Secretaria não pode
-- marcar como selecionável uma matrícula cuja modalidade ainda não possui
-- modelo de contrato ATIVO. A elegibilidade permanece exclusivamente no RPC.

create or replace function public.get_secretaria_contratos_aluno_workspace_secure(
  p_polo_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_targets jsonb;
  v_turmas jsonb;
  v_templates jsonb;
  v_policy jsonb;
begin
  if not public.can_manage_secretaria_document('contrato_aluno', p_polo_id) then
    raise exception 'Acesso aos contratos de aluno não autorizado.'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', enrollment.id,
        'matricula_id', enrollment.id,
        'aluno_id', student.id,
        'aluno_nome', student.nome,
        'curso_nome', course.nome,
        'modalidade', upper(course.modalidade),
        'turma_id', class.id,
        'turma_nome', class.nome,
        'turma_codigo', class.codigo,
        'matricula_status', upper(enrollment.status),
        'modelo_status', model.status,
        'elegivel', coalesce(model.status = 'ATIVO', false),
        'mensagem_elegibilidade', case
          when model.template_key is null then 'Não há modelo de contrato configurado para esta modalidade.'
          when model.status <> 'ATIVO' then 'O modelo desta modalidade está em revisão e não pode ser emitido.'
          else null
        end,
        'status_label', case
          when model.status = 'ATIVO' then 'Matrícula ativa e modelo disponível'
          when model.template_key is null then 'Matrícula ativa · modelo não configurado'
          else 'Matrícula ativa · modelo em revisão'
        end,
        'data_matricula', enrollment.data_matricula
      ) order by student.nome, class.nome
    ),
    '[]'::jsonb
  )
  into v_targets
  from public.matriculas enrollment
  join public.parceiros student on student.id = enrollment.aluno_id
  join public.turmas class on class.id = enrollment.turma_id
  join public.cursos course on course.id = class.curso_id
  left join public.documentos_modelos_configuracoes model
    on model.template_key = 'contrato_aluno'
    and model.modalidade = upper(course.modalidade)
  where class.polo_id = p_polo_id
    and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'LIVRE', 'SUPERIOR')
    and upper(coalesce(enrollment.status, '')) = 'ATIVO';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', class.id,
        'nome', class.nome,
        'codigo', class.codigo,
        'curso_nome', course.nome,
        'modalidade', upper(course.modalidade)
      ) order by course.nome, class.nome
    ),
    '[]'::jsonb
  )
  into v_turmas
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.polo_id = p_polo_id
    and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'LIVRE', 'SUPERIOR');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'templateKey', model.template_key,
        'modality', model.modalidade,
        'revision', model.revisao,
        'status', model.status,
        'updatedAt', model.updated_at,
        'content', model.conteudo
      ) order by model.modalidade
    ),
    '[]'::jsonb
  )
  into v_templates
  from public.documentos_modelos_configuracoes model
  where model.template_key = 'contrato_aluno';

  select jsonb_build_object(
    'documento', policy.documento,
    'prefixo', policy.prefixo,
    'validade_dias', policy.validade_dias,
    'validacao_publica', policy.validacao_publica,
    'consulta_publica_ativa', policy.consulta_publica_ativa,
    'campos_publicos', policy.campos_publicos,
    'versao', policy.versao
  )
  into v_policy
  from public.documentos_validacao_politicas policy
  where policy.documento = 'contrato_aluno';

  return jsonb_build_object(
    'targets', v_targets,
    'turmas', v_turmas,
    'templates', v_templates,
    'policy', coalesce(v_policy, '{}'::jsonb),
    'generated_at', clock_timestamp()
  );
end;
$function$;

revoke all on function public.get_secretaria_contratos_aluno_workspace_secure(uuid)
  from public, anon;
grant execute on function public.get_secretaria_contratos_aluno_workspace_secure(uuid)
  to authenticated, service_role;
