alter table public.matriculas
  drop constraint if exists matriculas_status_check;

alter table public.matriculas
  add constraint matriculas_status_check
  check (status in ('PENDENTE', 'ATIVO', 'TRANCADO', 'CANCELADO', 'CONCLUIDO', 'DESISTENTE', 'TRANSFERIDO'));

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
    'alunosPendentes', count(*) filter (where m.status = 'PENDENTE'),
    'alunosLiberados', count(*) filter (where m.status = 'ATIVO'),
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
      (select jsonb_array_length(coalesce(tc.ead_config->'atividades', '[]'::jsonb)) from turma_curso tc) as total_atividades
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
      'inscricaoStatus', inscricao_status,
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

create or replace function public.ead_buscar_alunos_disponiveis(
  p_turma_id uuid,
  p_search text default ''
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'nome', p.nome,
      'email', p.email,
      'cpfCnpj', p.cpf_cnpj,
      'telefone', p.telefone
    )
    order by p.nome
  ), '[]'::jsonb)
  from public.parceiros p
  where p.tipo = 'Aluno'
    and p.status = 'ATIVO'
    and not exists (
      select 1 from public.matriculas m
      where m.aluno_id = p.id
        and m.turma_id = p_turma_id
    )
    and (
      coalesce(p_search, '') = ''
      or p.nome ilike '%' || p_search || '%'
      or p.email ilike '%' || p_search || '%'
      or regexp_replace(coalesce(p.cpf_cnpj, ''), '\D', '', 'g') like '%' || regexp_replace(coalesce(p_search, ''), '\D', '', 'g') || '%'
    )
  limit 20;
$$;

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
  select t.id, t.curso_id, c.modalidade
  into v_turma
  from public.turmas t
  join public.cursos c on c.id = t.curso_id
  where t.id = p_turma_id;

  if not found or v_turma.modalidade <> 'EAD' then
    raise exception 'Turma EAD nao encontrada';
  end if;

  if not exists (select 1 from public.parceiros where id = p_aluno_id and tipo = 'Aluno') then
    raise exception 'Aluno nao encontrado';
  end if;

  insert into public.matriculas (aluno_id, turma_id, status)
  values (p_aluno_id, p_turma_id, 'ATIVO')
  on conflict (aluno_id, turma_id) do update
    set status = 'ATIVO'
  returning * into v_matricula;

  perform public.ead_get_aluno_progress(p_aluno_id, v_turma.curso_id);

  return jsonb_build_object(
    'success', true,
    'matriculaId', v_matricula.id,
    'status', v_matricula.status
  );
end;
$$;

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
  update public.matriculas
  set status = 'ATIVO'
  where id = p_matricula_id
  returning * into v_matricula;

  if not found then
    raise exception 'Matricula nao encontrada';
  end if;

  select t.curso_id
  into v_curso_id
  from public.turmas t
  join public.cursos c on c.id = t.curso_id
  where t.id = v_matricula.turma_id
    and c.modalidade = 'EAD';

  if v_curso_id is null then
    raise exception 'Matricula nao pertence a turma EAD';
  end if;

  update public.inscricoes_online
  set status = 'PAGO',
      erro = null,
      updated_at = now()
  where matricula_id = p_matricula_id
    and status = 'AGUARDANDO_PAGAMENTO';

  perform public.ead_get_aluno_progress(v_matricula.aluno_id, v_curso_id);

  return jsonb_build_object(
    'success', true,
    'matriculaId', v_matricula.id,
    'status', 'ATIVO'
  );
end;
$$;

create or replace function public.ead_activate_matricula_on_paid_inscricao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'PAGO' and new.matricula_id is not null then
    update public.matriculas
    set status = 'ATIVO'
    where id = new.matricula_id
      and status = 'PENDENTE';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ead_activate_matricula_on_paid_inscricao on public.inscricoes_online;
create trigger trg_ead_activate_matricula_on_paid_inscricao
after insert or update of status on public.inscricoes_online
for each row
execute function public.ead_activate_matricula_on_paid_inscricao();
