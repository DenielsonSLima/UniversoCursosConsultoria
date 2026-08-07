create or replace function internal_academic.p1_get_turma_alunos_academico_20260719(
  p_turma_id uuid
)
returns table(
  matricula_id uuid,
  aluno_id uuid,
  nome text,
  cpf text,
  data_nascimento date,
  data_matricula timestamp with time zone,
  status text,
  frequencia_percent numeric,
  tem_lancamentos_academicos boolean,
  pode_remover boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not exists (
    select 1
    from public.turmas t
    where t.id = p_turma_id
      and (
        coalesce((select auth.role()), '') = 'service_role'
        or (
          t.polo_id is not null
          and (select public.is_gestor_for_polo(t.polo_id))
        )
      )
  ) then
    raise exception 'Acesso ao cadastro acadêmico não autorizado.'
      using errcode = '42501';
  end if;

  return query
  select
    m.id,
    p.id,
    p.nome,
    p.cpf_cnpj,
    p.data_nascimento,
    m.data_matricula,
    m.status,
    frequency.frequencia_percent,
    public.matricula_possui_lancamentos_academicos(m.id),
    (
      (t.data_inicio is null or t.data_inicio > current_date)
      and not public.matricula_possui_lancamentos_academicos(m.id)
    )
  from public.matriculas m
  join public.turmas t on t.id = m.turma_id
  join public.parceiros p on p.id = m.aluno_id
  left join lateral (
    select round(
      (
        sum(
          case when f.status = 'P'
            then case when a.carga_horaria > 0 then a.carga_horaria else 1 end
            else 0
          end
        )
        / nullif(
          sum(case when a.carga_horaria > 0 then a.carga_horaria else 1 end),
          0
        )
      ) * 100,
      1
    ) as frequencia_percent
    from public.diario_frequencia f
    join public.aulas_turma a
      on a.id = f.aula_id
     and a.turma_id = f.turma_id
     and a.disciplina_id = f.disciplina_id
    where f.turma_id = m.turma_id
      and f.aluno_id = m.aluno_id
      and f.status in ('P', 'F')
  ) frequency on true
  where m.turma_id = p_turma_id
  order by p.nome;
end;
$function$;
