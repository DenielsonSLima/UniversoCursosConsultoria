CREATE OR REPLACE FUNCTION internal_academic.technical_manual_cycle_state_before_individual_admission(p_matricula_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_state jsonb; v_block text; v_message text;
begin
  v_state:=internal_academic.technical_manual_cycle_state_before_proesc_scopes(p_matricula_id);
  if v_state#>>'{politica,fingerprint}' is not null then
    v_state:=jsonb_set(v_state,'{politica,fingerprint}',to_jsonb(
      internal_proesc.individual_cycle_policy_fingerprint(p_matricula_id,
        v_state#>>'{politica,fingerprint}')),false);
  end if;
  if exists(select 1 from public.matriculas m
    join internal_proesc.class_scopes s on s.turma_id=m.turma_id
    left join internal_proesc.enrollment_sources a on a.matricula_id=m.id
    where m.id=p_matricula_id and s.phase='CONFIRMED'
      and ((s.batch_id is not null and s.financial_mode='INDIVIDUAL_REVIEW'
        and a.source_verified and a.source_status='CURSANDO')
        or (s.batch_id is null and s.financial_mode='CICLO1_PROESC'))
      and (case when s.batch_id is null then m.status in ('ATIVO','PENDENTE') else m.status='ATIVO' end)
      and not exists(select 1 from internal_proesc.enrollment_cycle_evidence e
        where e.matricula_id=m.id and e.has_external_cycle2 is true)
      and not exists(select 1 from internal_academic.technical_manual_cycle_runs r where r.matricula_id=m.id)
      and not exists(select 1 from internal_academic.technical_external_cycle_coverage e where e.matricula_id=m.id)) then
    v_state:=v_state||jsonb_build_object('conferenciaProesc',jsonb_build_object('necessaria',true));
  end if;
  v_block:=internal_proesc.enrollment_financial_block(p_matricula_id);
  if v_block is null then return v_state; end if;
  v_message:=case v_block
    when 'PROESC_CONTRATO_EXTERNO' then 'O segundo ciclo já consta no Proesc. Novas cobranças estão protegidas.'
    when 'PROESC_SITUACAO_ACADEMICA_EM_CONFERENCIA' then 'A situação acadêmica não permite gerar um novo ciclo.'
    else 'A consulta automática ainda não confirmou que esta matrícula possui somente o primeiro ciclo.' end;
  return v_state||jsonb_build_object('podeGerar',false,
    'estado',case when v_state->>'estado'='ELEGIVEL' then 'BLOQUEADO' else v_state->>'estado' end,
    'bloqueio',jsonb_build_object('codigo',v_block,'mensagem',v_message));
end;
$function$
