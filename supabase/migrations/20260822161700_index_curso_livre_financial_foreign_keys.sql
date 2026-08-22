begin;

create index if not exists nontechnical_condition_attempts_actor_idx
  on internal_academic.nontechnical_condition_attempts (actor_id);

create index if not exists nontechnical_condition_attempts_aluno_idx
  on internal_academic.nontechnical_condition_attempts (aluno_id);

create index if not exists nontechnical_condition_codes_updated_by_idx
  on internal_academic.nontechnical_condition_codes (updated_by);

create index if not exists matriculas_plano_unico_config_aluno_idx
  on public.matriculas_plano_financeiro_unico_config (aluno_id);

create index if not exists matriculas_plano_unico_config_autorizado_por_idx
  on public.matriculas_plano_financeiro_unico_config (autorizado_por);

create index if not exists matriculas_plano_unico_config_created_by_idx
  on public.matriculas_plano_financeiro_unico_config (created_by);

create index if not exists matriculas_plano_unico_config_generated_by_idx
  on public.matriculas_plano_financeiro_unico_config (generated_by);

create index if not exists matriculas_plano_unico_config_matricula_turma_aluno_idx
  on public.matriculas_plano_financeiro_unico_config (
    matricula_id,
    turma_id,
    aluno_id
  );

commit;
