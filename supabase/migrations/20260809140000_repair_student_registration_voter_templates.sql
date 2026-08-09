-- Repara somente os blocos eleitorais dos modelos oficiais persistidos.
-- Coordenadas, estilos externos, campos customizados e snapshots históricos
-- permanecem imutáveis; a nova emissão continua congelada pela RPC canônica.

begin;

do $migration$
declare
  v_ficha_cadastral_block text := $html$
    <h4 style="font-size:14px;text-transform:uppercase;border-bottom:2px solid #cbd5e1;padding-bottom:6px;margin:0 0 10px;color:#0f172a;">Dados eleitorais</h4>
    <section style="display:grid;grid-template-columns:2fr .7fr .7fr 1fr .55fr;gap:12px;border:1px solid #e2e8f0;border-radius:14px;padding:12px;background:rgba(255,255,255,.70);margin-bottom:20px;font-size:12px;color:#334155;font-weight:400;">
      <div><strong style="display:block;margin-bottom:3px;font-size:10px;line-height:1.15;color:#0f172a;font-weight:800;text-transform:uppercase;letter-spacing:.07em;">Título</strong>{{ALUNO_TITULO_ELEITOR}}</div>
      <div><strong style="display:block;margin-bottom:3px;font-size:10px;line-height:1.15;color:#0f172a;font-weight:800;text-transform:uppercase;letter-spacing:.07em;">Zona</strong>{{ALUNO_TITULO_ZONA}}</div>
      <div><strong style="display:block;margin-bottom:3px;font-size:10px;line-height:1.15;color:#0f172a;font-weight:800;text-transform:uppercase;letter-spacing:.07em;">Seção</strong>{{ALUNO_TITULO_SECAO}}</div>
      <div><strong style="display:block;margin-bottom:3px;font-size:10px;line-height:1.15;color:#0f172a;font-weight:800;text-transform:uppercase;letter-spacing:.07em;">Emissão</strong>{{ALUNO_TITULO_EMISSAO}}</div>
      <div><strong style="display:block;margin-bottom:3px;font-size:10px;line-height:1.15;color:#0f172a;font-weight:800;text-transform:uppercase;letter-spacing:.07em;">UF</strong>{{ALUNO_TITULO_UF}}</div>
    </section>
$html$;
  v_documents_block text := $html$
  <section style="height:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:7px;background-color:rgba(255,255,255,.9);overflow:hidden;">
    <h4 style="margin:0;padding:4px 7px;border-bottom:1px solid #dbeafe;background-color:#eff6ff;color:#001a33;font-size:8px;line-height:1.1;text-transform:uppercase;letter-spacing:.08em;">Documentos</h4>
    <div style="height:calc(100% - 18px);box-sizing:border-box;display:grid;grid-template-columns:1.15fr 1.15fr .6fr .6fr 1fr 1fr;grid-template-rows:repeat(2,minmax(0,1fr));gap:5px 12px;padding:6px 8px;">
      <div style="grid-column:span 2;min-width:0;min-height:0;overflow:hidden;"><strong style="display:block;margin-bottom:3px;font-size:8px;line-height:1.15;color:#0f172a;font-weight:800;text-transform:uppercase;letter-spacing:.06em;">RG / Documento</strong><span style="display:-webkit-box;font-size:inherit;line-height:1.25;color:#334155;font-weight:400;overflow:hidden;overflow-wrap:anywhere;word-break:normal;-webkit-box-orient:vertical;-webkit-line-clamp:2;">{{ALUNO_RG}}</span></div>
      <div style="grid-column:span 2;min-width:0;min-height:0;overflow:hidden;"><strong style="display:block;margin-bottom:3px;font-size:8px;line-height:1.15;color:#0f172a;font-weight:800;text-transform:uppercase;letter-spacing:.06em;">Órgão expedidor / UF</strong><span style="display:-webkit-box;font-size:inherit;line-height:1.25;color:#334155;font-weight:400;overflow:hidden;overflow-wrap:anywhere;word-break:normal;-webkit-box-orient:vertical;-webkit-line-clamp:2;">{{ALUNO_RG_ORGAO}} / {{ALUNO_RG_UF}}</span></div>
      <div style="min-width:0;min-height:0;overflow:hidden;"><strong style="display:block;margin-bottom:3px;font-size:8px;line-height:1.15;color:#0f172a;font-weight:800;text-transform:uppercase;letter-spacing:.06em;">Data de expedição</strong><span style="display:-webkit-box;font-size:inherit;line-height:1.25;color:#334155;font-weight:400;overflow:hidden;overflow-wrap:anywhere;word-break:normal;-webkit-box-orient:vertical;-webkit-line-clamp:2;">{{ALUNO_RG_EMISSAO}}</span></div>
      <div style="min-width:0;min-height:0;overflow:hidden;"><strong style="display:block;margin-bottom:3px;font-size:8px;line-height:1.15;color:#0f172a;font-weight:800;text-transform:uppercase;letter-spacing:.06em;">CPF</strong><span style="display:-webkit-box;font-size:inherit;line-height:1.25;color:#334155;font-weight:400;overflow:hidden;overflow-wrap:anywhere;word-break:normal;-webkit-box-orient:vertical;-webkit-line-clamp:2;">{{ALUNO_CPF}}</span></div>
      <div style="grid-column:span 2;min-width:0;min-height:0;overflow:hidden;"><strong style="display:block;margin-bottom:3px;font-size:8px;line-height:1.15;color:#0f172a;font-weight:800;text-transform:uppercase;letter-spacing:.06em;">Título eleitoral</strong><span style="display:-webkit-box;font-size:inherit;line-height:1.25;color:#334155;font-weight:400;overflow:hidden;overflow-wrap:anywhere;word-break:normal;-webkit-box-orient:vertical;-webkit-line-clamp:2;">{{ALUNO_TITULO_ELEITOR}}</span></div>
      <div style="min-width:0;min-height:0;overflow:hidden;"><strong style="display:block;margin-bottom:3px;font-size:8px;line-height:1.15;color:#0f172a;font-weight:800;text-transform:uppercase;letter-spacing:.06em;">Zona</strong><span style="display:-webkit-box;font-size:inherit;line-height:1.25;color:#334155;font-weight:400;overflow:hidden;overflow-wrap:anywhere;word-break:normal;-webkit-box-orient:vertical;-webkit-line-clamp:2;">{{ALUNO_TITULO_ZONA}}</span></div>
      <div style="min-width:0;min-height:0;overflow:hidden;"><strong style="display:block;margin-bottom:3px;font-size:8px;line-height:1.15;color:#0f172a;font-weight:800;text-transform:uppercase;letter-spacing:.06em;">Seção</strong><span style="display:-webkit-box;font-size:inherit;line-height:1.25;color:#334155;font-weight:400;overflow:hidden;overflow-wrap:anywhere;word-break:normal;-webkit-box-orient:vertical;-webkit-line-clamp:2;">{{ALUNO_TITULO_SECAO}}</span></div>
      <div style="min-width:0;min-height:0;overflow:hidden;"><strong style="display:block;margin-bottom:3px;font-size:8px;line-height:1.15;color:#0f172a;font-weight:800;text-transform:uppercase;letter-spacing:.06em;">Emissão / UF</strong><span style="display:-webkit-box;font-size:inherit;line-height:1.25;color:#334155;font-weight:400;overflow:hidden;overflow-wrap:anywhere;word-break:normal;-webkit-box-orient:vertical;-webkit-line-clamp:2;">{{ALUNO_TITULO_EMISSAO}} / {{ALUNO_TITULO_UF}}</span></div>
      <div style="min-width:0;min-height:0;overflow:hidden;"><strong style="display:block;margin-bottom:3px;font-size:8px;line-height:1.15;color:#0f172a;font-weight:800;text-transform:uppercase;letter-spacing:.06em;">Reservista</strong><span style="display:-webkit-box;font-size:inherit;line-height:1.25;color:#334155;font-weight:400;overflow:hidden;overflow-wrap:anywhere;word-break:normal;-webkit-box-orient:vertical;-webkit-line-clamp:2;">{{ALUNO_RESERVISTA}}</span></div>
    </div>
  </section>
$html$;
  v_ficha_cadastral jsonb;
  v_pasta_identificacao jsonb;
  v_ficha_cadastral_text text;
  v_existing_voter_block text;
  v_missing_voter_fields text;
  v_repaired_html text;
  v_before_injection text;
  v_current_html text;
  v_fields jsonb;
  v_field jsonb;
  v_marker text := '<section style="border-top:2px dashed #0f172a;';
  v_default_field jsonb;
  v_model record;
  v_ficha_field_template text := '<div data-system-voter-field="%s"><strong style="display:block;margin-bottom:3px;font-size:10px;line-height:1.15;color:#0f172a;font-weight:800;text-transform:uppercase;letter-spacing:.07em;">%s</strong>%s</div>';
  v_document_field_template text := '<div style="%smin-width:0;min-height:0;overflow:hidden;" data-system-voter-field="%s"><strong style="display:block;margin-bottom:3px;font-size:8px;line-height:1.15;color:#0f172a;font-weight:800;text-transform:uppercase;letter-spacing:.06em;">%s</strong><span style="display:-webkit-box;font-size:inherit;line-height:1.25;color:#334155;font-weight:400;overflow:hidden;overflow-wrap:anywhere;word-break:normal;-webkit-box-orient:vertical;-webkit-line-clamp:2;">%s</span></div>';
begin
  select template.conteudo
  into v_ficha_cadastral
  from public.documentos_templates as template
  where template.id = 'ficha_cadastral_aluno'
  for update;

  if found and jsonb_typeof(v_ficha_cadastral) = 'object' then
    v_ficha_cadastral_text := coalesce(v_ficha_cadastral ->> 'textContent', '');
    v_existing_voter_block := substring(
      v_ficha_cadastral_text
      from '(?is)\s*<h4[^>]*>\s*Dados eleitorais\s*</h4>\s*<section[^>]*>.*?</section>'
    );

    if v_existing_voter_block is not null then
      v_missing_voter_fields := concat(
        case when v_existing_voter_block not like '%{{ALUNO_TITULO_ELEITOR}}%'
          then format(v_ficha_field_template, '{{ALUNO_TITULO_ELEITOR}}', 'Título', '{{ALUNO_TITULO_ELEITOR}}') else '' end,
        case when v_existing_voter_block not like '%{{ALUNO_TITULO_ZONA}}%'
          then format(v_ficha_field_template, '{{ALUNO_TITULO_ZONA}}', 'Zona', '{{ALUNO_TITULO_ZONA}}') else '' end,
        case when v_existing_voter_block not like '%{{ALUNO_TITULO_SECAO}}%'
          then format(v_ficha_field_template, '{{ALUNO_TITULO_SECAO}}', 'Seção', '{{ALUNO_TITULO_SECAO}}') else '' end,
        case when v_existing_voter_block not like '%{{ALUNO_TITULO_EMISSAO}}%'
          then format(v_ficha_field_template, '{{ALUNO_TITULO_EMISSAO}}', 'Emissão', '{{ALUNO_TITULO_EMISSAO}}') else '' end,
        case when v_existing_voter_block not like '%{{ALUNO_TITULO_UF}}%'
          then format(v_ficha_field_template, '{{ALUNO_TITULO_UF}}', 'UF', '{{ALUNO_TITULO_UF}}') else '' end
      );

      if v_missing_voter_fields <> '' then
        v_repaired_html := regexp_replace(
          v_existing_voter_block,
          '(?is)(</section>\s*)$',
          v_missing_voter_fields || E'\n\\1'
        );
        if v_repaired_html = v_existing_voter_block then
          v_repaired_html := v_existing_voter_block || E'\n' || v_missing_voter_fields;
        end if;
        v_ficha_cadastral_text := replace(
          v_ficha_cadastral_text,
          v_existing_voter_block,
          v_repaired_html
        );
      end if;
    else
      if strpos(v_ficha_cadastral_text, v_marker) > 0 then
        v_ficha_cadastral_text := overlay(
          v_ficha_cadastral_text placing v_ficha_cadastral_block || E'\n    '
          from strpos(v_ficha_cadastral_text, v_marker) for 0
        );
      else
        v_ficha_cadastral_text := v_ficha_cadastral_text || E'\n' || v_ficha_cadastral_block;
      end if;
    end if;

    update public.documentos_templates as template
    set conteudo = jsonb_set(
      jsonb_set(v_ficha_cadastral, '{textContent}', to_jsonb(v_ficha_cadastral_text), true),
      '{v}',
      to_jsonb(greatest(
        case
          when jsonb_typeof(v_ficha_cadastral -> 'v') = 'number'
            or btrim(coalesce(v_ficha_cadastral ->> 'v', '')) ~ '^[0-9]+([.][0-9]+)?$'
            then btrim(v_ficha_cadastral ->> 'v')::numeric
          else 0
        end,
        5
      )),
      true
    ),
    updated_at = now()
    where template.id = 'ficha_cadastral_aluno'
      and (
        case
          when jsonb_typeof(template.conteudo -> 'v') = 'number'
            or btrim(coalesce(template.conteudo ->> 'v', '')) ~ '^[0-9]+([.][0-9]+)?$'
            then btrim(template.conteudo ->> 'v')::numeric
          else 0
        end < 5
        or template.conteudo ->> 'textContent' is distinct from v_ficha_cadastral_text
      );
  end if;

  v_default_field := jsonb_build_object(
    'id', 'pasta_documentos',
    'type', 'text',
    'value', v_documents_block,
    'x', 76,
    'y', 690,
    'width', 642,
    'height', 92,
    'style', jsonb_build_object(
      'color', '#0f172a',
      'fontFamily', '"Times New Roman", Times, serif',
      'fontSize', '10px',
      'textAlign', 'left',
      'boxSizing', 'border-box',
      'padding', 0,
      'zIndex', 30
    )
  );

  select template.conteudo
  into v_pasta_identificacao
  from public.documentos_templates as template
  where template.id = 'pasta_identificacao_aluno'
  for update;

  if found and jsonb_typeof(v_pasta_identificacao) = 'object' then
    v_fields := '[]'::jsonb;
    for v_field in
      select field.value
      from jsonb_array_elements(
        case
          when jsonb_typeof(v_pasta_identificacao -> 'absoluteFields') = 'array'
            then v_pasta_identificacao -> 'absoluteFields'
          else '[]'::jsonb
        end
      ) as field(value)
    loop
      if v_field ->> 'id' = 'pasta_documentos' then
        v_current_html := coalesce(v_field ->> 'value', '');
        v_missing_voter_fields := concat(
          case when v_current_html not like '%{{ALUNO_TITULO_ELEITOR}}%'
            then format(v_document_field_template, 'grid-column:span 2;', '{{ALUNO_TITULO_ELEITOR}}', 'Título eleitoral', '{{ALUNO_TITULO_ELEITOR}}') else '' end,
          case when v_current_html not like '%{{ALUNO_TITULO_ZONA}}%'
            then format(v_document_field_template, '', '{{ALUNO_TITULO_ZONA}}', 'Zona', '{{ALUNO_TITULO_ZONA}}') else '' end,
          case when v_current_html not like '%{{ALUNO_TITULO_SECAO}}%'
            then format(v_document_field_template, '', '{{ALUNO_TITULO_SECAO}}', 'Seção', '{{ALUNO_TITULO_SECAO}}') else '' end,
          case when v_current_html not like '%{{ALUNO_TITULO_EMISSAO}}%'
            then format(v_document_field_template, '', '{{ALUNO_TITULO_EMISSAO}}', 'Emissão', '{{ALUNO_TITULO_EMISSAO}}') else '' end,
          case when v_current_html not like '%{{ALUNO_TITULO_UF}}%'
            then format(v_document_field_template, '', '{{ALUNO_TITULO_UF}}', 'UF', '{{ALUNO_TITULO_UF}}') else '' end
        );

        if v_missing_voter_fields <> '' then
          v_repaired_html := regexp_replace(
            v_current_html,
            '(?is)(</div>\s*</section>\s*)$',
            v_missing_voter_fields || E'\n\\1'
          );
          if v_repaired_html = v_current_html then
            v_repaired_html := regexp_replace(
              v_current_html,
              '(?is)(</section>\s*)$',
              v_missing_voter_fields || E'\n\\1'
            );
          end if;
          if v_repaired_html = v_current_html then
            v_repaired_html := v_current_html || E'\n' || v_missing_voter_fields;
          end if;
          v_field := v_field || jsonb_build_object('value', v_repaired_html);
        end if;
      end if;
      v_fields := v_fields || jsonb_build_array(v_field);
    end loop;

    if not exists (
      select 1
      from jsonb_array_elements(v_fields) as field(value)
      where field.value ->> 'id' = 'pasta_documentos'
    ) then
      v_fields := v_fields || jsonb_build_array(v_default_field);
    end if;

    update public.documentos_templates as template
    set conteudo = jsonb_set(
      jsonb_set(v_pasta_identificacao, '{absoluteFields}', v_fields, true),
      '{v}',
      to_jsonb(greatest(
        case
          when jsonb_typeof(v_pasta_identificacao -> 'v') = 'number'
            or btrim(coalesce(v_pasta_identificacao ->> 'v', '')) ~ '^[0-9]+([.][0-9]+)?$'
            then btrim(v_pasta_identificacao ->> 'v')::numeric
          else 0
        end,
        12
      )),
      true
    ),
    updated_at = now()
    where template.id = 'pasta_identificacao_aluno'
      and (
        case
          when jsonb_typeof(v_pasta_identificacao -> 'v') = 'number'
            or btrim(coalesce(v_pasta_identificacao ->> 'v', '')) ~ '^[0-9]+([.][0-9]+)?$'
            then btrim(v_pasta_identificacao ->> 'v')::numeric
          else 0
        end < 12
        or v_fields is distinct from coalesce(v_pasta_identificacao -> 'absoluteFields', '[]'::jsonb)
      );
  end if;

  v_default_field := jsonb_set(v_default_field, '{id}', '"ficha_documentos"'::jsonb);
  v_default_field := jsonb_set(v_default_field, '{y}', '622'::jsonb);

  for v_model in
    select model.id, coalesce(model.template_config, '{}'::jsonb) as template_config
    from public.modelos_fichas as model
    where case
        when jsonb_typeof(model.template_config -> 'v') = 'number'
          or btrim(coalesce(model.template_config ->> 'v', '')) ~ '^[0-9]+([.][0-9]+)?$'
          then btrim(model.template_config ->> 'v')::numeric
        else 0
      end < 12
      or not exists (
        select 1
        from jsonb_array_elements(
          case
            when jsonb_typeof(model.template_config -> 'absoluteFields') = 'array'
              then model.template_config -> 'absoluteFields'
            else '[]'::jsonb
          end
        ) as required_field(value)
        where required_field.value ->> 'id' = 'ficha_documentos'
          and coalesce(required_field.value ->> 'value', '') like '%{{ALUNO_TITULO_ELEITOR}}%'
          and coalesce(required_field.value ->> 'value', '') like '%{{ALUNO_TITULO_ZONA}}%'
          and coalesce(required_field.value ->> 'value', '') like '%{{ALUNO_TITULO_SECAO}}%'
          and coalesce(required_field.value ->> 'value', '') like '%{{ALUNO_TITULO_EMISSAO}}%'
          and coalesce(required_field.value ->> 'value', '') like '%{{ALUNO_TITULO_UF}}%'
      )
    for update
  loop
    v_fields := '[]'::jsonb;
    for v_field in
      select field.value
      from jsonb_array_elements(
        case
          when jsonb_typeof(v_model.template_config -> 'absoluteFields') = 'array'
            then v_model.template_config -> 'absoluteFields'
          else '[]'::jsonb
        end
      ) as field(value)
    loop
      if v_field ->> 'id' = 'ficha_documentos' then
        v_current_html := coalesce(v_field ->> 'value', '');
        v_repaired_html := regexp_replace(
          v_current_html,
          '(?i)(grid-template-columns\s*:\s*)[^;]+',
          E'\\1' || '1.15fr 1.15fr .6fr .6fr 1fr 1fr'
        );
        v_repaired_html := regexp_replace(
          v_repaired_html,
          '(?i)(grid-template-rows\s*:\s*)[^;]+',
          E'\\1repeat(2,minmax(0,1fr))'
        );
        v_missing_voter_fields := concat(
          case when v_current_html not like '%{{ALUNO_TITULO_ELEITOR}}%'
            then format(v_document_field_template, 'grid-column:span 2;', '{{ALUNO_TITULO_ELEITOR}}', 'Título eleitoral', '{{ALUNO_TITULO_ELEITOR}}') else '' end,
          case when v_current_html not like '%{{ALUNO_TITULO_ZONA}}%'
            then format(v_document_field_template, '', '{{ALUNO_TITULO_ZONA}}', 'Zona', '{{ALUNO_TITULO_ZONA}}') else '' end,
          case when v_current_html not like '%{{ALUNO_TITULO_SECAO}}%'
            then format(v_document_field_template, '', '{{ALUNO_TITULO_SECAO}}', 'Seção', '{{ALUNO_TITULO_SECAO}}') else '' end,
          case when v_current_html not like '%{{ALUNO_TITULO_EMISSAO}}%'
              and v_current_html not like '%{{ALUNO_TITULO_UF}}%'
            then format(v_document_field_template, 'grid-column:span 2;', 'titulo_eleitor_emissao_uf', 'Emissão / UF', '{{ALUNO_TITULO_EMISSAO}} / {{ALUNO_TITULO_UF}}') else '' end,
          case when v_current_html not like '%{{ALUNO_TITULO_EMISSAO}}%'
              and v_current_html like '%{{ALUNO_TITULO_UF}}%'
            then format(v_document_field_template, '', '{{ALUNO_TITULO_EMISSAO}}', 'Emissão', '{{ALUNO_TITULO_EMISSAO}}') else '' end,
          case when v_current_html not like '%{{ALUNO_TITULO_UF}}%'
              and v_current_html like '%{{ALUNO_TITULO_EMISSAO}}%'
            then format(v_document_field_template, '', '{{ALUNO_TITULO_UF}}', 'UF', '{{ALUNO_TITULO_UF}}') else '' end
        );

        if v_missing_voter_fields <> '' then
          v_before_injection := v_repaired_html;
          v_repaired_html := regexp_replace(
            v_before_injection,
            '(?is)(</div>\s*</section>\s*)$',
            v_missing_voter_fields || E'\n\\1'
          );
          if v_repaired_html = v_before_injection then
            v_repaired_html := regexp_replace(
              v_before_injection,
              '(?is)(</section>\s*)$',
              v_missing_voter_fields || E'\n\\1'
            );
          end if;
          if v_repaired_html = v_before_injection then
            v_repaired_html := v_before_injection || E'\n' || v_missing_voter_fields;
          end if;
        end if;
        if v_repaired_html is distinct from v_current_html then
          v_field := v_field || jsonb_build_object('value', v_repaired_html);
        end if;
      end if;
      v_fields := v_fields || jsonb_build_array(v_field);
    end loop;

    if not exists (
      select 1
      from jsonb_array_elements(v_fields) as field(value)
      where field.value ->> 'id' = 'ficha_documentos'
    ) then
      v_fields := v_fields || jsonb_build_array(v_default_field);
    end if;

    update public.modelos_fichas as model
    set template_config = jsonb_set(
      jsonb_set(v_model.template_config, '{absoluteFields}', v_fields, true),
      '{v}',
      to_jsonb(greatest(
        case
          when jsonb_typeof(v_model.template_config -> 'v') = 'number'
            or btrim(coalesce(v_model.template_config ->> 'v', '')) ~ '^[0-9]+([.][0-9]+)?$'
            then btrim(v_model.template_config ->> 'v')::numeric
          else 0
        end,
        12
      )),
      true
    ),
    updated_at = now()
    where model.id = v_model.id;
  end loop;
end;
$migration$;

commit;
