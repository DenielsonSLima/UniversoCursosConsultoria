BEGIN;

CREATE FUNCTION private.validate_nfse_preset_address(p_value jsonb,p_brazil boolean)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_key text;
BEGIN
  PERFORM private.nfse_preset_object(p_value,ARRAY['postalCode','street','number','complement','district','city','stateProvince']);
  PERFORM private.nfse_preset_text(p_value->'street',255,false);
  PERFORM private.nfse_preset_text(p_value->'number',60,false);
  PERFORM private.nfse_preset_text(p_value->'complement',156);
  PERFORM private.nfse_preset_text(p_value->'district',60,false);
  IF p_brazil THEN
    PERFORM private.nfse_preset_code(p_value->'postalCode','^[0-9]{8}$');
    IF p_value->'city'<>'null'::jsonb OR p_value->'stateProvince'<>'null'::jsonb THEN
      RAISE EXCEPTION 'Endereço nacional não armazena cidade/região do exterior.' USING ERRCODE='22023'; END IF;
  ELSE
    PERFORM private.nfse_preset_text(p_value->'postalCode',11,false);
    FOREACH v_key IN ARRAY ARRAY['city','stateProvince'] LOOP
      PERFORM private.nfse_preset_text(p_value->v_key,60,false); END LOOP;
  END IF;
END;
$function$;

CREATE FUNCTION private.validate_nfse_preset_construction(p_value jsonb,p_brazil boolean)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_ident jsonb; v_kind text;
BEGIN
  PERFORM private.nfse_preset_object(p_value,ARRAY['propertyTaxRegistration','identification']);
  PERFORM private.nfse_preset_text(p_value->'propertyTaxRegistration',30);
  v_ident:=p_value->'identification';
  PERFORM private.nfse_preset_object(v_ident,ARRAY['kind','workCode','cib','address']);
  v_kind:=private.nfse_preset_choice(v_ident->'kind',ARRAY['WORK_CODE','CIB','ADDRESS']);
  IF v_kind='WORK_CODE' THEN PERFORM private.nfse_preset_text(v_ident->'workCode',30,false);
  ELSIF v_ident->'workCode'<>'null'::jsonb THEN
    RAISE EXCEPTION 'Código de obra inativo deve permanecer vazio.' USING ERRCODE='22023'; END IF;
  IF v_kind='CIB' THEN
    IF length(private.nfse_preset_text(v_ident->'cib',8,false))<>8 THEN
      RAISE EXCEPTION 'CIB deve possuir oito posições.' USING ERRCODE='22023'; END IF;
  ELSIF v_ident->'cib'<>'null'::jsonb THEN
    RAISE EXCEPTION 'CIB inativo deve permanecer vazio.' USING ERRCODE='22023'; END IF;
  IF v_kind='ADDRESS' THEN PERFORM private.validate_nfse_preset_address(v_ident->'address',p_brazil);
  ELSIF v_ident->'address'<>'null'::jsonb THEN
    RAISE EXCEPTION 'Endereço de obra inativo deve permanecer vazio.' USING ERRCODE='22023'; END IF;
  IF NOT p_brazil AND v_kind<>'ADDRESS' THEN
    RAISE EXCEPTION 'Obra no exterior exige endereço.' USING ERRCODE='22023'; END IF;
END;
$function$;

CREATE FUNCTION private.validate_nfse_preset_property_unit(p_value jsonb,p_brazil boolean)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_ident jsonb; v_kind text;
BEGIN
  PERFORM private.nfse_preset_object(p_value,ARRAY['unitKey','propertyTaxRegistration','identification']);
  PERFORM private.nfse_preset_code(p_value->'unitKey','^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$');
  PERFORM private.nfse_preset_text(p_value->'propertyTaxRegistration',30);
  v_ident:=p_value->'identification';
  PERFORM private.nfse_preset_object(v_ident,ARRAY['kind','cib','address']);
  v_kind:=private.nfse_preset_choice(v_ident->'kind',ARRAY['CIB','ADDRESS']);
  IF v_kind='CIB' THEN
    IF length(private.nfse_preset_text(v_ident->'cib',8,false))<>8 OR v_ident->'address'<>'null'::jsonb THEN
      RAISE EXCEPTION 'Identificação CIB do imóvel inválida.' USING ERRCODE='22023'; END IF;
  ELSE
    IF v_ident->'cib'<>'null'::jsonb THEN
      RAISE EXCEPTION 'Endereço não armazena CIB.' USING ERRCODE='22023'; END IF;
    PERFORM private.validate_nfse_preset_address(v_ident->'address',p_brazil);
  END IF;
  IF NOT p_brazil AND v_kind<>'ADDRESS' THEN
    RAISE EXCEPTION 'Imóvel no exterior exige endereço.' USING ERRCODE='22023'; END IF;
END;
$function$;

CREATE FUNCTION private.validate_nfse_preset_event(p_value jsonb,p_brazil boolean)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_ident jsonb; v_kind text; v_start date; v_end date;
BEGIN
  PERFORM private.nfse_preset_object(p_value,ARRAY['description','startDate','endDate','identification']);
  PERFORM private.nfse_preset_text(p_value->'description',255,false);
  v_start:=private.nfse_preset_date(p_value->'startDate'); v_end:=private.nfse_preset_date(p_value->'endDate');
  IF v_start>v_end THEN RAISE EXCEPTION 'Início do evento posterior ao término.' USING ERRCODE='22023'; END IF;
  v_ident:=p_value->'identification';
  PERFORM private.nfse_preset_object(v_ident,ARRAY['kind','municipalId','address']);
  v_kind:=private.nfse_preset_choice(v_ident->'kind',ARRAY['MUNICIPAL_ID','ADDRESS']);
  IF v_kind='MUNICIPAL_ID' THEN
    PERFORM private.nfse_preset_text(v_ident->'municipalId',30,false);
    IF v_ident->'address'<>'null'::jsonb THEN
      RAISE EXCEPTION 'Identificador municipal não armazena endereço de evento.' USING ERRCODE='22023'; END IF;
  ELSE
    IF v_ident->'municipalId'<>'null'::jsonb THEN
      RAISE EXCEPTION 'Endereço de evento não armazena identificador municipal.' USING ERRCODE='22023'; END IF;
    PERFORM private.validate_nfse_preset_address(v_ident->'address',p_brazil);
  END IF;
  IF NOT p_brazil AND v_kind<>'ADDRESS' THEN
    RAISE EXCEPTION 'Evento no exterior exige endereço.' USING ERRCODE='22023'; END IF;
END;
$function$;

CREATE FUNCTION private.normalize_nfse_preset_foreign_trade(p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $function$
DECLARE v_key text; v_rule jsonb; v_fixed jsonb; v_temporary text; v_currency text;
BEGIN
  IF p_value='null'::jsonb THEN RETURN p_value; END IF;
  PERFORM private.nfse_preset_object(p_value,ARRAY['provisionMode','relationship','currencyCode','serviceAmount',
    'providerSupport','recipientSupport','temporaryGoods','importDeclaration','exportRegistration','shareWithMdic']);
  PERFORM private.nfse_preset_choice(p_value->'provisionMode',ARRAY['1','2','3','4']);
  PERFORM private.nfse_preset_choice(p_value->'relationship',ARRAY['0','1','2','3','4','5','6','9']);
  v_currency:=private.nfse_preset_code(p_value->'currencyCode','^[0-9]{3}$');
  IF NOT EXISTS(SELECT 1 FROM private.nfse_currency_catalog WHERE code=v_currency) THEN
    RAISE EXCEPTION 'Moeda não localizada no catálogo oficial pinado.' USING ERRCODE='22023'; END IF;
  v_fixed:=private.nfse_preset_rule_value(p_value->'serviceAmount');
  IF p_value->'serviceAmount'='null'::jsonb THEN
    RAISE EXCEPTION 'Informe a estratégia do valor em moeda estrangeira.' USING ERRCODE='22023'; END IF;
  IF v_fixed IS NOT NULL THEN
    PERFORM private.nfse_preset_code(v_fixed,'^(0|[1-9][0-9]{0,14})\.[0-9]{2}$');
    PERFORM private.nfse_preset_decimal(v_fixed); END IF;
  PERFORM private.nfse_preset_choice(p_value->'providerSupport',ARRAY['01','02','03','04','05','06','07','08']);
  PERFORM private.nfse_preset_choice(p_value->'recipientSupport',ARRAY['01','02','03','04','05','06','07','08','09',
    '10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26']);
  v_temporary:=private.nfse_preset_choice(p_value->'temporaryGoods',ARRAY['1','2','3']);
  IF jsonb_typeof(p_value->'shareWithMdic') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Confirme a opção MDIC.' USING ERRCODE='22023'; END IF;
  FOREACH v_key IN ARRAY ARRAY['importDeclaration','exportRegistration'] LOOP
    v_rule:=p_value->v_key; v_fixed:=private.nfse_preset_rule_value(v_rule);
    IF v_fixed IS NOT NULL THEN PERFORM private.nfse_preset_text(v_fixed,12,false); END IF;
  END LOOP;
  IF (v_temporary='2')<>(p_value->'importDeclaration'<>'null'::jsonb)
    OR (v_temporary='3')<>(p_value->'exportRegistration'<>'null'::jsonb) THEN
    RAISE EXCEPTION 'Movimentação temporária e registros de comércio exterior incompatíveis.' USING ERRCODE='22023'; END IF;
  RETURN p_value;
END;
$function$;

REVOKE ALL ON FUNCTION private.validate_nfse_preset_address(jsonb,boolean),
  private.validate_nfse_preset_construction(jsonb,boolean),private.validate_nfse_preset_property_unit(jsonb,boolean),
  private.validate_nfse_preset_event(jsonb,boolean),private.normalize_nfse_preset_foreign_trade(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
