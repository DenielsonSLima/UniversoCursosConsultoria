begin;

-- Tokens novos usam somente o snapshot congelado, nunca o cadastro atual.
create or replace function internal_academic.contract_individual_terms_text(
  p_source text,
  p_snapshot jsonb
)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  v_result text := coalesce(p_source, '');
  v_field record;
  v_value text;
  v_number_token text;
begin
  -- Número ausente não significa imóvel sem número. O snapshot novo conserva
  -- null/vazio; apenas a apresentação V4 omite esse segmento opcional.
  if p_snapshot #>> '{instituicao,presentationVersion}' = 'CONTRATO_A4_INSTITUCIONAL_V4_LEGIVEL' then
    for v_field in select * from (values
      ('aluno.endereco.numero', array['aluno', 'endereco', 'numero']),
      ('instituicao.numero', array['instituicao', 'numero'])
    ) as fields(token, path) loop
      v_value := lower(btrim(coalesce(p_snapshot #>> v_field.path, '')));
      if v_value in ('', '-', '—', 'não informado', 'nao informado', 'n/a', 'null') then
        v_number_token := '\{\{' || replace(v_field.token, '.', '\.') || '\}\}';
        v_result := regexp_replace(v_result,
          ',?[[:blank:]]*(?:nº[[:blank:]]*)?' || v_number_token, '', 'g');
      end if;
    end loop;
  end if;
  for v_field in select * from (values
    ('contratante.nome', array['contratante', 'nome']),
    ('contratante.cpf', array['contratante', 'cpf']),
    ('contratante.qualificacao', array['contratante', 'qualificacao']),
    ('financeiro.quantidadeCiclos', array['financeiro', 'quantidadeCiclos']),
    ('financeiro.quantidadeMatriculas', array['financeiro', 'quantidadeMatriculas']),
    ('financeiro.quantidadeRematriculas', array['financeiro', 'quantidadeRematriculas']),
    ('financeiro.valorTotalMensalidades', array['financeiro', 'valorTotalMensalidadesExibicao']),
    ('financeiro.valorTotalMatriculas', array['financeiro', 'valorTotalMatriculasExibicao']),
    ('financeiro.valorTotalRematriculas', array['financeiro', 'valorTotalRematriculasExibicao']),
    ('financeiro.valorTotalContrato', array['financeiro', 'valorTotalContratoExibicao']),
    ('financeiro.planoPagamento', array['financeiro', 'planoPagamentoExibicao'])
  ) as fields(token, path) loop
    if position('{{' || v_field.token || '}}' in v_result) = 0 then continue; end if;
    v_value := nullif(btrim(p_snapshot #>> v_field.path), '');
    if v_value is null then
      raise exception 'Dado obrigatório do contrato indisponível: %.', v_field.token
        using errcode = '22023';
    end if;
    v_result := replace(v_result, '{{' || v_field.token || '}}', v_value);
  end loop;

  if position('{{contratante.telefone}}' in v_result) > 0 then
    v_value := nullif(btrim(p_snapshot #>> '{contratante,telefone}'), '');
    if v_value is null then
      v_result := regexp_replace(v_result,
        '(^|\n)Contato:[[:blank:]]*\{\{contratante\.telefone\}\}[[:blank:]]*(\n|$)', E'\1', 'g');
    end if;
    v_result := replace(v_result, '{{contratante.telefone}}', coalesce(v_value, ''));
  end if;
  -- A ausência do campo distingue documentos legados. Seu texto financeiro
  -- continua sendo o texto do snapshot original, com o renderer compatível.
  if p_snapshot -> 'financeiro' ? 'condicoesExibicao' then
    v_value := nullif(btrim(p_snapshot #>> '{financeiro,condicoesExibicao}'), '');
    if v_value is null and position('{{financeiro.condicoes}}' in v_result) > 0 then
      raise exception 'Condições financeiras do contrato indisponíveis.' using errcode = '22023';
    end if;
    v_result := replace(v_result, '{{financeiro.condicoes}}', coalesce(v_value, ''));
  end if;
  return v_result;
end;
$function$;

revoke all on function internal_academic.contract_individual_terms_text(text, jsonb)
  from public, anon, authenticated, service_role;

do $wire_individual_terms_renderer$
declare
  v_definition text;
  v_needle text := '  v_body := internal_academic.contract_student_identity_text(v_body, p_snapshot -> ''aluno'');';
begin
  select pg_catalog.pg_get_functiondef(
    'public.renderizar_contrato_aluno_documento(jsonb,jsonb,text,timestamp with time zone)'::regprocedure
  ) into v_definition;
  if position('internal_academic.contract_individual_terms_text' in v_definition) > 0 then return; end if;
  if position(v_needle in v_definition) = 0 then
    raise exception 'Renderer de identidade contratual mudou; aplicação interrompida.';
  end if;
  execute replace(v_definition, v_needle, $replacement$
  v_body := internal_academic.contract_individual_terms_text(v_body, p_snapshot);
  v_header := internal_academic.contract_individual_terms_text(v_header, p_snapshot);
  v_footer := internal_academic.contract_individual_terms_text(v_footer, p_snapshot);
$replacement$ || v_needle);
end;
$wire_individual_terms_renderer$;

commit;
