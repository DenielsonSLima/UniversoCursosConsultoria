-- Student PDF rendering needs one configured model, not access to the template registry.
-- Keep documentos_templates RLS and all academic/document snapshots unchanged.
create function internal_academic.get_aluno_ead_certificate_model(p_certificado_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_aluno_id uuid;
  v_configured_id text;
  v_templates jsonb;
  v_model jsonb;
begin
  if auth.uid() is null then
    raise exception 'Acesso ao modelo do certificado não autorizado.' using errcode = '42501';
  end if;
  v_aluno_id := public.current_aluno_id();
  if v_aluno_id is null then
    raise exception 'Acesso ao modelo do certificado não autorizado.' using errcode = '42501';
  end if;

  select nullif(btrim(course.ead_config #>> '{certificacao,modeloDocumento}'), '')
    into v_configured_id
  from public.certificados_academicos certificate
  join public.cursos course on course.id = certificate.curso_id
  where certificate.id = p_certificado_id
    and certificate.aluno_id = v_aluno_id
    and certificate.modalidade = 'EAD'
    and certificate.status = 'FINALIZADO'
    and nullif(btrim(certificate.codigo_validacao), '') is not null;

  if not found then
    -- Do not reveal whether an inaccessible certificate exists.
    raise exception 'Acesso ao modelo do certificado não autorizado.' using errcode = '42501';
  end if;

  select template.conteudo into v_templates
  from public.documentos_templates template
  where template.id = 'diplomas';

  if jsonb_typeof(v_templates) is distinct from 'array' then
    raise exception 'O modelo de certificado EAD não está disponível.' using errcode = 'P0002';
  end if;

  select item.model into v_model
  from jsonb_array_elements(v_templates) with ordinality item(model, position)
  where jsonb_typeof(item.model) = 'object'
    and (v_configured_id is null or item.model ->> 'id' = v_configured_id)
    and (
      upper(coalesce(item.model ->> 'modalidade', '')) = 'EAD'
      or coalesce(item.model ->> 'tipoCurso', '') ~* '(^|[^a-z])ead([^a-z]|$)'
    )
  order by item.position
  limit 1;

  if v_model is null then
    raise exception 'O modelo de certificado EAD não está disponível.' using errcode = 'P0002';
  end if;
  return v_model;
end;
$function$;

revoke all on function internal_academic.get_aluno_ead_certificate_model(uuid)
  from public, anon, authenticated, service_role;
grant execute on function internal_academic.get_aluno_ead_certificate_model(uuid) to authenticated;

create function public.get_aluno_ead_certificate_model(p_certificado_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select internal_academic.get_aluno_ead_certificate_model(p_certificado_id);
$function$;

revoke all on function public.get_aluno_ead_certificate_model(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_aluno_ead_certificate_model(uuid) to authenticated;

comment on function public.get_aluno_ead_certificate_model(uuid) is
  'Leitura do único modelo EAD configurado para certificado finalizado do próprio aluno ativo; sem escrita nem acesso ao registro completo de modelos.';
