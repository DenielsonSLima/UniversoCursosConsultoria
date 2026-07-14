BEGIN;

-- O cadastro publico nao deve inserir diretamente em parceiros pelo cliente anonimo.
-- A finalizacao do perfil do aluno passa a ocorrer por RPC autenticada, apos
-- Supabase Auth criar/validar a sessao do usuario.

REVOKE SELECT, INSERT, UPDATE ON TABLE public.parceiros FROM anon;

DROP POLICY IF EXISTS "portal_parceiros_insert" ON public.parceiros;
DROP POLICY IF EXISTS "portal_parceiros_insert_aluno_self" ON public.parceiros;
DROP POLICY IF EXISTS "portal_parceiros_insert_gestor_scope" ON public.parceiros;

CREATE POLICY "portal_parceiros_insert_aluno_self"
  ON public.parceiros
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tipo = 'Aluno'
    AND lower(coalesce(email, '')) = public.auth_email()
  );

CREATE POLICY "portal_parceiros_insert_gestor_scope"
  ON public.parceiros
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_partner_in_gestor_scope(polo_id, polo_ids));

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
SET search_path = public
AS $$
DECLARE
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

REVOKE EXECUTE ON FUNCTION public.finalizar_cadastro_publico_aluno(text, text, text, text, date, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalizar_cadastro_publico_aluno(text, text, text, text, date, boolean, text) TO authenticated, service_role;

COMMIT;
