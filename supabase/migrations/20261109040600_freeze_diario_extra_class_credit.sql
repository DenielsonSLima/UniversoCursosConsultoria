-- Preserve the live canonical builder, including templates, institutional
-- assets, signers, authorization, idempotency and all frozen hash contracts.
-- Only the versioned academic evidence and its table locks are extended.
begin;

do $patch$
declare
  v_definition text := pg_get_functiondef(
    'public.assinatura_eletronica_solicitar_envelope_diario(uuid,uuid,text,uuid,uuid)'::regprocedure);
  v_old text;
  v_new text;
begin
  if md5(v_definition) <> '204f2ca5dec1422b1ed7ba64428f11bf'
    or to_regprocedure('internal_academic.diario_extra_classe_credito(uuid,uuid)') is null
    or to_regprocedure('internal_academic.diario_snapshot_extra_classe_base(jsonb)') is null
  then raise exception 'Drift ou dependência ausente no congelador canônico do diário.'; end if;

  v_old := E'  v_closure_snapshot jsonb;';
  v_new := v_old || E'\n  v_extra_class_credit jsonb;';
  if length(v_definition) - length(replace(v_definition,v_old,'')) <> length(v_old)
  then raise exception 'Declaração do congelador mudou.'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := E'    public.aulas_turma,\n    public.diario_frequencia,';
  v_new := E'    public.aulas_turma,\n    public.atividades_extra_classe,\n'
    || E'    public.matricula_movimentacoes,\n    public.matricula_aproveitamentos,\n'
    || E'    public.matricula_componentes,\n    public.matricula_disciplina_tentativas,\n'
    || E'    public.diario_matriculas_roster,\n    public.matricula_liberacoes_diario,\n'
    || E'    internal_academic.diario_resultados_importados,\n    public.diario_frequencia,';
  if length(v_definition) - length(replace(v_definition,v_old,'')) <> length(v_old)
  then raise exception 'Locks do congelador mudaram.'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := E'  v_closure_snapshot := jsonb_build_object(';
  v_new := E'  v_extra_class_credit := internal_academic.diario_extra_classe_credito(\n'
    || E'    p_turma_id, p_disciplina_id\n  );\n'
    || E'  SELECT coalesce(sum((session ->> ''cargaHoraria'')::numeric), 0)\n'
    || E'    + coalesce((SELECT sum((activity ->> ''cargaHoraria'')::numeric)\n'
    || E'      FROM jsonb_array_elements(v_extra_class_credit -> ''activities'') activity), 0)\n'
    || E'  INTO v_realizadas\n  FROM jsonb_array_elements(v_aulas) lesson\n'
    || E'  CROSS JOIN LATERAL jsonb_array_elements(lesson -> ''sessoes'') session;\n'
    || v_old;
  if length(v_definition) - length(replace(v_definition,v_old,'')) <> length(v_old)
  then raise exception 'Fechamento do congelador mudou.'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  -- Exactly two anchors: the academic revision digest and the frozen document.
  v_old := E'    ''closure'', v_closure_snapshot';
  v_new := v_old || E',\n    ''extraClassCredit'', v_extra_class_credit';
  if length(v_definition) - length(replace(v_definition,v_old,'')) <> 2 * length(v_old)
  then raise exception 'Hash ou payload acadêmico do congelador mudou.'; end if;
  v_definition := replace(v_definition,v_old,v_new);
  execute v_definition;
end;
$patch$;

commit;
