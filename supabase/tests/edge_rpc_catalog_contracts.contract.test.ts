// @ts-nocheck -- contrato estatico de migrations e Edge executado pelo Deno.

import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../migrations/20260819224314_harden_edge_rpc_contracts.sql",
  import.meta.url,
);
const artifactAdapterUrl = new URL(
  "../functions/assinatura-eletronica-diario-artefatos/supabase-adapter.ts",
  import.meta.url,
);
const responsavelHandlerUrl = new URL(
  "../functions/portal-user-management/handlers/ensure-responsavel-access.ts",
  import.meta.url,
);
const functionsRootUrl = new URL("../functions/", import.meta.url);

const sql = await Deno.readTextFile(migrationUrl);
const artifactAdapter = await Deno.readTextFile(artifactAdapterUrl);
const responsavelHandler = await Deno.readTextFile(responsavelHandlerUrl);
const compactSql = sql.replace(/\s+/g, " ").trim();

const byteLength = (value: string) =>
  new TextEncoder().encode(value).byteLength;
const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const argsRegex = (args: string[]) => args.map(escapeRegex).join("\\s*,\\s*");

const functionBlock = (name: string) => {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const start = sql.indexOf(marker);
  const end = sql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Funcao ${name} ausente.`);
  return sql.slice(start, end);
};

const assertAcl = (
  name: string,
  args: string[],
  grantedRole: "service_role" | "authenticated",
) => {
  const signature = `public\\.${escapeRegex(name)}\\(\\s*${
    argsRegex(args)
  }\\s*\\)`;
  assert.match(
    compactSql,
    new RegExp(
      `REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated, service_role`,
      "i",
    ),
  );
  assert.match(
    compactSql,
    new RegExp(`GRANT EXECUTE ON FUNCTION ${signature} TO ${grantedRole}`, "i"),
  );
  const otherRole = grantedRole === "service_role"
    ? "authenticated"
    : "service_role";
  assert.doesNotMatch(
    compactSql,
    new RegExp(`GRANT EXECUTE ON FUNCTION ${signature} TO ${otherRole}`, "i"),
  );
};

const serviceAliases = [
  {
    name: "assinatura_eletronica_rpc_publicar_original_diario",
    target: "assinatura_eletronica_internal_registrar_original_publicar_segu",
    args: [
      "uuid",
      "uuid",
      "uuid",
      "text",
      "text",
      "bigint",
      "text",
      "text",
      "jsonb",
      "jsonb",
      "jsonb",
      "jsonb",
      "uuid",
    ],
  },
  {
    name: "assinatura_eletronica_rpc_iniciar_finalizacao_diario",
    target: "assinatura_eletronica_internal_iniciar_finalizacao_diario_segur",
    args: ["uuid", "uuid", "uuid", "uuid"],
  },
  {
    name: "assinatura_eletronica_rpc_finalizar_artefatos_diario",
    target: "assinatura_eletronica_internal_registrar_artefato_finalizar_dia",
    args: [
      "uuid",
      "uuid",
      "uuid",
      "text",
      "text",
      "bigint",
      "text",
      "text",
      "text",
      "bigint",
      "text",
      "uuid",
    ],
  },
] as const;

Deno.test("migration incremental e atomica preserva o ledger aplicado", () => {
  assert.match(sql, /^--[\s\S]*?\nBEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /DROP\s+FUNCTION/i);
  assert.match(sql, /NAMEDATALEN = 64, maximo de 63 bytes/i);
  for (const alias of serviceAliases) {
    assert.match(
      sql,
      new RegExp(
        `to_regprocedure\\([\\s\\S]*?${escapeRegex(alias.target)}\\(`,
        "i",
      ),
    );
  }
});

Deno.test("aliases explicitos preservam assinatura segura e fecham nomes truncados", () => {
  for (const alias of serviceAliases) {
    assert.ok(byteLength(alias.name) <= 63, `${alias.name} excede 63 bytes.`);
    assert.equal(
      byteLength(alias.target),
      63,
      `${alias.target} nao e o nome truncado real.`,
    );
    const block = functionBlock(alias.name);
    assert.match(block, /RETURNS jsonb/i);
    assert.match(block, /LANGUAGE plpgsql/i);
    assert.match(block, /SECURITY DEFINER/i);
    assert.match(block, /SET search_path = ''/i);
    assert.match(
      block,
      new RegExp(`RETURN public\\.${escapeRegex(alias.target)}\\(`, "i"),
    );
    assertAcl(alias.name, [...alias.args], "service_role");
    assert.match(
      compactSql,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${escapeRegex(alias.target)}\\(\\s*${
          argsRegex([...alias.args])
        }\\s*\\) FROM PUBLIC, anon, authenticated, service_role`,
        "i",
      ),
    );
  }

  const legacySignatures = [
    {
      name: "assinatura_eletronica_internal_registrar_original_publicar",
      args: [
        "uuid",
        "text",
        "text",
        "bigint",
        "text",
        "text",
        "jsonb",
        "jsonb",
        "jsonb",
        "uuid",
      ],
    },
    {
      name: "assinatura_eletronica_internal_iniciar_finalizacao",
      args: ["uuid", "uuid"],
    },
    {
      name: "assinatura_eletronica_internal_registrar_artefato_finalizar",
      args: [
        "uuid",
        "text",
        "text",
        "bigint",
        "text",
        "text",
        "text",
        "bigint",
        "text",
        "uuid",
      ],
    },
  ];
  for (const legacy of legacySignatures) {
    assert.match(
      compactSql,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${escapeRegex(legacy.name)}\\(\\s*${
          argsRegex(legacy.args)
        }\\s*\\) FROM PUBLIC, anon, authenticated, service_role`,
        "i",
      ),
    );
  }
});

Deno.test("Vault e HMAC do convite sao exclusivos, exatos e fail-closed", () => {
  const name = "portal_identidade_assinar_convite_responsavel";
  assert.ok(byteLength(name) <= 63);
  assert.match(
    sql,
    /WHERE segredo\.name = 'portal_invite_reconciliation_hmac_secret'[\s\S]*?IF v_secret_count = 0 THEN[\s\S]*?vault\.create_secret\([\s\S]*?extensions\.gen_random_bytes\(32\)[\s\S]*?ELSIF v_secret_count > 1 THEN[\s\S]*?PORTAL_INVITE_RECONCILIATION_SECRET_DUPLICADO/i,
  );
  assert.match(
    sql,
    /IF v_secret_count <> 1 THEN[\s\S]*?PORTAL_INVITE_RECONCILIATION_SECRET_INDISPONIVEL/i,
  );

  const block = functionBlock(name);
  assert.match(block, /RETURNS text/i);
  assert.match(
    block,
    /STABLE[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i,
  );
  assert.match(
    block,
    /responsavel_legal_acesso_preparar\([\s\S]*?p_responsavel_legal_id[\s\S]*?p_current_actor_auth_user_id/i,
  );
  assert.match(block, /'eligible'\)::boolean, false/i);
  assert.match(block, /v_email IS DISTINCT FROM v_canonical_email/i);
  assert.match(
    block,
    /FROM vault\.decrypted_secrets[\s\S]*?v_secret_count <> 1[\s\S]*?octet_length\(v_secret\) < 32/i,
  );
  assert.match(
    block,
    /v_payload := 'v1' \|\| E'\\n'[\s\S]*?p_original_actor_auth_user_id::text[\s\S]*?p_request_id::text[\s\S]*?p_responsavel_legal_id::text[\s\S]*?v_email/i,
  );
  assert.match(block, /RETURN pg_catalog\.encode\([\s\S]*?extensions\.hmac\(/i);
  assert.doesNotMatch(block, /RETURN\s+v_secret/i);
  assertAcl(
    name,
    ["uuid", "uuid", "uuid", "uuid", "text"],
    "service_role",
  );
});

Deno.test("lookup atual autoriza no banco e delega o shape canonico", () => {
  const name = "assinatura_eletronica_obter_envelope_diario_atual";
  assert.ok(byteLength(name) <= 63);
  const block = functionBlock(name);
  assert.match(block, /RETURNS jsonb/i);
  assert.match(
    block,
    /STABLE[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i,
  );
  assert.match(block, /v_perfil <> 'GESTOR'/i);
  const authorize = block.indexOf(
    "public.assinatura_eletronica_gestor_pode_gerir_diario(",
  );
  const locate = block.indexOf("FROM public.assinatura_eletronica_envelopes");
  assert.ok(
    authorize >= 0 && locate > authorize,
    "Envelope localizado antes da autorizacao.",
  );
  assert.match(
    block,
    /IF NOT coalesce\([\s\S]*?assinatura_eletronica_gestor_pode_gerir_diario\([\s\S]*?false[\s\S]*?\) THEN/i,
  );
  assert.match(block, /envelope\.origem_tipo = 'DIARIO'/i);
  assert.match(
    block,
    /WHEN envelope\.status IN \([\s\S]*?'RASCUNHO'[\s\S]*?'PENDENTE'[\s\S]*?'EM_ASSINATURA'[\s\S]*?'FINALIZANDO'[\s\S]*?THEN 0/i,
  );
  assert.match(
    block,
    /envelope\.origem_versao DESC[\s\S]*?envelope\.updated_at DESC[\s\S]*?envelope\.id DESC/i,
  );
  assert.match(block, /IF v_envelope_id IS NULL THEN\s+RETURN NULL;/i);
  assert.match(
    block,
    /RETURN public\.assinatura_eletronica_obter_envelope\([\s\S]*?v_envelope_id[\s\S]*?v_perfil[\s\S]*?p_context_id/i,
  );
  assert.doesNotMatch(block, /jsonb_build_object/i);
  assertAcl(name, ["uuid", "uuid", "text", "uuid"], "authenticated");
});

const collectEdgeSources = async (
  root: URL,
  output: Array<{ url: URL; source: string }> = [],
) => {
  for await (const entry of Deno.readDir(root)) {
    const url = new URL(`${entry.name}${entry.isDirectory ? "/" : ""}`, root);
    if (entry.isDirectory) {
      if (!entry.name.startsWith(".")) await collectEdgeSources(url, output);
      continue;
    }
    if (
      !entry.isFile || !entry.name.endsWith(".ts") ||
      entry.name.endsWith(".test.ts")
    ) {
      continue;
    }
    output.push({ url, source: await Deno.readTextFile(url) });
  }
  return output;
};

Deno.test("toda RPC literal ou constante chamada por Edge cabe no catalogo PostgreSQL", async () => {
  const sources = await collectEdgeSources(functionsRootUrl);
  const calls = new Map<string, string>();
  const patterns = [
    /\.rpc\(\s*["'`]([^"'`]+)["'`]/gu,
    /(?:export\s+)?const\s+[A-Z][A-Z0-9_]*_RPC\s*=\s*["'`]([^"'`]+)["'`]/gu,
  ];
  for (const { url, source } of sources) {
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        calls.set(match[1], url.pathname);
      }
    }
  }

  assert.ok(calls.size > 0, "Nenhuma RPC Edge foi detectada.");
  for (const [name, source] of calls) {
    assert.ok(
      byteLength(name) <= 63,
      `RPC Edge ${name} excede 63 bytes em ${source}.`,
    );
  }
  for (
    const expected of [
      ...serviceAliases.map((alias) => alias.name),
      "portal_identidade_assinar_convite_responsavel",
    ]
  ) {
    assert.ok(calls.has(expected), `Contrato Edge ausente: ${expected}`);
  }

  assert.match(
    artifactAdapter,
    /assinatura_eletronica_rpc_publicar_original_diario/,
  );
  assert.match(
    artifactAdapter,
    /assinatura_eletronica_rpc_iniciar_finalizacao_diario/,
  );
  assert.match(
    artifactAdapter,
    /assinatura_eletronica_rpc_finalizar_artefatos_diario/,
  );
  assert.match(
    responsavelHandler,
    /portal_identidade_assinar_convite_responsavel/,
  );
  assert.doesNotMatch(
    responsavelHandler,
    /PORTAL_INVITE_RECONCILIATION_SECRET/,
  );
});
