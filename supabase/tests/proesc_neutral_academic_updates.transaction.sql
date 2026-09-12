-- Append after proesc_academic_bootstrap.transaction.sql in the same outer
-- rollback transaction, with migration 07 installed. Uses synthetic data only.
do $neutral_academic_updates$
declare
  v_class uuid; v_before jsonb; v_after jsonb; v_original text; v_actual text;
  v_blocked boolean; v_assignment text; v_source_before text; v_source_after text;
begin
  assert current_setting('app.proesc_test_rollback',true)='on', 'Outer rollback flag required';
  select t.id,to_jsonb(t) into strict v_class,v_before from public.turmas t
  join internal_proesc.class_scopes scope on scope.turma_id=t.id
  where t.codigo='ENF-T35-REHEARSAL' and scope.batch_id is not null
    and scope.phase='CONFIRMED' and scope.financial_mode='INDIVIDUAL_REVIEW';
  assert not exists(select 1 from internal_proesc.bootstrap_claims
    where record_id=v_class and not completed), 'Test must run after the creation claim';
  select md5(coalesce(string_agg(to_jsonb(c)::text,'' order by c.id),'')) into v_original
  from public.contas_receber c join public.turmas t on t.id=c.turma_id
  where t.codigo in ('ENF-T42-INT-MAT','2026.1-RAD-INT-JAP');
  select md5(coalesce(string_agg(to_jsonb(e)::text,'' order by e.matricula_id),'')) into v_source_before
  from internal_proesc.enrollment_sources e join public.matriculas m on m.id=e.matricula_id
  where m.turma_id=v_class;

  update public.turmas set nome=nome||' - revisão acadêmica' where id=v_class;
  select to_jsonb(t) into strict v_after from public.turmas t where id=v_class;
  assert v_after->>'nome'=(v_before->>'nome')||' - revisão acadêmica', 'Academic name update failed';
  assert (v_after-'nome')=(v_before-'nome'), 'Academic update changed protected class data';

  foreach v_assignment in array array[
    'valor_parcela=1','qtd_parcelas=1','dia_vencimento_padrao=1',
    'gerar_cobrancas_futuras=true','sincronizar_asaas_futuro=true',
    'publicar_no_site=true','permitir_inscricoes_online=true',
    'origem_financeira=''NOVA''','regra_financeira_revisao=1',
    'regra_financeira_fingerprint=repeat(''a'',64)',
    'cronograma_financeiro=''[{"tipo":"PARCELA","valor":1}]''::jsonb',
    'instrucao_boleto_carne=''instrução financeira alterada'''
  ] loop
    v_blocked:=false;
    begin
      execute format('update public.turmas set %s where id=$1',v_assignment) using v_class;
    exception when check_violation or invalid_parameter_value or raise_exception then
      v_blocked:=true;
    end;
    assert v_blocked, 'Financial/publication change bypassed normal validation: '||v_assignment;
  end loop;
  assert (select to_jsonb(t)=v_after from public.turmas t where id=v_class),
    'Rejected mutation left a partial change';
  assert not exists(select 1 from public.matriculas_tecnicas_financeiro_config where turma_id=v_class),
    'Academic update manufactured financial configuration';
  assert not exists(select 1 from internal_academic.technical_manual_cycle_policies where turma_id=v_class),
    'Academic update manufactured a manual cycle policy';
  assert not exists(select 1 from public.contas_receber where turma_id=v_class),
    'Academic update emitted a receivable';
  assert not exists(select 1 from public.matriculas m where m.turma_id=v_class
    and internal_proesc.has_confirmed_first_cycle_only(m.id)), 'Academic update released C2';
  select md5(coalesce(string_agg(to_jsonb(e)::text,'' order by e.matricula_id),'')) into v_source_after
  from internal_proesc.enrollment_sources e join public.matriculas m on m.id=e.matricula_id
  where m.turma_id=v_class;
  assert v_source_after=v_source_before, 'Academic update changed financial/source review';
  select md5(coalesce(string_agg(to_jsonb(c)::text,'' order by c.id),'')) into v_actual
  from public.contas_receber c join public.turmas t on t.id=c.turma_id
  where t.codigo in ('ENF-T42-INT-MAT','2026.1-RAD-INT-JAP');
  assert v_actual=v_original, 'T42/Radiology receivables changed';
  -- Restore the synthetic name to avoid influencing later fixture comparisons.
  update public.turmas set nome=v_before->>'nome' where id=v_class;
  raise notice 'Neutral academic update assertions passed; outer caller must ROLLBACK';
end;
$neutral_academic_updates$;
