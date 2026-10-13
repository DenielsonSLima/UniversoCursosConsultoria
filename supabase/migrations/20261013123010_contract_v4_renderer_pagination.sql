-- Seleciona V4 apenas quando a nova revisão do modelo a declarar.
begin;
do $patch$
declare
  v_definition text;
  v_old text := $needle$    'pages', case
      when p_template ->> 'presentationVersion' = 'CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA'$needle$;
  v_new text := $replacement$    'pages', case
      when p_template ->> 'presentationVersion' = 'CONTRATO_A4_INSTITUCIONAL_V4_LEGIVEL'
        then public.paginar_contrato_aluno_v4(
          v_header,
          coalesce(nullif(p_template ->> 'tituloDocumento', ''), 'Contrato de Prestação de Serviços Educacionais'),
          v_body,
          v_footer
        )
      when p_template ->> 'presentationVersion' = 'CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA'$replacement$;
begin
  v_definition := pg_get_functiondef('public.renderizar_contrato_aluno_documento(jsonb,jsonb,text,timestamptz)'::regprocedure);
  if position(v_old in v_definition) = 0 then
    raise exception 'Ponto seguro de paginação do renderer mudou; aplicação interrompida.';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$patch$;
commit;
