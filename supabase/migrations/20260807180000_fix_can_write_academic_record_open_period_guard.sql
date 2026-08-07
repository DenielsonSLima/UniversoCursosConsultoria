-- Ajuste de permissões para evitar falso negativo em aulas técnicas quando o vínculo
-- da disciplina não traz explicitamente o período letivo, mas a turma ainda possui
-- um período técnico aberto para o módulo correspondente.
create or replace function public.can_write_academic_record_open(
  p_turma_id uuid,
  p_disciplina_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select auth.role()), '') = 'service_role' or exists (
    select 1
    from public.turmas t
    join public.cursos c on c.id = t.curso_id
    join public.turmas_disciplinas td
      on td.turma_id = t.id
     and td.disciplina_id = p_disciplina_id
    join public.disciplinas d on d.id = td.disciplina_id
    left join public.periodos_letivos pl on pl.id = td.periodo_letivo_id
    where t.id = p_turma_id
      and (
        (
          upper(coalesce(c.modalidade, '')) <> 'TECNICO'
          and upper(coalesce(t.status, '')) <> 'FINALIZADA'
        )
        or (
          upper(coalesce(c.modalidade, '')) = 'TECNICO'
          and upper(coalesce(t.status, '')) = 'EM_ANDAMENTO'
          and (
            (
              pl.id is not null
              and upper(coalesce(pl.status, '')) in ('ABERTO', 'EM_FECHAMENTO')
            )
            or exists (
              select 1
              from public.periodos_letivos pl_alt
              where pl_alt.turma_id = t.id
                and pl_alt.modulo_id = d.modulo_id
                and upper(coalesce(pl_alt.status, '')) in ('ABERTO', 'EM_FECHAMENTO')
            )
          )
        )
      )
      and (
        (
          public.can_operate_turma_academics(t.id)
          and td.bloqueio_diario <> 'TOTAL'
        )
        or (
          td.professor_id = public.current_professor_id()
          and td.bloqueio_diario = 'ABERTO'
        )
      )
  );
$function$;
