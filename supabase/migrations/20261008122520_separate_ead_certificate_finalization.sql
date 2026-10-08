BEGIN;

-- Somente EAD dispensa o registro técnico. Outras modalidades mantêm o delegado.
CREATE OR REPLACE FUNCTION public.finalizar_certificado_academico(p_certificado_id uuid, p_certificado_numero text DEFAULT NULL::text, p_pagina_livro text DEFAULT NULL::text, p_livro_registro text DEFAULT NULL::text, p_validacao_sistec text DEFAULT NULL::text, p_ensino_medio_estabelecimento text DEFAULT NULL::text, p_ensino_medio_localidade_uf text DEFAULT NULL::text, p_ensino_medio_ano_conclusao text DEFAULT NULL::text, p_emitido_por uuid DEFAULT NULL::uuid)
 RETURNS public.certificados_academicos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_polo_id uuid;
  v_modalidade text;
  v_documento text;
  v_matricula_id uuid;
begin
  select ca.polo_id, ca.modalidade, ca.matricula_id
  into v_polo_id, v_modalidade, v_matricula_id
  from public.certificados_academicos ca where ca.id = p_certificado_id;
  v_documento := case upper(coalesce(v_modalidade, ''))
    when 'TECNICO' then 'certificado_tecnico'
    when 'EAD' then 'certificado_ead'
    when 'LIVRE' then 'certificado_livre'
    else 'certificado_especializacao'
  end;
  if not public.can_manage_secretaria_document(v_documento, v_polo_id) then
    raise exception 'Acesso à emissão de certificados não autorizado.' using errcode = '42501';
  end if;
  if v_modalidade = 'EAD' then
    return internal_academic.ead_emitir_certificado_automatico(v_matricula_id);
  end if;
  return internal_academic.p1_finalizar_certificado_academico_20260719(
    p_certificado_id, p_certificado_numero, p_pagina_livro, p_livro_registro,
    p_validacao_sistec, p_ensino_medio_estabelecimento,
    p_ensino_medio_localidade_uf, p_ensino_medio_ano_conclusao, p_emitido_por
  );
end;
$function$;

COMMIT;
