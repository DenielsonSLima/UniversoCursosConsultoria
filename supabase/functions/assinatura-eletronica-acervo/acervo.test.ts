// deno-lint-ignore-file require-await
import assert from "node:assert/strict";
import {
  ARCHIVE_DOWNLOAD_TTL_SECONDS,
  type ArchiveArtifactClass,
  type ArchiveDependencies,
  createArchiveHandler,
  type CreateDownloadUrlRequest,
  parseArchiveRequest,
  publicArchiveErrorFromUnknown,
} from "./acervo.ts";
import {
  authenticateArchiveBearer,
  createSupabaseArchiveDependencies,
  RESOLVE_ARCHIVE_ARTIFACT_RPC,
} from "./supabase-adapter.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const ENVELOPE_ID = "33333333-3333-4333-8333-333333333333";
const ARTIFACT_ID = "44444444-4444-4444-8444-444444444444";
const CONTEXT_ID = "55555555-5555-4555-8555-555555555555";
const REQUEST_ID = "66666666-6666-4666-8666-666666666666";
const BEARER = "user-jwt-that-must-never-leak";
const SHA256 = "a".repeat(64);
const FILE_NAME = "diario-de-classe-final.pdf";
const BUCKET_ID = "documentos-assinados-privado";
const STORAGE_PATH = `${ENVELOPE_ID}/${ARTIFACT_ID}.pdf`;
const SIGNED_URL = "https://storage.example.test/download?token=opaque";
const NOW = new Date("2026-08-19T18:30:00.000Z");

const body = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  action: "CREATE_DOWNLOAD_URL",
  envelopeId: ENVELOPE_ID,
  artifactClass: "DOCUMENTO_FINAL",
  profile: "GESTOR",
  contextId: CONTEXT_ID,
  requestId: REQUEST_ID,
  ...overrides,
});

const authorized = (
  overrides: Record<string, unknown> = {},
) => ({
  envelopeId: ENVELOPE_ID,
  artifactId: ARTIFACT_ID,
  artifactClass: "DOCUMENTO_FINAL" as ArchiveArtifactClass,
  sha256: SHA256,
  byteSize: 18432,
  mimeType: "application/pdf" as const,
  fileName: FILE_NAME,
  ...overrides,
});

const resolved = (overrides: Record<string, unknown> = {}) => ({
  requestId: REQUEST_ID,
  ...authorized(),
  bucketId: BUCKET_ID,
  storagePath: STORAGE_PATH,
  ...overrides,
});

const request = (
  requestBody: unknown,
  options: { bearer?: string; method?: string; contentType?: string } = {},
) =>
  new Request("https://example.test/assinatura-eletronica-acervo", {
    method: options.method || "POST",
    headers: {
      ...(options.bearer === ""
        ? {}
        : { authorization: `Bearer ${options.bearer || BEARER}` }),
      "content-type": options.contentType || "application/json",
    },
    body: (options.method || "POST") === "GET"
      ? undefined
      : JSON.stringify(requestBody),
  });

const dependencies = (
  overrides: Partial<ArchiveDependencies> = {},
): ArchiveDependencies => ({
  authenticate: async () => ({ userId: USER_ID, sessionId: SESSION_ID }),
  resolveAuthorizedArtifact: async () => resolved(),
  createSignedDownload: async () => SIGNED_URL,
  now: () => NOW,
  ...overrides,
});

const responseJson = async (response: Response) => ({
  response,
  json: await response.json() as Record<string, unknown>,
});

Deno.test("requires bearer authentication before reading the archive body", async () => {
  let authCalls = 0;
  const handler = createArchiveHandler(dependencies({
    authenticate: async () => {
      authCalls += 1;
      throw new Error("must not run");
    },
  }));
  const { response, json } = await responseJson(
    await handler(request(body(), { bearer: "" })),
  );
  assert.equal(response.status, 401);
  assert.equal(
    (json.error as Record<string, unknown>).code,
    "AUTHENTICATION_REQUIRED",
  );
  assert.equal(authCalls, 0);
});

Deno.test("returns the frozen response contract and a private 120-second URL", async () => {
  const calls: string[] = [];
  const signedInputs: unknown[] = [];
  const handler = createArchiveHandler(dependencies({
    authenticate: async (bearer) => {
      calls.push("authenticate");
      assert.equal(bearer, BEARER);
      return { userId: USER_ID, sessionId: SESSION_ID };
    },
    resolveAuthorizedArtifact: async (identity, input) => {
      calls.push("authorize-resolve-service-rpc");
      assert.deepEqual(identity, { userId: USER_ID, sessionId: SESSION_ID });
      assert.deepEqual(input, body());
      return resolved();
    },
    createSignedDownload: async (input) => {
      calls.push("sign-private-storage");
      signedInputs.push(input);
      return SIGNED_URL;
    },
  }));

  const { response, json } = await responseJson(await handler(request(body())));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    "authenticate",
    "authorize-resolve-service-rpc",
    "sign-private-storage",
  ]);
  assert.deepEqual(signedInputs, [{
    bucketId: BUCKET_ID,
    storagePath: STORAGE_PATH,
    fileName: FILE_NAME,
    expiresIn: 120,
  }]);
  assert.deepEqual(json, {
    ok: true,
    action: "CREATE_DOWNLOAD_URL",
    requestId: REQUEST_ID,
    data: {
      ...authorized(),
      url: SIGNED_URL,
      expiresAt: "2026-08-19T18:32:00.000Z",
      expiresIn: 120,
    },
  });
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  const serialized = JSON.stringify(json);
  assert.equal(serialized.includes("bucketId"), false);
  assert.equal(serialized.includes("storagePath"), false);
  assert.equal(serialized.includes(BEARER), false);
});

Deno.test("retries keep the same actor, session, scope and requestId binding", async () => {
  const calls: Array<{
    identity: unknown;
    input: CreateDownloadUrlRequest;
  }> = [];
  const handler = createArchiveHandler(dependencies({
    resolveAuthorizedArtifact: async (identity, input) => {
      calls.push({ identity, input });
      return resolved();
    },
  }));

  const first = await responseJson(await handler(request(body())));
  const retry = await responseJson(await handler(request(body())));
  assert.equal(first.response.status, 200);
  assert.equal(retry.response.status, 200);
  assert.equal(first.json.requestId, REQUEST_ID);
  assert.equal(retry.json.requestId, REQUEST_ID);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[0], {
    identity: { userId: USER_ID, sessionId: SESSION_ID },
    input: body(),
  });
});

Deno.test("accepts only the three frozen external artifact classes", async () => {
  const classes: ArchiveArtifactClass[] = [
    "DOCUMENTO_ORIGINAL",
    "DOCUMENTO_FINAL",
    "COMPROVANTE_EVIDENCIA",
  ];
  const forwarded: ArchiveArtifactClass[] = [];
  const handler = createArchiveHandler(dependencies({
    resolveAuthorizedArtifact: async (_identity, input) => {
      forwarded.push(input.artifactClass);
      return resolved({
        artifactClass: forwarded.at(-1),
      });
    },
  }));

  for (const artifactClass of classes) {
    const { response } = await responseJson(
      await handler(request(body({ artifactClass }))),
    );
    assert.equal(response.status, 200, artifactClass);
  }
  assert.deepEqual(forwarded, classes);
  assert.throws(
    () => parseArchiveRequest(body({ artifactClass: "ARQUIVO_INTERNO" })),
    /inválidos/i,
  );
});

Deno.test("does not derive profile/class permissions outside the atomic RPC", async () => {
  const forwarded: CreateDownloadUrlRequest[] = [];
  const handler = createArchiveHandler(dependencies({
    resolveAuthorizedArtifact: async (_identity, input) => {
      forwarded.push(input);
      throw {
        code: "42501",
        message: "ASSINATURA_ACERVO_NAO_AUTORIZADO contexto privado",
      };
    },
    createSignedDownload: async () => {
      throw new Error("must not run");
    },
  }));

  const { response, json } = await responseJson(
    await handler(request(body({
      profile: "PROFESSOR",
      artifactClass: "DOCUMENTO_FINAL",
    }))),
  );
  assert.equal(response.status, 403);
  assert.equal((json.error as Record<string, unknown>).code, "ACCESS_DENIED");
  assert.equal(forwarded.length, 1);
  assert.equal(forwarded[0].contextId, CONTEXT_ID);
  assert.equal(JSON.stringify(json).includes("contexto privado"), false);
});

Deno.test("fails closed when the atomic RPC diverges from the immutable request", async () => {
  const divergences: Array<[string, unknown]> = [
    ["requestId", "77777777-7777-4777-8777-777777777777"],
    ["envelopeId", "77777777-7777-4777-8777-777777777777"],
    ["artifactClass", "DOCUMENTO_ORIGINAL"],
  ];
  for (const [key, value] of divergences) {
    let signCalls = 0;
    const handler = createArchiveHandler(dependencies({
      resolveAuthorizedArtifact: async () => resolved({ [key]: value }),
      createSignedDownload: async () => {
        signCalls += 1;
        return SIGNED_URL;
      },
    }));
    const { response, json } = await responseJson(
      await handler(request(body())),
    );
    assert.equal(response.status, 503, key);
    assert.equal(
      (json.error as Record<string, unknown>).code,
      "ARTIFACT_UNAVAILABLE",
      key,
    );
    assert.equal(signCalls, 0, key);
    assert.equal(JSON.stringify(json).includes(STORAGE_PATH), false, key);
  }
});

Deno.test("fails closed on malformed private metadata from the atomic RPC", async () => {
  const malformed: Array<[string, unknown]> = [
    ["artifactId", "not-a-uuid"],
    ["sha256", "b".repeat(63)],
    ["mimeType", "application/octet-stream"],
    ["byteSize", 0],
    ["fileName", "../diario.pdf"],
    ["bucketId", "private/nested"],
    ["storagePath", "../escape.pdf"],
  ];
  for (const [key, value] of malformed) {
    let signCalls = 0;
    const handler = createArchiveHandler(dependencies({
      resolveAuthorizedArtifact: async () => resolved({ [key]: value }),
      createSignedDownload: async () => {
        signCalls += 1;
        return SIGNED_URL;
      },
    }));
    const { response, json } = await responseJson(
      await handler(request(body())),
    );
    assert.equal(response.status, 503, key);
    assert.equal(
      (json.error as Record<string, unknown>).code,
      "ARTIFACT_UNAVAILABLE",
      key,
    );
    assert.equal(signCalls, 0, key);
  }
});

Deno.test("enforces the 8 KiB request limit after authentication", async () => {
  let authCalls = 0;
  let resolverCalls = 0;
  const handler = createArchiveHandler(dependencies({
    authenticate: async () => {
      authCalls += 1;
      return { userId: USER_ID, sessionId: SESSION_ID };
    },
    resolveAuthorizedArtifact: async () => {
      resolverCalls += 1;
      return resolved();
    },
  }));
  const { response, json } = await responseJson(
    await handler(request(body({ extra: "x".repeat(9 * 1024) }))),
  );
  assert.equal(response.status, 413);
  assert.equal(
    (json.error as Record<string, unknown>).code,
    "REQUEST_BODY_TOO_LARGE",
  );
  assert.equal(authCalls, 1);
  assert.equal(resolverCalls, 0);
});

Deno.test("rejects extra keys and invalid UUIDs before atomic resolution", async () => {
  let resolverCalls = 0;
  const handler = createArchiveHandler(dependencies({
    resolveAuthorizedArtifact: async () => {
      resolverCalls += 1;
      return resolved();
    },
  }));
  for (
    const invalidBody of [
      body({ participantId: USER_ID }),
      body({ requestId: "not-a-uuid" }),
      body({ profile: "ADMIN" }),
    ]
  ) {
    const { response, json } = await responseJson(
      await handler(request(invalidBody)),
    );
    assert.equal(response.status, 400);
    assert.equal(
      (json.error as Record<string, unknown>).code,
      "INVALID_REQUEST",
    );
  }
  assert.equal(resolverCalls, 0);
});

Deno.test("sanitizes resolver and Storage failures", async () => {
  const secret = `${BUCKET_ID}/${STORAGE_PATH}?service_role=${BEARER}`;
  for (const stage of ["resolver", "storage"] as const) {
    const handler = createArchiveHandler(dependencies({
      resolveAuthorizedArtifact: async () => {
        if (stage === "resolver") throw new Error(secret);
        return resolved();
      },
      createSignedDownload: async () => {
        if (stage === "storage") throw new Error(secret);
        return SIGNED_URL;
      },
    }));
    const { response, json } = await responseJson(
      await handler(request(body())),
    );
    assert.equal(response.status, 503, stage);
    const serialized = JSON.stringify(json);
    assert.equal(serialized.includes(secret), false, stage);
    assert.equal(serialized.includes(BUCKET_ID), false, stage);
    assert.equal(serialized.includes(STORAGE_PATH), false, stage);
    assert.equal(serialized.includes(BEARER), false, stage);
  }
});

Deno.test("fails closed when session or RBAC is revoked at the atomic RPC boundary", async () => {
  const revokedCases = [
    {
      backend: {
        code: "55000",
        message: "ASSINATURA_SESSAO_INVALIDA_OU_REVOGADA",
      },
      status: 401,
      publicCode: "SESSION_INVALID",
    },
    {
      backend: {
        code: "42501",
        message: "ASSINATURA_ARTEFATO_NAO_AUTORIZADO",
      },
      status: 403,
      publicCode: "ACCESS_DENIED",
    },
  ] as const;

  for (const revoked of revokedCases) {
    let storageCalls = 0;
    const handler = createArchiveHandler(dependencies({
      resolveAuthorizedArtifact: async (identity, input) => {
        assert.deepEqual(identity, {
          userId: USER_ID,
          sessionId: SESSION_ID,
        });
        assert.equal(input.requestId, REQUEST_ID);
        throw revoked.backend;
      },
      createSignedDownload: async () => {
        storageCalls += 1;
        return SIGNED_URL;
      },
    }));
    const { response, json } = await responseJson(
      await handler(request(body())),
    );
    assert.equal(response.status, revoked.status);
    assert.equal(
      (json.error as Record<string, unknown>).code,
      revoked.publicCode,
    );
    assert.equal(storageCalls, 0);
  }
});

Deno.test("getClaims and getUser must agree on authenticated UID and session_id", async () => {
  const calls: string[] = [];
  let includeSession = true;
  const admin = {
    auth: {
      getClaims: async (bearer: string) => {
        calls.push(`claims:${bearer}`);
        const claims: Record<string, unknown> = {
          sub: USER_ID,
          role: "authenticated",
          is_anonymous: false,
        };
        if (includeSession) claims.session_id = SESSION_ID;
        return {
          data: { claims },
          error: null,
        };
      },
      getUser: async (bearer: string) => {
        calls.push(`user:${bearer}`);
        return {
          data: { user: { id: USER_ID, is_anonymous: false } },
          error: null,
        };
      },
    },
  };
  assert.deepEqual(await authenticateArchiveBearer(admin, BEARER), {
    userId: USER_ID,
    sessionId: SESSION_ID,
  });
  assert.deepEqual(calls, [`claims:${BEARER}`, `user:${BEARER}`]);

  includeSession = false;
  await assert.rejects(
    () => authenticateArchiveBearer(admin, BEARER),
    /sessão/i,
  );
});

Deno.test("adapter binds identity and request in one service-role RPC", async () => {
  const factoryCalls: Array<{
    apiKey: string;
    options: Record<string, unknown>;
  }> = [];
  const rpcCalls: Array<{
    name: string;
    args: Record<string, unknown>;
  }> = [];
  const storageCalls: unknown[] = [];
  const admin = {
    auth: {
      getClaims: async () => ({
        data: {
          claims: {
            sub: USER_ID,
            session_id: SESSION_ID,
            role: "authenticated",
            is_anonymous: false,
          },
        },
        error: null,
      }),
      getUser: async () => ({
        data: { user: { id: USER_ID, is_anonymous: false } },
        error: null,
      }),
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return { data: resolved(), error: null };
    },
    storage: {
      from: (bucketId: string) => ({
        createSignedUrl: async (
          storagePath: string,
          expiresIn: number,
          options: { download: string },
        ) => {
          storageCalls.push({ bucketId, storagePath, expiresIn, options });
          return { data: { signedUrl: SIGNED_URL }, error: null };
        },
      }),
    },
  };
  const factory = (
    _url: string,
    apiKey: string,
    options: Record<string, unknown>,
  ) => {
    factoryCalls.push({ apiKey, options });
    return admin;
  };
  const deps = createSupabaseArchiveDependencies({
    supabaseUrl: "https://project.supabase.co",
    serviceRoleKey: "service-role-key",
  }, factory);

  const identity = await deps.authenticate(BEARER);
  const parsed = parseArchiveRequest(body());
  assert.deepEqual(
    await deps.resolveAuthorizedArtifact(identity, parsed),
    resolved(),
  );
  assert.equal(
    await deps.createSignedDownload({
      bucketId: BUCKET_ID,
      storagePath: STORAGE_PATH,
      fileName: FILE_NAME,
      expiresIn: ARCHIVE_DOWNLOAD_TTL_SECONDS,
    }),
    SIGNED_URL,
  );

  assert.equal(factoryCalls.length, 1);
  assert.equal(factoryCalls[0].apiKey, "service-role-key");
  assert.deepEqual(rpcCalls, [
    {
      name: RESOLVE_ARCHIVE_ARTIFACT_RPC,
      args: {
        p_envelope_id: ENVELOPE_ID,
        p_classe: "DOCUMENTO_FINAL",
        p_perfil: "GESTOR",
        p_context_id: CONTEXT_ID,
        p_actor_auth_user_id: USER_ID,
        p_auth_session_id: SESSION_ID,
        p_request_id: REQUEST_ID,
      },
    },
  ]);
  assert.deepEqual(storageCalls, [{
    bucketId: BUCKET_ID,
    storagePath: STORAGE_PATH,
    expiresIn: 120,
    options: { download: FILE_NAME },
  }]);
});

Deno.test("rejects missing secure configuration and keeps known backend errors stable", () => {
  assert.throws(
    () =>
      createSupabaseArchiveDependencies({
        supabaseUrl: "https://project.supabase.co",
        serviceRoleKey: "",
      }),
    /temporariamente/i,
  );
  assert.equal(
    publicArchiveErrorFromUnknown({
      code: "42501",
      message: "ASSINATURA_ACERVO_NAO_AUTORIZADO",
    }).code,
    "ACCESS_DENIED",
  );
  const serviceRoleRequired = publicArchiveErrorFromUnknown({
    code: "42501",
    message: "ASSINATURA_SERVICE_ROLE_OBRIGATORIA",
  });
  assert.equal(serviceRoleRequired.status, 503);
  assert.equal(
    serviceRoleRequired.code,
    "SECURE_CONFIGURATION_UNAVAILABLE",
  );
  assert.equal(
    publicArchiveErrorFromUnknown({
      code: "P0002",
      message: "ASSINATURA_ACERVO_ARTEFATO_NAO_ENCONTRADO",
    }).code,
    "ARTIFACT_NOT_FOUND",
  );
  assert.equal(
    publicArchiveErrorFromUnknown({
      code: "42501",
      message: "AUTENTICACAO_OBRIGATORIA",
    }).code,
    "SESSION_INVALID",
  );
  assert.equal(
    publicArchiveErrorFromUnknown({
      code: "55000",
      message: "ASSINATURA_SESSAO_INVALIDA_OU_REVOGADA",
    }).code,
    "SESSION_INVALID",
  );
  assert.equal(
    publicArchiveErrorFromUnknown({
      code: "22023",
      message: "ASSINATURA_ARTEFATO_ESCOPO_INVALIDO",
    }).code,
    "INVALID_REQUEST",
  );
});

Deno.test("config enables gateway JWT verification and source has no logging", async () => {
  const config = await Deno.readTextFile(
    new URL("../../config.toml", import.meta.url),
  );
  assert.match(
    config,
    /\[functions\.assinatura-eletronica-acervo\]\s+verify_jwt\s*=\s*true/,
  );
  for (const file of ["acervo.ts", "supabase-adapter.ts", "index.ts"]) {
    const source = await Deno.readTextFile(new URL(file, import.meta.url));
    assert.equal(source.includes("console."), false, file);
  }
});
