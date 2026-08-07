-- Corrige a emissão da Pasta de Identificação.
--
-- A versão anterior só atribuía v_model no ramo ficha_matricula, mas lia
-- v_model.nome ao montar o snapshot de ambos os documentos. Em PL/pgSQL,
-- acessar um campo de RECORD nunca atribuído falha antes mesmo de o CASE
-- descartar o ramo, gerando HTTP 500 no PostgREST.
do $migration$
declare
  v_function_oid oid;
  v_definition text;
  v_needle text := E'  else\n    select template.conteudo';
  v_replacement text := E'  else\n    -- O snapshot comum lê v_model.nome; atribua o RECORD também neste ramo.\n    select ''Pasta de Identificação Geral''::text as nome\n    into v_model;\n\n    select template.conteudo';
begin
  select procedure.oid
  into v_function_oid
  from pg_proc as procedure
  join pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'emitir_ficha_validacao_portal'
    and pg_get_function_identity_arguments(procedure.oid)
      = 'p_documento text, p_matricula_id uuid, p_periodo_referencia text, p_emitido_por uuid, p_registrar_reemissao boolean, p_dados_emissao jsonb';

  if v_function_oid is null then
    raise exception 'A função canônica emitir_ficha_validacao_portal não foi encontrada.';
  end if;

  v_definition := pg_get_functiondef(v_function_oid);

  if position('O snapshot comum lê v_model.nome' in v_definition) > 0 then
    return;
  end if;

  if position(v_needle in v_definition) = 0 then
    raise exception 'A estrutura esperada de emitir_ficha_validacao_portal mudou; correção não aplicada.';
  end if;

  execute replace(v_definition, v_needle, v_replacement);
end;
$migration$;

comment on function public.emitir_ficha_validacao_portal(
  text, uuid, text, uuid, boolean, jsonb
) is
  'Emite Pasta de Identificação ou Ficha de Matrícula com snapshot cadastral e de layout atômico.';
