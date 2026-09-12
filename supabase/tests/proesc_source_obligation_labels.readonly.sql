-- Bounded read-only check after migration 20260912230001. The V4 result is
-- materialized per 25-row page; no full payload is repeated in an expanded sort.
do $proesc_obligation_label_contract$
declare
  v_claims text:=current_setting('request.jwt.claims',true);
  v_role text:=current_setting('request.jwt.claim.role',true);
  v_sub text:=current_setting('request.jwt.claim.sub',true);
  v_scope record; v_payload jsonb; v_row jsonb; v_label text;
  v_checked integer:=0; v_generic integer:=0;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub','',true);
  for v_scope in select turma_id,polo_id from internal_proesc.class_scopes
    where batch_id is not null and phase='CONFIRMED' order by turma_id
  loop
    v_payload:=public.get_receivables_modality_page_v4_secure(
      'TECNICO',v_scope.polo_id,v_scope.turma_id,null,null,null,'all','none',null,1,25);
    for v_row in select value from jsonb_array_elements(v_payload->'rows') loop
      select case i.obligation_kind
        when 'REENROLLMENT_FEE' then 'Rematrícula'
        when 'TUITION' then case when i.source_ordinal is not null
          then 'Parcela '||i.source_ordinal::text else 'Mensalidade' end
        else 'Obrigação Proesc' end into strict v_label
      from internal_proesc.obligation_links l join internal_proesc.obligation_imports i on i.link_id=l.id
      where l.receivable_id=(v_row->>'id')::uuid;
      assert v_row#>>'{proesc_evidence,obligationLabel}'=v_label,'Public label diverges from source classification';
      if v_label='Obrigação Proesc' then v_generic:=v_generic+1; end if;
      v_checked:=v_checked+1;
    end loop;
  end loop;
  assert v_checked>0 and v_generic>0,'No unclassified imported obligation exercised';
  -- Existing T42 classifications and Banese are not rewritten by this projection.
  for v_scope in select id as turma_id,polo_id from public.turmas
    where codigo in ('ENF-T42-INT-MAT','2026.1-RAD-INT-JAP')
  loop
    v_payload:=public.get_receivables_modality_page_v4_secure(
      'TECNICO',v_scope.polo_id,v_scope.turma_id,null,null,null,'all','none',null,1,25);
    for v_row in select value from jsonb_array_elements(v_payload->'rows') loop
      if not exists(select 1 from internal_proesc.obligation_links l
        join internal_proesc.obligation_imports i on i.link_id=l.id
        where l.receivable_id=(v_row->>'id')::uuid) then
        assert v_row#>>'{proesc_evidence,obligationLabel}' is null,'Existing history was reclassified';
      end if;
      if v_row->>'gateway_provider' is not null then
        assert v_row->'proesc_evidence' in ('null'::jsonb) or not v_row ? 'proesc_evidence',
          'Bank-linked receivable obtained Proesc source evidence';
      end if;
    end loop;
  end loop;
  perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
  perform set_config('request.jwt.claim.role',coalesce(v_role,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
  raise notice 'Source obligation labels passed: % bounded rows, % generic; existing T42/Banese preserved',v_checked,v_generic;
end;
$proesc_obligation_label_contract$;
