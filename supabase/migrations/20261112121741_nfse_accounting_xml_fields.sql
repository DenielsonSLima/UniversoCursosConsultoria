-- Read-only fiscal projection. Never replaces missing XML values with estimates.
BEGIN;
CREATE FUNCTION private.nfse_accounting_xml_fields(p_xml text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $function$
DECLARE v_fields jsonb; v_xml xml;
BEGIN
  IF octet_length(p_xml)>4500000 OR strpos(upper(p_xml),'<!DOCTYPE')>0
    OR strpos(upper(p_xml),'<!ENTITY')>0 THEN RETURN NULL; END IF;
  v_xml:=xmlparse(DOCUMENT p_xml);
  IF cardinality(xpath('/nf:NFSe/nf:infNFSe',v_xml,
    ARRAY[ARRAY['nf','http://www.sped.fazenda.gov.br/nfse']]))<>1 THEN RETURN NULL; END IF;
  SELECT to_jsonb(f) INTO v_fields FROM XMLTABLE(
    XMLNAMESPACES('http://www.sped.fazenda.gov.br/nfse' AS nf),
    '/nf:NFSe/nf:infNFSe' PASSING v_xml COLUMNS
    "recipientName" text PATH 'nf:DPS/nf:infDPS/nf:toma/nf:xNome',
    "recipientDocument" text PATH 'nf:DPS/nf:infDPS/nf:toma/nf:CNPJ | nf:DPS/nf:infDPS/nf:toma/nf:CPF',
    "competenceDate" text PATH 'nf:DPS/nf:infDPS/nf:dCompet',
    "nationalServiceCode" text PATH 'nf:DPS/nf:infDPS/nf:serv/nf:cServ/nf:cTribNac',
    "nbsCode" text PATH 'nf:DPS/nf:infDPS/nf:serv/nf:cServ/nf:cNBS',
    "amount" text PATH 'nf:DPS/nf:infDPS/nf:valores/nf:vServPrest/nf:vServ',
    "issAmount" text PATH 'nf:valores/nf:vISSQN',
    "issRetention" text PATH 'nf:DPS/nf:infDPS/nf:valores/nf:trib/nf:tribMun/nf:tpRetISSQN'
  ) f;
  RETURN v_fields;
EXCEPTION WHEN invalid_xml_document OR invalid_xml_content THEN RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION private.nfse_accounting_xml_fields(text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
