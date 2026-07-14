BEGIN;

-- Garante que o cadastro publico do aluno crie o perfil visivel na Matriz,
-- inclusive quando o Supabase Auth exige confirmacao de e-mail e nao devolve
-- sessao autenticada para o frontend finalizar por RPC.

CREATE OR REPLACE FUNCTION public.finalizar_cadastro_publico_aluno(
  p_nome text,
  p_email text,
  p_telefone text,
  p_cpf text,
  p_data_nascimento date,
  p_aceitou_termos boolean,
  p_termos_versao text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_matriz_polo_id uuid := '44444444-4444-4444-4444-444444444444'::uuid;
  v_auth_email text := public.auth_email();
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_phone text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_existing_by_email public.parceiros%ROWTYPE;
  v_existing_by_cpf public.parceiros%ROWTYPE;
  v_target_id uuid;
  v_sum int;
  v_digit int;
  v_expected int;
  i int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessao autenticada obrigatoria para concluir o cadastro do aluno.';
  END IF;

  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Informe um e-mail valido para concluir o cadastro.';
  END IF;

  IF v_auth_email IS NULL OR v_email <> v_auth_email THEN
    RAISE EXCEPTION 'O e-mail do cadastro nao confere com o usuario autenticado.';
  END IF;

  IF v_nome IS NULL OR length(v_nome) < 3 THEN
    RAISE EXCEPTION 'Informe o nome completo para concluir o cadastro.';
  END IF;

  IF NOT coalesce(p_aceitou_termos, false) THEN
    RAISE EXCEPTION 'Voce precisa aceitar os Termos de Uso para concluir o cadastro.';
  END IF;

  IF p_data_nascimento IS NULL OR p_data_nascimento > current_date THEN
    RAISE EXCEPTION 'Informe uma data de nascimento valida.';
  END IF;

  IF length(v_phone) > 11 AND left(v_phone, 2) = '55' THEN
    v_phone := substr(v_phone, 3);
  END IF;

  IF length(v_phone) NOT IN (10, 11) THEN
    RAISE EXCEPTION 'Informe um telefone/WhatsApp valido.';
  END IF;

  IF length(v_cpf) <> 11 OR v_cpf ~ '^([0-9])\1{10}$' THEN
    RAISE EXCEPTION 'Informe um CPF valido para concluir o cadastro.';
  END IF;

  v_sum := 0;
  FOR i IN 1..9 LOOP
    v_sum := v_sum + substr(v_cpf, i, 1)::int * (11 - i);
  END LOOP;
  v_expected := (v_sum * 10) % 11;
  IF v_expected = 10 THEN
    v_expected := 0;
  END IF;
  v_digit := substr(v_cpf, 10, 1)::int;
  IF v_digit <> v_expected THEN
    RAISE EXCEPTION 'Informe um CPF valido para concluir o cadastro.';
  END IF;

  v_sum := 0;
  FOR i IN 1..10 LOOP
    v_sum := v_sum + substr(v_cpf, i, 1)::int * (12 - i);
  END LOOP;
  v_expected := (v_sum * 10) % 11;
  IF v_expected = 10 THEN
    v_expected := 0;
  END IF;
  v_digit := substr(v_cpf, 11, 1)::int;
  IF v_digit <> v_expected THEN
    RAISE EXCEPTION 'Informe um CPF valido para concluir o cadastro.';
  END IF;

  SELECT *
    INTO v_existing_by_email
  FROM public.parceiros p
  WHERE lower(coalesce(p.email, '')) = v_email
    AND p.tipo = 'Aluno'
  ORDER BY p.created_at DESC NULLS LAST
  LIMIT 1;

  SELECT *
    INTO v_existing_by_cpf
  FROM public.parceiros p
  WHERE regexp_replace(coalesce(p.cpf_cnpj, ''), '\D', '', 'g') = v_cpf
    AND p.tipo = 'Aluno'
  ORDER BY p.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_existing_by_cpf.id IS NOT NULL
    AND lower(coalesce(v_existing_by_cpf.email, '')) <> v_email THEN
    RAISE EXCEPTION 'Este CPF ja esta cadastrado com outro e-mail. Entre com o e-mail correto ou fale com a secretaria.';
  END IF;

  IF v_existing_by_email.id IS NOT NULL
    AND regexp_replace(coalesce(v_existing_by_email.cpf_cnpj, ''), '\D', '', 'g') <> ''
    AND regexp_replace(coalesce(v_existing_by_email.cpf_cnpj, ''), '\D', '', 'g') <> v_cpf THEN
    RAISE EXCEPTION 'Este e-mail ja possui um cadastro de aluno com outro CPF. Entre com seus dados corretos ou fale com a secretaria.';
  END IF;

  v_target_id := coalesce(v_existing_by_email.id, v_existing_by_cpf.id);

  IF v_target_id IS NULL THEN
    INSERT INTO public.parceiros (
      tipo,
      nome,
      email,
      telefone,
      cpf_cnpj,
      data_nascimento,
      polo_id,
      polo_ids,
      status,
      observacao,
      aceitou_termos_uso,
      aceitou_termos_uso_em,
      termos_uso_versao,
      troca_senha_obrigatoria
    )
    VALUES (
      'Aluno',
      v_nome,
      v_email,
      v_phone,
      v_cpf,
      p_data_nascimento,
      v_matriz_polo_id,
      array[v_matriz_polo_id],
      'ATIVO',
      'Cadastro publico criado pelo fluxo de compra online EAD.',
      true,
      now(),
      nullif(btrim(coalesce(p_termos_versao, '')), ''),
      false
    )
    RETURNING id INTO v_target_id;
  ELSE
    UPDATE public.parceiros
      SET nome = v_nome,
          email = v_email,
          telefone = v_phone,
          cpf_cnpj = v_cpf,
          data_nascimento = p_data_nascimento,
          polo_id = coalesce(polo_id, v_matriz_polo_id),
          polo_ids = CASE
            WHEN coalesce(array_length(polo_ids, 1), 0) = 0 THEN array[v_matriz_polo_id]
            ELSE polo_ids
          END,
          status = 'ATIVO',
          aceitou_termos_uso = true,
          aceitou_termos_uso_em = coalesce(aceitou_termos_uso_em, now()),
          termos_uso_versao = coalesce(nullif(btrim(coalesce(p_termos_versao, '')), ''), termos_uso_versao),
          troca_senha_obrigatoria = false,
          updated_at = now()
    WHERE id = v_target_id;
  END IF;

  RETURN v_target_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_public_aluno_auth_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_matriz_polo_id uuid := '44444444-4444-4444-4444-444444444444'::uuid;
  v_meta jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  v_origin text := coalesce(v_meta->>'origem', '');
  v_tipo text := coalesce(v_meta->>'tipo', '');
  v_nome text := nullif(btrim(coalesce(v_meta->>'nome', '')), '');
  v_email text := lower(nullif(btrim(coalesce(NEW.email, v_meta->>'email', '')), ''));
  v_phone text := regexp_replace(coalesce(v_meta->>'telefone', ''), '\D', '', 'g');
  v_cpf text := regexp_replace(coalesce(v_meta->>'cpf', ''), '\D', '', 'g');
  v_data_nascimento date;
  v_aceitou_termos boolean := false;
  v_termos_versao text := nullif(btrim(coalesce(v_meta->>'termsVersion', '2026-06-25')), '');
  v_existing_by_email public.parceiros%ROWTYPE;
  v_existing_by_cpf public.parceiros%ROWTYPE;
  v_target_id uuid;
  v_sum int;
  v_digit int;
  v_expected int;
  i int;
BEGIN
  IF v_origin <> 'cadastro_publico_ead' AND v_tipo <> 'Aluno' THEN
    RETURN NEW;
  END IF;

  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN NEW;
  END IF;

  IF v_nome IS NULL OR length(v_nome) < 3 THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_aceitou_termos := coalesce((v_meta->>'acceptedTerms')::boolean, false);
  EXCEPTION WHEN others THEN
    v_aceitou_termos := false;
  END;

  IF NOT v_aceitou_termos THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_data_nascimento := nullif(v_meta->>'dataNascimento', '')::date;
  EXCEPTION WHEN others THEN
    RETURN NEW;
  END;

  IF v_data_nascimento IS NULL OR v_data_nascimento > current_date THEN
    RETURN NEW;
  END IF;

  IF length(v_phone) > 11 AND left(v_phone, 2) = '55' THEN
    v_phone := substr(v_phone, 3);
  END IF;

  IF length(v_phone) NOT IN (10, 11) THEN
    RETURN NEW;
  END IF;

  IF length(v_cpf) <> 11 OR v_cpf ~ '^([0-9])\1{10}$' THEN
    RETURN NEW;
  END IF;

  v_sum := 0;
  FOR i IN 1..9 LOOP
    v_sum := v_sum + substr(v_cpf, i, 1)::int * (11 - i);
  END LOOP;
  v_expected := (v_sum * 10) % 11;
  IF v_expected = 10 THEN
    v_expected := 0;
  END IF;
  v_digit := substr(v_cpf, 10, 1)::int;
  IF v_digit <> v_expected THEN
    RETURN NEW;
  END IF;

  v_sum := 0;
  FOR i IN 1..10 LOOP
    v_sum := v_sum + substr(v_cpf, i, 1)::int * (12 - i);
  END LOOP;
  v_expected := (v_sum * 10) % 11;
  IF v_expected = 10 THEN
    v_expected := 0;
  END IF;
  v_digit := substr(v_cpf, 11, 1)::int;
  IF v_digit <> v_expected THEN
    RETURN NEW;
  END IF;

  SELECT *
    INTO v_existing_by_email
  FROM public.parceiros p
  WHERE lower(coalesce(p.email, '')) = v_email
    AND p.tipo = 'Aluno'
  ORDER BY p.created_at DESC NULLS LAST
  LIMIT 1;

  SELECT *
    INTO v_existing_by_cpf
  FROM public.parceiros p
  WHERE regexp_replace(coalesce(p.cpf_cnpj, ''), '\D', '', 'g') = v_cpf
    AND p.tipo = 'Aluno'
  ORDER BY p.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_existing_by_cpf.id IS NOT NULL
    AND lower(coalesce(v_existing_by_cpf.email, '')) <> v_email THEN
    RETURN NEW;
  END IF;

  v_target_id := coalesce(v_existing_by_email.id, v_existing_by_cpf.id);

  IF v_target_id IS NULL THEN
    INSERT INTO public.parceiros (
      tipo,
      nome,
      email,
      telefone,
      cpf_cnpj,
      data_nascimento,
      polo_id,
      polo_ids,
      status,
      observacao,
      aceitou_termos_uso,
      aceitou_termos_uso_em,
      termos_uso_versao,
      troca_senha_obrigatoria
    )
    VALUES (
      'Aluno',
      v_nome,
      v_email,
      v_phone,
      v_cpf,
      v_data_nascimento,
      v_matriz_polo_id,
      array[v_matriz_polo_id],
      'ATIVO',
      'Cadastro publico criado automaticamente pelo Auth do fluxo de compra online EAD.',
      true,
      now(),
      v_termos_versao,
      false
    );
  ELSE
    UPDATE public.parceiros
      SET nome = v_nome,
          email = v_email,
          telefone = v_phone,
          cpf_cnpj = v_cpf,
          data_nascimento = v_data_nascimento,
          polo_id = coalesce(polo_id, v_matriz_polo_id),
          polo_ids = CASE
            WHEN coalesce(array_length(polo_ids, 1), 0) = 0 THEN array[v_matriz_polo_id]
            ELSE polo_ids
          END,
          status = 'ATIVO',
          aceitou_termos_uso = true,
          aceitou_termos_uso_em = coalesce(aceitou_termos_uso_em, now()),
          termos_uso_versao = coalesce(v_termos_versao, termos_uso_versao),
          troca_senha_obrigatoria = false,
          updated_at = now()
    WHERE id = v_target_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'Falha ao sincronizar cadastro publico de aluno para %: %', coalesce(NEW.email, '<sem email>'), SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_public_aluno_auth_profile ON auth.users;
CREATE TRIGGER trg_sync_public_aluno_auth_profile
AFTER INSERT OR UPDATE OF email, raw_user_meta_data
ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_public_aluno_auth_profile();

REVOKE EXECUTE ON FUNCTION public.sync_public_aluno_auth_profile() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_public_aluno_auth_profile() TO service_role;

COMMIT;
