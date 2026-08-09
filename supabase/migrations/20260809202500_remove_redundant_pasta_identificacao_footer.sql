-- Remove do modelo atual da Pasta o rodapé institucional que repete o
-- cabeçalho canônico. Snapshots emitidos permanecem imutáveis; o frontend
-- elimina somente a mesma assinatura legada na cópia usada para renderização.

begin;

do $remove_redundant_pasta_identificacao_footer$
declare
  v_template jsonb;
  v_fields jsonb := '[]'::jsonb;
  v_field jsonb;
  v_footer_found boolean := false;
  v_version numeric;
  v_x numeric;
  v_y numeric;
  v_width numeric;
  v_height numeric;
  v_known_geometry boolean;
begin
  select template.conteudo
  into v_template
  from public.documentos_templates as template
  where template.id = 'pasta_identificacao_aluno'
  for update;

  if not found then
    raise exception 'O modelo geral da Pasta de Identificação não foi encontrado.';
  end if;
  if jsonb_typeof(v_template) <> 'object'
    or jsonb_typeof(v_template -> 'absoluteFields') <> 'array'
  then
    raise exception 'O modelo geral da Pasta de Identificação possui estrutura inválida.';
  end if;

  v_version := case
    when jsonb_typeof(v_template -> 'v') = 'number'
      or btrim(coalesce(v_template ->> 'v', '')) ~ '^[0-9]+([.][0-9]+)?$'
      then btrim(v_template ->> 'v')::numeric
    else 0
  end;

  for v_field in
    select field.value
    from jsonb_array_elements(v_template -> 'absoluteFields') as field(value)
  loop
    if v_field ->> 'id' = 'pasta_rodape' then
      if v_footer_found then
        raise exception 'O modelo geral da Pasta possui mais de um campo pasta_rodape.';
      end if;
      v_footer_found := true;

      v_x := case
        when coalesce(v_field ->> 'x', '') ~ '^-?[0-9]+([.][0-9]+)?$'
          then (v_field ->> 'x')::numeric
        else null
      end;
      v_y := case
        when coalesce(v_field ->> 'y', '') ~ '^-?[0-9]+([.][0-9]+)?$'
          then (v_field ->> 'y')::numeric
        else null
      end;
      v_width := case
        when coalesce(v_field ->> 'width', '') ~ '^-?[0-9]+([.][0-9]+)?$'
          then (v_field ->> 'width')::numeric
        else null
      end;
      v_height := case
        when coalesce(v_field ->> 'height', '') ~ '^-?[0-9]+([.][0-9]+)?$'
          then (v_field ->> 'height')::numeric
        else null
      end;

      v_known_geometry := v_x = 76
        and v_width = 642
        and (
          (v_y = 930 and v_height = 100)
          or (
            v_y >= 1000
            and v_y < 1123
            and (
              not (v_field ? 'height')
              or jsonb_typeof(v_field -> 'height') = 'null'
              or v_height <= 0
            )
          )
        );

      if v_known_geometry is not true
        or coalesce(v_field ->> 'value', '') not like '%{{POLO_NOME}}%'
        or coalesce(v_field ->> 'value', '') not like '%{{POLO_CNPJ}}%'
        or coalesce(v_field ->> 'value', '') not like '%{{POLO_ENDERECO_COMPLETO}}%'
        or coalesce(v_field ->> 'value', '') not like '%{{POLO_TELEFONE}}%'
        or coalesce(v_field ->> 'value', '') not like '%{{POLO_EMAIL}}%'
      then
        raise exception 'O campo pasta_rodape não corresponde ao rodapé institucional redundante conhecido.';
      end if;

      -- O campo reconhecido não é copiado para v_fields.
      continue;
    end if;

    v_fields := v_fields || jsonb_build_array(v_field);
  end loop;

  if not v_footer_found then
    -- Instalações antigas sem campo absoluto ficam fora deste hotfix. Em uma
    -- repetição após sucesso, o modelo já está em v14 e também não muda.
    return;
  end if;

  update public.documentos_templates as template
  set conteudo = jsonb_set(
    jsonb_set(v_template, '{absoluteFields}', v_fields, true),
    '{v}',
    to_jsonb(greatest(v_version, 14)),
    true
  ),
  updated_at = now()
  where template.id = 'pasta_identificacao_aluno';
end;
$remove_redundant_pasta_identificacao_footer$;

commit;
