-- Uma credencial publica ja concluida pelo Responsavel prova a existencia da
-- senha global do Auth. Convites e senhas temporarias pendentes continuam sem
-- liberar automaticamente os contextos institucionais Gestor/Professor.

BEGIN;

-- Compatibilidade civil não prova que a senha global já foi criada. Esta RPC
-- centraliza a prova de credencial para o vínculo de um novo perfil de Aluno.
CREATE OR REPLACE FUNCTION public.portal_identidade_credencial_compartilhada_liberada(
  p_auth_user_id uuid,
  p_exclude_partner_id uuid DEFAULT NULL,
  p_exclude_responsavel_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p_auth_user_id IS NOT NULL AND (
    public.portal_identidade_institucional_acesso_liberado(
      p_auth_user_id,
      'GESTOR'
    )
    OR public.portal_identidade_institucional_acesso_liberado(
      p_auth_user_id,
      'PROFESSOR'
    )
    OR EXISTS (
      SELECT 1
      FROM public.parceiros AS aluno
      WHERE aluno.auth_user_id = p_auth_user_id
        AND aluno.id IS DISTINCT FROM p_exclude_partner_id
        AND upper(btrim(coalesce(aluno.tipo, ''))) = 'ALUNO'
        AND coalesce(public.is_active_status(aluno.status), false)
        AND aluno.senha_atualizada_em IS NOT NULL
        AND NOT coalesce(aluno.troca_senha_obrigatoria, false)
        AND NOT (
          coalesce(aluno.senha_temporaria_pendente, false)
          AND (
            aluno.senha_temporaria_emitida_em IS NULL
            OR aluno.senha_atualizada_em IS NULL
            OR aluno.senha_atualizada_em <=
              aluno.senha_temporaria_emitida_em
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.responsaveis_legais AS responsavel
      WHERE responsavel.auth_user_id = p_auth_user_id
        AND responsavel.id IS DISTINCT FROM p_exclude_responsavel_id
        AND responsavel.status = 'ATIVO'
        AND responsavel.senha_atualizada_em IS NOT NULL
        AND NOT coalesce(responsavel.troca_senha_obrigatoria, false)
        AND NOT (
          coalesce(responsavel.senha_temporaria_pendente, false)
          AND (
            responsavel.senha_temporaria_emitida_em IS NULL
            OR responsavel.senha_atualizada_em <=
              responsavel.senha_temporaria_emitida_em
          )
        )
    )
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema AS gestor_pendente
    WHERE gestor_pendente.auth_user_id = p_auth_user_id
      AND coalesce(public.is_active_status(gestor_pendente.status), false)
      AND gestor_pendente.primeiro_acesso_institucional_pendente
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.parceiros AS parceiro_pendente
    WHERE parceiro_pendente.auth_user_id = p_auth_user_id
      AND parceiro_pendente.id IS DISTINCT FROM p_exclude_partner_id
      AND coalesce(public.is_active_status(parceiro_pendente.status), false)
      AND (
        (
          upper(btrim(coalesce(parceiro_pendente.tipo, ''))) = 'PROFESSOR'
          AND parceiro_pendente.primeiro_acesso_institucional_pendente
        )
        OR (
          upper(btrim(coalesce(parceiro_pendente.tipo, ''))) = 'ALUNO'
          AND (
            parceiro_pendente.senha_atualizada_em IS NULL
            OR coalesce(parceiro_pendente.acesso_status, '') <> 'ativo'
            OR coalesce(parceiro_pendente.troca_senha_obrigatoria, false)
            OR (
              coalesce(
                parceiro_pendente.senha_temporaria_pendente,
                false
              )
              AND (
                parceiro_pendente.senha_temporaria_emitida_em IS NULL
                OR parceiro_pendente.senha_atualizada_em IS NULL
                OR parceiro_pendente.senha_atualizada_em <=
                  parceiro_pendente.senha_temporaria_emitida_em
              )
            )
          )
        )
      )
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.responsaveis_legais AS responsavel_pendente
    WHERE responsavel_pendente.auth_user_id = p_auth_user_id
      AND responsavel_pendente.id IS DISTINCT FROM p_exclude_responsavel_id
      AND responsavel_pendente.status = 'ATIVO'
      AND (
        responsavel_pendente.senha_atualizada_em IS NULL
        OR coalesce(responsavel_pendente.troca_senha_obrigatoria, false)
        OR (
          coalesce(
            responsavel_pendente.senha_temporaria_pendente,
            false
          )
          AND (
            responsavel_pendente.senha_temporaria_emitida_em IS NULL
            OR responsavel_pendente.senha_atualizada_em IS NULL
            OR responsavel_pendente.senha_atualizada_em <=
              responsavel_pendente.senha_temporaria_emitida_em
          )
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION
  public.portal_identidade_credencial_compartilhada_liberada(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.portal_identidade_credencial_compartilhada_liberada(uuid, uuid, uuid)
  TO service_role;

COMMIT;
