-- Corrige somente a geometria do rodapé legado no modelo atual da Pasta.
-- Snapshots já emitidos permanecem imutáveis e são tratados pelo compositor
-- vetorial com a mesma normalização determinística.

begin;

do $fix_pasta_identificacao_footer_geometry$
declare
  v_template jsonb;
  v_fields jsonb := '[]'::jsonb;
  v_field jsonb;
  v_changed boolean := false;
  v_footer_found boolean := false;
  v_footer_canonical boolean := false;
  v_version numeric;
  v_x numeric;
  v_y numeric;
  v_width numeric;
  v_height numeric;
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

      if v_x = 76
        and v_width = 642
        and v_y = 930
        and v_height = 100
      then
        v_footer_canonical := true;
      elsif v_x = 76
        and v_width = 642
        and v_y >= 1000
        and v_y < 1123
        and (
          not (v_field ? 'height')
          or jsonb_typeof(v_field -> 'height') = 'null'
          or v_height <= 0
        )
        and coalesce(v_field ->> 'value', '') like '%{{POLO_NOME}}%'
        and coalesce(v_field ->> 'value', '') like '%{{POLO_ENDERECO_COMPLETO}}%'
        and coalesce(v_field ->> 'value', '') like '%{{POLO_TELEFONE}}%'
        and coalesce(v_field ->> 'value', '') like '%{{POLO_EMAIL}}%'
      then
        v_field := v_field || jsonb_build_object(
          'y', 930,
          'height', 100
        );
        v_changed := true;
        v_footer_canonical := true;
      else
        raise exception 'A geometria de pasta_rodape mudou; hotfix seguro não aplicado.';
      end if;
    end if;

    v_fields := v_fields || jsonb_build_array(v_field);
  end loop;

  if not v_footer_found then
    -- Instalações que ainda conservam o template v3 inteiramente em
    -- textContent não possuem este campo absoluto e ficam fora deste hotfix.
    return;
  end if;
  if not v_footer_canonical then
    raise exception 'O campo pasta_rodape não alcançou a geometria canônica.';
  end if;

  if v_version < 13 then
    v_changed := true;
  end if;

  if v_changed then
    update public.documentos_templates as template
    set conteudo = jsonb_set(
      jsonb_set(v_template, '{absoluteFields}', v_fields, true),
      '{v}',
      to_jsonb(greatest(v_version, 13)),
      true
    ),
    updated_at = now()
    where template.id = 'pasta_identificacao_aluno';
  end if;
end;
$fix_pasta_identificacao_footer_geometry$;

commit;
