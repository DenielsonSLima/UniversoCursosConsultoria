-- Historical averages are documentary evidence, not inputs to the regular sum.
create function internal_academic.resolve_diario_historical_result(
  p_historico internal_academic.diario_resultados_importados
)
returns table (
  turma_id uuid, disciplina_id uuid, aluno_id uuid,
  nota_p numeric, nota_ti numeric, nota_tg numeric, nota_s numeric,
  nota_cq numeric, nota_o numeric, nota_rec numeric,
  total_aulas bigint, total_faltas bigint, frequencia_percent numeric,
  media_parcial numeric, media_final numeric, resultado_final text
)
language sql immutable set search_path = '' as $$
  select p_historico.turma_id, p_historico.disciplina_id, p_historico.aluno_id,
    null::numeric, null::numeric, null::numeric,
    null::numeric, null::numeric, null::numeric,
    case when p_historico.notas_estado = 'CONFERIDO' then p_historico.nota_rec end,
    p_historico.aulas_registradas::bigint,
    case when p_historico.frequencia_estado = 'CONFERIDO'
      then p_historico.total_faltas::bigint end,
    case when p_historico.frequencia_estado = 'CONFERIDO'
      then p_historico.frequencia_percent end,
    case when p_historico.notas_estado = 'CONFERIDO' then p_historico.media_parcial end,
    case when p_historico.notas_estado = 'CONFERIDO' then p_historico.media_final end,
    case
      when p_historico.notas_estado = 'CONFERIDO'
        and p_historico.frequencia_estado = 'CONFERIDO'
        and p_historico.media_final is not null
        and p_historico.frequencia_percent is not null
      then case upper(btrim(p_historico.resultado_documental))
        when 'APROVADO' then 'APROVADO'
        when 'APROVADA' then 'APROVADO'
        when 'APROVADO(A)' then 'APROVADO'
        when 'APROVADO (A)' then 'APROVADO'
        when 'REPROVADO' then 'REPROVADO'
        when 'REPROVADA' then 'REPROVADO'
        when 'REPROVADO(A)' then 'REPROVADO'
        when 'REPROVADO (A)' then 'REPROVADO'
        when 'REPROVADO_FREQUENCIA' then 'REPROVADO_FREQUENCIA'
        when 'REPROVADO_POR_FALTA' then 'REPROVADO_FREQUENCIA'
        when 'EM_RECUPERACAO' then 'EM_RECUPERACAO'
        else 'EM_CONFERENCIA'
      end
      else 'EM_CONFERENCIA'
    end;
$$;
revoke all on function internal_academic.resolve_diario_historical_result(
  internal_academic.diario_resultados_importados
) from public, anon, authenticated, service_role;

-- Match the diary RPC's read scope. Historical membership never grants writes.
create function internal_academic.diario_historical_result_readable(
  p_turma_id uuid, p_disciplina_id uuid, p_aluno_id uuid
)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.role()), '') = 'service_role'
    or coalesce(public.gestor_can_read_diario_results(p_turma_id), false)
    or coalesce(public.is_professor_assigned_disciplina(p_turma_id, p_disciplina_id), false)
    or (
      p_aluno_id = public.current_aluno_id()
      and exists (
        select 1 from public.matriculas m
        join public.turmas t on t.id = m.turma_id
        join public.cursos c on c.id = t.curso_id
        where m.turma_id = p_turma_id and m.aluno_id = p_aluno_id
          and upper(coalesce(c.modalidade, '')) in ('TECNICO', 'TÉCNICO')
          and (
            (upper(coalesce(t.status, '')) = 'EM_ANDAMENTO'
              and upper(coalesce(m.status, '')) = 'ATIVO')
            or (upper(coalesce(t.status, '')) = 'FINALIZADA'
              and upper(coalesce(m.status, '')) in ('CONCLUIDO','REPROVADO','EM_DEPENDENCIA'))
          )
      )
    );
$$;
revoke all on function internal_academic.diario_historical_result_readable(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;

-- The snapshot view is SECURITY INVOKER. This filtered projection exposes no
-- source documents and gives its callers no access to the private ledger.
create function internal_academic.get_diario_historical_snapshot_rows()
returns table (
  turma_id uuid, disciplina_id uuid, aluno_id uuid,
  nota_p numeric, nota_ti numeric, nota_tg numeric, nota_s numeric,
  nota_cq numeric, nota_o numeric, nota_rec numeric,
  total_aulas bigint, total_faltas bigint, frequencia_percent numeric,
  media_parcial numeric, media_final numeric, resultado_final text
)
language sql stable security definer set search_path = '' as $$
  select resultado.*
  from internal_academic.diario_resultados_importados h
  join public.matriculas m on m.id = h.matricula_id
    and m.turma_id = h.turma_id and m.aluno_id = h.aluno_id
  cross join lateral internal_academic.resolve_diario_historical_result(h) resultado
  where h.ativo and internal_academic.diario_historical_result_readable(
    h.turma_id, h.disciplina_id, h.aluno_id
  );
$$;
revoke all on function internal_academic.get_diario_historical_snapshot_rows() from public;
grant execute on function internal_academic.get_diario_historical_snapshot_rows()
  to anon, authenticated, service_role;
