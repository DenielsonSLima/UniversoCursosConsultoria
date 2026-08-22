// @ts-nocheck -- contrato estático da migration executado pelo Deno.

import assert from "node:assert/strict";
import {
  compactSql,
  functionBlock,
  functionBlockFrom,
  migration,
  studentMigration,
} from "./responsavel_first_access.contract-support.ts";

Deno.test("Aluno e Responsável rejeitam multiperfil de forma simétrica e cercam a corrida de vínculo", () => {
  const studentReserve = functionBlockFrom(
    studentMigration,
    "public.portal_reservar_emissao_senha_temporaria(",
  );
  const responsibleReserve = functionBlock(
    "public.portal_reservar_emissao_senha_temporaria_responsavel(",
  );
  const linkGuard = functionBlock(
    "public.proteger_vinculo_auth_senha_temporaria()",
  );

  for (const reserve of [studentReserve, responsibleReserve]) {
    assert.match(reserve, /pg_advisory_xact_lock/i);
    assert.match(
      reserve,
      /portal-temporary-password-auth:[\s\S]*?auth_user_id/i,
    );
    assert.match(reserve, /FROM public\.parceiros AS /i);
    assert.match(reserve, /FROM public\.usuarios_sistema AS usuario_interno/i);
    assert.match(reserve, /FROM public\.responsaveis_legais AS /i);
  }
  assert.match(
    studentReserve,
    /PORTAL_EMISSAO_SENHA_TEMPORARIA_ALUNO_IDENTIDADE_MULTIPERFIL/i,
  );
  assert.match(
    responsibleReserve,
    /PORTAL_EMISSAO_SENHA_TEMPORARIA_RESPONSAVEL_IDENTIDADE_MULTIPERFIL/i,
  );

  assert.match(linkGuard, /pg_advisory_xact_lock/i);
  assert.match(linkGuard, /pg_catalog\.to_jsonb\(OLD\)/i);
  assert.match(linkGuard, /pg_catalog\.to_jsonb\(NEW\)/i);
  assert.match(linkGuard, /FROM public\.parceiros AS aluno/i);
  assert.match(linkGuard, /FROM public\.responsaveis_legais AS responsavel/i);
  assert.match(
    linkGuard,
    /coalesce\(aluno\.senha_temporaria_pendente, false\)/i,
  );
  assert.match(
    linkGuard,
    /coalesce\(responsavel\.senha_temporaria_pendente, false\)/i,
  );
  assert.match(
    linkGuard,
    /PORTAL_VINCULO_AUTH_BLOQUEADO_POR_SENHA_TEMPORARIA/i,
  );
  assert.match(
    linkGuard,
    /NEW\.auth_user_id IS DISTINCT FROM OLD\.auth_user_id[\s\S]*?AND v_proprio_acesso_temporario[\s\S]*?PORTAL_VINCULO_AUTH_BLOQUEADO_POR_SENHA_TEMPORARIA/i,
  );
  assert.match(
    linkGuard,
    /v_tipo_parceiro_alterado := TG_TABLE_NAME = 'parceiros'[\s\S]*?NEW\.auth_user_id IS NOT DISTINCT FROM OLD\.auth_user_id[\s\S]*?AND NOT v_tipo_parceiro_alterado[\s\S]*?RETURN NEW/i,
  );
  assert.match(
    linkGuard,
    /pg_advisory_xact_lock[\s\S]*?IF v_tipo_parceiro_alterado AND v_proprio_acesso_temporario THEN[\s\S]*?PORTAL_VINCULO_AUTH_BLOQUEADO_POR_SENHA_TEMPORARIA/i,
  );
  for (
    const table of ["parceiros", "usuarios_sistema", "responsaveis_legais"]
  ) {
    assert.match(
      migration,
      new RegExp(
        `CREATE TRIGGER b15_proteger_vinculo_auth_senha_temporaria[\\s\\S]*?ON public\\.${table}[\\s\\S]*?EXECUTE FUNCTION public\\.proteger_vinculo_auth_senha_temporaria\\(\\)`,
        "i",
      ),
    );
  }

  const deleteGuard = functionBlock(
    "public.proteger_remocao_senha_temporaria_pendente()",
  );
  assert.match(deleteGuard, /pg_catalog\.to_jsonb\(OLD\)/i);
  assert.match(deleteGuard, /senha_temporaria_pendente/i);
  assert.match(deleteGuard, /senha_temporaria_emissao_id/i);
  assert.match(
    deleteGuard,
    /PORTAL_REMOCAO_BLOQUEADA_POR_SENHA_TEMPORARIA/i,
  );
  for (const table of ["parceiros", "responsaveis_legais"]) {
    assert.match(
      migration,
      new RegExp(
        `CREATE TRIGGER b16_proteger_remocao_senha_temporaria_pendente\\s+BEFORE DELETE ON public\\.${table}[\\s\\S]*?EXECUTE FUNCTION public\\.proteger_remocao_senha_temporaria_pendente\\(\\)`,
        "i",
      ),
    );
  }
});

Deno.test("ledger e RPCs de reenvio são fechados, serializados e idempotentes", () => {
  assert.match(
    migration,
    /CREATE TABLE public\.portal_responsavel_reenvios_acesso[\s\S]*?UNIQUE \(actor_auth_user_id, request_id\)/i,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX portal_responsavel_reenvios_reserva_ativa_key[\s\S]*?\(responsavel_legal_id\)[\s\S]*?WHERE estado = 'RESERVADO'/i,
  );
  assert.match(
    migration,
    /ALTER TABLE public\.portal_responsavel_reenvios_acesso ENABLE ROW LEVEL SECURITY/i,
  );
  assert.match(
    migration,
    /CREATE POLICY portal_responsavel_reenvios_client_deny[\s\S]*?AS RESTRICTIVE FOR ALL TO anon, authenticated[\s\S]*?USING \(false\)[\s\S]*?WITH CHECK \(false\)/i,
  );

  const reserve = functionBlock(
    "public.portal_reservar_reenvio_acesso_responsavel(",
  );
  const complete = functionBlock(
    "public.portal_concluir_reenvio_acesso_responsavel(",
  );
  const cancel = functionBlock(
    "public.portal_cancelar_reenvio_acesso_responsavel(",
  );

  assert.ok(
    reserve.indexOf("responsavel_legal_acesso_preparar(") <
      reserve.indexOf("WHERE reenvio.actor_auth_user_id"),
    "A autorização deve anteceder qualquer lookup por request_id.",
  );
  assert.match(reserve, /portal-responsavel-resend:[\s\S]*?p_request_id/i);
  assert.match(
    reserve,
    /portal-responsavel-resend-target:[\s\S]*?p_responsavel_legal_id/i,
  );
  assert.match(
    reserve,
    /UPDATE public\.portal_responsavel_reenvios_acesso AS reenvio[\s\S]*?estado = 'FALHOU'[\s\S]*?falhou_em = pg_catalog\.clock_timestamp\(\)[\s\S]*?reenvio\.estado = 'RESERVADO'[\s\S]*?reenvio\.reservado_em <=[\s\S]*?pg_catalog\.clock_timestamp\(\) - interval '5 minutes'/i,
  );
  assert.ok(
    reserve.indexOf("portal-responsavel-resend-target:") <
      reserve.indexOf("UPDATE public.portal_responsavel_reenvios_acesso"),
    "A expiração ambígua deve ocorrer sob o advisory exclusivo do destinatário.",
  );
  assert.ok(
    reserve.indexOf("UPDATE public.portal_responsavel_reenvios_acesso") <
      reserve.indexOf("WHERE reenvio.actor_auth_user_id"),
    "Reservas vencidas devem virar FALHOU antes do replay por request_id.",
  );
  assert.match(reserve, /FOR UPDATE/i);
  assert.match(
    reserve,
    /responsavel_legal_id IS DISTINCT FROM[\s\S]*?PORTAL_REENVIO_RESPONSAVEL_REQUEST_REPLAY_DIVERGENTE/i,
  );
  assert.match(
    reserve,
    /estado = 'ENVIADO'[\s\S]*?'shouldSend', false[\s\S]*?'state', 'sent'/i,
  );
  assert.match(
    reserve,
    /estado = 'RESERVADO'[\s\S]*?'shouldSend', false[\s\S]*?'state', 'reserved'/i,
  );
  assert.match(
    reserve,
    /tentativas = reenvio\.tentativas \+ 1[\s\S]*?'shouldSend', true[\s\S]*?'replayed', true/i,
  );
  assert.match(complete, /estado = 'ENVIADO'[\s\S]*?RETURN true/i);
  assert.match(cancel, /estado = 'FALHOU'[\s\S]*?RETURN true/i);

  for (
    const rpc of [
      "portal_reservar_reenvio_acesso_responsavel",
      "portal_concluir_reenvio_acesso_responsavel",
      "portal_cancelar_reenvio_acesso_responsavel",
    ]
  ) {
    const block = functionBlock(`public.${rpc}(`);
    assert.match(block, /SECURITY DEFINER/i);
    assert.match(block, /SET search_path = ''/i);
    assert.match(
      block,
      /portal_identidade_exigir_service_role_actor|responsavel_legal_acesso_preparar/i,
    );
    assert.match(
      compactSql,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${rpc}\\(uuid, uuid, uuid\\)[\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role`,
        "i",
      ),
    );
    assert.match(
      compactSql,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${rpc}\\(uuid, uuid, uuid\\)[\\s\\S]*?TO service_role`,
        "i",
      ),
    );
  }
});

Deno.test("assinaturas de Aluno e Responsável respeitam a barreira simétrica de primeiro acesso", () => {
  const signatureGate = functionBlock(
    "public.assinatura_eletronica_perfil_contexto_valido(",
  );
  const responsibleBranch = signatureGate.slice(
    signatureGate.indexOf("WHEN 'RESPONSAVEL_LEGAL'"),
    signatureGate.indexOf("WHEN 'ALUNO'"),
  );
  const studentBranch = signatureGate.slice(
    signatureGate.indexOf("WHEN 'ALUNO'"),
    signatureGate.indexOf("ELSE false"),
  );

  assert.match(
    responsibleBranch,
    /responsavel\.auth_user_id = p_actor_auth_user_id/i,
  );
  assert.match(responsibleBranch, /responsavel\.status = 'ATIVO'/i);
  assert.match(responsibleBranch, /senha_atualizada_em IS NOT NULL/i);
  assert.match(
    responsibleBranch,
    /NOT coalesce\(responsavel\.troca_senha_obrigatoria, false\)/i,
  );
  assert.match(responsibleBranch, /senha_temporaria_pendente/i);
  assert.match(
    responsibleBranch,
    /senha_atualizada_em <=[\s\S]*?senha_temporaria_emitida_em/i,
  );
  assert.match(responsibleBranch, /aceitou_termos_uso/i);
  assert.match(responsibleBranch, /aceitou_termos_uso_em IS NOT NULL/i);
  assert.match(
    responsibleBranch,
    /termos_uso_versao =[\s\S]*?portal_identidade_termos_versao_vigente\(\)/i,
  );

  assert.match(studentBranch, /aluno\.auth_user_id = p_actor_auth_user_id/i);
  assert.match(studentBranch, /upper\(aluno\.tipo\) = 'ALUNO'/i);
  assert.match(studentBranch, /public\.is_active_status\(aluno\.status\)/i);
  assert.match(
    studentBranch,
    /NOT coalesce\(aluno\.troca_senha_obrigatoria, false\)/i,
  );
  assert.match(studentBranch, /senha_temporaria_pendente/i);
  assert.match(
    studentBranch,
    /senha_atualizada_em <=[\s\S]*?senha_temporaria_emitida_em/i,
  );
  assert.match(studentBranch, /aceitou_termos_uso/i);
  assert.match(
    studentBranch,
    /termos_uso_versao =[\s\S]*?portal_identidade_termos_versao_vigente\(\)/i,
  );
});
