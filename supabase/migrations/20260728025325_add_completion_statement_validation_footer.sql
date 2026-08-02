with footer_fields as (
  select jsonb_build_array(
    jsonb_build_object(
      'id', 'atestado_footer_valid_until',
      'type', 'text',
      'value', 'ESTE DOCUMENTO É VÁLIDO ATÉ <span style="color: #ef4444">{{VALIDADE_DATA}}</span>.',
      'x', 50,
      'y', 975,
      'width', 694,
      'style', jsonb_build_object(
        'textAlign', 'center',
        'fontSize', '9px',
        'color', '#000000',
        'fontWeight', 'bold',
        'textTransform', 'uppercase'
      )
    ),
    jsonb_build_object(
      'id', 'atestado_footer_url',
      'type', 'text',
      'value', 'PARA VERIFICAR A AUTENTICIDADE DESTE DOCUMENTO ACESSE: <span style="color: #ef4444">WWW.UNIVERSOCC.COM.BR/VALIDADOR</span>',
      'x', 50,
      'y', 995,
      'width', 694,
      'style', jsonb_build_object(
        'textAlign', 'center',
        'fontSize', '9px',
        'color', '#000000',
        'fontWeight', 'bold',
        'textTransform', 'uppercase'
      )
    ),
    jsonb_build_object(
      'id', 'atestado_footer_validity',
      'type', 'text',
      'value', 'VALIDADE DESTE DOCUMENTO: <span style="color: #ef4444">{{VALIDADE_DIAS}} DIAS A PARTIR DA DATA DE EMISSÃO</span>.',
      'x', 50,
      'y', 1015,
      'width', 694,
      'style', jsonb_build_object(
        'textAlign', 'center',
        'fontSize', '9px',
        'color', '#000000',
        'fontWeight', 'bold',
        'textTransform', 'uppercase'
      )
    ),
    jsonb_build_object(
      'id', 'atestado_footer_generation',
      'type', 'text',
      'value', 'DOCUMENTO GERADO EM: {{DATA_GERACAO}}',
      'x', 50,
      'y', 1035,
      'width', 694,
      'style', jsonb_build_object(
        'textAlign', 'center',
        'fontSize', '8px',
        'color', '#94a3b8',
        'textTransform', 'uppercase'
      )
    )
  ) as fields
)
update public.documentos_templates as template
set conteudo = jsonb_set(
      jsonb_set(
        template.conteudo,
        '{absoluteFields}',
        coalesce(template.conteudo->'absoluteFields', '[]'::jsonb) || footer.fields,
        true
      ),
      '{v}',
      '2'::jsonb,
      true
    ),
    updated_at = now()
from footer_fields as footer
where template.id like 'atestado_conclusao_tecnico%'
  and not exists (
    select 1
    from jsonb_array_elements(
      coalesce(template.conteudo->'absoluteFields', '[]'::jsonb)
    ) as field
    where field->>'id' = 'atestado_footer_valid_until'
  );
