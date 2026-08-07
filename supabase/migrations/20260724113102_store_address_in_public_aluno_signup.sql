BEGIN;

-- Mantem a assinatura anterior para clientes ainda publicados e adiciona uma
-- sobrecarga usada pelo novo cadastro em duas etapas. A funcao canonica antiga
-- continua responsavel por identidade, CPF, telefone, termos e escopo do aluno.
CREATE OR REPLACE FUNCTION public.finalizar_cadastro_publico_aluno(
  p_nome text,
  p_email text,
  p_telefone text,
  p_cpf text,
  p_data_nascimento date,
  p_aceitou_termos boolean,
  p_termos_versao text,
  p_cep text,
  p_endereco text,
  p_numero text,
  p_complemento text,
  p_bairro text,
  p_cidade text,
  p_uf text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_id uuid;
  v_cep text := regexp_replace(coalesce(p_cep, ''), '\D', '', 'g');
  v_endereco text := nullif(upper(btrim(coalesce(p_endereco, ''))), '');
  v_numero text := nullif(upper(btrim(coalesce(p_numero, ''))), '');
  v_complemento text := nullif(upper(btrim(coalesce(p_complemento, ''))), '');
  v_bairro text := nullif(upper(btrim(coalesce(p_bairro, ''))), '');
  v_cidade text := nullif(upper(btrim(coalesce(p_cidade, ''))), '');
  v_uf text := upper(btrim(coalesce(p_uf, '')));
BEGIN
  IF length(v_cep) <> 8 THEN
    RAISE EXCEPTION 'Informe um CEP valido para concluir o cadastro.';
  END IF;

  IF v_endereco IS NULL OR v_numero IS NULL OR v_bairro IS NULL OR v_cidade IS NULL THEN
    RAISE EXCEPTION 'Complete endereco, numero, bairro e cidade para concluir o cadastro.';
  END IF;

  IF v_uf !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'Informe uma UF valida para concluir o cadastro.';
  END IF;

  v_target_id := public.finalizar_cadastro_publico_aluno(
    p_nome,
    p_email,
    p_telefone,
    p_cpf,
    p_data_nascimento,
    p_aceitou_termos,
    p_termos_versao
  );

  UPDATE public.parceiros
    SET cep = substr(v_cep, 1, 5) || '-' || substr(v_cep, 6, 3),
        endereco = v_endereco,
        numero = v_numero,
        complemento = v_complemento,
        bairro = v_bairro,
        cidade = v_cidade,
        uf = v_uf,
        updated_at = now()
  WHERE id = v_target_id
    AND tipo = 'Aluno';

  RETURN v_target_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalizar_cadastro_publico_aluno(
  text, text, text, text, date, boolean, text,
  text, text, text, text, text, text, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.finalizar_cadastro_publico_aluno(
  text, text, text, text, date, boolean, text,
  text, text, text, text, text, text, text
) TO authenticated, service_role;

COMMIT;
