update public.cursos c
set ead_config = jsonb_set(
  coalesce(c.ead_config, '{}'::jsonb),
  '{conteudos}',
  (
    select jsonb_agg(
      case
        when ord = 1 then item || jsonb_build_object('videoUrl', c.ead_config->>'videoUrl')
        else item - 'videoUrl'
      end
      order by ord
    )
    from jsonb_array_elements(coalesce(c.ead_config->'conteudos', '[]'::jsonb)) with ordinality as content(item, ord)
  ),
  true
)
where c.modalidade = 'EAD'
  and coalesce(c.ead_config->>'videoUrl', '') <> ''
  and jsonb_array_length(coalesce(c.ead_config->'conteudos', '[]'::jsonb)) > 0;
