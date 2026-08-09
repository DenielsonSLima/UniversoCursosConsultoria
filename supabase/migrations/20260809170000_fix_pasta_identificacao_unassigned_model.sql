-- Hotfix: a Pasta de Identificação não carrega um registro de modelo de
-- Ficha de Matrícula. A expressão que montava documentTemplateName ainda
-- referenciava v_model.nome e falhava antes de o CASE escolher o outro ramo.

begin;

do $fix_pasta_identificacao_unassigned_model$
declare
  v_function_oid oid;
  v_definition text;
  v_declaration_needle text := E'  v_model_id uuid;\n  v_template jsonb;';
  v_declaration_replacement text := E'  v_model_id uuid;\n  v_template_name text;\n  v_template jsonb;';
  v_ficha_needle text := E'    v_template :=\n      coalesce(v_model.template_config, ''{}''::jsonb)';
  v_ficha_replacement text := E'    v_template_name := v_model.nome;\n\n    v_template :=\n      coalesce(v_model.template_config, ''{}''::jsonb)';
  v_pasta_needle text := E'  else\n    select template.conteudo';
  v_pasta_replacement text := E'  else\n    v_template_name := ''Pasta de Identificação Geral'';\n\n    select template.conteudo';
  v_snapshot_needle text := E'    ''documentTemplateName'', case\n      when p_documento = ''ficha_matricula'' then v_model.nome\n      else ''Pasta de Identificação Geral''\n    end,';
  v_snapshot_replacement text := E'    ''documentTemplateName'', v_template_name,';
begin
  select procedure.oid
  into v_function_oid
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'emitir_ficha_validacao_portal'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      = 'p_documento text, p_matricula_id uuid, p_periodo_referencia text, p_emitido_por uuid, p_registrar_reemissao boolean, p_dados_emissao jsonb';

  if v_function_oid is null then
    raise exception 'A função canônica emitir_ficha_validacao_portal não foi encontrada.';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(v_function_oid);

  if position(v_snapshot_replacement in v_definition) > 0 then
    return;
  end if;

  if position(v_declaration_needle in v_definition) = 0
    or position(v_ficha_needle in v_definition) = 0
    or position(v_pasta_needle in v_definition) = 0
    or position(v_snapshot_needle in v_definition) = 0
  then
    raise exception 'A definição da emissão de Pasta/Ficha mudou; hotfix seguro não aplicado.';
  end if;

  v_definition := replace(
    v_definition,
    v_declaration_needle,
    v_declaration_replacement
  );
  v_definition := replace(
    v_definition,
    v_ficha_needle,
    v_ficha_replacement
  );
  v_definition := replace(
    v_definition,
    v_pasta_needle,
    v_pasta_replacement
  );
  v_definition := replace(
    v_definition,
    v_snapshot_needle,
    v_snapshot_replacement
  );

  if position(v_snapshot_needle in v_definition) > 0
    or position(v_declaration_replacement in v_definition) = 0
    or position(v_ficha_replacement in v_definition) = 0
    or position(v_pasta_replacement in v_definition) = 0
    or position(v_snapshot_replacement in v_definition) = 0
    or position('from public.emitir_documento_validacao_portal_base(' in v_definition) = 0
  then
    raise exception 'A definição corrigida da emissão de Pasta/Ficha ficou incompleta.';
  end if;

  execute v_definition;
end;
$fix_pasta_identificacao_unassigned_model$;

revoke all on function public.emitir_ficha_validacao_portal(
  text, uuid, text, uuid, boolean, jsonb
) from public, anon;
grant execute on function public.emitir_ficha_validacao_portal(
  text, uuid, text, uuid, boolean, jsonb
) to authenticated, service_role;

comment on function public.emitir_ficha_validacao_portal(
  text, uuid, text, uuid, boolean, jsonb
) is 'Emite Pasta/Ficha com nome de modelo escalar, snapshot canônico e reimpressão imutável.';

commit;
