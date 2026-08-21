-- Crachá de Preceptor CR80 vertical.
-- A chave técnica `carteirinha_preceptor`, a elegibilidade e os registros já
-- emitidos continuam os mesmos. Esta migration somente acrescenta o contrato
-- seguro do layout vertical e completa o snapshot canônico da emissão.

alter function public.save_modelo_documento_template_secure(text, text, integer, jsonb, uuid)
  rename to save_modelo_documento_template_preceptor_vertical_base_secure;

create or replace function public.save_modelo_documento_template_secure(
  p_template_key text,
  p_modality text,
  p_expected_revision integer,
  p_content jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_template_key text := lower(btrim(coalesce(p_template_key, '')));
  v_source jsonb := coalesce(p_content, 'null'::jsonb);
  v_content jsonb;
  v_field jsonb;
  v_field_type text;
  v_field_value text;
  v_style jsonb;
  v_normalized_style jsonb;
  v_fields jsonb := '[]'::jsonb;
  v_residual_tokens text;
  v_qr jsonb;
  v_qr_mode text;
  v_qr_days integer;
  v_qr_label text;
  v_qr_path text;
  v_width numeric;
  v_height numeric;
  v_start_number integer;
  v_name_size numeric;
  v_data_size numeric;
  v_photo_width numeric;
  v_photo_height numeric;
  v_has_photo boolean := false;
  v_has_qr boolean := false;
begin
  -- Todos os demais documentos continuam no contrato seguro vigente.
  if v_template_key <> 'carteirinha_preceptor' then
    return public.save_modelo_documento_template_preceptor_vertical_base_secure(
      p_template_key, p_modality, p_expected_revision, p_content, p_request_id
    );
  end if;

  if not public.can_manage_modelos_documentos() then
    raise exception 'Acesso aos modelos de documentos não autorizado.' using errcode = '42501';
  end if;

  if jsonb_typeof(v_source) <> 'object' then
    raise exception 'O conteúdo do modelo deve ser um objeto.' using errcode = '22023';
  end if;
  if coalesce(v_source ->> 'layoutVersion', '') <> 'CR80_VERTICAL_V1'
    or jsonb_typeof(v_source -> 'fields') is distinct from 'array' then
    raise exception 'O Crachá de Preceptor exige layout CR80 vertical e campos posicionados.' using errcode = '22023';
  end if;
  if jsonb_array_length(v_source -> 'fields') not between 1 and 80 then
    raise exception 'O Crachá de Preceptor deve conter entre 1 e 80 campos.' using errcode = '22023';
  end if;
  if coalesce(btrim(v_source ->> 'nome'), '') = '' or char_length(v_source ->> 'nome') > 120 then
    raise exception 'Informe o nome do Crachá de Preceptor.' using errcode = '22023';
  end if;
  if char_length(coalesce(v_source ->> 'nomeModelo', '')) > 120
    or char_length(coalesce(v_source ->> 'cargoPadrao', '')) > 120
    or char_length(coalesce(v_source ->> 'textoFrente', '')) > 240
    or char_length(coalesce(v_source ->> 'tituloFrente', '')) > 240
    or char_length(coalesce(v_source ->> 'subtituloFrente', '')) > 500
    or char_length(coalesce(v_source ->> 'textoVerso', '')) > 4000
    or char_length(coalesce(v_source ->> 'mensagemVerso', '')) > 4000
    or char_length(coalesce(v_source ->> 'rodape', '')) > 500 then
    raise exception 'Um texto de configuração do Crachá de Preceptor excede o limite.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_source -> 'hasVerso') is distinct from 'boolean'
    or jsonb_typeof(v_source -> 'ocultarDesignPadrao') is distinct from 'boolean'
    or (v_source ? 'mostrarPolo' and jsonb_typeof(v_source -> 'mostrarPolo') is distinct from 'boolean')
    or (v_source ? 'marcaDaguaHabilitada' and jsonb_typeof(v_source -> 'marcaDaguaHabilitada') is distinct from 'boolean')
    or (v_source ? 'mostrarFoto' and jsonb_typeof(v_source -> 'mostrarFoto') is distinct from 'boolean') then
    raise exception 'As opções visuais do Crachá de Preceptor são inválidas.' using errcode = '22023';
  end if;
  if coalesce(v_source ->> 'corPrimaria', '') !~ '^#[0-9A-Fa-f]{6}$'
    or coalesce(v_source ->> 'corSecundaria', '') !~ '^#[0-9A-Fa-f]{6}$'
    or coalesce(v_source ->> 'corTexto', '') !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'As cores do Crachá de Preceptor devem usar hexadecimal RGB.' using errcode = '22023';
  end if;
  if coalesce(v_source ->> 'bgFrenteUrl', '') !~ '^(|https://[^[:space:]]{1,2000})$'
    or coalesce(v_source ->> 'bgVersoUrl', '') !~ '^(|https://[^[:space:]]{1,2000})$' then
    raise exception 'A URL de fundo do Crachá de Preceptor é inválida.' using errcode = '22023';
  end if;
  if position('{{ALUNO_' in upper(v_source::text)) > 0 then
    raise exception 'O Crachá de Preceptor não aceita dados ou marcadores de aluno.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_source -> 'fields') as item(value)
    group by btrim(item.value ->> 'id')
    having count(*) > 1
  ) then
    raise exception 'Os campos do Crachá de Preceptor precisam ter identificadores únicos.' using errcode = '22023';
  end if;

  if v_source ? 'startNumber' and coalesce(v_source ->> 'startNumber', '') !~ '^[0-9]+$' then
    raise exception 'O número sequencial inicial é inválido.' using errcode = '22023';
  end if;
  v_start_number := coalesce((v_source ->> 'startNumber')::integer, 1000);
  if v_start_number not between 1 and 9999999 then
    raise exception 'O número sequencial inicial é inválido.' using errcode = '22023';
  end if;
  if (v_source ? 'tamanhoFonteNome' and coalesce(v_source ->> 'tamanhoFonteNome', '') !~ '^[0-9]+(\.[0-9]+)?$')
    or (v_source ? 'tamanhoFonteDados' and coalesce(v_source ->> 'tamanhoFonteDados', '') !~ '^[0-9]+(\.[0-9]+)?$')
    or (v_source ? 'fotoWidth' and coalesce(v_source ->> 'fotoWidth', '') !~ '^[0-9]+(\.[0-9]+)?$')
    or (v_source ? 'fotoHeight' and coalesce(v_source ->> 'fotoHeight', '') !~ '^[0-9]+(\.[0-9]+)?$') then
    raise exception 'As dimensões tipográficas do Crachá de Preceptor são inválidas.' using errcode = '22023';
  end if;
  v_name_size := coalesce((v_source ->> 'tamanhoFonteNome')::numeric, 8.5);
  v_data_size := coalesce((v_source ->> 'tamanhoFonteDados')::numeric, 6.8);
  v_photo_width := coalesce((v_source ->> 'fotoWidth')::numeric, 45);
  v_photo_height := coalesce((v_source ->> 'fotoHeight')::numeric, 28.5);
  if v_name_size not between 3 and 48
    or v_data_size not between 3 and 48
    or v_photo_width not between 1 and 100
    or v_photo_height not between 1 and 100 then
    raise exception 'As dimensões tipográficas do Crachá de Preceptor são inválidas.' using errcode = '22023';
  end if;

  for v_field in select value from jsonb_array_elements(v_source -> 'fields') as item(value)
  loop
    if jsonb_typeof(v_field) <> 'object' then
      raise exception 'Campo posicionado do Crachá de Preceptor é inválido.' using errcode = '22023';
    end if;
    v_field_type := v_field ->> 'type';
    v_field_value := coalesce(v_field ->> 'value', '');
    if coalesce(btrim(v_field ->> 'id'), '') = ''
      or char_length(v_field ->> 'id') > 120
      or v_field_type not in ('foto', 'image', 'qrcode', 'text')
      or v_field ->> 'page' not in ('frente', 'verso')
      or coalesce(v_field ->> 'x', '') !~ '^-?[0-9]+(\.[0-9]+)?$'
      or coalesce(v_field ->> 'y', '') !~ '^-?[0-9]+(\.[0-9]+)?$'
      or (v_field ? 'width' and coalesce(v_field ->> 'width', '') !~ '^[0-9]+(\.[0-9]+)?$')
      or (v_field ? 'height' and coalesce(v_field ->> 'height', '') !~ '^[0-9]+(\.[0-9]+)?$') then
      raise exception 'Campo posicionado do Crachá de Preceptor é inválido.' using errcode = '22023';
    end if;

    v_width := coalesce(
      (v_field ->> 'width')::numeric,
      case v_field_type when 'foto' then 45 when 'qrcode' then 22 when 'image' then 25 else 92.6 end
    );
    v_height := coalesce(
      (v_field ->> 'height')::numeric,
      case v_field_type when 'foto' then 28.5 when 'qrcode' then 14 when 'image' then 12 else 12 end
    );
    if (v_field ->> 'x')::numeric not between -10 and 100
      or (v_field ->> 'y')::numeric not between -10 and 100
      or v_width not between 1 and 100
      or v_height not between 1 and 100 then
      raise exception 'Posição ou dimensão do campo do Crachá de Preceptor é inválida.' using errcode = '22023';
    end if;
    if v_field_type = 'foto' and v_field_value <> '' then
      raise exception 'A foto do Crachá de Preceptor vem exclusivamente do snapshot seguro.' using errcode = '22023';
    end if;
    if v_field_type = 'qrcode' and v_field_value <> 'QR_VALIDADOR_CRACHA' then
      raise exception 'O QR Code do Crachá de Preceptor é controlado pelo servidor.' using errcode = '22023';
    end if;
    if v_field_type = 'image' and v_field_value !~ '^https://[^[:space:]]{1,2000}$' then
      raise exception 'Imagem adicional do Crachá de Preceptor deve usar URL HTTPS.' using errcode = '22023';
    end if;
    if v_field_type = 'text' then
      if char_length(v_field_value) > 2000 then
        raise exception 'O texto de um campo do Crachá de Preceptor excede o limite.' using errcode = '22023';
      end if;
      v_residual_tokens := replace(replace(replace(replace(replace(replace(replace(replace(
        v_field_value,
        '{{PRECEPTOR_NOME}}', ''),
        '{{PRECEPTOR_CARGO}}', ''),
        '{{PRECEPTOR_AREA}}', ''),
        '{{PRECEPTOR_REGISTRO}}', ''),
        '{{POLO_NOME}}', ''),
        '{{DATA_HOJE}}', ''),
        '{{DATA_VALIDADE}}', ''),
        '{{VALIDACAO_CODIGO}}', '');
      if position('{{' in v_residual_tokens) > 0 or position('}}' in v_residual_tokens) > 0 then
        raise exception 'Use somente os marcadores permitidos do Crachá de Preceptor.' using errcode = '22023';
      end if;
    end if;

    v_style := coalesce(v_field -> 'style', '{}'::jsonb);
    if jsonb_typeof(v_style) <> 'object'
      or (v_style ? 'color' and coalesce(v_style ->> 'color', '') !~ '^#[0-9A-Fa-f]{6}$')
      or (v_style ? 'fontSize' and coalesce(v_style ->> 'fontSize', '') !~ '^[0-9]+(\.[0-9]+)?(px)?$')
      or (v_style ? 'fontStyle' and v_style ->> 'fontStyle' not in ('normal', 'italic'))
      or (v_style ? 'fontWeight' and v_style ->> 'fontWeight' not in ('normal', 'bold'))
      or (v_style ? 'lineHeight' and coalesce(v_style ->> 'lineHeight', '') !~ '^[0-9]+(\.[0-9]+)?$')
      or (v_style ? 'mixBlendMode' and v_style ->> 'mixBlendMode' not in ('normal', 'multiply'))
      or (v_style ? 'objectFit' and v_style ->> 'objectFit' not in ('contain', 'cover'))
      or (v_style ? 'textAlign' and v_style ->> 'textAlign' not in ('left', 'center', 'right'))
      or (v_style ? 'zIndex' and coalesce(v_style ->> 'zIndex', '') !~ '^[0-9]+$') then
      raise exception 'O estilo de um campo do Crachá de Preceptor é inválido.' using errcode = '22023';
    end if;
    if (v_style ? 'fontSize' and regexp_replace(v_style ->> 'fontSize', 'px$', '')::numeric not between 3 and 48)
      or (v_style ? 'lineHeight' and (v_style ->> 'lineHeight')::numeric not between 0.8 and 3)
      or (v_style ? 'zIndex' and (v_style ->> 'zIndex')::integer not between 0 and 100) then
      raise exception 'O estilo de um campo do Crachá de Preceptor é inválido.' using errcode = '22023';
    end if;
    v_normalized_style := jsonb_strip_nulls(jsonb_build_object(
      'color', case when v_style ? 'color' then v_style ->> 'color' else null end,
      'fontSize', case when v_style ? 'fontSize' then v_style ->> 'fontSize' else null end,
      'fontStyle', case when v_style ? 'fontStyle' then v_style ->> 'fontStyle' else null end,
      'fontWeight', case when v_style ? 'fontWeight' then v_style ->> 'fontWeight' else null end,
      'lineHeight', case when v_style ? 'lineHeight' then v_style ->> 'lineHeight' else null end,
      'mixBlendMode', case when v_style ? 'mixBlendMode' then v_style ->> 'mixBlendMode' else null end,
      'objectFit', case when v_style ? 'objectFit' then v_style ->> 'objectFit' else null end,
      'textAlign', case when v_style ? 'textAlign' then v_style ->> 'textAlign' else null end,
      'zIndex', case when v_style ? 'zIndex' then to_jsonb((v_style ->> 'zIndex')::integer) else null end
    ));
    v_fields := v_fields || jsonb_build_array(jsonb_build_object(
      'id', btrim(v_field ->> 'id'),
      'type', v_field_type,
      'value', v_field_value,
      'x', (v_field ->> 'x')::numeric,
      'y', (v_field ->> 'y')::numeric,
      'width', v_width,
      'height', v_height,
      'page', v_field ->> 'page',
      'style', v_normalized_style
    ));
    v_has_photo := v_has_photo or v_field_type = 'foto';
    v_has_qr := v_has_qr or v_field_type = 'qrcode';
  end loop;

  v_qr := coalesce(v_source -> 'qr', '{}'::jsonb);
  if jsonb_typeof(v_qr) <> 'object' then
    raise exception 'A configuração de QR Code deve ser um objeto.' using errcode = '22023';
  end if;
  v_qr_mode := coalesce(v_qr ->> 'modoValidade', 'POR_DIAS');
  if v_qr_mode not in ('SEM_VENCIMENTO', 'POR_DIAS') then
    raise exception 'Modo de validade do QR Code inválido.' using errcode = '22023';
  end if;
  if v_qr_mode = 'POR_DIAS' then
    if coalesce(v_qr ->> 'diasValidade', '') !~ '^[0-9]+$'
      or (v_qr ->> 'diasValidade')::integer not between 1 and 3650 then
      raise exception 'A validade do QR Code deve estar entre 1 e 3650 dias.' using errcode = '22023';
    end if;
    v_qr_days := (v_qr ->> 'diasValidade')::integer;
  else
    v_qr_days := null;
  end if;
  v_qr_label := coalesce(nullif(btrim(v_qr ->> 'rotulo'), ''), 'Validar credencial');
  v_qr_path := coalesce(nullif(btrim(v_qr ->> 'caminhoValidacao'), ''), '/validar-documento');
  if char_length(v_qr_label) > 120 or v_qr_path !~ '^/[A-Za-z0-9/_?=&-]{1,240}$' then
    raise exception 'A configuração de QR Code é inválida.' using errcode = '22023';
  end if;

  -- Reconstrói o conteúdo a partir da allowlist. Chaves desconhecidas (inclusive
  -- objetos de aluno ou dados pessoais) nunca entram no template congelado.
  v_content := jsonb_build_object(
    'layoutVersion', 'CR80_VERTICAL_V1',
    'nome', btrim(v_source ->> 'nome'),
    'nomeModelo', coalesce(nullif(btrim(v_source ->> 'nomeModelo'), ''), btrim(v_source ->> 'nome')),
    'cargoPadrao', coalesce(nullif(btrim(v_source ->> 'cargoPadrao'), ''), 'PRECEPTOR(A)'),
    'startNumber', v_start_number,
    'hasVerso', (v_source ->> 'hasVerso')::boolean,
    'corPrimaria', v_source ->> 'corPrimaria',
    'corSecundaria', v_source ->> 'corSecundaria',
    'corTexto', v_source ->> 'corTexto',
    'textoFrente', coalesce(nullif(v_source ->> 'textoFrente', ''), coalesce(nullif(v_source ->> 'cargoPadrao', ''), 'PRECEPTOR(A)')),
    'textoVerso', coalesce(v_source ->> 'textoVerso', ''),
    'bgFrenteUrl', coalesce(v_source ->> 'bgFrenteUrl', ''),
    'bgVersoUrl', coalesce(v_source ->> 'bgVersoUrl', ''),
    'ocultarDesignPadrao', (v_source ->> 'ocultarDesignPadrao')::boolean,
    'tamanhoFonteNome', v_name_size,
    'tamanhoFonteDados', v_data_size,
    'fotoWidth', v_photo_width,
    'fotoHeight', v_photo_height,
    'tituloFrente', coalesce(nullif(v_source ->> 'tituloFrente', ''), 'PRECEPTOR(A)'),
    'subtituloFrente', coalesce(v_source ->> 'subtituloFrente', ''),
    'mensagemVerso', coalesce(v_source ->> 'mensagemVerso', ''),
    'rodape', coalesce(v_source ->> 'rodape', ''),
    'mostrarFoto', v_has_photo,
    'mostrarPolo', coalesce((v_source ->> 'mostrarPolo')::boolean, true),
    'marcaDaguaHabilitada', coalesce((v_source ->> 'marcaDaguaHabilitada')::boolean, true),
    'qr', jsonb_strip_nulls(jsonb_build_object(
      'habilitado', v_has_qr,
      'rotulo', v_qr_label,
      'caminhoValidacao', v_qr_path,
      'modoValidade', v_qr_mode,
      'diasValidade', v_qr_days
    )),
    'fields', v_fields
  );

  -- O navegador não pode ativar, arquivar ou alterar a situação do modelo.
  return public.save_modelo_documento_template_preceptor_vertical_base_secure(
    p_template_key, p_modality, p_expected_revision, v_content - 'status', p_request_id
  );
end;
$function$;

revoke all on function public.save_modelo_documento_template_preceptor_vertical_base_secure(text, text, integer, jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.save_modelo_documento_template_secure(text, text, integer, jsonb, uuid)
  from public, anon;
grant execute on function public.save_modelo_documento_template_secure(text, text, integer, jsonb, uuid)
  to authenticated, service_role;

-- Reescreve a camada de mensagem em cima do emissor original, e não em cima
-- do wrapper anterior: assim um replay não acrescenta a mesma mensagem duas
-- vezes. A resposta final é gravada no ledger de idempotência.
create or replace function public.preparar_emissao_carteirinha_preceptor_secure(
  p_polo_id uuid,
  p_modo text,
  p_professor_ids uuid[],
  p_mensagem_personalizada text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_mode text := upper(btrim(coalesce(p_modo, '')));
  v_message text := nullif(btrim(regexp_replace(
    coalesce(p_mensagem_personalizada, ''), '[[:cntrl:]]+', ' ', 'g'
  )), '');
  v_response jsonb;
  v_documents jsonb := '[]'::jsonb;
  v_document jsonb;
  v_back_message text;
  v_issued_at timestamptz;
  v_emissao jsonb;
  v_is_vertical boolean;
begin
  if v_mode not in ('INDIVIDUAL', 'LOTE', 'PERSONALIZADO') then
    raise exception 'Modo de emissão inválido.' using errcode = '22023';
  end if;
  if char_length(coalesce(v_message, '')) > 1000 then
    raise exception 'A mensagem personalizada deve ter no máximo 1000 caracteres.' using errcode = '22023';
  end if;
  if v_mode = 'PERSONALIZADO' and v_message is null then
    raise exception 'Informe a mensagem complementar da emissão personalizada.' using errcode = '22023';
  end if;
  if v_mode <> 'PERSONALIZADO' then
    v_message := null;
  end if;

  v_response := public.preparar_emissao_carteirinha_preceptor_base_secure(
    p_polo_id, v_mode, p_professor_ids, v_message, p_idempotency_key
  );

  -- Replay de resposta final: não recalcula data, não toca no credential e
  -- não duplica a mensagem complementar.
  if not exists (
    select 1
    from jsonb_array_elements(coalesce(v_response -> 'documents', '[]'::jsonb)) as item(value)
    where item.value #>> '{render_payload,template,layoutVersion}' = 'CR80_VERTICAL_V1'
      and coalesce(item.value #>> '{render_payload,snapshot,emissao,dataIso}', '') = ''
  ) and (
    v_message is null or not exists (
      select 1
      from jsonb_array_elements(coalesce(v_response -> 'documents', '[]'::jsonb)) as item(value)
      where position(
        'Mensagem complementar: ' || v_message
        in coalesce(item.value #>> '{render_payload,rendered,back,message}', '')
      ) = 0
    )
  ) then
    return v_response;
  end if;

  for v_document in select value from jsonb_array_elements(coalesce(v_response -> 'documents', '[]'::jsonb)) as item(value)
  loop
    if v_message is not null
      and position(
        'Mensagem complementar: ' || v_message
        in coalesce(v_document #>> '{render_payload,rendered,back,message}', '')
      ) = 0 then
      v_back_message := concat_ws(
        E'\n\n',
        nullif(v_document #>> '{render_payload,rendered,back,message}', ''),
        'Mensagem complementar: ' || v_message
      );
      v_document := jsonb_set(
        v_document,
        '{render_payload,rendered,back,message}',
        to_jsonb(v_back_message),
        true
      );
    end if;

    v_is_vertical := v_document #>> '{render_payload,template,layoutVersion}' = 'CR80_VERTICAL_V1';
    if v_is_vertical then
      select coalesce(credential.ultima_emissao_em, credential.created_at)
      into v_issued_at
      from public.documentos_validacao_preceptores credential
      where credential.id = (v_document ->> 'emission_id')::uuid
      for update;
      if not found then
        raise exception 'A emissão do Crachá de Preceptor não foi encontrada.' using errcode = '55000';
      end if;

      v_emissao := jsonb_build_object(
        'dataIso', to_char(v_issued_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'dataExibicao', to_char(v_issued_at at time zone 'America/Maceio', 'DD/MM/YYYY')
      );
      v_document := jsonb_set(
        jsonb_set(
          v_document,
          '{render_payload,snapshot,emissao}',
          v_emissao,
          true
        ),
        '{render_payload,rendered,emissao}',
        v_emissao,
        true
      );
    end if;

    update public.documentos_validacao_preceptores credential
    set
      dados_emissao = jsonb_set(
        case when v_is_vertical then
          jsonb_set(coalesce(credential.dados_emissao, '{}'::jsonb), '{emissao}', v_emissao, true)
        else coalesce(credential.dados_emissao, '{}'::jsonb)
        end,
        '{renderedDocument}',
        coalesce(v_document #> '{render_payload,rendered}', '{}'::jsonb),
        true
      ),
      updated_at = now()
    where credential.id = (v_document ->> 'emission_id')::uuid;

    v_documents := v_documents || jsonb_build_array(v_document);
  end loop;

  v_response := jsonb_set(v_response, '{documents}', v_documents, true);
  -- O base grava a primeira resposta. Troca-a pelo payload final que será
  -- devolvido nos replays da mesma chave de idempotência.
  update public.secretaria_documentos_emissao_requisicoes request
  set resposta = v_response
  where request.request_id = p_idempotency_key
    and request.tipo = 'CARTEIRINHA_PRECEPTOR';
  return v_response;
end;
$function$;

revoke all on function public.preparar_emissao_carteirinha_preceptor_base_secure(uuid, text, uuid[], text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.preparar_emissao_carteirinha_preceptor_secure(uuid, text, uuid[], text, uuid)
  from public, anon;
grant execute on function public.preparar_emissao_carteirinha_preceptor_secure(uuid, text, uuid[], text, uuid)
  to authenticated, service_role;
