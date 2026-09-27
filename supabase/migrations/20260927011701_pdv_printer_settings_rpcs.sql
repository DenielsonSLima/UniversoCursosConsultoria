BEGIN;
CREATE FUNCTION public.get_pdv_printer_settings(p_polo_id uuid,p_workstation_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_manage boolean := coalesce(internal_pdv.can_manage(p_polo_id),false);
BEGIN
  PERFORM internal_pdv.assert_scope(p_polo_id,v_manage);
  IF p_workstation_id IS NOT NULL THEN
    PERFORM internal_pdv.assert_workstation(p_workstation_id,p_polo_id);
  END IF;
  RETURN jsonb_build_object('version',1,'context','OUTROS_CREDITOS','canManage',v_manage,
    'canUse',coalesce(internal_pdv.can_use(p_polo_id),false),'selectedWorkstationId',p_workstation_id,
    'workstations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,
      'active',active,'ownedByCurrentUser',owner_id=auth.uid()) ORDER BY name,id)
      FROM internal_pdv.workstations WHERE polo_id=p_polo_id AND (v_manage OR owner_id=auth.uid())),'[]'::jsonb),
    'printers',coalesce((SELECT jsonb_agg(internal_pdv.printer_dto(p) ORDER BY p.name,p.id)
      FROM internal_pdv.printers p JOIN internal_pdv.workstations w ON w.id=p.workstation_id
      WHERE p.polo_id=p_polo_id AND (v_manage OR w.owner_id=auth.uid())),'[]'::jsonb),
    'defaultPrinterId',(SELECT id FROM internal_pdv.printers WHERE workstation_id=p_workstation_id
      AND polo_id=p_polo_id AND is_default AND active));
END $$;

CREATE FUNCTION public.register_pdv_workstation(p_polo_id uuid,p_name text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v internal_pdv.workstations; v_payload jsonb; v_result jsonb;
BEGIN
  PERFORM internal_pdv.assert_scope(p_polo_id,coalesce(internal_pdv.can_manage(p_polo_id),false));
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Nome de estação inválido.' USING ERRCODE='PT422';
  END IF;
  v_payload:=jsonb_build_object('poloId',p_polo_id,'name',btrim(p_name));
  v_result:=internal_pdv.replay(p_request_id,'REGISTER_WORKSTATION',v_payload);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  INSERT INTO internal_pdv.workstations(polo_id,owner_id,name)
    VALUES(p_polo_id,auth.uid(),btrim(p_name)) RETURNING * INTO v;
  v_result:=jsonb_build_object('id',v.id,'name',v.name,'active',v.active,'ownedByCurrentUser',true);
  INSERT INTO internal_pdv.audit(actor_id,polo_id,entity_id,operation,detail)
    VALUES(auth.uid(),p_polo_id,v.id,'REGISTER_WORKSTATION',v_result);
  RETURN internal_pdv.remember(p_request_id,'REGISTER_WORKSTATION',v_payload,v_result);
END $$;

CREATE FUNCTION public.save_pdv_printer(p_input jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_polo uuid; v_station uuid; v_id uuid; v_version integer; v_template jsonb;
  v internal_pdv.printers; v_result jsonb; v_default boolean; v_active boolean;
BEGIN
  IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Configuração inválida.' USING ERRCODE='PT422';
  END IF;
  v_polo:=(p_input->>'poloId')::uuid;
  PERFORM internal_pdv.assert_scope(v_polo,true);
  IF p_input-ARRAY['id','poloId','workstationId','name','model','transport','behavior',
      'isDefault','active','expectedVersion','template']<>'{}'::jsonb
    OR length(btrim(coalesce(p_input->>'name',''))) NOT BETWEEN 1 AND 80
    OR length(coalesce(p_input->>'model',''))>80
    OR coalesce(p_input->>'transport','') NOT IN('BROWSER','QZ_TRAY','EPOS')
    OR coalesce(p_input->>'behavior','') NOT IN('PERGUNTAR','AUTOMATICO','NAO')
    OR jsonb_typeof(p_input->'isDefault') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_input->'active') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_input->'expectedVersion') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Configuração de impressora inválida.' USING ERRCODE='PT422';
  END IF;
  IF p_input->>'behavior'='AUTOMATICO' THEN
    RAISE EXCEPTION 'Impressão automática requer transporte homologado.' USING ERRCODE='PT409';
  END IF;
  v_station:=(p_input->>'workstationId')::uuid;
  PERFORM internal_pdv.assert_workstation(v_station,v_polo,false);
  -- Serialize default selection and concurrent edits within the physical station.
  PERFORM 1 FROM internal_pdv.workstations WHERE id=v_station FOR UPDATE;
  v_id:=(p_input->>'id')::uuid; v_version:=(p_input->>'expectedVersion')::integer;
  v_template:=internal_pdv.validate_template(p_input->'template');
  v_default:=(p_input->>'isDefault')::boolean; v_active:=(p_input->>'active')::boolean;
  IF v_id IS NOT NULL THEN
    SELECT * INTO v FROM internal_pdv.printers WHERE id=v_id AND polo_id=v_polo FOR UPDATE;
    IF NOT FOUND OR v.workstation_id<>v_station THEN
      RAISE EXCEPTION 'Impressora não autorizada neste escopo.' USING ERRCODE='42501';
    END IF;
  END IF;
  v_result:=internal_pdv.replay(p_request_id,'SAVE_PRINTER',p_input);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  IF (v_id IS NULL AND v_version<>0) OR (v_id IS NOT NULL AND v.version<>v_version) THEN
    RAISE EXCEPTION 'Configuração alterada. Recarregue antes de salvar.' USING ERRCODE='PT409';
  END IF;
  IF v_default AND v_active THEN
    WITH changed AS (
      UPDATE internal_pdv.printers SET is_default=false,version=version+1,
        updated_by=auth.uid(),updated_at=now()
      WHERE workstation_id=v_station AND is_default AND active AND id IS DISTINCT FROM v_id
      RETURNING id,version
    ) INSERT INTO internal_pdv.audit(actor_id,polo_id,entity_id,operation,detail)
      SELECT auth.uid(),v_polo,id,'CLEAR_DEFAULT',jsonb_build_object('version',version) FROM changed;
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO internal_pdv.printers(polo_id,workstation_id,name,model,transport,behavior,
      is_default,active,template,created_by,updated_by)
    VALUES(v_polo,v_station,btrim(p_input->>'name'),coalesce(p_input->>'model',''),
      p_input->>'transport',p_input->>'behavior',v_default,v_active,v_template,auth.uid(),auth.uid())
    RETURNING * INTO v;
  ELSE
    UPDATE internal_pdv.printers SET name=btrim(p_input->>'name'),model=coalesce(p_input->>'model',''),
      transport=p_input->>'transport',behavior=p_input->>'behavior',is_default=v_default,
      active=v_active,template=v_template,version=version+1,updated_by=auth.uid(),updated_at=now()
    WHERE id=v_id RETURNING * INTO v;
  END IF;
  v_result:=internal_pdv.printer_dto(v);
  INSERT INTO internal_pdv.audit(actor_id,polo_id,entity_id,operation,detail)
    VALUES(auth.uid(),v_polo,v.id,'SAVE_PRINTER',v_result);
  RETURN internal_pdv.remember(p_request_id,'SAVE_PRINTER',p_input,v_result);
END $$;
REVOKE ALL ON FUNCTION public.get_pdv_printer_settings(uuid,uuid),
  public.register_pdv_workstation(uuid,text,uuid),public.save_pdv_printer(jsonb,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_pdv_printer_settings(uuid,uuid),
  public.register_pdv_workstation(uuid,text,uuid),public.save_pdv_printer(jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
