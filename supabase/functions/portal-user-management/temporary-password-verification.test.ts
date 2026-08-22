import assert from "node:assert/strict";
import { verifyTemporaryPasswordWithClient } from "./temporary-password-verification.ts";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const EMAIL = "responsavel@example.com";
const PASSWORD = "Senha-Temporaria9!";

const makeClient = (options: {
  authUserId?: string;
  email?: string;
  signInError?: boolean;
  signInThrows?: boolean;
  signOutError?: boolean;
  signOutThrows?: boolean;
} = {}) => {
  const calls: Array<{ name: string; payload?: unknown }> = [];
  const client = {
    auth: {
      signInWithPassword: async (payload: {
        email: string;
        password: string;
      }) => {
        calls.push({ name: "signInWithPassword", payload });
        if (options.signInThrows) throw new Error("transporte interrompido");
        return {
          data: options.signInError ? { session: null, user: null } : {
            session: { access_token: "token-efemero" },
            user: {
              id: options.authUserId || AUTH_USER_ID,
              email: options.email || EMAIL,
            },
          },
          error: options.signInError
            ? { message: "credencial inválida" }
            : null,
        };
      },
      signOut: async (payload: { scope: "local" }) => {
        calls.push({ name: "signOut", payload });
        if (options.signOutThrows) throw new Error("logout interrompido");
        return {
          error: options.signOutError ? { message: "logout recusado" } : null,
        };
      },
    },
  };
  return { client, calls };
};

Deno.test("valida senha e encerra somente a sessão efêmera local", async () => {
  const fixture = makeClient();
  const result = await verifyTemporaryPasswordWithClient(
    fixture.client,
    EMAIL,
    PASSWORD,
    AUTH_USER_ID,
  );

  assert.deepEqual(result, { verified: true, sessionClosed: true });
  assert.deepEqual(fixture.calls, [
    {
      name: "signInWithPassword",
      payload: { email: EMAIL, password: PASSWORD },
    },
    { name: "signOut", payload: { scope: "local" } },
  ]);
});

Deno.test("recusa sessão de outro auth_user_id e ainda a encerra localmente", async () => {
  const fixture = makeClient({
    authUserId: "22222222-2222-4222-8222-222222222222",
  });
  const result = await verifyTemporaryPasswordWithClient(
    fixture.client,
    EMAIL,
    PASSWORD,
    AUTH_USER_ID,
  );

  assert.deepEqual(result, { verified: false, sessionClosed: true });
  assert.equal(fixture.calls.at(-1)?.name, "signOut");
});

Deno.test("falha fechada quando credencial não autentica", async () => {
  const fixture = makeClient({ signInError: true });
  const result = await verifyTemporaryPasswordWithClient(
    fixture.client,
    EMAIL,
    PASSWORD,
    AUTH_USER_ID,
  );

  assert.deepEqual(result, { verified: false, sessionClosed: true });
  assert.equal(fixture.calls.at(-1)?.name, "signOut");
});

Deno.test("encerra defensivamente a sessão local quando o login lança erro", async () => {
  const fixture = makeClient({ signInThrows: true });
  const result = await verifyTemporaryPasswordWithClient(
    fixture.client,
    EMAIL,
    PASSWORD,
    AUTH_USER_ID,
  );

  assert.deepEqual(result, { verified: false, sessionClosed: true });
  assert.equal(fixture.calls.at(-1)?.name, "signOut");
});

Deno.test("não aprova senha se a sessão efêmera não puder ser encerrada", async () => {
  const fixture = makeClient({ signOutError: true });
  const result = await verifyTemporaryPasswordWithClient(
    fixture.client,
    EMAIL,
    PASSWORD,
    AUTH_USER_ID,
  );

  assert.deepEqual(result, { verified: true, sessionClosed: false });
});
