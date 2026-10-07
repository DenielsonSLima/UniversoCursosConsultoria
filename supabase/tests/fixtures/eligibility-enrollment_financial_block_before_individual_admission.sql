CREATE OR REPLACE FUNCTION internal_proesc.enrollment_financial_block_before_individual_admission(p_matricula_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when s.phase<>'CONFIRMED' then 'PROESC_IMPORTACAO_EM_CONFERENCIA'
    when s.batch_id is null and (exists(select 1 from internal_academic.technical_manual_cycle_runs r
      where r.matricula_id=m.id) or exists(select 1 from internal_academic.technical_external_cycle_coverage c
      where c.matricula_id=m.id)) then null
    when (s.batch_id is not null and (e.matricula_id is null or not e.source_verified or e.source_status<>'CURSANDO'))
      or (case when s.batch_id is null then m.status not in ('ATIVO','PENDENTE')
        else m.status<>'ATIVO' end) then 'PROESC_SITUACAO_ACADEMICA_EM_CONFERENCIA'
    when exists(select 1 from internal_proesc.enrollment_cycle_evidence c
      where c.matricula_id=m.id and c.scope_id=s.id and c.classification='FULL'
        and c.verification='CONFIRMED') then 'PROESC_CONTRATO_EXTERNO'
    when internal_proesc.has_confirmed_first_cycle_only(m.id) then null
    when exists(select 1 from internal_proesc.enrollment_cycle_evidence c
      where c.matricula_id=m.id and c.evidence_kind='API_SCHEDULE_REVIEW') then 'PROESC_CONFERENCIA_ATUALIZADA_NECESSARIA'
    when e.financial_review_state<>'CONFIRMED' then 'PROESC_FINANCEIRO_EM_CONFERENCIA'
    else 'PROESC_COBERTURA_INDIVIDUAL_EM_CONFERENCIA' end
  from public.matriculas m join internal_proesc.class_scopes s on s.turma_id=m.turma_id
  left join internal_proesc.enrollment_sources e on e.matricula_id=m.id
  where m.id=p_matricula_id and (s.batch_id is not null or s.financial_mode='CICLO1_PROESC');
$function$
;

