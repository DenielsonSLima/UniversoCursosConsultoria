-- DML-only contract against the installed migration. Every synthetic write is rolled back.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

DO $contract$
DECLARE
  v_actor uuid;
  v_manager uuid;
  v_finance_only uuid;
  v_polo uuid;
  v_candidate_polo uuid;
  v_teacher uuid := gen_random_uuid();
  v_non_professor uuid := gen_random_uuid();
  v_before text;
  v_other_before text;
  v_count integer;
  v_constraint text;
  v_rejected boolean;
  v_finance_denied boolean := false;
  v_anon_denied boolean := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='parceiros' AND column_name='tipo_chave_pix') THEN
    RAISE EXCEPTION 'A migration Pix precisa estar instalada antes do ensaio.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.parceiros
    WHERE nome IN ('TESTE CONTRATO PIX PROFESSOR 20261115','TESTE CONTRATO PIX PF 20261115')) THEN
    RAISE EXCEPTION 'Os nomes sintéticos do ensaio já estão em uso.';
  END IF;

  -- Resolve an already authorized manager without returning any identity to the client.
  FOR v_actor IN SELECT DISTINCT auth_user_id FROM public.usuarios_sistema
    WHERE auth_user_id IS NOT NULL AND public.is_active_status(status) LOOP
    PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);
    PERFORM set_config('request.jwt.claim.role','authenticated',true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
    v_candidate_polo := (public.gestor_allowed_polo_ids())[1];
    IF v_candidate_polo IS NOT NULL
      AND public.is_partner_in_gestor_scope(v_candidate_polo,ARRAY[v_candidate_polo]) THEN
      v_manager := v_actor;
      v_polo := v_candidate_polo;
      EXIT;
    END IF;
  END LOOP;
  IF v_manager IS NULL THEN RAISE EXCEPTION 'Nenhum gestor autorizado disponível para o ensaio.'; END IF;

  FOR v_actor IN SELECT DISTINCT auth_user_id FROM public.usuarios_sistema
    WHERE auth_user_id IS NOT NULL AND public.is_active_status(status) LOOP
    PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);
    PERFORM set_config('request.jwt.claim.role','authenticated',true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
    IF public.gestor_has_module('financeiro') AND NOT public.gestor_has_module('parceiros')
      AND public.is_partner_in_gestor_read_scope(v_polo,ARRAY[v_polo]) THEN
      v_finance_only := v_actor;
      EXIT;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub',v_manager::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_manager,'role','authenticated')::text,true);

  INSERT INTO public.parceiros(id,tipo,nome,status,polo_id,polo_ids,chave_pix,tipo_chave_pix)
  VALUES(v_teacher,'Professor','TESTE CONTRATO PIX PROFESSOR 20261115','ATIVO',v_polo,ARRAY[v_polo],'LEGACY-UNKNOWN',NULL),
    (v_non_professor,'PF','TESTE CONTRATO PIX PF 20261115','ATIVO',v_polo,ARRAY[v_polo],NULL,NULL);
  SELECT md5((to_jsonb(p)-ARRAY['chave_pix','tipo_chave_pix'])::text) INTO v_before
    FROM public.parceiros p WHERE id=v_teacher;
  SELECT md5(to_jsonb(p)::text) INTO v_other_before FROM public.parceiros p WHERE id=v_non_professor;

  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.parceiros SET tipo_chave_pix='PHONE',chave_pix='+5579999999999'
    WHERE id=v_teacher AND tipo='Professor';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'A escrita do gestor autorizado não foi confirmada.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.parceiros WHERE id=v_teacher
    AND tipo_chave_pix='PHONE' AND chave_pix='+5579999999999') THEN
    RAISE EXCEPTION 'O tipo e a chave não foram persistidos juntos.';
  END IF;
  UPDATE public.parceiros SET tipo_chave_pix=NULL,chave_pix=NULL
    WHERE id=v_teacher AND tipo='Professor';
  IF NOT EXISTS (SELECT 1 FROM public.parceiros WHERE id=v_teacher
    AND tipo_chave_pix IS NULL AND chave_pix IS NULL) THEN
    RAISE EXCEPTION 'Os campos opcionais não puderam ser limpos.';
  END IF;
  IF (SELECT md5((to_jsonb(p)-ARRAY['chave_pix','tipo_chave_pix'])::text)
    FROM public.parceiros p WHERE id=v_teacher) IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'Uma coluna fora de Pix foi alterada.';
  END IF;
  UPDATE public.parceiros SET tipo_chave_pix='EMAIL',chave_pix='synthetic@example.invalid'
    WHERE id=v_non_professor AND tipo='Professor';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>0 THEN RAISE EXCEPTION 'O filtro de tipo permitiu alterar outro parceiro.'; END IF;

  v_rejected:=false;
  BEGIN
    UPDATE public.parceiros SET tipo_chave_pix='PDF',chave_pix='arquivo'
      WHERE id=v_teacher AND tipo='Professor';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_constraint=CONSTRAINT_NAME;
    IF v_constraint<>'parceiros_tipo_chave_pix_allowed' THEN RAISE; END IF;
    v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Tipo de chave inexistente foi aceito.'; END IF;
  v_rejected:=false;
  BEGIN
    UPDATE public.parceiros SET tipo_chave_pix='EMAIL',chave_pix='  '
      WHERE id=v_teacher AND tipo='Professor';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_constraint=CONSTRAINT_NAME;
    IF v_constraint<>'parceiros_typed_pix_requires_key' THEN RAISE; END IF;
    v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Tipo sem chave foi aceito.'; END IF;
  UPDATE public.parceiros SET tipo_chave_pix=NULL,chave_pix='LEGACY-UNKNOWN'
    WHERE id=v_teacher AND tipo='Professor';
  EXECUTE 'RESET ROLE';

  IF v_finance_only IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub',v_finance_only::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_finance_only,'role','authenticated')::text,true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.parceiros SET tipo_chave_pix='EMAIL',chave_pix='denied@example.invalid'
      WHERE id=v_teacher AND tipo='Professor';
    GET DIAGNOSTICS v_count=ROW_COUNT;
    IF v_count<>0 THEN RAISE EXCEPTION 'Financeiro sem Parceiros ganhou permissão de escrita.'; END IF;
    v_finance_denied:=true;
    EXECUTE 'RESET ROLE';
  END IF;
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('request.jwt.claim.role','anon',true);
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    UPDATE public.parceiros SET tipo_chave_pix='EMAIL',chave_pix='anon@example.invalid'
      WHERE id=v_teacher AND tipo='Professor';
  EXCEPTION WHEN insufficient_privilege THEN v_anon_denied:=true;
  END;
  IF NOT v_anon_denied THEN RAISE EXCEPTION 'A escrita anônima não foi negada.'; END IF;
  EXECUTE 'RESET ROLE';

  IF (SELECT md5(to_jsonb(p)::text) FROM public.parceiros p WHERE id=v_non_professor)
    IS DISTINCT FROM v_other_before THEN RAISE EXCEPTION 'O parceiro não Professor foi alterado.'; END IF;
  IF (SELECT md5((to_jsonb(p)-ARRAY['chave_pix','tipo_chave_pix'])::text)
    FROM public.parceiros p WHERE id=v_teacher) IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'O cadastro fora dos campos Pix mudou durante o ensaio.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.parceiros WHERE id=v_teacher
    AND tipo_chave_pix IS NULL AND chave_pix='LEGACY-UNKNOWN') THEN
    RAISE EXCEPTION 'O legado sem tipo não foi preservado.';
  END IF;
  PERFORM set_config('codex.pix_contract_result',jsonb_build_object(
    'authorized_manager',true,'professor_only',true,'optional_clear',true,
    'unknown_type_rejected',true,'type_without_key_rejected',true,
    'legacy_unknown_preserved',true,'other_columns_preserved',true,
    'finance_only_available',v_finance_only IS NOT NULL,'finance_only_denied',v_finance_denied,
    'anon_denied',v_anon_denied,'synthetic_only',true,'rollback_required',true)::text,true);
END;
$contract$;

SELECT current_setting('codex.pix_contract_result')::jsonb AS result;
ROLLBACK;

SELECT count(*) AS synthetic_rows_remaining FROM public.parceiros
WHERE nome IN ('TESTE CONTRATO PIX PROFESSOR 20261115','TESTE CONTRATO PIX PF 20261115');
