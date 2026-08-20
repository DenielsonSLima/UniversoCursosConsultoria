// deno-lint-ignore-file require-await
import assert from "node:assert/strict";
import {
  AuthenticationServiceError,
  createReauthenticationHandler,
  InvalidPasswordError,
  publicErrorFromUnknown,
  type ReauthenticationDependencies,
  sha256Text,
} from "./reauthentication.ts";
import {
  authenticateBearer,
  CONFIRM_SIGNATURE_RPC,
  createSupabaseReauthenticationDependencies,
  normalizeTicket,
  PREPARE_REAUTHENTICATION_RPC,
  REGISTER_REAUTHENTICATION_RPC,
} from "./supabase-adapter.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const ENVELOPE_ID = "33333333-3333-4333-8333-333333333333";
const PARTICIPANT_ID = "44444444-4444-4444-8444-444444444444";
const CONTEXT_ID = "55555555-5555-4555-8555-555555555555";
const REQUEST_ID = "66666666-6666-4666-8666-666666666666";
const CHALLENGE_ID = "77777777-7777-4777-8777-777777777777";
const ATTEMPT_ID = "99999999-9999-4999-8999-999999999999";
const SECOND_ATTEMPT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BEARER = "original-jwt-that-must-never-leak";
const PASSWORD = "password-that-must-never-leak";
const SECONDARY_TOKEN = "secondary-jwt-that-must-never-leak";
const TICKET = "opaque-ticket." + "a".repeat(64);
const CLIENT_IP = "203.0.113.42";
const USER_AGENT = "universo-signature-test/1.0";
const IP_HASH = "a".repeat(64);
const USER_AGENT_HASH = "b".repeat(64);
const TERM_SHA256 = "c".repeat(64);
const CONSENT = {
  accepted: true as const,
  termId: "diario_classe:v1",
  sha256: TERM_SHA256,
};

const reauthenticateBody = (overrides: Record<string, unknown> = {}) => ({
  action: "REAUTHENTICATE",
  envelopeId: ENVELOPE_ID,
  participantId: PARTICIPANT_ID,
  profile: "PROFESSOR",
  contextId: CONTEXT_ID,
  requestId: REQUEST_ID,
  password: PASSWORD,
  consent: CONSENT,
  ...overrides,
});

const confirmationBody = (overrides: Record<string, unknown> = {}) => ({
  action: "CONFIRM_SIGNATURE",
  requestId: REQUEST_ID,
  ticket: TICKET,
  ...overrides,
});

const request = (body: unknown, bearer = BEARER) =>
  new Request("https://example.test/assinatura-eletronica-reautenticacao", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${bearer}`,
      "content-type": "application/json",
      "user-agent": USER_AGENT,
      "x-forwarded-for": CLIENT_IP,
    },
    body: JSON.stringify(body),
  });

const ticket = () => ({
  ticket: TICKET,
  challengeId: CHALLENGE_ID,
  envelopeId: ENVELOPE_ID,
  participantId: PARTICIPANT_ID,
  participantRole: "PROFESSOR",
  participantOrder: 1,
  profile: "PROFESSOR",
  contextId: CONTEXT_ID,
  issuedAt: "2026-08-19T15:04:05.000Z",
  expiresAt: "2026-08-19T15:06:05.000Z",
});

const confirmation = () => ({
  envelopeId: ENVELOPE_ID,
  envelopeStatus: "FINALIZANDO",
  participantId: PARTICIPANT_ID,
  participantRole: "PROFESSOR",
  participantOrder: 1,
  participantStatus: "ASSINADO",
  signedAt: "2026-08-19T15:04:08.000Z",
  nextParticipantId: null,
  nextParticipantRole: null,
  requiresFinalization: true,
});

const dependencies = (
  overrides: Partial<ReauthenticationDependencies> = {},
): ReauthenticationDependencies => ({
  authenticate: async () => ({ userId: USER_ID, sessionId: SESSION_ID }),
  prepareReauthentication: async () => ({
    attemptId: ATTEMPT_ID,
    email: "professor@example.test",
    passwordEnabled: true,
    rateLimit: { remaining: 4, resetAt: "2026-08-19T15:19:05.000Z" },
  }),
  verifyPassword: async () => ({
    userId: USER_ID,
    accessToken: SECONDARY_TOKEN,
  }),
  revokeSecondarySession: async () => {},
  registerReauthentication: async () => ticket(),
  confirmSignature: async () => confirmation(),
  newAttemptId: () => ATTEMPT_ID,
  now: () => new Date("2026-08-19T15:04:05.987Z"),
  ...overrides,
});

const responseJson = async (response: Response) => ({
  response,
  body: await response.json() as Record<string, unknown>,
});

Deno.test("requires a bearer before reading signature input", async () => {
  let authenticated = false;
  const handler = createReauthenticationHandler(dependencies({
    authenticate: async () => {
      authenticated = true;
      throw new Error("must not run");
    },
  }));
  const raw = request(reauthenticateBody(), "");
  raw.headers.delete("authorization");
  const { response, body } = await responseJson(await handler(raw));
  assert.equal(response.status, 401);
  assert.equal(
    (body.error as Record<string, unknown>).code,
    "AUTHENTICATION_REQUIRED",
  );
  assert.equal(authenticated, false);
});

Deno.test("reauthenticates in the required order and revalidates the original session", async () => {
  const calls: string[] = [];
  const registered: Array<Record<string, unknown>> = [];
  const handler = createReauthenticationHandler(dependencies({
    authenticate: async (bearer) => {
      calls.push("authenticate");
      assert.equal(bearer, BEARER);
      return { userId: USER_ID, sessionId: SESSION_ID };
    },
    prepareReauthentication: async (input) => {
      calls.push("prepare");
      assert.equal(input.requestId, REQUEST_ID);
      assert.equal(input.attemptId, ATTEMPT_ID);
      assert.equal(input.sessionId, SESSION_ID);
      return {
        attemptId: ATTEMPT_ID,
        email: "PROFESSOR@EXAMPLE.TEST",
        passwordEnabled: true,
        rateLimit: {
          remaining: 4,
          resetAt: "2026-08-19T15:19:05.000Z",
        },
      };
    },
    verifyPassword: async (email, password) => {
      calls.push("verify-password");
      assert.equal(email, "professor@example.test");
      assert.equal(password, PASSWORD);
      return { userId: USER_ID, accessToken: SECONDARY_TOKEN };
    },
    revokeSecondarySession: async (accessToken) => {
      calls.push("revoke-secondary");
      assert.equal(accessToken, SECONDARY_TOKEN);
    },
    registerReauthentication: async (input) => {
      calls.push("register");
      registered.push(input as unknown as Record<string, unknown>);
      return ticket();
    },
  }));

  const { response, body } = await responseJson(
    await handler(request(reauthenticateBody())),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    "authenticate",
    "prepare",
    "verify-password",
    "revoke-secondary",
    "prepare",
    "register",
  ]);
  assert.equal(registered[0]?.reauthenticatedAt, "2026-08-19T15:04:05.000Z");
  assert.equal(registered[0]?.attemptId, ATTEMPT_ID);
  assert.deepEqual(registered[0]?.evidence, {
    provider: "SUPABASE_PASSWORD",
    authenticatedAt: "2026-08-19T15:04:05.000Z",
    ipHash: await sha256Text(
      `assinatura-eletronica:v1|ip|${REQUEST_ID}|${CLIENT_IP}`,
    ),
    userAgentHash: await sha256Text(
      `assinatura-eletronica:v1|user-agent|${REQUEST_ID}|${USER_AGENT}`,
    ),
    consent: CONSENT,
  });
  const serialized = JSON.stringify(body);
  for (const secret of [BEARER, PASSWORD, SECONDARY_TOKEN]) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.equal((body.data as Record<string, unknown>).ticket, TICKET);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(serialized.includes(CLIENT_IP), false);
  assert.equal(serialized.includes(USER_AGENT), false);
});

Deno.test("keeps auxiliary IP and user-agent hashes optional without weakening consent", async () => {
  for (const header of ["x-forwarded-for", "user-agent"]) {
    const registered: Array<Record<string, unknown>> = [];
    const handler = createReauthenticationHandler(dependencies({
      registerReauthentication: async (input) => {
        registered.push(input.evidence as unknown as Record<string, unknown>);
        return ticket();
      },
    }));
    const raw = request(reauthenticateBody());
    raw.headers.delete(header);
    const { response, body } = await responseJson(await handler(raw));
    assert.equal(response.status, 200, header);
    assert.equal(registered.length, 1, header);
    assert.deepEqual(registered[0]?.consent, CONSENT, header);
    assert.equal(
      header === "x-forwarded-for" && "ipHash" in registered[0],
      false,
    );
    assert.equal(
      header === "user-agent" && "userAgentHash" in registered[0],
      false,
    );
    assert.equal(JSON.stringify(body).includes(CLIENT_IP), false, header);
    assert.equal(JSON.stringify(body).includes(USER_AGENT), false, header);
  }
});

Deno.test("each REAUTHENTICATE invocation gets a fresh server attempt while requestId remains logical", async () => {
  const generated = [ATTEMPT_ID, SECOND_ATTEMPT_ID];
  const prepared: string[] = [];
  const registered: string[] = [];
  const handler = createReauthenticationHandler(dependencies({
    newAttemptId: () => {
      const attemptId = generated.shift();
      assert.ok(attemptId);
      return attemptId;
    },
    prepareReauthentication: async (input) => {
      prepared.push(input.attemptId);
      assert.equal(input.requestId, REQUEST_ID);
      return {
        attemptId: input.attemptId,
        email: "professor@example.test",
        passwordEnabled: true,
        rateLimit: {
          remaining: 4,
          resetAt: "2026-08-19T15:19:05.000Z",
        },
      };
    },
    registerReauthentication: async (input) => {
      registered.push(input.attemptId);
      assert.equal(input.requestId, REQUEST_ID);
      return ticket();
    },
  }));

  const first = await responseJson(
    await handler(request(reauthenticateBody())),
  );
  const second = await responseJson(
    await handler(request(reauthenticateBody())),
  );

  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.deepEqual(prepared, [
    ATTEMPT_ID,
    ATTEMPT_ID,
    SECOND_ATTEMPT_ID,
    SECOND_ATTEMPT_ID,
  ]);
  assert.deepEqual(registered, [ATTEMPT_ID, SECOND_ATTEMPT_ID]);
  for (const body of [first.body, second.body]) {
    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes(ATTEMPT_ID), false);
    assert.equal(serialized.includes(SECOND_ATTEMPT_ID), false);
    assert.equal(body.requestId, REQUEST_ID);
  }
});

Deno.test("attemptId is server-only and cannot be supplied by the client", async () => {
  let generated = false;
  const handler = createReauthenticationHandler(dependencies({
    newAttemptId: () => {
      generated = true;
      return ATTEMPT_ID;
    },
  }));
  const { response, body } = await responseJson(
    await handler(request(reauthenticateBody({ attemptId: ATTEMPT_ID }))),
  );
  assert.equal(response.status, 400);
  assert.equal((body.error as Record<string, unknown>).code, "INVALID_REQUEST");
  assert.equal(generated, false);
});

Deno.test("requires an exact canonical consent before password verification", async () => {
  const invalidConsents: unknown[] = [
    undefined,
    null,
    { ...CONSENT, accepted: false },
    { ...CONSENT, sha256: TERM_SHA256.toUpperCase() },
    { ...CONSENT, sha256: "a".repeat(63) },
    { ...CONSENT, termId: " diario_classe:v1" },
    { ...CONSENT, extra: true },
  ];
  for (const consent of invalidConsents) {
    let prepareCalls = 0;
    let passwordCalls = 0;
    const handler = createReauthenticationHandler(dependencies({
      prepareReauthentication: async () => {
        prepareCalls += 1;
        throw new Error("must not run");
      },
      verifyPassword: async () => {
        passwordCalls += 1;
        throw new Error("must not run");
      },
    }));
    const { response, body } = await responseJson(
      await handler(request(reauthenticateBody({ consent }))),
    );
    assert.equal(response.status, 400);
    assert.equal(
      (body.error as Record<string, unknown>).code,
      "INVALID_REQUEST",
    );
    assert.equal(prepareCalls, 0);
    assert.equal(passwordCalls, 0);
  }
});

Deno.test("binds the same consent to preflight and durable evidence on replay", async () => {
  const prepared: unknown[] = [];
  const registered: unknown[] = [];
  const handler = createReauthenticationHandler(dependencies({
    prepareReauthentication: async (input) => {
      prepared.push(input.consent);
      return {
        attemptId: input.attemptId,
        email: "professor@example.test",
        passwordEnabled: true,
        rateLimit: { remaining: 4, resetAt: "2026-08-19T15:19:05.000Z" },
      };
    },
    registerReauthentication: async (input) => {
      registered.push(input.evidence.consent);
      return ticket();
    },
  }));

  const first = await handler(request(reauthenticateBody()));
  const replay = await handler(request(reauthenticateBody()));
  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  assert.deepEqual(prepared, [CONSENT, CONSENT, CONSENT, CONSENT]);
  assert.deepEqual(registered, [CONSENT, CONSENT]);
});

Deno.test("a well-shaped but tampered term hash never produces a ticket", async () => {
  const tamperedHash = "d".repeat(64);
  let registerCalls = 0;
  const handler = createReauthenticationHandler(dependencies({
    registerReauthentication: async (input) => {
      registerCalls += 1;
      assert.equal(input.evidence.consent.sha256, tamperedHash);
      throw {
        code: "22023",
        message: "ASSINATURA_REAUTH_EVIDENCIA_INVALIDA",
        details: `term hash ${tamperedHash}`,
      };
    },
  }));
  const { response, body } = await responseJson(
    await handler(request(reauthenticateBody({
      consent: { ...CONSENT, sha256: tamperedHash },
    }))),
  );
  assert.equal(response.status, 400);
  assert.equal((body.error as Record<string, unknown>).code, "INVALID_REQUEST");
  assert.equal(registerCalls, 1);
  assert.equal(JSON.stringify(body).includes(tamperedHash), false);
  assert.equal(JSON.stringify(body).includes("term hash"), false);
});

Deno.test("fails closed when the preflight does not echo the server attemptId", async () => {
  let passwordCalls = 0;
  const handler = createReauthenticationHandler(dependencies({
    prepareReauthentication: async () => ({
      attemptId: SECOND_ATTEMPT_ID,
      email: "professor@example.test",
      passwordEnabled: true,
      rateLimit: { remaining: 4, resetAt: "2026-08-19T15:19:05.000Z" },
    }),
    verifyPassword: async () => {
      passwordCalls += 1;
      throw new Error("must not run");
    },
  }));
  const { response, body } = await responseJson(
    await handler(request(reauthenticateBody())),
  );
  assert.equal(response.status, 503);
  assert.equal(
    (body.error as Record<string, unknown>).code,
    "SERVICE_UNAVAILABLE",
  );
  assert.equal(passwordCalls, 0);
});

Deno.test("fails OAuth-only accounts closed before password verification", async () => {
  let passwordCalls = 0;
  let registerCalls = 0;
  const handler = createReauthenticationHandler(dependencies({
    prepareReauthentication: async () => ({
      attemptId: ATTEMPT_ID,
      email: "oauth@example.test",
      passwordEnabled: false,
      rateLimit: { remaining: 4, resetAt: "2026-08-19T15:19:05.000Z" },
    }),
    verifyPassword: async () => {
      passwordCalls += 1;
      throw new Error("must not run");
    },
    registerReauthentication: async () => {
      registerCalls += 1;
      throw new Error("must not run");
    },
  }));
  const { response, body } = await responseJson(
    await handler(request(reauthenticateBody())),
  );
  assert.equal(response.status, 409);
  assert.equal(
    (body.error as Record<string, unknown>).code,
    "PASSWORD_REAUTH_UNAVAILABLE",
  );
  assert.equal(passwordCalls, 0);
  assert.equal(registerCalls, 0);
});

Deno.test("durable rate limit runs before password and returns bounded retry", async () => {
  let passwordCalls = 0;
  const handler = createReauthenticationHandler(dependencies({
    prepareReauthentication: async () => {
      throw {
        code: "55000",
        message: "ASSINATURA_REAUTH_RATE_LIMITED",
        details: '{"retryAfterSeconds":37}',
      };
    },
    verifyPassword: async () => {
      passwordCalls += 1;
      throw new Error("must not run");
    },
  }));
  const { response, body } = await responseJson(
    await handler(request(reauthenticateBody())),
  );
  assert.equal(response.status, 429);
  assert.deepEqual(body.error, {
    code: "RATE_LIMITED",
    message: "Muitas tentativas. Aguarde antes de tentar novamente.",
    retryAfterSeconds: 37,
  });
  assert.equal(passwordCalls, 0);
});

Deno.test("invalid password never emits a ticket or leaks credentials", async () => {
  let registerCalls = 0;
  const handler = createReauthenticationHandler(dependencies({
    verifyPassword: async () => {
      throw new InvalidPasswordError({ cause: new Error(PASSWORD) });
    },
    registerReauthentication: async () => {
      registerCalls += 1;
      throw new Error("must not run");
    },
  }));
  const { response, body } = await responseJson(
    await handler(request(reauthenticateBody())),
  );
  assert.equal(response.status, 401);
  assert.equal(
    (body.error as Record<string, unknown>).code,
    "INVALID_PASSWORD",
  );
  assert.equal(JSON.stringify(body).includes(PASSWORD), false);
  assert.equal(registerCalls, 0);
});

Deno.test("secondary revocation is mandatory and blocks ticket emission", async () => {
  let prepareCalls = 0;
  let registerCalls = 0;
  const handler = createReauthenticationHandler(dependencies({
    prepareReauthentication: async () => {
      prepareCalls += 1;
      return {
        attemptId: ATTEMPT_ID,
        email: "professor@example.test",
        passwordEnabled: true,
        rateLimit: {
          remaining: 4,
          resetAt: "2026-08-19T15:19:05.000Z",
        },
      };
    },
    revokeSecondarySession: async () => {
      throw new AuthenticationServiceError({
        cause: new Error(SECONDARY_TOKEN),
      });
    },
    registerReauthentication: async () => {
      registerCalls += 1;
      return ticket();
    },
  }));
  const { response, body } = await responseJson(
    await handler(request(reauthenticateBody())),
  );
  assert.equal(response.status, 503);
  assert.equal(
    (body.error as Record<string, unknown>).code,
    "AUTH_SERVICE_UNAVAILABLE",
  );
  assert.equal(prepareCalls, 1);
  assert.equal(registerCalls, 0);
  assert.equal(JSON.stringify(body).includes(SECONDARY_TOKEN), false);
});

Deno.test("fails closed when the original session disappears after secondary revocation", async () => {
  let prepareCalls = 0;
  let registerCalls = 0;
  const handler = createReauthenticationHandler(dependencies({
    prepareReauthentication: async () => {
      prepareCalls += 1;
      if (prepareCalls === 2) {
        throw {
          code: "55000",
          message: "ASSINATURA_REAUTH_SESSAO_INVALIDA",
        };
      }
      return {
        attemptId: ATTEMPT_ID,
        email: "professor@example.test",
        passwordEnabled: true,
        rateLimit: {
          remaining: 4,
          resetAt: "2026-08-19T15:19:05.000Z",
        },
      };
    },
    registerReauthentication: async () => {
      registerCalls += 1;
      return ticket();
    },
  }));
  const { response, body } = await responseJson(
    await handler(request(reauthenticateBody())),
  );
  assert.equal(response.status, 401);
  assert.equal((body.error as Record<string, unknown>).code, "SESSION_INVALID");
  assert.equal(prepareCalls, 2);
  assert.equal(registerCalls, 0);
});

Deno.test("fails closed when the password identity changes after verification", async () => {
  for (
    const [label, refreshed] of [
      [
        "email changed",
        {
          email: "other-professor@example.test",
          passwordEnabled: true,
        },
      ],
      [
        "password disabled",
        {
          email: "professor@example.test",
          passwordEnabled: false,
        },
      ],
    ] as const
  ) {
    let prepareCalls = 0;
    let registerCalls = 0;
    const handler = createReauthenticationHandler(dependencies({
      prepareReauthentication: async () => {
        prepareCalls += 1;
        return {
          attemptId: ATTEMPT_ID,
          email: prepareCalls === 1
            ? "professor@example.test"
            : refreshed.email,
          passwordEnabled: prepareCalls === 1
            ? true
            : refreshed.passwordEnabled,
          rateLimit: {
            remaining: 4,
            resetAt: "2026-08-19T15:19:05.000Z",
          },
        };
      },
      registerReauthentication: async () => {
        registerCalls += 1;
        return ticket();
      },
    }));

    const { response, body } = await responseJson(
      await handler(request(reauthenticateBody())),
    );
    assert.equal(response.status, 503, label);
    assert.equal(
      (body.error as Record<string, unknown>).code,
      "SERVICE_UNAVAILABLE",
      label,
    );
    assert.equal(prepareCalls, 2, label);
    assert.equal(registerCalls, 0, label);
  }
});

Deno.test("revokes a mismatched secondary UID before rejecting it", async () => {
  const calls: string[] = [];
  const handler = createReauthenticationHandler(dependencies({
    verifyPassword: async () => {
      calls.push("verify");
      return {
        userId: "88888888-8888-4888-8888-888888888888",
        accessToken: SECONDARY_TOKEN,
      };
    },
    revokeSecondarySession: async () => {
      calls.push("revoke");
    },
    registerReauthentication: async () => {
      calls.push("register");
      return ticket();
    },
  }));
  const { response, body } = await responseJson(
    await handler(request(reauthenticateBody())),
  );
  assert.equal(response.status, 401);
  assert.equal((body.error as Record<string, unknown>).code, "SESSION_INVALID");
  assert.deepEqual(calls, ["verify", "revoke"]);
});

Deno.test("revokes a secondary token even when Auth omits the secondary UID", async () => {
  const calls: string[] = [];
  const handler = createReauthenticationHandler(dependencies({
    verifyPassword: async () => ({
      userId: "",
      accessToken: SECONDARY_TOKEN,
    }),
    revokeSecondarySession: async () => {
      calls.push("revoke");
    },
    registerReauthentication: async () => {
      calls.push("register");
      return ticket();
    },
  }));
  const { response } = await responseJson(
    await handler(request(reauthenticateBody())),
  );
  assert.equal(response.status, 401);
  assert.deepEqual(calls, ["revoke"]);
});

Deno.test("confirmation binds the current bearer UID and session to the opaque ticket", async () => {
  const received: Array<Record<string, unknown>> = [];
  const handler = createReauthenticationHandler(dependencies({
    confirmSignature: async (input) => {
      received.push(input as unknown as Record<string, unknown>);
      return confirmation();
    },
  }));
  const { response, body } = await responseJson(
    await handler(request(confirmationBody())),
  );
  assert.equal(response.status, 200);
  assert.equal(received[0]?.userId, USER_ID);
  assert.equal(received[0]?.sessionId, SESSION_ID);
  assert.equal(received[0]?.requestId, REQUEST_ID);
  assert.equal(received[0]?.ticket, TICKET);
  assert.equal(
    (body.data as Record<string, unknown>).participantStatus,
    "ASSINADO",
  );
});

Deno.test("maps expired and consumed tickets without exposing database errors", async () => {
  for (
    const [message, publicCode] of [
      ["ASSINATURA_REAUTH_TICKET_EXPIRADO", "REAUTH_TICKET_EXPIRED"],
      ["ASSINATURA_REAUTH_TICKET_CONSUMIDO", "REAUTH_TICKET_CONSUMED"],
    ] as const
  ) {
    const handler = createReauthenticationHandler(dependencies({
      confirmSignature: async () => {
        throw { code: "55000", message, details: SECONDARY_TOKEN };
      },
    }));
    const { response, body } = await responseJson(
      await handler(request(confirmationBody())),
    );
    assert.equal(response.status, 409);
    assert.equal((body.error as Record<string, unknown>).code, publicCode);
    assert.equal(JSON.stringify(body).includes(SECONDARY_TOKEN), false);
  }
});

Deno.test("maps the final SQL error vocabulary to stable public errors", () => {
  for (
    const [message, code] of [
      ["ASSINATURA_SESSAO_INVALIDA_OU_REVOGADA", "SESSION_INVALID"],
      ["ASSINATURA_IDEMPOTENCIA_DIVERGENTE", "IDEMPOTENCY_CONFLICT"],
      ["ASSINATURA_REAUTH_ORDEM_OU_ESTADO_INVALIDO", "SIGNATURE_ORDER_BLOCKED"],
      [
        "ASSINATURA_REAUTH_SECRET_INDISPONIVEL",
        "SECURE_CONFIGURATION_UNAVAILABLE",
      ],
      ["ASSINATURA_REAUTH_PARTICIPANTE_NAO_AUTORIZADO", "ACCESS_DENIED"],
      ["ASSINATURA_REAUTH_EVIDENCIA_INVALIDA", "INVALID_REQUEST"],
      ["ASSINATURA_REAUTH_CONSENTIMENTO_INVALIDO", "INVALID_REQUEST"],
      [
        "ASSINATURA_REAUTH_ATTEMPT_OU_CONSENTIMENTO_INVALIDO",
        "INVALID_REQUEST",
      ],
    ] as const
  ) {
    assert.equal(publicErrorFromUnknown({ code: "55000", message }).code, code);
  }
});

Deno.test("idempotent confirmation replay returns the same canonical response", async () => {
  let calls = 0;
  const handler = createReauthenticationHandler(dependencies({
    confirmSignature: async () => {
      calls += 1;
      return confirmation();
    },
  }));
  const first = await responseJson(await handler(request(confirmationBody())));
  const replay = await responseJson(await handler(request(confirmationBody())));
  assert.equal(first.response.status, 200);
  assert.equal(replay.response.status, 200);
  assert.deepEqual(replay.body, first.body);
  assert.equal(calls, 2);
});

Deno.test("getClaims and getUser must agree on a non-anonymous session", async () => {
  const calls: string[] = [];
  const admin = {
    auth: {
      getClaims: async (
        bearer: string,
      ): Promise<{ data: unknown; error: unknown }> => {
        calls.push(`claims:${bearer}`);
        return {
          data: {
            claims: {
              sub: USER_ID,
              session_id: SESSION_ID,
              role: "authenticated",
              is_anonymous: false,
            },
          },
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
      admin: { signOut: async () => ({ data: null, error: null }) },
    },
    rpc: async () => ({ data: null, error: null }),
  };
  assert.deepEqual(await authenticateBearer(admin, BEARER), {
    userId: USER_ID,
    sessionId: SESSION_ID,
  });
  assert.deepEqual(calls, [`claims:${BEARER}`, `user:${BEARER}`]);

  admin.auth.getClaims = async () => ({
    data: {
      claims: { sub: USER_ID, role: "authenticated", is_anonymous: false },
    },
    error: null,
  });
  await assert.rejects(() => authenticateBearer(admin, BEARER), /sessão/i);
});

Deno.test("rejects anonymous claims and a getUser UID mismatch", async () => {
  const authAdmin = (
    claims: Record<string, unknown>,
    userId = USER_ID,
  ) => ({
    auth: {
      getClaims: async () => ({ data: { claims }, error: null }),
      getUser: async () => ({
        data: { user: { id: userId, is_anonymous: false } },
        error: null,
      }),
      admin: { signOut: async () => ({ data: null, error: null }) },
    },
    rpc: async () => ({ data: null, error: null }),
  });
  await assert.rejects(
    () =>
      authenticateBearer(
        authAdmin({
          sub: USER_ID,
          session_id: SESSION_ID,
          role: "authenticated",
          is_anonymous: true,
        }),
        BEARER,
      ),
    /sessão/i,
  );
  await assert.rejects(
    () =>
      authenticateBearer(
        authAdmin({
          sub: USER_ID,
          session_id: SESSION_ID,
          role: "authenticated",
          is_anonymous: false,
        }, "88888888-8888-4888-8888-888888888888"),
        BEARER,
      ),
    /sessão/i,
  );
});

Deno.test("password client is isolated and its session is revoked with local scope", async () => {
  const factoryCalls: Array<{
    apiKey: string;
    options: Record<string, unknown>;
  }> = [];
  const revocations: Array<[string, string]> = [];
  const admin = {
    auth: {
      getClaims: async () => ({ data: null, error: null }),
      getUser: async () => ({ data: null, error: null }),
      admin: {
        signOut: async (accessToken: string, scope: string) => {
          revocations.push([accessToken, scope]);
          return { data: null, error: null };
        },
      },
    },
    rpc: async () => ({ data: null, error: null }),
  };
  const isolated = {
    auth: {
      signInWithPassword: async () => ({
        data: {
          user: { id: USER_ID },
          session: { access_token: SECONDARY_TOKEN },
        },
        error: null,
      }),
    },
  };
  const factory = (
    _url: string,
    apiKey: string,
    options: Record<string, unknown>,
  ) => {
    factoryCalls.push({ apiKey, options });
    return factoryCalls.length === 1 ? admin : isolated;
  };
  const deps = createSupabaseReauthenticationDependencies({
    supabaseUrl: "https://project.supabase.co",
    serviceRoleKey: "service-key",
    publicApiKey: "publishable-key",
  }, factory);
  const secondary = await deps.verifyPassword(
    "professor@example.test",
    PASSWORD,
  );
  await deps.revokeSecondarySession(secondary.accessToken);
  assert.equal(factoryCalls.length, 2);
  assert.equal(factoryCalls[1].apiKey, "publishable-key");
  assert.deepEqual(factoryCalls[1].options, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  assert.deepEqual(revocations, [[SECONDARY_TOKEN, "local"]]);
});

Deno.test("never accepts service_role as the password-verification client key", () => {
  assert.throws(
    () =>
      createSupabaseReauthenticationDependencies({
        supabaseUrl: "https://project.supabase.co",
        serviceRoleKey: "same-secret-key",
        publicApiKey: "same-secret-key",
      }),
    /temporariamente indisponível/,
  );
});

Deno.test("adapter calls the frozen service-role RPC contract", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const admin = {
    auth: {
      getClaims: async () => ({ data: null, error: null }),
      getUser: async () => ({ data: null, error: null }),
      admin: { signOut: async () => ({ data: null, error: null }) },
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === PREPARE_REAUTHENTICATION_RPC) {
        return {
          data: {
            attemptId: ATTEMPT_ID,
            email: "professor@example.test",
            passwordEnabled: true,
            rateLimit: {
              remaining: 4,
              resetAt: "2026-08-19T15:19:05.000Z",
            },
          },
          error: null,
        };
      }
      if (name === REGISTER_REAUTHENTICATION_RPC) {
        return { data: ticket(), error: null };
      }
      return { data: confirmation(), error: null };
    },
  };
  const factory = () => admin;
  const deps = createSupabaseReauthenticationDependencies({
    supabaseUrl: "https://project.supabase.co",
    serviceRoleKey: "service-key",
    publicApiKey: "publishable-key",
  }, factory);
  const base = {
    envelopeId: ENVELOPE_ID,
    participantId: PARTICIPANT_ID,
    profile: "PROFESSOR",
    contextId: CONTEXT_ID,
    requestId: REQUEST_ID,
    attemptId: ATTEMPT_ID,
    userId: USER_ID,
    sessionId: SESSION_ID,
    consent: CONSENT,
  };
  const prepared = await deps.prepareReauthentication(base);
  const registered = await deps.registerReauthentication({
    ...base,
    reauthenticatedAt: "2026-08-19T15:04:05.000Z",
    evidence: {
      provider: "SUPABASE_PASSWORD",
      authenticatedAt: "2026-08-19T15:04:05.000Z",
      ipHash: IP_HASH,
      userAgentHash: USER_AGENT_HASH,
      consent: CONSENT,
    },
  });
  const confirmed = await deps.confirmSignature({
    action: "CONFIRM_SIGNATURE",
    requestId: REQUEST_ID,
    ticket: TICKET,
    userId: USER_ID,
    sessionId: SESSION_ID,
  });
  assert.deepEqual(calls.map((call) => call.name), [
    PREPARE_REAUTHENTICATION_RPC,
    REGISTER_REAUTHENTICATION_RPC,
    CONFIRM_SIGNATURE_RPC,
  ]);
  assert.deepEqual(calls[0].args, {
    p_envelope_id: ENVELOPE_ID,
    p_participante_id: PARTICIPANT_ID,
    p_perfil: "PROFESSOR",
    p_context_id: CONTEXT_ID,
    p_actor_auth_user_id: USER_ID,
    p_auth_session_id: SESSION_ID,
    p_consent: CONSENT,
    p_request_id: REQUEST_ID,
    p_attempt_id: ATTEMPT_ID,
  });
  assert.deepEqual(calls[1].args, {
    p_envelope_id: ENVELOPE_ID,
    p_participante_id: PARTICIPANT_ID,
    p_perfil: "PROFESSOR",
    p_context_id: CONTEXT_ID,
    p_actor_auth_user_id: USER_ID,
    p_auth_session_id: SESSION_ID,
    p_reautenticado_em: "2026-08-19T15:04:05.000Z",
    p_evidencia: {
      provider: "SUPABASE_PASSWORD",
      authenticatedAt: "2026-08-19T15:04:05.000Z",
      ipHash: IP_HASH,
      userAgentHash: USER_AGENT_HASH,
      consent: CONSENT,
    },
    p_request_id: REQUEST_ID,
    p_attempt_id: ATTEMPT_ID,
  });
  assert.deepEqual(calls[2].args, {
    p_ticket: TICKET,
    p_request_id: REQUEST_ID,
    p_actor_auth_user_id: USER_ID,
    p_auth_session_id: SESSION_ID,
  });
  assert.deepEqual(prepared, {
    attemptId: ATTEMPT_ID,
    email: "professor@example.test",
    passwordEnabled: true,
    rateLimit: {
      remaining: 4,
      resetAt: "2026-08-19T15:19:05.000Z",
    },
  });
  assert.deepEqual(registered, ticket());
  assert.deepEqual(confirmed, confirmation());
});

Deno.test("rejects tickets whose declared lifetime exceeds 120 seconds", () => {
  assert.throws(
    () =>
      normalizeTicket({
        ...ticket(),
        expiresAt: "2026-08-19T15:06:06.000Z",
      }),
    /temporariamente indisponível/,
  );
});

Deno.test("config keeps the Edge gateway JWT verification enabled", async () => {
  const config = await Deno.readTextFile(
    new URL("../../config.toml", import.meta.url),
  );
  assert.match(
    config,
    /\[functions\.assinatura-eletronica-reautenticacao\]\s+verify_jwt\s*=\s*true/,
  );
});

Deno.test("Edge neither owns the ticket HMAC secret nor logs sensitive input", async () => {
  const sources = await Promise.all([
    Deno.readTextFile(new URL("./index.ts", import.meta.url)),
    Deno.readTextFile(new URL("./reauthentication.ts", import.meta.url)),
    Deno.readTextFile(new URL("./supabase-adapter.ts", import.meta.url)),
  ]);
  const source = sources.join("\n");
  assert.equal(source.includes("ASSINATURA_REAUTH_TICKET_SECRET"), false);
  assert.equal(source.includes("assinatura_reauth_ticket_hmac_secret"), false);
  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)/);
});
