BEGIN;

-- Extensão puramente visual do MODELO_PADRAO. Ela mantém a fundação
-- fail-closed: não habilita documentos, não cria envelopes e não altera RLS,
-- desafios, participantes, eventos ou o bucket privado de PDFs finais.

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_editor_padrao()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'pages', jsonb_build_array(
      jsonb_build_object(
        'page', 1,
        'template', 'EVIDENCE',
        'watermark', jsonb_build_object(
          'enabled', false,
          'source', 'TEXT',
          'label', 'UNIVERSO',
          'opacity', 0.08,
          'scalePercent', 60,
          'rotationDegrees', -45
        )
      ),
      jsonb_build_object(
        'page', 2,
        'template', 'LEGAL_TEXTS',
        'sections', jsonb_build_array(
          jsonb_build_object(
            'id', 'ownership',
            'title', 'DA PROPRIEDADE',
            'body', 'Defina aqui a identificação e a titularidade do serviço institucional de assinatura eletrônica.'
          ),
          jsonb_build_object(
            'id', 'consent',
            'title', 'DA RATIFICAÇÃO DO CONSENTIMENTO',
            'body', 'Descreva aqui o consentimento do signatário e sua vinculação ao documento, conforme a política jurídica aprovada.'
          ),
          jsonb_build_object(
            'id', 'terms_update',
            'title', 'DA ATUALIZAÇÃO DOS TERMOS DE USO',
            'body', 'Informe como alterações dos Termos de Uso e da Política de Privacidade serão comunicadas aos usuários.'
          ),
          jsonb_build_object(
            'id', 'contact',
            'title', 'COMO ENTRAR EM CONTATO',
            'body', 'Informe os canais oficiais para dúvidas sobre o documento e o tratamento de dados.'
          ),
          jsonb_build_object(
            'id', 'copies',
            'title', 'OBTENÇÃO DE CÓPIAS',
            'body', 'Explique como cada parte poderá consultar ou obter a cópia final do documento e do comprovante.'
          )
        ),
        'watermark', jsonb_build_object(
          'enabled', false,
          'source', 'TEXT',
          'label', 'UNIVERSO',
          'opacity', 0.08,
          'scalePercent', 60,
          'rotationDegrees', -45
        )
      )
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_texto_editor_seguro(
  p_value text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT p_value IS NOT NULL
    AND p_value !~* '(https?://|www\.|<[^>]*>|\[[^]]+\][[:space:]]*\()'
    AND p_value !~ '\m[0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}\M'
    AND p_value !~ '\m([0-9]{1,3}\.){3}[0-9]{1,3}\M'
    AND lower(p_value) !~ '\m(cpf|ip|sessão|sessao|session|senha|password|pin|otp|token|bearer|cookie)\M';
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_preview_identidade_matriz()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_matrix_count integer;
  v_brand record;
  v_logo_url text;
  v_watermark_url text;
BEGIN
  SELECT count(*)
  INTO v_matrix_count
  FROM public.polos AS pole
  JOIN public.empresas AS company ON company.id = pole.company_id
  WHERE coalesce(pole.is_matriz, false)
    AND lower(coalesce(pole.status, '')) = 'ativo'
    AND coalesce(company.ativo, false);

  IF v_matrix_count <> 1 THEN
    RAISE EXCEPTION 'A prévia exige exatamente uma matriz ativa; foram encontradas %.', v_matrix_count
      USING ERRCODE = '55000';
  END IF;

  SELECT
    coalesce(nullif(btrim(pole.nome), ''), nullif(btrim(company.nome_fantasia), '')) AS name,
    coalesce(nullif(btrim(pole.cnpj), ''), nullif(btrim(company.cnpj), '')) AS cnpj,
    coalesce(nullif(btrim(pole.endereco), ''), nullif(btrim(company.endereco), '')) AS address,
    coalesce(nullif(btrim(pole.numero), ''), nullif(btrim(company.numero), '')) AS number,
    coalesce(nullif(btrim(pole.complemento), ''), nullif(btrim(company.complemento), '')) AS complement,
    coalesce(nullif(btrim(pole.bairro), ''), nullif(btrim(company.bairro), '')) AS neighborhood,
    coalesce(nullif(btrim(pole.cidade), ''), nullif(btrim(company.cidade), '')) AS city,
    coalesce(nullif(btrim(pole.estado), ''), nullif(btrim(company.uf), '')) AS state,
    coalesce(nullif(btrim(pole.cep), ''), nullif(btrim(company.cep), '')) AS postal_code,
    coalesce(nullif(btrim(pole.telefone), ''), nullif(btrim(company.telefone), '')) AS phone,
    coalesce(nullif(btrim(pole.logo_url), ''), nullif(btrim(company.logo_url), '')) AS logo_url,
    coalesce(nullif(btrim(pole.watermark_url), ''), nullif(btrim(company.watermark_url), '')) AS watermark_url
  INTO v_brand
  FROM public.polos AS pole
  JOIN public.empresas AS company ON company.id = pole.company_id
  WHERE coalesce(pole.is_matriz, false)
    AND lower(coalesce(pole.status, '')) = 'ativo'
    AND coalesce(company.ativo, false);

  IF coalesce(v_brand.name, '') = '' THEN
    RAISE EXCEPTION 'A matriz ativa não possui nome institucional para a prévia.'
      USING ERRCODE = '22023';
  END IF;

  v_logo_url := v_brand.logo_url;
  v_watermark_url := v_brand.watermark_url;
  IF v_logo_url IS NOT NULL
     AND (
       char_length(v_logo_url) > 16777216
       OR (
         v_logo_url !~* '^https://'
         AND v_logo_url !~* '^data:image/(png|jpe?g|webp);base64,'
       )
     )
  THEN
    RAISE EXCEPTION 'O logotipo da matriz não usa uma origem autorizada para a prévia.'
      USING ERRCODE = '22023';
  END IF;
  IF v_watermark_url IS NOT NULL
     AND (
       char_length(v_watermark_url) > 16777216
       OR (
         v_watermark_url !~* '^https://'
         AND v_watermark_url !~* '^data:image/(png|jpe?g|webp);base64,'
       )
     )
  THEN
    RAISE EXCEPTION 'A marca-d''água da matriz não usa uma origem autorizada para a prévia.'
      USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'institution', jsonb_build_object(
      'name', v_brand.name,
      'legalName', '',
      'cnpj', coalesce(v_brand.cnpj, ''),
      'address', coalesce(v_brand.address, ''),
      'number', coalesce(v_brand.number, ''),
      'complement', coalesce(v_brand.complement, ''),
      'neighborhood', coalesce(v_brand.neighborhood, ''),
      'city', coalesce(v_brand.city, ''),
      'state', coalesce(v_brand.state, ''),
      'postalCode', coalesce(v_brand.postal_code, ''),
      'phone', coalesce(v_brand.phone, ''),
      'email', 'universo.cursoseconsultoria@gmail.com',
      'isHeadquarters', true
    ),
    'logoUrl', v_logo_url,
    'watermarkUrl', v_watermark_url,
    'hasInstitutionalWatermark', v_watermark_url IS NOT NULL
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_normalizar_editor(
  p_editor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_page_1 jsonb;
  v_page_2 jsonb;
  v_watermark jsonb;
  v_watermarks jsonb[] := ARRAY[]::jsonb[];
  v_sections jsonb := '[]'::jsonb;
  v_section jsonb;
  v_expected_id text;
  v_source text;
  v_label text;
  v_title text;
  v_body text;
  v_total_body_length integer := 0;
  v_opacity numeric;
  v_scale integer;
  v_rotation integer;
  v_index integer;
BEGIN
  IF p_editor IS NULL THEN
    RETURN public.assinatura_eletronica_editor_padrao();
  END IF;

  IF jsonb_typeof(p_editor) IS DISTINCT FROM 'object'
     OR (SELECT array_agg(entry.key ORDER BY entry.key) FROM jsonb_object_keys(p_editor) AS entry(key))
        IS DISTINCT FROM ARRAY['pages', 'schemaVersion']::text[]
     OR jsonb_typeof(p_editor -> 'schemaVersion') IS DISTINCT FROM 'number'
     OR p_editor ->> 'schemaVersion' <> '1'
     OR jsonb_typeof(p_editor -> 'pages') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_editor -> 'pages') <> 2
  THEN
    RAISE EXCEPTION 'O editor deve usar o schema 1 e conter exatamente duas páginas.'
      USING ERRCODE = '22023';
  END IF;

  v_page_1 := p_editor -> 'pages' -> 0;
  v_page_2 := p_editor -> 'pages' -> 1;

  IF jsonb_typeof(v_page_1) IS DISTINCT FROM 'object'
     OR (SELECT array_agg(entry.key ORDER BY entry.key) FROM jsonb_object_keys(v_page_1) AS entry(key))
        IS DISTINCT FROM ARRAY['page', 'template', 'watermark']::text[]
     OR jsonb_typeof(v_page_1 -> 'page') IS DISTINCT FROM 'number'
     OR v_page_1 ->> 'page' <> '1'
     OR v_page_1 ->> 'template' <> 'EVIDENCE'
  THEN
    RAISE EXCEPTION 'A página 1 deve usar o modelo canônico de evidências.'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_page_2) IS DISTINCT FROM 'object'
     OR (SELECT array_agg(entry.key ORDER BY entry.key) FROM jsonb_object_keys(v_page_2) AS entry(key))
        IS DISTINCT FROM ARRAY['page', 'sections', 'template', 'watermark']::text[]
     OR jsonb_typeof(v_page_2 -> 'page') IS DISTINCT FROM 'number'
     OR v_page_2 ->> 'page' <> '2'
     OR v_page_2 ->> 'template' <> 'LEGAL_TEXTS'
     OR jsonb_typeof(v_page_2 -> 'sections') IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_page_2 -> 'sections') <> 5
  THEN
    RAISE EXCEPTION 'A página 2 deve usar o modelo canônico com cinco blocos jurídicos.'
      USING ERRCODE = '22023';
  END IF;

  FOR v_index IN 0..1 LOOP
    v_watermark := (p_editor -> 'pages' -> v_index) -> 'watermark';
    IF jsonb_typeof(v_watermark) IS DISTINCT FROM 'object'
       OR (SELECT array_agg(entry.key ORDER BY entry.key) FROM jsonb_object_keys(v_watermark) AS entry(key))
          IS DISTINCT FROM ARRAY['enabled', 'label', 'opacity', 'rotationDegrees', 'scalePercent', 'source']::text[]
       OR jsonb_typeof(v_watermark -> 'enabled') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(v_watermark -> 'source') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_watermark -> 'opacity') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_watermark -> 'scalePercent') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_watermark -> 'rotationDegrees') IS DISTINCT FROM 'number'
       OR (v_watermark ->> 'scalePercent') !~ '^[0-9]+$'
       OR (v_watermark ->> 'rotationDegrees') !~ '^-?[0-9]+$'
    THEN
      RAISE EXCEPTION 'A marca-d''água da página % não corresponde ao contrato autorizado.', v_index + 1
        USING ERRCODE = '22023';
    END IF;

    v_source := v_watermark ->> 'source';
    v_label := CASE
      WHEN jsonb_typeof(v_watermark -> 'label') = 'string' THEN btrim(v_watermark ->> 'label')
      ELSE NULL
    END;
    v_opacity := (v_watermark ->> 'opacity')::numeric;
    v_scale := (v_watermark ->> 'scalePercent')::integer;
    v_rotation := (v_watermark ->> 'rotationDegrees')::integer;

    IF v_source NOT IN ('TEXT', 'INSTITUTIONAL_BRAND')
       OR v_opacity < 0.03 OR v_opacity > 0.15
       OR v_scale < 20 OR v_scale > 65
       OR v_rotation NOT IN (-45, 0)
       OR (v_source = 'TEXT' AND (v_label IS NULL OR v_label = '' OR char_length(v_label) > 60))
       OR (v_source = 'TEXT' AND v_label ~* '(https?://|www\.|<[^>]*>|\[[^]]+\][[:space:]]*\()')
       OR (v_source = 'TEXT' AND NOT public.assinatura_eletronica_texto_editor_seguro(v_label))
       OR (v_source = 'INSTITUTIONAL_BRAND' AND jsonb_typeof(v_watermark -> 'label') IS DISTINCT FROM 'null')
    THEN
      RAISE EXCEPTION 'A marca-d''água da página % excedeu os limites autorizados.', v_index + 1
        USING ERRCODE = '22023';
    END IF;

    v_watermarks := array_append(v_watermarks, jsonb_build_object(
      'enabled', (v_watermark ->> 'enabled')::boolean,
      'source', v_source,
      'label', CASE WHEN v_source = 'TEXT' THEN to_jsonb(v_label) ELSE 'null'::jsonb END,
      'opacity', v_opacity,
      'scalePercent', v_scale,
      'rotationDegrees', v_rotation
    ));
  END LOOP;

  FOR v_index IN 0..4 LOOP
    v_section := v_page_2 -> 'sections' -> v_index;
    v_expected_id := CASE v_index
      WHEN 0 THEN 'ownership'
      WHEN 1 THEN 'consent'
      WHEN 2 THEN 'terms_update'
      WHEN 3 THEN 'contact'
      ELSE 'copies'
    END;

    IF jsonb_typeof(v_section) IS DISTINCT FROM 'object'
       OR (SELECT array_agg(entry.key ORDER BY entry.key) FROM jsonb_object_keys(v_section) AS entry(key))
          IS DISTINCT FROM ARRAY['body', 'id', 'title']::text[]
       OR jsonb_typeof(v_section -> 'id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_section -> 'title') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_section -> 'body') IS DISTINCT FROM 'string'
       OR v_section ->> 'id' <> v_expected_id
    THEN
      RAISE EXCEPTION 'O bloco jurídico % não corresponde à ordem canônica.', v_index + 1
        USING ERRCODE = '22023';
    END IF;

    v_title := btrim(v_section ->> 'title');
    v_body := btrim(v_section ->> 'body');
    IF v_title = '' OR char_length(v_title) > 80
       OR v_body = '' OR char_length(v_body) > 260
       OR v_title ~* '(https?://|www\.|<[^>]*>|\[[^]]+\][[:space:]]*\()'
       OR v_body ~* '(https?://|www\.|<[^>]*>|\[[^]]+\][[:space:]]*\()'
       OR NOT public.assinatura_eletronica_texto_editor_seguro(v_title)
       OR NOT public.assinatura_eletronica_texto_editor_seguro(v_body)
    THEN
      RAISE EXCEPTION 'O bloco jurídico % excedeu o formato permitido.', v_index + 1
        USING ERRCODE = '22023';
    END IF;
    v_total_body_length := v_total_body_length + char_length(v_body);
    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'id', v_expected_id,
      'title', v_title,
      'body', v_body
    ));
  END LOOP;

  IF v_total_body_length > 1000 THEN
    RAISE EXCEPTION 'O conjunto de textos jurídicos excedeu a área segura do comprovante.'
      USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'schemaVersion', 1,
    'pages', jsonb_build_array(
      jsonb_build_object(
        'page', 1,
        'template', 'EVIDENCE',
        'watermark', v_watermarks[1]
      ),
      jsonb_build_object(
        'page', 2,
        'template', 'LEGAL_TEXTS',
        'sections', v_sections,
        'watermark', v_watermarks[2]
      )
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_apresentar_configuracao(
  p_registro public.assinatura_eletronica_politicas
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'polo_id', (p_registro).polo_id,
    'version', (p_registro).versao,
    'enabled', (p_registro).habilitada,
    'legal_status_label', public.assinatura_eletronica_status_juridico_label((p_registro).status_juridico),
    'previewIdentity', public.assinatura_eletronica_preview_identidade_matriz(),
    'certificate', jsonb_build_object(
      'statusLabel', coalesce(
        (p_registro).certificado ->> 'statusLabel',
        public.assinatura_eletronica_status_juridico_label((p_registro).status_juridico)
      ),
      'description', coalesce(
        (p_registro).certificado ->> 'description',
        CASE
          WHEN (p_registro).habilitada THEN
            'A configuração exige cadeia de evidências e autenticação reforçada; a execução conclusiva ainda não está liberada nesta fundação.'
          ELSE
            'Nenhuma assinatura jurídica está habilitada até aprovação da matriz e integração do fator de autenticação.'
        END
      )
    ),
    'policy', jsonb_build_object(
      'documentType', coalesce((p_registro).politica ->> 'documentType', (p_registro).documento),
      'name', coalesce((p_registro).politica ->> 'name', 'Modelo de comprovante de assinatura'),
      'versionLabel', 'Versão ' || (p_registro).versao::text,
      'confirmationMessage', coalesce(
        (p_registro).politica ->> 'confirmationMessage',
        'A confirmação jurídica será disponibilizada após a aprovação da política de assinatura.'
      ),
      'receiptTitle', coalesce((p_registro).politica ->> 'receiptTitle', 'Comprovante de Assinatura Eletrônica'),
      'receiptMessage', coalesce(
        (p_registro).politica ->> 'receiptMessage',
        'A autenticidade deve ser conferida pelo QR Code ou pela URL de validação.'
      ),
      'receiptFields', CASE
        WHEN jsonb_typeof((p_registro).politica -> 'receiptFields') = 'array'
          THEN (p_registro).politica -> 'receiptFields'
        ELSE jsonb_build_array(
          jsonb_build_object('id', 'envelope', 'label', 'Envelope', 'description', 'Identificador único do envio.'),
          jsonb_build_object('id', 'document_revision', 'label', 'Revisão', 'description', 'Versão congelada do documento.'),
          jsonb_build_object('id', 'participants', 'label', 'Participantes', 'description', 'Participantes e papéis autorizados.'),
          jsonb_build_object('id', 'events', 'label', 'Eventos', 'description', 'Trilha de evidências do processo.')
        )
      END,
      'editor', CASE
        WHEN jsonb_typeof((p_registro).politica -> 'editor') = 'object'
          THEN public.assinatura_eletronica_normalizar_editor((p_registro).politica -> 'editor')
        ELSE public.assinatura_eletronica_editor_padrao()
      END
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_obter_configuracao(
  p_polo_id uuid DEFAULT NULL,
  p_documento text DEFAULT 'MODELO_PADRAO'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_documento text := upper(btrim(coalesce(p_documento, 'MODELO_PADRAO')));
  v_politica public.assinatura_eletronica_politicas%ROWTYPE;
BEGIN
  IF v_documento = '' THEN
    RAISE EXCEPTION 'Documento de assinatura inválido.' USING ERRCODE = '22023';
  END IF;

  IF NOT public.assinatura_eletronica_autoriza_configuracao(p_polo_id) THEN
    RAISE EXCEPTION 'Acesso não autorizado à configuração de assinatura eletrônica.'
      USING ERRCODE = '42501';
  END IF;

  IF v_documento = 'MODELO_PADRAO' AND p_polo_id IS NOT NULL THEN
    RAISE EXCEPTION 'MODELO_PADRAO é uma configuração global.' USING ERRCODE = '22023';
  END IF;

  IF v_documento <> 'MODELO_PADRAO' THEN
    RAISE EXCEPTION 'Políticas por documento permanecem bloqueadas nesta fundação.'
      USING ERRCODE = '55000';
  END IF;

  SELECT politica.*
  INTO v_politica
  FROM public.assinatura_eletronica_politicas AS politica
  WHERE politica.polo_id IS NOT DISTINCT FROM p_polo_id
    AND politica.documento = v_documento
    AND politica.arquivada_em IS NULL
  ORDER BY politica.versao DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'polo_id', p_polo_id,
      'version', 0,
      'enabled', false,
      'legal_status_label', 'Aguardando parecer jurídico',
      'previewIdentity', public.assinatura_eletronica_preview_identidade_matriz(),
      'certificate', jsonb_build_object(
        'statusLabel', 'Aguardando parecer jurídico',
        'description', 'Nenhuma assinatura jurídica está habilitada até aprovação da matriz e integração do fator de autenticação.'
      ),
      'policy', jsonb_build_object(
        'documentType', v_documento,
        'name', 'Modelo de comprovante de assinatura',
        'versionLabel', 'Sem versão',
        'confirmationMessage', 'A confirmação jurídica será disponibilizada após a aprovação da política de assinatura.',
        'receiptTitle', 'Comprovante de Assinatura Eletrônica',
        'receiptMessage', 'A autenticidade deve ser conferida pelo QR Code ou pela URL de validação.',
        'receiptFields', jsonb_build_array(
          jsonb_build_object('id', 'envelope', 'label', 'Envelope', 'description', 'Identificador único do envio.'),
          jsonb_build_object('id', 'document_revision', 'label', 'Revisão', 'description', 'Versão congelada do documento.'),
          jsonb_build_object('id', 'participants', 'label', 'Participantes', 'description', 'Participantes e papéis autorizados.'),
          jsonb_build_object('id', 'events', 'label', 'Eventos', 'description', 'Trilha de evidências do processo.')
        ),
        'editor', public.assinatura_eletronica_editor_padrao()
      )
    );
  END IF;

  RETURN public.assinatura_eletronica_apresentar_configuracao(v_politica);
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_salvar_configuracao(
  p_polo_id uuid DEFAULT NULL,
  p_documento text DEFAULT 'MODELO_PADRAO',
  p_configuracao jsonb DEFAULT '{}'::jsonb,
  p_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_documento text := upper(btrim(coalesce(p_documento, 'MODELO_PADRAO')));
  v_habilitada boolean := false;
  v_status_juridico text := 'PENDENTE_MATRIZ_JURIDICA';
  v_certificado jsonb;
  v_editor jsonb;
  v_politica_core jsonb;
  v_politica_json jsonb;
  v_company_id uuid;
  v_versao integer;
  v_expected_version integer;
  v_current_version integer;
  v_request_id uuid := coalesce(p_request_id, gen_random_uuid());
  v_replay public.assinatura_eletronica_politicas%ROWTYPE;
  v_resultado public.assinatura_eletronica_politicas%ROWTYPE;
BEGIN
  IF NOT public.assinatura_eletronica_autoriza_configuracao(p_polo_id) THEN
    RAISE EXCEPTION 'Acesso não autorizado para configurar assinatura eletrônica.'
      USING ERRCODE = '42501';
  END IF;

  IF v_documento = '' OR jsonb_typeof(p_configuracao) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Configuração de assinatura inválida.' USING ERRCODE = '22023';
  END IF;

  IF v_documento <> 'MODELO_PADRAO' THEN
    RAISE EXCEPTION 'Políticas por documento permanecem bloqueadas nesta fundação.'
      USING ERRCODE = '55000';
  END IF;

  IF p_polo_id IS NOT NULL THEN
    RAISE EXCEPTION 'MODELO_PADRAO é uma configuração global.' USING ERRCODE = '22023';
  END IF;

  IF (SELECT array_agg(entry.key ORDER BY entry.key) FROM jsonb_object_keys(p_configuracao) AS entry(key))
       IS DISTINCT FROM ARRAY['confirmationMessage', 'editor', 'expectedVersion', 'name', 'receiptMessage', 'receiptTitle']::text[]
     OR jsonb_typeof(p_configuracao -> 'name') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_configuracao -> 'confirmationMessage') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_configuracao -> 'receiptTitle') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_configuracao -> 'receiptMessage') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_configuracao -> 'expectedVersion') IS DISTINCT FROM 'number'
     OR (p_configuracao ->> 'expectedVersion') !~ '^[0-9]+$'
     OR btrim(p_configuracao ->> 'name') = ''
     OR btrim(p_configuracao ->> 'confirmationMessage') = ''
     OR btrim(p_configuracao ->> 'receiptTitle') = ''
     OR btrim(p_configuracao ->> 'receiptMessage') = ''
     OR char_length(p_configuracao ->> 'name') > 120
     OR char_length(p_configuracao ->> 'confirmationMessage') > 600
     OR char_length(p_configuracao ->> 'receiptTitle') > 120
     OR char_length(p_configuracao ->> 'receiptMessage') > 240
     OR p_configuracao ->> 'name' ~* '(https?://|www\.|<[^>]*>|\[[^]]+\][[:space:]]*\()'
     OR p_configuracao ->> 'confirmationMessage' ~* '(https?://|www\.|<[^>]*>|\[[^]]+\][[:space:]]*\()'
     OR p_configuracao ->> 'receiptTitle' ~* '(https?://|www\.|<[^>]*>|\[[^]]+\][[:space:]]*\()'
     OR p_configuracao ->> 'receiptMessage' ~* '(https?://|www\.|<[^>]*>|\[[^]]+\][[:space:]]*\()'
     OR NOT public.assinatura_eletronica_texto_editor_seguro(p_configuracao ->> 'name')
     OR NOT public.assinatura_eletronica_texto_editor_seguro(p_configuracao ->> 'confirmationMessage')
     OR NOT public.assinatura_eletronica_texto_editor_seguro(p_configuracao ->> 'receiptTitle')
     OR NOT public.assinatura_eletronica_texto_editor_seguro(p_configuracao ->> 'receiptMessage')
  THEN
    RAISE EXCEPTION 'Os quatro textos e o editor de duas páginas são obrigatórios e excederam o formato permitido.'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_expected_version := (p_configuracao ->> 'expectedVersion')::integer;
  EXCEPTION WHEN numeric_value_out_of_range THEN
    RAISE EXCEPTION 'A versão-base do modelo excedeu o intervalo permitido.'
      USING ERRCODE = '22023';
  END;
  IF v_expected_version < 0 OR v_expected_version = 2147483647 THEN
    RAISE EXCEPTION 'A versão-base do modelo é inválida.' USING ERRCODE = '22023';
  END IF;

  v_editor := public.assinatura_eletronica_normalizar_editor(p_configuracao -> 'editor');
  v_certificado := jsonb_build_object(
    'metodo', 'BLOQUEADO',
    'cadeiaEvidencias', false,
    'statusLabel', 'Aguardando parecer jurídico',
    'description', 'Nenhuma assinatura jurídica está habilitada até aprovação da matriz e integração do fator de autenticação.'
  );
  v_politica_core := jsonb_build_object(
    'name', btrim(p_configuracao ->> 'name'),
    'confirmationMessage', btrim(p_configuracao ->> 'confirmationMessage'),
    'receiptTitle', btrim(p_configuracao ->> 'receiptTitle'),
    'receiptMessage', btrim(p_configuracao ->> 'receiptMessage'),
    'editor', v_editor
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'assinatura-eletronica-config:' || coalesce(p_polo_id::text, 'GLOBAL') || ':' || v_documento,
      0
    )
  );

  SELECT politica.*
  INTO v_replay
  FROM public.assinatura_eletronica_politicas AS politica
  WHERE politica.request_id = v_request_id;

  IF FOUND THEN
    IF v_replay.polo_id IS DISTINCT FROM p_polo_id
       OR v_replay.documento IS DISTINCT FROM v_documento
       OR v_replay.versao IS DISTINCT FROM v_expected_version + 1
       OR v_replay.habilitada IS DISTINCT FROM v_habilitada
       OR v_replay.status_juridico IS DISTINCT FROM v_status_juridico
       OR v_replay.certificado IS DISTINCT FROM v_certificado
       OR (
         v_replay.politica
         - 'documentType'
         - 'versionLabel'
         - 'receiptFields'
         - 'signatarios'
       ) IS DISTINCT FROM v_politica_core
    THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada com dados diferentes.'
        USING ERRCODE = '22023';
    END IF;

    RETURN public.assinatura_eletronica_apresentar_configuracao(v_replay);
  END IF;

  SELECT coalesce(max(politica.versao), 0)
  INTO v_current_version
  FROM public.assinatura_eletronica_politicas AS politica
  WHERE politica.polo_id IS NOT DISTINCT FROM p_polo_id
    AND politica.documento = v_documento;

  IF v_current_version IS DISTINCT FROM v_expected_version THEN
    RAISE EXCEPTION 'O modelo foi atualizado por outro usuário. Recarregue a versão atual antes de salvar.'
      USING ERRCODE = '40001';
  END IF;

  v_versao := v_current_version + 1;

  v_politica_json := v_politica_core || jsonb_build_object(
    'documentType', 'MODELO_PADRAO',
    'versionLabel', 'Versão ' || v_versao::text,
    'receiptFields', jsonb_build_array(
      jsonb_build_object('id', 'envelope', 'label', 'Envelope', 'description', 'Identificador único do envio.'),
      jsonb_build_object('id', 'document_revision', 'label', 'Revisão', 'description', 'Versão congelada do documento.'),
      jsonb_build_object('id', 'participants', 'label', 'Participantes', 'description', 'Participantes e papéis autorizados.'),
      jsonb_build_object('id', 'events', 'label', 'Eventos', 'description', 'Trilha de evidências do processo.')
    ),
    'signatarios', jsonb_build_array()
  );

  UPDATE public.assinatura_eletronica_politicas AS politica
  SET arquivada_em = now(),
      arquivada_por = auth.uid(),
      atualizada_por = auth.uid()
  WHERE politica.polo_id IS NOT DISTINCT FROM p_polo_id
    AND politica.documento = v_documento
    AND politica.arquivada_em IS NULL;

  INSERT INTO public.assinatura_eletronica_politicas (
    company_id,
    polo_id,
    documento,
    versao,
    habilitada,
    status_juridico,
    certificado,
    politica,
    request_id,
    criada_por,
    atualizada_por
  ) VALUES (
    v_company_id,
    p_polo_id,
    v_documento,
    v_versao,
    v_habilitada,
    v_status_juridico,
    v_certificado,
    v_politica_json,
    v_request_id,
    auth.uid(),
    auth.uid()
  )
  RETURNING * INTO v_resultado;

  RETURN public.assinatura_eletronica_apresentar_configuracao(v_resultado);
END;
$function$;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_editor_padrao() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_texto_editor_seguro(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_preview_identidade_matriz() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_normalizar_editor(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_apresentar_configuracao(public.assinatura_eletronica_politicas) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_obter_configuracao(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_salvar_configuracao(uuid, text, jsonb, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_obter_configuracao(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_salvar_configuracao(uuid, text, jsonb, uuid) TO authenticated, service_role;

COMMIT;
