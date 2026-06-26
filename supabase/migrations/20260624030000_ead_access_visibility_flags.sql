create or replace function public.ead_get_turma_dashboard(p_turma_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'turmaId', t.id,
    'codigo', t.codigo,
    'nome', t.nome,
    'status', t.status,
    'cursoId', c.id,
    'cursoNome', c.nome,
    'area', coalesce(c.area, 'Outros'),
    'valor', coalesce(c.valor, 0),
    'asaasUrl', c.asaas_payment_link_url,
    'vagasTotais', t.vagas_totais,
    'alunosTotal', count(m.id),
    'alunosPendentes', count(*) filter (where m.status in ('PENDENTE', 'AGUARDANDO_PAGAMENTO', 'AGUARDANDO_CONFIRMACAO')),
    'alunosLiberados', count(*) filter (where m.status in ('ATIVO', 'CONCLUIDO')),
    'alunosConcluidos', count(*) filter (where m.status = 'CONCLUIDO'),
    'certificadosPendentes', count(ca.id) filter (where ca.status = 'PENDENTE'),
    'certificadosEmitidos', count(ca.id) filter (where ca.status = 'FINALIZADO'),
    'receitaPrevista', coalesce(c.valor, 0) * count(m.id),
    'receitaConfirmada', coalesce(c.valor, 0) * count(*) filter (where m.status in ('ATIVO', 'CONCLUIDO')),
    'configuracao', coalesce(c.ead_config, '{}'::jsonb)
  )
  into v_result
  from public.turmas t
  join public.cursos c on c.id = t.curso_id
  left join public.matriculas m on m.turma_id = t.id
  left join public.certificados_academicos ca on ca.matricula_id = m.id
  where t.id = p_turma_id
    and c.modalidade = 'EAD'
  group by t.id, c.id;

  if v_result is null then
    raise exception 'Turma EAD nao encontrada';
  end if;

  return v_result;
end;
$$;

create or replace function public.ead_get_turma_alunos(p_turma_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with turma_curso as (
    select t.id as turma_id, c.id as curso_id, c.ead_config
    from public.turmas t
    join public.cursos c on c.id = t.curso_id
    where t.id = p_turma_id
      and c.modalidade = 'EAD'
  ),
  base as (
    select
      m.id as matricula_id,
      m.status as matricula_status,
      m.data_matricula,
      p.id as aluno_id,
      p.nome,
      p.email,
      p.telefone,
      p.cpf_cnpj,
      tc.curso_id,
      coalesce(pr.progress, '{}'::jsonb) as progress,
      ca.status as certificado_status,
      ca.certificado_numero,
      io.status as inscricao_status,
      io.asaas_payment_id,
      io.asaas_payment_link_id,
      coalesce(io.valor, 0) as valor_pago
    from turma_curso tc
    join public.matriculas m on m.turma_id = tc.turma_id
    join public.parceiros p on p.id = m.aluno_id
    left join public.ead_aluno_progresso pr on pr.aluno_id = p.id and pr.curso_id = tc.curso_id
    left join public.certificados_academicos ca on ca.matricula_id = m.id
    left join lateral (
      select *
      from public.inscricoes_online i
      where i.matricula_id = m.id
      order by i.updated_at desc nulls last, i.created_at desc nulls last
      limit 1
    ) io on true
  ),
  totals as (
    select
      b.*,
      coalesce(jsonb_array_length(b.progress->'completedContentIds'), 0) as aulas_concluidas,
      coalesce(jsonb_array_length(b.progress->'completedActivityIds'), 0) as atividades_concluidas,
      coalesce((b.progress->>'quizScore')::int, null) as nota_prova,
      (select jsonb_array_length(coalesce(tc.ead_config->'conteudos', '[]'::jsonb)) from turma_curso tc) as total_aulas,
      (select jsonb_array_length(coalesce(tc.ead_config->'atividades', '[]'::jsonb)) from turma_curso tc) as total_atividades,
      upper(replace(unaccent(b.matricula_status), ' ', '')) as matricula_status_normalized,
      upper(coalesce(replace(unaccent(b.inscricao_status), ' ', ''), '')) as inscricao_status_normalized
    from base b
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'matriculaId', matricula_id,
      'alunoId', aluno_id,
      'nome', nome,
      'email', email,
      'telefone', telefone,
      'cpfCnpj', cpf_cnpj,
      'status', matricula_status,
      'statusNormalizado', matricula_status_normalized,
      'inscricaoStatus', inscricao_status,
      'inscricaoStatusNormalizado', inscricao_status_normalized,
      'acessoLiberado', matricula_status_normalized in ('ATIVO', 'CONCLUIDO'),
      'pendentePagamento', matricula_status_normalized in ('PENDENTE', 'AGUARDANDOPAGAMENTO', 'AGUARDANDOCONFIRMACAO')
      or inscricao_status_normalized in ('PENDENTE', 'AGUARDANDOPAGAMENTO', 'AGUARDANDOCONFIRMACAO'),
      'dataMatricula', data_matricula,
      'aulasConcluidas', aulas_concluidas,
      'totalAulas', total_aulas,
      'atividadesConcluidas', atividades_concluidas,
      'totalAtividades', total_atividades,
      'progressoPercentual', case
        when (total_aulas + total_atividades) > 0
          then least(100, round(((aulas_concluidas + atividades_concluidas)::numeric / (total_aulas + total_atividades)::numeric) * 100)::int)
        else 0
      end,
      'notaProva', nota_prova,
      'certificadoStatus', certificado_status,
      'certificadoNumero', certificado_numero,
      'asaasPaymentId', asaas_payment_id,
      'asaasPaymentLinkId', asaas_payment_link_id,
      'valorPago', valor_pago
    )
    order by data_matricula desc, nome
  ), '[]'::jsonb)
  from totals;
$$;
