CREATE OR REPLACE FUNCTION internal_proesc.person_document_hash(p_person_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_document text;
begin
  select regexp_replace(coalesce(cpf_cnpj,''),'[^0-9]','','g') into strict v_document
  from public.parceiros where id=p_person_id;
  if v_document !~ '^[0-9]{11}$' then
    raise exception 'CPF canônico de onze dígitos obrigatório para vincular a origem.' using errcode='22023'; end if;
  return encode(extensions.digest(v_document,'sha256'),'hex');
end;
$function$
;

