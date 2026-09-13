-- Preserve the existing regular computation and approved dependency precedence.
create or replace function internal_academic.get_enrollment_results(p_matricula_id uuid)
returns table (
  disciplina_id uuid, media_final numeric,
  frequencia_percent numeric, resultado_final text
)
language sql stable security definer set search_path = '' as $$
  with regular as (
    select resultado.*
    from internal_academic.p1_get_enrollment_results_20260730(p_matricula_id) resultado
  ), historico as (
    select resultado.disciplina_id, resultado.media_final,
      resultado.frequencia_percent, resultado.resultado_final
    from internal_academic.diario_resultados_importados h
    join public.matriculas m on m.id = h.matricula_id
      and m.turma_id = h.turma_id and m.aluno_id = h.aluno_id
    cross join lateral internal_academic.resolve_diario_historical_result(h) resultado
    where h.ativo and h.matricula_id = p_matricula_id
  ), origem as (
    select r.* from regular r
    where not exists (select 1 from historico h where h.disciplina_id = r.disciplina_id)
    union all
    select h.* from historico h
  ), dependencia_aprovada as (
    select componente.disciplina_id,
      tentativa.media_final_destino, tentativa.frequencia_destino
    from public.matricula_componentes componente
    join public.matricula_disciplina_tentativas tentativa
      on tentativa.id = componente.tentativa_aprovada_id
    where componente.matricula_id = p_matricula_id
      and componente.status = 'APROVADO' and tentativa.status = 'APROVADA'
      and tentativa.resultado_destino in ('APROVADO','APROVEITADO')
  )
  select origem.disciplina_id,
    coalesce(dependencia.media_final_destino, origem.media_final),
    coalesce(dependencia.frequencia_destino, origem.frequencia_percent),
    case when dependencia.disciplina_id is not null then 'APROVADO'
      else origem.resultado_final end
  from origem
  left join dependencia_aprovada dependencia on dependencia.disciplina_id = origem.disciplina_id;
$$;
revoke all on function internal_academic.get_enrollment_results(uuid)
  from public, anon, authenticated, service_role;
