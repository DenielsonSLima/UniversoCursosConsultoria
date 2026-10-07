-- Corrige somente a projeção de leitura das páginas congeladas.
-- Nenhuma UPDATE de ledger, aprovação, minuta, hash ou contador de emissão.
begin;

create or replace function public.repaginar_resposta_contrato_v3(p_response jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $function$
declare
  v_document jsonb;
  v_documents jsonb := '[]'::jsonb;
  v_rendered jsonb;
begin
  for v_document in select value from jsonb_array_elements(p_response -> 'documents') loop
    if v_document #>> '{render_payload,snapshot,instituicao,presentationVersion}'
      is distinct from 'CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA' then
      v_documents := v_documents || jsonb_build_array(v_document);
      continue;
    end if;
    v_rendered := public.repaginar_render_contrato_v3(
      v_document #> '{render_payload,rendered}',
      v_document #>> '{render_payload,snapshot,instituicao,presentationVersion}'
    );
    v_documents := v_documents || jsonb_build_array(jsonb_set(
      v_document, '{render_payload,rendered}', v_rendered
    ));
  end loop;
  return jsonb_set(p_response, '{documents}', v_documents);
end;
$function$;
revoke all on function public.repaginar_resposta_contrato_v3(jsonb) from public, anon, authenticated, service_role;

do $patch$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  v_definition := pg_get_functiondef('public.preparar_emissao_contrato_aluno_secure(uuid,text,uuid[],text,uuid)'::regprocedure);
  v_old := 'return v_replay.resposta;';
  v_new := 'return public.repaginar_resposta_contrato_v3(v_replay.resposta);';
  if position(v_old in v_definition) = 0 then raise exception 'Replay canônico não encontrado; aplicação interrompida.'; end if;
  execute replace(v_definition, v_old, v_new);

  v_definition := pg_get_functiondef('public.search_secretaria_emissions_secure(uuid,text,uuid,text,integer,integer)'::regprocedure);
  v_old := 'jsonb_agg(payload order by ultima_emissao_em desc, id) from page_rows';
  v_new := $projection$jsonb_agg(
        case when payload ->> 'documento' = 'contrato_aluno'
          and payload #>> '{dados_emissao,contractSnapshot,instituicao,presentationVersion}'
            = 'CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA' then
          jsonb_set(payload, '{dados_emissao,renderedDocument}',
            public.repaginar_render_contrato_v3(
              payload #> '{dados_emissao,renderedDocument}',
              payload #>> '{dados_emissao,contractSnapshot,instituicao,presentationVersion}'
            )
          ) else payload end
        order by ultima_emissao_em desc, id) from page_rows$projection$;
  if position(v_old in v_definition) = 0 then raise exception 'Projeção do histórico não encontrada; aplicação interrompida.'; end if;
  execute replace(v_definition, v_old, v_new);
end;
$patch$;
commit;
