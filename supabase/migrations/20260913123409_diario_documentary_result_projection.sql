-- Historical averages are documentary evidence, not inputs to the regular sum.
create function internal_academic.resolve_diario_historical_result_before_materialization(
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
revoke all on function internal_academic.resolve_diario_historical_result_before_materialization(
  internal_academic.diario_resultados_importados
) from public, anon, authenticated, service_role;

-- Documentary averages and outcomes are transcribed, never recalculated from
-- the conventional instrument slots. This projection changes no enrollment.
create or replace function internal_academic.resolve_diario_historical_result(
  p_historico internal_academic.diario_resultados_importados
) returns table (
  turma_id uuid, disciplina_id uuid, aluno_id uuid,
  nota_p numeric, nota_ti numeric, nota_tg numeric, nota_s numeric,
  nota_cq numeric, nota_o numeric, nota_rec numeric,
  total_aulas bigint, total_faltas bigint, frequencia_percent numeric,
  media_parcial numeric, media_final numeric, resultado_final text
) language sql stable security definer set search_path='' as $$
  with materializado as (
    select n.* from public.diario_notas n
    join internal_academic.diario_materializacoes m on m.importacao_id=p_historico.importacao_id
    where n.origem_resultado_historico_id=p_historico.id
      and (n.turma_id,n.disciplina_id,n.aluno_id)=
        (p_historico.turma_id,p_historico.disciplina_id,p_historico.aluno_id)
  ), documental as (
    select n.*,
      internal_academic.diario_documentary_number(n.resultados_documentais->'absences',10000) as faltas,
      internal_academic.diario_documentary_number(n.resultados_documentais->'frequency',100) as frequencia,
      upper(btrim(n.resultados_documentais#>>'{outcome,value}')) as situacao
    from materializado n
  )
  select n.turma_id,n.disciplina_id,n.aluno_id,
    n.nota_p,n.nota_ti,n.nota_tg,n.nota_s,n.nota_cq,n.nota_o,n.nota_rec,
    (select count(*) from internal_academic.diario_aulas_materializadas a
      where a.importacao_id=p_historico.importacao_id),
    case when n.faltas=trunc(n.faltas) then n.faltas::bigint end,
    n.frequencia,n.media_parcial_documental,n.media_final_documental,
    case n.situacao
      when 'APROVADO' then 'APROVADO' when 'APROVADA' then 'APROVADO'
      when 'APROVADO(A)' then 'APROVADO' when 'APROVADO (A)' then 'APROVADO'
      when 'REPROVADO' then 'REPROVADO' when 'REPROVADA' then 'REPROVADO'
      when 'REPROVADO(A)' then 'REPROVADO' when 'REPROVADO (A)' then 'REPROVADO'
      when 'REPROVADO_FREQUENCIA' then 'REPROVADO_FREQUENCIA'
      when 'REPROVADO_POR_FALTA' then 'REPROVADO_FREQUENCIA'
      when 'EM_RECUPERACAO' then 'EM_RECUPERACAO'
      else 'EM_CONFERENCIA' end
  from documental n
  union all
  select r.* from internal_academic.resolve_diario_historical_result_before_materialization(p_historico) r
    where not exists(select 1 from materializado);
$$;
revoke all on function internal_academic.resolve_diario_historical_result(
  internal_academic.diario_resultados_importados
) from public,anon,authenticated,service_role;
