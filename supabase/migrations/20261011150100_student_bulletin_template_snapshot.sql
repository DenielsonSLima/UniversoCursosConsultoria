-- Keep the complete configured model. Only the recognized live student line evolves.
CREATE OR REPLACE FUNCTION internal_academic.normalize_bulletin_template(p_template jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_template jsonb := p_template;
  v_version numeric;
  v_header text := '<p>Aluno(a): {{ALUNO_NOME}} &nbsp; Matrícula: {{ALUNO_MATRICULA}}</p>';
  v_identity text := '<p>CPF nº {{ALUNO_CPF}}, {{ALUNO_DOCUMENTO_TIPO}} nº {{ALUNO_RG}}</p>';
  v_default_body text := '<p><b>DADOS ACADÊMICOS</b></p><p>Aluno(a): {{ALUNO_NOME}} &nbsp; Matrícula: {{ALUNO_MATRICULA}}</p><p>Curso técnico: {{CURSO_NOME}} &nbsp; Turma: {{TURMA_NOME}}</p><p>Módulos: {{MODULO_PERIODO}} &nbsp; Ano letivo: {{ANO_LETIVO}}</p><br><p><b>RESULTADO POR COMPONENTE CURRICULAR</b></p>{{TABELA_BOLETIM_TECNICO}}<br><p>Média geral: <b>{{MEDIA_GERAL}}</b> &nbsp; Frequência geral: <b>{{FREQUENCIA_GERAL}}</b></p><p>Situação: <b>{{SITUACAO_ACADEMICA}}</b></p><p class="text-sm">Documento informativo sujeito à consolidação pela Secretaria Acadêmica.</p>';
  v_fields jsonb;
BEGIN
  IF jsonb_typeof(v_template) IS DISTINCT FROM 'object' THEN RETURN v_template; END IF;
  v_version := CASE WHEN coalesce(v_template ->> 'v', '') ~ '^[0-9]+$'
    THEN (v_template ->> 'v')::numeric ELSE 0 END;
  IF v_version >= 4 THEN RETURN v_template; END IF;
  IF v_version < 3 AND jsonb_typeof(v_template -> 'absoluteFields') = 'array' THEN
    SELECT coalesce(jsonb_agg(CASE
      WHEN field ->> 'id' = 'boletim_data' AND field ->> 'x' = '455'
        AND field ->> 'y' = '875' AND field ->> 'width' = '260'
      THEN jsonb_set(field, '{width}', '190'::jsonb) ELSE field END ORDER BY ordinal), '[]'::jsonb)
    INTO v_fields FROM jsonb_array_elements(v_template -> 'absoluteFields')
      WITH ORDINALITY AS configured(field, ordinal);
    v_template := jsonb_set(v_template, '{absoluteFields}', v_fields);
    v_template := jsonb_set(v_template, '{v}', '3'::jsonb);
  END IF;
  IF regexp_replace(coalesce(v_template ->> 'textContent', ''), '\\+"', '"', 'g') = v_default_body
    AND coalesce(v_template ->> 'textContent', '') !~ '\{\{ALUNO_(CPF|RG|DOCUMENTO_TIPO|TIPO_DOCUMENTO)\}\}'
  THEN
    v_template := jsonb_set(v_template, '{textContent}', to_jsonb(
      replace(v_template ->> 'textContent', v_header, v_header || v_identity)));
    v_template := jsonb_set(v_template, '{v}', '4'::jsonb);
  END IF;
  RETURN v_template;
END;
$function$;
REVOKE ALL ON FUNCTION internal_academic.normalize_bulletin_template(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION internal_academic.get_bulletin_template()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_template jsonb;
BEGIN
  SELECT model.conteudo INTO v_template FROM public.documentos_templates model
  WHERE model.id IN ('boletim_tecnico', 'boletim_tecnico_TECNICO')
  ORDER BY CASE WHEN model.id = 'boletim_tecnico' THEN 0 ELSE 1 END LIMIT 1;
  IF NOT FOUND THEN
    -- Exact fallback displayed in the Boletim editor; contract tests compare all keys.
    v_template := $template${
      "textContent":"<p><b>DADOS ACADÊMICOS</b></p><p>Aluno(a): {{ALUNO_NOME}} &nbsp; Matrícula: {{ALUNO_MATRICULA}}</p><p>CPF nº {{ALUNO_CPF}}, {{ALUNO_DOCUMENTO_TIPO}} nº {{ALUNO_RG}}</p><p>Curso técnico: {{CURSO_NOME}} &nbsp; Turma: {{TURMA_NOME}}</p><p>Módulos: {{MODULO_PERIODO}} &nbsp; Ano letivo: {{ANO_LETIVO}}</p><br><p><b>RESULTADO POR COMPONENTE CURRICULAR</b></p>{{TABELA_BOLETIM_TECNICO}}<br><p>Média geral: <b>{{MEDIA_GERAL}}</b> &nbsp; Frequência geral: <b>{{FREQUENCIA_GERAL}}</b></p><p>Situação: <b>{{SITUACAO_ACADEMICA}}</b></p><p class=\"text-sm\">Documento informativo sujeito à consolidação pela Secretaria Acadêmica.</p>",
      "absoluteFields":[
        {"id":"boletim_data","type":"text","value":"Emitido em {{DATA_ATUAL}}","x":455,"y":875,"width":190,"style":{"textAlign":"right","fontWeight":"bold","fontSize":"12px"}},
        {"id":"boletim_assinatura","type":"text","value":"___________________________________________\nSecretaria Acadêmica","x":235,"y":930,"width":325,"style":{"textAlign":"center","fontSize":"13px","whiteSpace":"pre-line"}}
      ],"validityDays":30,"v":4
    }$template$::jsonb;
  END IF;
  v_template := internal_academic.normalize_bulletin_template(v_template);
  IF jsonb_typeof(v_template) IS DISTINCT FROM 'object'
    OR jsonb_typeof(v_template -> 'textContent') IS DISTINCT FROM 'string'
    OR nullif(btrim(v_template ->> 'textContent'), '') IS NULL
    OR (v_template ? 'absoluteFields'
      AND jsonb_typeof(v_template -> 'absoluteFields') IS DISTINCT FROM 'array')
  THEN
    RAISE EXCEPTION 'O modelo oficial do boletim está inválido.' USING ERRCODE = '55000';
  END IF;
  RETURN v_template;
END;
$function$;
REVOKE ALL ON FUNCTION internal_academic.get_bulletin_template()
  FROM PUBLIC, anon, authenticated, service_role;

-- Do not rewrite historical dados_emissao or unrecognized/custom live bodies.
UPDATE public.documentos_templates
SET conteudo = internal_academic.normalize_bulletin_template(conteudo)
WHERE id IN ('boletim_tecnico', 'boletim_tecnico_TECNICO')
  AND conteudo ->> 'v' = '3'
  AND conteudo IS DISTINCT FROM internal_academic.normalize_bulletin_template(conteudo);
