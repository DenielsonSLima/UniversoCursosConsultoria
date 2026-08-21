// @ts-nocheck -- contrato estatico da migration/Edge executado pelo Deno.

import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../migrations/20260819150000_harden_assinatura_reauth_attempt_nonce.sql",
  import.meta.url,
);
const edgeUrl = new URL(
  "../functions/assinatura-eletronica-reautenticacao/reauthentication.ts",
  import.meta.url,
);
const adapterUrl = new URL(
  "../functions/assinatura-eletronica-reautenticacao/supabase-adapter.ts",
  import.meta.url,
);

const [sql, edge, adapter] = await Promise.all([
  Deno.readTextFile(migrationUrl),
  Deno.readTextFile(edgeUrl),
  Deno.readTextFile(adapterUrl),
]);

const functionBlock = (signature: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  const end = sql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Funcao ${signature} ausente.`);
  return sql.slice(start, end);
};

const prepare = functionBlock(
  "public.assinatura_eletronica_internal_preparar_reautenticacao(",
);
const register = functionBlock(
  "public.assinatura_eletronica_internal_registrar_reautenticacao(",
);

Deno.test("migration incremental e atomica separa attemptId de requestId", () => {
  assert.match(sql, /^--[\s\S]*?\nBEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(
    sql,
    /ADD COLUMN attempt_id uuid[\s\S]*?ADD COLUMN consumido_em timestamptz[\s\S]*?ADD COLUMN desafio_id uuid/i,
  );
  assert.match(sql, /SET attempt_id = id[\s\S]*?WHERE attempt_id IS NULL/i);
  assert.match(
    sql,
    /DROP CONSTRAINT assinatura_eletronica_reauth_tentativas_request_key/i,
  );
  assert.match(
    sql,
    /assinatura_eletronica_reauth_tentativas_attempt_key[\s\S]*?UNIQUE \(attempt_id\)/i,
  );
  assert.match(
    sql,
    /\(consumido_em IS NULL AND desafio_id IS NULL\)[\s\S]*?\(consumido_em IS NOT NULL AND desafio_id IS NOT NULL\)/i,
  );
  assert.doesNotMatch(
    sql,
    /UNIQUE\s*\(actor_auth_user_id,\s*request_id\)/i,
  );
});

Deno.test("Edge gera attemptId no servidor e nunca aceita esse campo do cliente", () => {
  assert.match(edge, /globalThis\.crypto\.randomUUID\(\)/);
  assert.match(edge, /const attemptId = String\(/);
  assert.match(edge, /prepareInput\(body, identity, attemptId\)/);
  assert.match(edge, /await dependencies\.prepareReauthentication\(input\)/);
  assert.match(edge, /await dependencies\.registerReauthentication\(\{/);
  assert.match(edge, /value\.attemptId\.toLowerCase\(\) !== expectedAttemptId/);

  const requestKeys = edge.slice(
    edge.indexOf('if (source.action === "REAUTHENTICATE")'),
    edge.indexOf('if (source.action === "CONFIRM_SIGNATURE")'),
  );
  assert.doesNotMatch(requestKeys, /"attemptId"/);
  assert.match(adapter, /p_attempt_id: input\.attemptId/g);
});

Deno.test("preflight autoriza antes do replay e conta attemptId sob lock por ator", () => {
  assert.match(prepare, /p_request_id uuid[\s\S]*?p_attempt_id uuid/i);
  const authorization = prepare.indexOf(
    "assinatura_eletronica_exigir_sessao_ativa",
  );
  const scope = prepare.indexOf("assinatura_eletronica_validar_escopo_reauth");
  const replay = prepare.indexOf("SELECT tentativa.* INTO v_attempt");
  assert.ok(authorization >= 0 && scope > authorization && replay > scope);

  assert.match(
    prepare,
    /assinatura:reauth:rate:' \|\| p_actor_auth_user_id::text/i,
  );
  assert.match(
    prepare,
    /WHERE tentativa\.attempt_id = p_attempt_id[\s\S]*?FOR UPDATE/i,
  );
  assert.match(
    prepare,
    /v_attempt\.actor_auth_user_id IS DISTINCT FROM p_actor_auth_user_id[\s\S]*?v_attempt\.auth_session_id IS DISTINCT FROM p_auth_session_id[\s\S]*?v_attempt\.envelope_id IS DISTINCT FROM p_envelope_id[\s\S]*?v_attempt\.participante_id IS DISTINCT FROM p_participante_id[\s\S]*?v_attempt\.request_id IS DISTINCT FROM p_request_id/i,
  );
  assert.match(
    prepare,
    /created_at > statement_timestamp\(\) - interval '15 minutes'/i,
  );
  assert.match(prepare, /IF v_count >= 5/i);
  assert.match(prepare, /ASSINATURA_REAUTH_RATE_LIMITED/i);
  assert.match(
    prepare,
    /INSERT INTO public\.assinatura_eletronica_reauth_tentativas[\s\S]*?p_request_id,[\s\S]*?p_attempt_id/i,
  );
  assert.match(
    prepare,
    /'PREPARAR_REAUTENTICACAO',[\s\S]*?p_attempt_id,[\s\S]*?v_attempt_payload_sha256/i,
  );
});

Deno.test("replay do preflight revalida a identidade de senha corrente", () => {
  const replayLookup = prepare.indexOf("SELECT operacao.* INTO v_replay");
  const currentCredentialGuard = prepare.indexOf(
    "ASSINATURA_REAUTH_CREDENCIAL_CORRENTE_DIVERGENTE",
  );
  const cachedReturn = prepare.indexOf("RETURN v_replay.resultado");
  assert.ok(
    replayLookup >= 0 && currentCredentialGuard > replayLookup &&
      cachedReturn > currentCredentialGuard,
  );
  assert.match(
    prepare,
    /jsonb_typeof\(v_replay\.resultado -> 'email'\) IS DISTINCT FROM 'string'[\s\S]*?lower\(btrim\(v_replay\.resultado ->> 'email'\)\)[\s\S]*?IS DISTINCT FROM lower\(btrim\(v_scope ->> 'email'\)\)/i,
  );
  assert.match(
    prepare,
    /v_replay\.resultado -> 'passwordEnabled' IS DISTINCT FROM 'true'::jsonb[\s\S]*?v_scope -> 'passwordEnabled' IS DISTINCT FROM 'true'::jsonb/i,
  );
});

Deno.test("registrador exige exatamente a tentativa preparada e a consome uma vez", () => {
  assert.match(
    register,
    /p_request_id uuid,[\s\S]*?p_attempt_id uuid/i,
  );
  const authorization = register.indexOf(
    "assinatura_eletronica_exigir_sessao_ativa",
  );
  const scope = register.indexOf("assinatura_eletronica_validar_escopo_reauth");
  const replay = register.indexOf("SELECT operacao.* INTO v_replay");
  assert.ok(authorization >= 0 && scope > authorization && replay > scope);

  assert.match(
    register,
    /WHERE tentativa\.attempt_id = p_attempt_id[\s\S]*?FOR UPDATE/i,
  );
  assert.match(
    register,
    /operacao\.request_id = p_attempt_id[\s\S]*?v_preflight\.payload_sha256 IS DISTINCT FROM v_attempt_payload_sha256/i,
  );
  assert.match(
    register,
    /desafio\.actor_auth_user_id = p_actor_auth_user_id[\s\S]*?desafio\.auth_session_id = p_auth_session_id[\s\S]*?desafio\.request_id = p_request_id/i,
  );
  assert.match(
    register,
    /SET consumido_em = statement_timestamp\(\),[\s\S]*?desafio_id = v_challenge_id/i,
  );
  assert.match(register, /ASSINATURA_REAUTH_ATTEMPT_JA_CONSUMIDO/i);
  assert.match(
    register,
    /public\.assinatura_eletronica_internal_registrar_reautenticacao\([\s\S]*?p_evidencia,[\s\S]*?p_request_id[\s\S]*?\);/i,
  );
});

Deno.test("registrador revalida a identidade de senha antes de emitir ou replayar ticket", () => {
  const preflightLookup = register.indexOf(
    "SELECT operacao.* INTO v_preflight",
  );
  const currentCredentialGuard = register.indexOf(
    "ASSINATURA_REAUTH_CREDENCIAL_CORRENTE_DIVERGENTE",
  );
  const replayLookup = register.indexOf("SELECT operacao.* INTO v_replay");
  const issuerCall = register.indexOf(
    "v_resultado := public.assinatura_eletronica_internal_registrar_reautenticacao",
  );
  assert.ok(
    preflightLookup >= 0 && currentCredentialGuard > preflightLookup &&
      replayLookup > currentCredentialGuard && issuerCall > replayLookup,
  );
  assert.match(
    register,
    /jsonb_typeof\(v_preflight\.resultado -> 'email'\) IS DISTINCT FROM 'string'[\s\S]*?lower\(btrim\(v_preflight\.resultado ->> 'email'\)\)[\s\S]*?IS DISTINCT FROM lower\(btrim\(v_scope ->> 'email'\)\)/i,
  );
  assert.match(
    register,
    /v_preflight\.resultado -> 'passwordEnabled' IS DISTINCT FROM 'true'::jsonb[\s\S]*?v_scope -> 'passwordEnabled' IS DISTINCT FROM 'true'::jsonb/i,
  );
});

Deno.test("somente overloads com attemptId ficam executaveis pelo service_role", () => {
  const compactSql = sql.replace(/\s+/g, " ");
  for (
    const signature of [
      "assinatura_eletronica_internal_preparar_reautenticacao\\(\\s*uuid, uuid, text, uuid, uuid, uuid, uuid\\s*\\)",
      "assinatura_eletronica_internal_registrar_reautenticacao\\(\\s*uuid, uuid, text, uuid, uuid, uuid, timestamptz, jsonb, uuid\\s*\\)",
    ]
  ) {
    assert.match(
      compactSql,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${signature}[\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role`,
        "i",
      ),
    );
  }
  for (
    const signature of [
      "assinatura_eletronica_internal_preparar_reautenticacao\\(\\s*uuid, uuid, text, uuid, uuid, uuid, uuid, uuid\\s*\\)",
      "assinatura_eletronica_internal_registrar_reautenticacao\\(\\s*uuid, uuid, text, uuid, uuid, uuid, timestamptz, jsonb, uuid, uuid\\s*\\)",
    ]
  ) {
    assert.match(
      compactSql,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${signature}[\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role`,
        "i",
      ),
    );
    assert.match(
      compactSql,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${signature}[\\s\\S]*?TO service_role`,
        "i",
      ),
    );
  }
  assert.match(
    sql,
    /REVOKE ALL ON TABLE public\.assinatura_eletronica_reauth_tentativas[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i,
  );
  assert.match(sql, /SET search_path = ''/g);
});

Deno.test("hardening nao persiste nem registra senha ou tokens", () => {
  const source = `${sql}\n${edge}\n${adapter}`;
  const attemptInsert = prepare.match(
    /INSERT INTO public\.assinatura_eletronica_reauth_tentativas\s*\([\s\S]*?\) VALUES \([\s\S]*?\);/i,
  )?.[0] || "";
  assert.ok(attemptInsert);
  assert.doesNotMatch(sql, /ADD COLUMN\s+(?:password|senha|token)/i);
  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)/);
  assert.doesNotMatch(
    attemptInsert,
    /(?:password|senha|accessToken|refreshToken)/i,
  );
});

Deno.test("CONFIRM permanece no contrato logico requestId/ticket", () => {
  assert.match(
    adapter,
    /p_ticket: input\.ticket,[\s\S]*?p_request_id: input\.requestId,[\s\S]*?p_actor_auth_user_id: input\.userId,[\s\S]*?p_auth_session_id: input\.sessionId/i,
  );
  assert.doesNotMatch(
    adapter.slice(adapter.indexOf("confirmSignature: async")),
    /p_attempt_id/,
  );
});
