import assert from "node:assert/strict";
import { handleResendResponsavelAccess } from "./resend-responsavel-access.ts";
import type { HandlerContext } from "../types.ts";

const RESPONSAVEL_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const AUTH_ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "44444444-4444-4444-8444-444444444444";
const EMAIL = "responsavel@example.com";

const basePrepared = {
  responsavelLegalId: RESPONSAVEL_ID,
  nome: "Responsável Teste",
  cpf: "52998224725",
  email: EMAIL,
  status: "ATIVO",
  authUserId: AUTH_ID,
  eligible: true,
  accessBlockReason: null,
  firstAccessPending: true,
};

const makeFixture = (options: {
  prepared?: Record<string, unknown>;
  authUser?: Record<string, unknown> | null;
  reservation?: {
    shouldSend: boolean;
    replayed: boolean;
    state: "reserved" | "sent";
  };
  reservations?: Array<{
    shouldSend: boolean;
    replayed: boolean;
    state: "reserved" | "sent";
  }>;
  reservationError?: boolean;
  completion?: boolean;
  cancellation?: boolean;
} = {}) => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const admin = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === "responsavel_legal_acesso_preparar") {
        return { data: options.prepared || basePrepared, error: null };
      }
      if (name === "portal_reservar_reenvio_acesso_responsavel") {
        const sequencedReservation = options.reservations?.shift();
        return options.reservationError
          ? { data: null, error: { message: "reserva interna" } }
          : {
            data: sequencedReservation || options.reservation || {
              shouldSend: true,
              replayed: false,
              state: "reserved",
            },
            error: null,
          };
      }
      if (name === "portal_concluir_reenvio_acesso_responsavel") {
        return { data: options.completion ?? true, error: null };
      }
      if (name === "portal_cancelar_reenvio_acesso_responsavel") {
        return { data: options.cancellation ?? true, error: null };
      }
      throw new Error(`RPC inesperada: ${name}`);
    },
    auth: {
      admin: {
        getUserById: async () => ({
          data: {
            user: options.authUser === undefined
              ? { id: AUTH_ID, email: EMAIL }
              : options.authUser,
          },
          error: null,
        }),
      },
    },
  };
  const context: HandlerContext = {
    admin,
    gestor: { id: "gestor-1", nome: "Gestor", auth_user_id: ACTOR_ID },
    gestorEmail: "gestor@example.com",
    json: (payload, status = 200) =>
      new Response(JSON.stringify(payload), { status }),
  };
  return { context, rpcCalls };
};

const options = {
  supabaseUrl: "https://project.supabase.co",
  publicApiKey: "public-anon-key",
};

Deno.test("reserva e conclui o reenvio para a recuperação do responsável sem expor segredo", async () => {
  const fixture = makeFixture();
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (input, init) => {
    requests.push({ url: String(input), init });
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  try {
    const response = await handleResendResponsavelAccess(
      fixture.context,
      RESPONSAVEL_ID,
      REQUEST_ID,
      options,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      success: true,
      action: "resend-responsavel-access",
      userId: AUTH_ID,
      recoveryEmailSent: true,
      requestFinalized: true,
      profileLinkState: "already_linked",
      message:
        "Novo e-mail de acesso enviado. O responsável poderá criar uma senha pela recuperação.",
    });
    assert.equal(requests.length, 1);
    const recoveryUrl = new URL(requests[0].url);
    assert.equal(recoveryUrl.pathname, "/auth/v1/recover");
    assert.equal(
      recoveryUrl.searchParams.get("redirect_to"),
      "https://universocc.com.br/recuperar-senha?source=responsavel",
    );
    assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
      email: EMAIL,
    });
    assert.doesNotMatch(
      JSON.stringify(body),
      /token|recoveryLink|action_link/i,
    );
    assert.deepEqual(
      fixture.rpcCalls.map((call) => call.name),
      [
        "responsavel_legal_acesso_preparar",
        "portal_reservar_reenvio_acesso_responsavel",
        "portal_concluir_reenvio_acesso_responsavel",
      ],
    );
    assert.deepEqual(fixture.rpcCalls[1].args, {
      p_responsavel_legal_id: RESPONSAVEL_ID,
      p_request_id: REQUEST_ID,
      p_actor_auth_user_id: ACTOR_ID,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("exige requestId estável antes de consultar banco ou enviar e-mail", async () => {
  const fixture = makeFixture();
  const response = await handleResendResponsavelAccess(
    fixture.context,
    RESPONSAVEL_ID,
    "invalido",
    options,
  );

  assert.equal(response.status, 400);
  assert.equal(fixture.rpcCalls.length, 0);
});

Deno.test("não reenvia quando o perfil ainda não possui auth_user_id", async () => {
  const fixture = makeFixture({
    prepared: { ...basePrepared, authUserId: null },
  });
  const response = await handleResendResponsavelAccess(
    fixture.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
    options,
  );

  assert.equal(response.status, 409);
});

Deno.test("não envia quando a reserva transacional e sua auditoria falham", async () => {
  const fixture = makeFixture({ reservationError: true });
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  try {
    const response = await handleResendResponsavelAccess(
      fixture.context,
      RESPONSAVEL_ID,
      REQUEST_ID,
      options,
    );
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(fetchCalls, 0);
    assert.doesNotMatch(JSON.stringify(body), /reserva interna/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("mantém reserva em falha ambígua do provedor e sanitiza sua mensagem", async () => {
  const fixture = makeFixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({ message: "token interno super-secreto" }),
        { status: 500 },
      ),
    );
  try {
    const response = await handleResendResponsavelAccess(
      fixture.context,
      RESPONSAVEL_ID,
      REQUEST_ID,
      options,
    );
    const body = await response.json();

    assert.equal(response.status, 502);
    assert.equal(body.requestFinalized, false);
    assert.match(body.error, /não confirmou o envio/i);
    assert.doesNotMatch(JSON.stringify(body), /token interno|super-secreto/i);
    assert.equal(
      fixture.rpcCalls.some((call) =>
        call.name === "portal_cancelar_reenvio_acesso_responsavel"
      ),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("retry reservado responde 202 sem auditar ou duplicar e-mail", async () => {
  const fixture = makeFixture({
    reservation: { shouldSend: false, replayed: true, state: "reserved" },
  });
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  try {
    const response = await handleResendResponsavelAccess(
      fixture.context,
      RESPONSAVEL_ID,
      REQUEST_ID,
      options,
    );
    const body = await response.json();

    assert.equal(response.status, 202);
    assert.equal(body.success, true);
    assert.equal(body.recoveryEmailSent, false);
    assert.equal(body.requestFinalized, false);
    assert.match(body.message, /nenhum e-mail duplicado/i);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("retry concluído responde sucesso sem duplicar e-mail", async () => {
  const fixture = makeFixture({
    reservation: { shouldSend: false, replayed: true, state: "sent" },
  });
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  try {
    const response = await handleResendResponsavelAccess(
      fixture.context,
      RESPONSAVEL_ID,
      REQUEST_ID,
      options,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.recoveryEmailSent, true);
    assert.equal(body.requestFinalized, true);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("cancela reserva somente quando o provedor recusa definitivamente", async () => {
  const fixture = makeFixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response('{"message":"e-mail inválido"}', {
        status: 400,
      }),
    );
  try {
    const response = await handleResendResponsavelAccess(
      fixture.context,
      RESPONSAVEL_ID,
      REQUEST_ID,
      options,
    );

    assert.equal(response.status, 502);
    assert.equal(
      fixture.rpcCalls.at(-1)?.name,
      "portal_cancelar_reenvio_acesso_responsavel",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("retry com o mesmo requestId não duplica envio enquanto a conclusão fica pendente", async () => {
  const fixture = makeFixture({
    completion: false,
    reservations: [
      { shouldSend: true, replayed: false, state: "reserved" },
      { shouldSend: false, replayed: true, state: "reserved" },
    ],
  });
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  try {
    const firstResponse = await handleResendResponsavelAccess(
      fixture.context,
      RESPONSAVEL_ID,
      REQUEST_ID,
      options,
    );
    const firstBody = await firstResponse.json();
    const retryResponse = await handleResendResponsavelAccess(
      fixture.context,
      RESPONSAVEL_ID,
      REQUEST_ID,
      options,
    );
    const retryBody = await retryResponse.json();

    assert.equal(firstResponse.status, 202);
    assert.equal(firstBody.recoveryEmailSent, true);
    assert.equal(firstBody.requestFinalized, false);
    assert.equal(retryResponse.status, 202);
    assert.equal(retryBody.recoveryEmailSent, false);
    assert.equal(retryBody.requestFinalized, false);
    assert.equal(fetchCalls, 1);
    assert.deepEqual(
      fixture.rpcCalls
        .filter((call) =>
          call.name === "portal_reservar_reenvio_acesso_responsavel"
        )
        .map((call) => call.args.p_request_id),
      [REQUEST_ID, REQUEST_ID],
    );
    assert.equal(
      fixture.rpcCalls.some((call) =>
        call.name === "portal_cancelar_reenvio_acesso_responsavel"
      ),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
