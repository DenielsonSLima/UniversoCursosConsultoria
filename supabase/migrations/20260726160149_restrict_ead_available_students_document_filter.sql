begin;

-- Restringe a busca documental a termos formados somente por dígitos e
-- pontuação de CPF/CNPJ. Nomes e e-mails alfanuméricos não podem ampliar
-- os resultados por coincidência parcial com números do documento.
create or replace function public.ead_buscar_alunos_disponiveis(
  p_turma_id uuid,
  p_search text default ''::text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with pesquisa as (
    select
      btrim(coalesce(p_search, '')) as termo,
      regexp_replace(btrim(coalesce(p_search, '')), '\D', '', 'g') as digitos,
      btrim(coalesce(p_search, '')) ~ '^[0-9./-]+$' as busca_documento
  ),
  turma_curso as (
    select t.id as turma_id, t.curso_id
    from public.turmas t
    join public.cursos c on c.id = t.curso_id
    where t.id = p_turma_id
      and c.modalidade = 'EAD'
      and (
        coalesce(auth.role(), '') = 'service_role'
        or (
          public.gestor_has_module('gestao')
          and public.can_write_turma(t.id)
        )
      )
  ),
  candidatos as (
    select
      p.id,
      p.nome,
      p.email,
      p.cpf_cnpj,
      p.telefone
    from public.parceiros p
    cross join turma_curso tc
    cross join pesquisa q
    where p.tipo = 'Aluno'
      and p.status = 'ATIVO'
      and not exists (
        select 1
        from public.matriculas m
        join public.turmas mt on mt.id = m.turma_id
        where m.aluno_id = p.id
          and mt.curso_id = tc.curso_id
          and coalesce(m.status, '') not in ('CANCELADO', 'DESISTENTE', 'TRANSFERIDO')
          and (
            m.status in (
              'PENDENTE', 'AGUARDANDO_PAGAMENTO', 'AGUARDANDO_CONFIRMACAO',
              'ATIVO', 'TRANCADO', 'CONCLUIDO'
            )
            or exists (
              select 1
              from public.contas_receber cr
              where cr.matricula_id = m.id
                and cr.tipo_lancamento = 'MATRICULA'
                and (
                  cr.status = 'PAGO'
                  or cr.asaas_status in ('RECEIVED', 'CONFIRMED')
                )
            )
            or exists (
              select 1
              from public.inscricoes_online io
              where io.matricula_id = m.id
                and io.status = 'PAGO'
            )
          )
      )
      and (
        q.termo = ''
        or p.nome ilike '%' || q.termo || '%'
        or coalesce(p.email, '') ilike '%' || q.termo || '%'
        or (
          q.busca_documento
          and q.digitos <> ''
          and regexp_replace(coalesce(p.cpf_cnpj, ''), '\D', '', 'g')
            like '%' || q.digitos || '%'
        )
      )
    order by p.nome
    limit 20
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'nome', nome,
        'email', email,
        'cpfCnpj', cpf_cnpj,
        'telefone', telefone
      )
      order by nome
    ),
    '[]'::jsonb
  )
  from candidatos;
$$;

comment on function public.ead_buscar_alunos_disponiveis(uuid, text) is
  'Lista até 20 alunos ativos disponíveis para matrícula EAD, filtrados por nome, e-mail ou CPF/CNPJ e limitados ao escopo de escrita do gestor.';

commit;
