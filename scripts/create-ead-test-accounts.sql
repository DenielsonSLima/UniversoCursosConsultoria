-- =========================================================
-- Usuarios de teste para fluxo EAD
-- =========================================================
-- Este projeto Supabase nao possui auth.admin_create_user().
-- Por isso, este script cria/sincroniza diretamente:
--   1. auth.users
--   2. auth.identities
--   3. public.parceiros para Aluno/Professor
--   4. public.usuarios_sistema para Gestor
--
-- Acessos:
--   Aluno     : aluno.ead@universo.com / ead-aluno-2026
--   Professor : professor.ead@universo.com / ead-prof-2026
--   Gestor    : gestor.ead@universo.com / ead-gestor-2026
-- =========================================================

DO $$
DECLARE
  v_aluno_user_id uuid;
  v_professor_user_id uuid;
  v_gestor_user_id uuid;
BEGIN
  v_aluno_user_id := COALESCE(
    (SELECT id FROM auth.users WHERE lower(email) = lower('aluno.ead@universo.com')),
    gen_random_uuid()
  );

  v_professor_user_id := COALESCE(
    (SELECT id FROM auth.users WHERE lower(email) = lower('professor.ead@universo.com')),
    gen_random_uuid()
  );

  v_gestor_user_id := COALESCE(
    (SELECT id FROM auth.users WHERE lower(email) = lower('gestor.ead@universo.com')),
    gen_random_uuid()
  );

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    is_sso_user,
    is_anonymous
  ) VALUES
    (
      '00000000-0000-0000-0000-000000000000',
      v_aluno_user_id,
      'authenticated',
      'authenticated',
      'aluno.ead@universo.com',
      crypt('ead-aluno-2026', gen_salt('bf', 10)),
      now(),
      '',
      '',
      '',
      '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('sub', v_aluno_user_id::text, 'email', 'aluno.ead@universo.com', 'email_verified', true, 'phone_verified', false, 'tipo', 'Aluno'),
      now(),
      now(),
      false,
      false
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      v_professor_user_id,
      'authenticated',
      'authenticated',
      'professor.ead@universo.com',
      crypt('ead-prof-2026', gen_salt('bf', 10)),
      now(),
      '',
      '',
      '',
      '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('sub', v_professor_user_id::text, 'email', 'professor.ead@universo.com', 'email_verified', true, 'phone_verified', false, 'tipo', 'Professor'),
      now(),
      now(),
      false,
      false
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      v_gestor_user_id,
      'authenticated',
      'authenticated',
      'gestor.ead@universo.com',
      crypt('ead-gestor-2026', gen_salt('bf', 10)),
      now(),
      '',
      '',
      '',
      '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('sub', v_gestor_user_id::text, 'email', 'gestor.ead@universo.com', 'email_verified', true, 'phone_verified', false, 'tipo', 'Gestor'),
      now(),
      now(),
      false,
      false
    )
  ON CONFLICT (id) DO UPDATE SET
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    confirmation_token = '',
    recovery_token = '',
    email_change_token_new = '',
    email_change = '',
    raw_app_meta_data = EXCLUDED.raw_app_meta_data,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = now();

  DELETE FROM auth.identities
  WHERE user_id IN (v_aluno_user_id, v_professor_user_id, v_gestor_user_id);

  INSERT INTO auth.identities (
    id,
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES
    (
      v_aluno_user_id,
      v_aluno_user_id::text,
      v_aluno_user_id,
      jsonb_build_object('sub', v_aluno_user_id::text, 'email', 'aluno.ead@universo.com', 'email_verified', true, 'phone_verified', false),
      'email',
      now(),
      now(),
      now()
    ),
    (
      v_professor_user_id,
      v_professor_user_id::text,
      v_professor_user_id,
      jsonb_build_object('sub', v_professor_user_id::text, 'email', 'professor.ead@universo.com', 'email_verified', true, 'phone_verified', false),
      'email',
      now(),
      now(),
      now()
    ),
    (
      v_gestor_user_id,
      v_gestor_user_id::text,
      v_gestor_user_id,
      jsonb_build_object('sub', v_gestor_user_id::text, 'email', 'gestor.ead@universo.com', 'email_verified', true, 'phone_verified', false),
      'email',
      now(),
      now(),
      now()
    );

  INSERT INTO public.parceiros (id, nome, email, tipo, status)
  VALUES
    (v_aluno_user_id, 'Aluno EAD (teste)', 'aluno.ead@universo.com', 'Aluno', 'ATIVO'),
    (v_professor_user_id, 'Professor EAD (teste)', 'professor.ead@universo.com', 'Professor', 'ATIVO')
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      email = EXCLUDED.email,
      tipo = EXCLUDED.tipo,
      status = EXCLUDED.status;

  INSERT INTO public.usuarios_sistema (id, nome, email, perfil, status, context)
  VALUES (v_gestor_user_id, 'Gestor EAD (teste)', 'gestor.ead@universo.com', 'Gestor', 'ATIVO', 'global')
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      email = EXCLUDED.email,
      perfil = EXCLUDED.perfil,
      status = EXCLUDED.status,
      context = EXCLUDED.context;
END;
$$;
