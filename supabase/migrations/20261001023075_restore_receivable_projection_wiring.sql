-- As duas RPCs publicadas já usam a apresentação canônica. Reconstruções a
-- partir das migrations antigas precisam do mesmo vínculo, sem mudar RBAC,
-- filtros, composição, ordenação ou auditoria da baixa.
begin;
do $wiring$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.get_receivables_modality_groups_page_v3_secure(text,uuid,uuid,text,date,date,text,text,integer,integer)'::regprocedure);
  if md5(v_definition) <> 'add55865ec7c3f85f346bc1928e1b478' then
    v_definition := replace(v_definition,
      $old$SELECT to_jsonb(f) - 'group_key' - 'group_label' AS first_row
      FROM filtered f$old$,
      $new$SELECT (to_jsonb(f) - 'group_key' - 'group_label')
        || internal_academic.receivable_cycle_presentation(target) AS first_row
      FROM filtered f
      JOIN public.contas_receber target ON target.id=f.id$new$);
    if md5(v_definition) <> 'add55865ec7c3f85f346bc1928e1b478' then
      raise exception 'Drift na RPC de grupos; projeção exige rebase.';
    end if;
    execute v_definition;
  end if;

  v_definition := pg_get_functiondef(
    'public.get_receivables_modality_page_v4_secure(text,uuid,uuid,text,date,date,text,text,text,integer,integer)'::regprocedure);
  if md5(v_definition) <> '0cb8672232fb52203f2503a351baa6c5' then
    v_definition := replace(v_definition,
      'entry.value || pg_catalog.jsonb_build_object(',
      'entry.value || internal_academic.receivable_cycle_presentation(target) || pg_catalog.jsonb_build_object(');
    v_definition := replace(v_definition,
      $old$      'destino_cobranca', case when target.regra_financeira_tecnica_snapshot->>'destinoCobranca' in ('LOCAL','BANESE')
        then target.regra_financeira_tecnica_snapshot->>'destinoCobranca' end,
$old$, '');
    if md5(v_definition) <> '0cb8672232fb52203f2503a351baa6c5' then
      raise exception 'Drift na RPC de página; projeção exige rebase.';
    end if;
    execute v_definition;
  end if;
end;
$wiring$;
notify pgrst, 'reload schema';
commit;
