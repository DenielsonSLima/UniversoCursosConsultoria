-- Fixtures sintéticas revertidas; nenhum aluno real ou credencial é alterado.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';
SET LOCAL plpgsql.check_asserts = 'on';

DO $test$
DECLARE
  v_auth uuid := gen_random_uuid();
  v_other_auth uuid := gen_random_uuid();
  v_responsavel uuid := gen_random_uuid();
  v_email text := 'identity-lookup-' || v_auth::text || '@example.invalid';
  v_rows jsonb;
  v_role text;
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) r
    WHERE has_table_privilege(r, 'public.responsaveis_legais', 'SELECT')
  ), 'Tabela de responsáveis deve continuar privada';
  ASSERT NOT has_function_privilege('anon',
    'public.portal_identidade_listar_responsaveis_vinculados(uuid)', 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated',
    'public.portal_identidade_listar_responsaveis_vinculados(uuid)', 'EXECUTE');
  ASSERT has_function_privilege('service_role',
    'public.portal_identidade_listar_responsaveis_vinculados(uuid)', 'EXECUTE');

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  INSERT INTO auth.users(id, email) VALUES (v_auth, v_email);
  INSERT INTO public.responsaveis_legais(id, auth_user_id, nome, email)
    VALUES (v_responsavel, v_auth, 'RESPONSAVEL SINTETICO LOOKUP', v_email);
  SET CONSTRAINTS ALL IMMEDIATE;

  SET LOCAL ROLE service_role;
  ASSERT current_user = 'service_role';
  BEGIN
    PERFORM id FROM public.responsaveis_legais WHERE auth_user_id = v_auth;
    RAISE EXCEPTION 'Leitura direta indevidamente permitida';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT jsonb_agg(to_jsonb(r)) INTO v_rows
    FROM public.portal_identidade_listar_responsaveis_vinculados(v_auth) r;
  ASSERT v_rows = jsonb_build_array(jsonb_build_object(
    'id', v_responsavel, 'cpf_normalizado', NULL, 'email', v_email
  )), 'RPC deve retornar somente identidade mínima do UID solicitado';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.portal_identidade_listar_responsaveis_vinculados(v_other_auth)
  ), 'Outro UID não pode receber o responsável da fixture';
  BEGIN
    PERFORM * FROM public.portal_identidade_listar_responsaveis_vinculados(NULL);
    RAISE EXCEPTION 'UID nulo indevidamente permitido';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  -- Mesmo com EXECUTE, a guarda interna exige contexto de serviço.
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM * FROM public.portal_identidade_listar_responsaveis_vinculados(v_auth);
    RAISE EXCEPTION 'Guarda interna não bloqueou contexto incorreto';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    EXECUTE format('SET LOCAL ROLE %I', v_role);
    ASSERT current_user = v_role;
    BEGIN
      PERFORM * FROM public.portal_identidade_listar_responsaveis_vinculados(v_auth);
      RAISE EXCEPTION 'Cliente indevidamente autorizado';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
  END LOOP;
END;
$test$;
ROLLBACK;
