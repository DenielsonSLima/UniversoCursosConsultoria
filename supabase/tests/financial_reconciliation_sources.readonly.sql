-- Read-only assertions against the deployed RPC; no fixtures, writes or HTTP.
-- Resolve a real Auth actor through the configured operator's email relationship.
do $reconciliation_sources$
declare
  v_saved_claims text:=current_setting('request.jwt.claims',true);
  v_saved_role text:=current_setting('request.jwt.claim.role',true);
  v_saved_sub text:=current_setting('request.jwt.claim.sub',true);
  v_actor uuid;
  v_email text;
  v_polos uuid[];
  v_page jsonb;
  v_next jsonb;
  v_old jsonb;
  v_item jsonb;
  v_expected bigint;
  v_matches integer:=0;
  v_field text;
  v_started timestamptz:=clock_timestamp();
  v_receivable public.contas_receber;
  v_source text;
begin
  select a.id,a.email into strict v_actor,v_email
  from internal_proesc.connection c
  join public.usuarios_sistema u on u.id=c.updated_by
  join auth.users a on lower(btrim(a.email))=lower(btrim(u.email))
  where lower(u.status)='ativo' limit 1;
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.list_financial_reconciliation_secure();
    raise exception 'Session without a real identity was accepted';
  exception when sqlstate '42501' then null; end;
  assert not has_function_privilege('anon',
    'public.list_financial_reconciliation_secure(uuid,uuid,date,date,text,text,text,integer,integer,text,text)','execute'),
    'Anonymous execution is exposed';
  assert not has_function_privilege('authenticated',
    'internal_proesc.reconciliation_item(uuid,text,text)','execute'),'Private projection is exposed';
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_actor,'email',v_email)::text,true);
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  v_polos:=public.gestor_allowed_polo_ids();
  assert cardinality(v_polos)>0,'Test actor has no authorized scope';
  begin
    perform public.list_financial_reconciliation_secure(p_source_system=>'UNKNOWN');
    raise exception 'Invalid source was accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.list_financial_reconciliation_secure(p_polo_id=>'00000000-0000-0000-0000-000000000000');
    raise exception 'An unauthorized polo was accepted';
  exception when sqlstate '42501' then null; end;

  v_page:=public.list_financial_reconciliation_secure(p_status=>'PAGO',p_source_system=>'PROESC',p_page_size=>20);
  v_next:=public.list_financial_reconciliation_secure(p_status=>'PAGO',p_source_system=>'PROESC',p_page=>2,p_page_size=>20);
  select count(*) into v_expected from public.contas_receber c
  join internal_proesc.obligation_links l on l.receivable_id=c.id
  join internal_proesc.class_scopes s on s.turma_id=l.turma_id and s.source_unit_id=l.source_unit_id
    and s.source_class_id=l.source_class_id and s.phase='CONFIRMED'
  where c.status='PAGO' and c.polo_id=any(v_polos) and c.origem_pagamento='SISTEMA_ANTERIOR'
    and l.matricula_id=c.matricula_id and l.turma_id=c.turma_id and s.polo_id=c.polo_id
    and not exists(select 1 from public.emprestimos_financeiros e where e.conta_receber_id=c.id);
  assert (v_page->>'total_count')::bigint=v_expected,'Proesc paid count differs from canonical links';
  assert (v_page->'counts'->>'historico_migrado')::bigint=0,'Proesc duplicated in migrated-history card';
  assert (v_page->'counts'->>'proesc')::bigint=v_expected,'Proesc card does not match source';
  assert not exists(select 1 from jsonb_array_elements(v_page->'items') a
    join jsonb_array_elements(v_next->'items') b on a->>'id'=b->>'id'),'Pages overlap';
  for v_item in select value from jsonb_array_elements(v_page->'items') loop
    assert v_item->>'source_system'='PROESC' and v_item->>'origem'='PROESC','Source filter leaked another source';
    assert v_item->>'status'='PAGO' and v_item->>'status_label'='Pago','Verified payment lost paid label';
    assert v_item->>'nosso_numero' is null and v_item->>'gateway_provider' is null,'Proesc acquired bank identity';
    select * into strict v_receivable from public.contas_receber where id=(v_item->>'id')::uuid;
    assert (v_item->>'valor_nominal')::numeric=v_receivable.valor,'Principal changed';
    assert (v_item->>'valor_pago')::numeric=v_receivable.valor_pago,'Received amount changed';
    assert (v_item->>'data_pagamento')::date=v_receivable.data_pagamento,'Payment date changed';
  end loop;

  v_page:=public.list_financial_reconciliation_secure(p_status=>'PENDENTE',p_source_system=>'PROESC',p_page_size=>20);
  assert v_page->'summary'->'valor_pendentes'='null'::jsonb,'Unknown balance was presented as exact debt';
  for v_item in select value from jsonb_array_elements(v_page->'items') loop
    assert v_item->>'source_system'='PROESC' and v_item->>'status'<>'PAGO','Pending source leaked paid rows';
    if v_item->>'source_verification'='REVIEW' then
      assert v_item->>'status_label'='Pendente de conferência','Review mislabeled as confirmed debt';
    end if;
    assert v_item->'juros_aplicados'='null'::jsonb and v_item->'desconto_aplicado'='null'::jsonb,
      'Pending source manufactured payment components';
  end loop;
  v_page:=public.list_financial_reconciliation_secure(p_status=>'VENCIDO',p_source_system=>'PROESC');
  assert not exists(select 1 from jsonb_array_elements(v_page->'items') i
    where i->'proesc_evidence'->>'verification'<>'VERIFIED' or i->'proesc_evidence'->>'sourceStatus'<>'OPEN'),
    'Unverified source was presented as overdue';

  v_page:=public.list_financial_reconciliation_secure(p_status=>'PAGO',p_source_system=>'BANESE',p_page_size=>20);
  assert not exists(select 1 from jsonb_array_elements(v_page->'items') i where i->>'source_system'<>'BANESE'),
    'Banese source filter leaked another source';
  v_old:=public.list_financial_receipts_v2_secure(p_page_size=>20);
  v_next:=public.list_financial_reconciliation_secure(p_status=>'PAGO',p_page_size=>20);
  assert v_old->>'total_count'=v_next->>'total_count','Unified paid list lost existing financial receipts';
  for v_item in select value from jsonb_array_elements(v_next->'items') loop
    select value into v_page from jsonb_array_elements(v_old->'items') where value->>'id'=v_item->>'id';
    if v_page is not null then
      v_matches:=v_matches+1;
      foreach v_field in array array['valor_nominal','valor_pago','data_pagamento','data_vencimento',
        'juros_aplicados','multa_aplicada','desconto_aplicado','acrescimo_aplicado',
        'diferenca_nao_discriminada','composicao_status','composicao_proveniencia','conta_recebedora_nome'] loop
        assert v_item->v_field is not distinct from v_page->v_field,'Canonical receipt projection changed: '||v_field;
      end loop;
    end if;
  end loop;
  assert v_matches>0,'No overlapping canonical receipts compared';
  assert not exists(select 1 from public.contas_receber c where c.origem_pagamento='SISTEMA_ANTERIOR'
    and not exists(select 1 from internal_proesc.obligation_links l where l.receivable_id=c.id)
    and internal_proesc.reconciliation_source_system(c)='PROESC'),'Unlinked history was promoted to Proesc';
  v_page:=public.list_financial_reconciliation_secure(p_search=>'nonexistent-reconciliation-6f893765');
  assert (v_page->>'total_count')::integer=0 and (v_page->>'total_pages')::integer=1,'Empty pagination is inconsistent';
  perform set_config('request.jwt.claims',coalesce(v_saved_claims,''),true);
  perform set_config('request.jwt.claim.role',coalesce(v_saved_role,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(v_saved_sub,''),true);
  raise notice 'Reconciliation source, authorization, pagination and canonical payment checks passed in % ms',
    round(extract(epoch from clock_timestamp()-v_started)*1000);
end;
$reconciliation_sources$;
